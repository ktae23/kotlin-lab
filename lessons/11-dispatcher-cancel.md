# Lesson 11 — 디스패처, 컨텍스트, 취소

Lesson 10에서 "코루틴은 스레드를 반납한다"고 했습니다. 그럼 **누가 어느 스레드에서 실행할지 정하는가?** 그리고 **이미 실행 중인 작업을 어떻게 멈추는가?** 이 둘이 실무에서 사고가 나는 지점입니다.

## CoroutineContext — 코루틴의 실행 환경

모든 코루틴은 `CoroutineContext`를 들고 다닙니다. 키-값 맵이라고 생각하면 되고, `+`로 합칩니다.

```kotlin
launch(Dispatchers.IO + CoroutineName("order-sync")) { ... }
```

주요 구성요소 4개입니다.

| 요소 | 역할 | Java 대응 |
|---|---|---|
| `Job` | 생명주기 — 취소/완료 상태, 부모-자식 관계 | `Future` + 그 이상 |
| `CoroutineDispatcher` | **어느 스레드에서 돌릴지** | `Executor` |
| `CoroutineName` | 디버깅용 이름 | 스레드 이름 |
| `CoroutineExceptionHandler` | 처리되지 않은 예외 | `UncaughtExceptionHandler` |

자식 코루틴은 부모 컨텍스트를 **상속**합니다. 단, `Job`만은 예외 — 자식은 **자기 Job을 새로 만들고 부모 Job을 부모로 등록**합니다. 이 한 줄이 구조적 동시성의 구현 그 자체입니다.

## 디스패처 — Executor의 후계자

```kotlin
Dispatchers.Default    // CPU 코어 수만큼의 스레드풀 (최소 2). CPU 바운드 작업용
Dispatchers.IO         // 기본 64개까지 늘어나는 풀. 블로킹 I/O 전용
Dispatchers.Unconfined // 재개된 스레드에서 그냥 이어 실행. 라이브러리 내부용
```

Java에서 하던 선택과 같습니다. `newFixedThreadPool(코어수)` 대 `newCachedThreadPool()`. 왜 나누는지도 같고요.

- **CPU 바운드**(계산, 파싱, 정렬)에 스레드를 코어 수보다 많이 주면 컨텍스트 스위칭 비용만 늘어납니다 → `Default`
- **블로킹 I/O**(레거시 JDBC, 파일, 블로킹 HTTP 클라이언트)는 스레드가 놀고 있으니 많이 있어야 처리량이 납니다 → `IO`

`Default`와 `IO`는 **스레드풀을 공유**합니다. `IO`로 전환한다고 해서 매번 새 스레드가 만들어지는 게 아니라, 같은 풀에서 동시 실행 한도만 다르게 잡습니다. 그래서 전환 비용이 쌉니다.

> 실무에서 제일 흔한 사고: `suspend` 함수 안에서 **블로킹 JDBC 호출을 `Dispatchers.Default`에서 돌리는 것.** 코어가 8개면 스레드 8개짜리 풀이고, 느린 쿼리 8개가 그 풀을 전부 잡아먹으면 **앱 전체의 CPU 작업이 멈춥니다.** 블로킹 호출은 반드시 `IO`로 옮기세요.

## withContext — 스레드 전환의 표준

```kotlin
suspend fun loadReport(id: Long): Report {
    val rows = withContext(Dispatchers.IO) { jdbcTemplate.query(...) }  // I/O 풀에서
    return withContext(Dispatchers.Default) { aggregate(rows) }          // CPU 풀에서
}
```

`withContext`는 블록이 끝날 때까지 **중단**하고 결과를 반환합니다. 그리고 원래 컨텍스트로 돌아옵니다.

여기서 Kotlin 코루틴의 중요한 설계 규칙이 나옵니다 — **"suspend 함수는 호출자를 블로킹하지 않아야 한다"**(main-safety). 블로킹 코드를 감싸는 책임은 **함수를 만드는 쪽**에 있습니다. 호출하는 쪽이 매번 `withContext(IO)`로 감싸게 만들면 안 됩니다.

```kotlin
// 나쁨 — 호출자가 알아서 IO 로 감싸야 함
suspend fun findUser(id: Long): User = jdbcTemplate.queryForObject(...)

// 좋음 — 함수 자신이 main-safe
suspend fun findUser(id: Long): User = withContext(Dispatchers.IO) {
    jdbcTemplate.queryForObject(...)
}
```

## 협조적 취소 — Thread.interrupt()의 교훈

Java에서 스레드를 멈추는 방법을 떠올려 보세요. `Thread.stop()`은 20년 전에 폐기됐습니다. 락을 쥔 채로 강제로 죽이면 상태가 깨지니까요. 남은 건 `interrupt()` 뿐이고, 이건 **요청일 뿐**입니다.

```java
while (!Thread.currentThread().isInterrupted()) {   // 내가 확인해야 함
    doChunk();
}
// sleep/wait 중이면 InterruptedException 이 던져진다 — 근데 잡아서 무시하면 그만
```

코루틴 취소도 정확히 같은 철학입니다. **협조적(cooperative)** — 코루틴이 스스로 확인해야 멈춥니다.

```kotlin
val job = launch {
    while (isActive) {          // 확인하지 않으면 취소해도 계속 돈다
        computeChunk()
    }
}
job.cancelAndJoin()
```

취소를 확인하는 도구 3개:

- **`isActive`** — `Boolean`. 루프 조건에 쓰기 좋습니다.
- **`ensureActive()`** — 취소됐으면 `CancellationException`을 던집니다. `suspend` 함수 안(스코프 리시버가 없는 곳)에서는 `currentCoroutineContext().ensureActive()`로 씁니다.
- **`yield()`** — 다른 코루틴에게 양보하면서 취소도 확인합니다.

그리고 **`kotlinx.coroutines`의 모든 `suspend` 함수(`delay`, `withContext`, `await`...)는 자동으로 취소를 확인합니다.** 그래서 대부분의 코드는 그냥 취소가 동작합니다. 안 되는 경우는 딱 하나 — **중단 지점 없이 CPU를 계속 쓰는 루프.** Java에서 `isInterrupted()`를 안 보는 루프가 안 멈추던 것과 똑같습니다.

## 취소는 왜 예외인가

취소되면 `CancellationException`이 던져집니다. 왜 반환값이 아니라 예외일까요?

**`finally`를 타게 하려고요.** 중단 지점 한복판에서 작업이 끊길 때, 열어둔 커넥션·파일·락을 정리할 기회를 주는 유일한 메커니즘이 예외 전파입니다. Java의 `InterruptedException`이 검사 예외인 이유와 같습니다.

`CancellationException`은 **정상 종료 신호로 취급**됩니다. 부모에게 전파되지 않고, 코루틴 예외 핸들러도 타지 않습니다. 그래서 이런 코드가 재앙입니다.

```kotlin
try {
    delay(1000)
} catch (e: Exception) {      // CancellationException 까지 삼킨다 → 취소 불가 코루틴 탄생
    log.error("실패", e)
}
```

> 리뷰 규칙: **코루틴 안에서 `catch (e: Exception)`은 위험 신호.** `CancellationException`은 다시 던지거나(`catch (e: CancellationException) { throw e }`), 처음부터 구체 타입만 잡으세요.

## withTimeout 과 NonCancellable

```kotlin
val result = withTimeout(500) { fetchAll() }        // 초과 시 TimeoutCancellationException
val result = withTimeoutOrNull(500) { fetchAll() }  // 초과 시 null — 실무에서 더 자주 씀
```

타임아웃은 "정해진 시간 뒤 이 코루틴을 취소한다"의 문법 설탕입니다. 외부 API 호출을 감쌀 때 반드시 씁니다.

문제는 **취소된 코루틴 안에서는 `suspend` 함수를 더 못 부른다**는 것입니다. 이미 취소 상태라 즉시 예외가 나니까요. 정리 작업에 중단이 필요하다면:

```kotlin
try {
    fetchPages()
} finally {
    withContext(NonCancellable) {   // 이 블록 안에서는 취소가 무시된다
        rollbackTx()                // suspend 함수 호출 가능
    }
}
```

`NonCancellable`은 **정리 코드 전용 탈출구**입니다. 여기에 일반 로직을 넣으면 취소가 안 되는 좀비 코루틴이 생깁니다.

## 연습

타임아웃 걸린 수집 작업을 협조적 취소와 함께 구현합니다.

1. **`collectPages`** — `pages`를 순회하며 각 항목마다 `delay(200)` 후 `currentCoroutineContext().ensureActive()`로 취소를 확인하고, `done` 리스트에 담은 뒤 `"수집: $page"`를 출력합니다. `finally`에서는 `withContext(NonCancellable)`로 `delay(50)` 후 `"정리: ${done.size}건 커밋"`을 출력하세요. 정상 완료 시 `done`을 반환합니다.
2. **`totalSize`** — `withContext(Dispatchers.Default)`로 옮겨 각 문자열 길이의 합을 반환합니다.

`main`은 `withTimeoutOrNull(500)`으로 4개 항목 수집을 시도합니다. 200ms짜리 2개만 끝나고 500ms에 취소되므로, `finally`의 정리 로그가 찍힌 뒤 결과는 `null`이 됩니다.

**핵심 확인 포인트**: `finally`가 `NonCancellable` 없이 `delay(50)`을 호출하면 그 자리에서 `CancellationException`이 나서 정리 로그가 **안 찍힙니다.** 한 번 빼보고 차이를 확인하세요.

```kotlin starter
import kotlinx.coroutines.*

suspend fun collectPages(pages: List<String>): List<String> {
    val done = mutableListOf<String>()
    // TODO: try/finally 로 감싸세요.
    //   try: pages 순회 → delay(200) → currentCoroutineContext().ensureActive()
    //        → done += page → println("수집: $page")
    //   finally: withContext(NonCancellable) { delay(50); println("정리: ${done.size}건 커밋") }
    return done
}

suspend fun totalSize(pages: List<String>): Int {
    // TODO: withContext(Dispatchers.Default) 안에서 각 문자열 length 의 합을 반환하세요.
    TODO("구현하세요")
}

fun main() = runBlocking {
    val collected = withTimeoutOrNull(500) { collectPages(listOf("p1", "p2", "p3", "p4")) }
    println("수집 결과: $collected")
    println("전체 글자수: ${totalSize(listOf("p1", "p2", "p3"))}")
}
```

```text expected
수집: p1
수집: p2
정리: 2건 커밋
수집 결과: null
전체 글자수: 6
```
