# Lesson 10 — 코루틴 기초와 구조적 동시성

Java 백엔드에서 동시성은 **스레드를 어떻게 관리할까**의 문제였습니다. Kotlin에서는 질문 자체가 바뀝니다. 스레드는 그대로 두고, **그 위에서 도는 작업을 잠시 멈췄다 재개**합니다. 여기서부터 5년차의 직관이 한 번 무너집니다.

## 스레드 블로킹 vs 서스펜션

Java의 동시성 코드를 떠올려 보세요.

```java
// 스레드 하나가 200ms 동안 "아무것도 못 하고" 잡혀 있다
Thread.sleep(200);
String body = httpClient.send(req, ofString()).body();  // 응답 올 때까지 블로킹
```

`Thread.sleep`과 블로킹 I/O의 비용은 단순히 "느림"이 아닙니다. **OS 스레드 하나(스택 ~1MB)가 통째로 점유**됩니다. 톰캣 기본 스레드풀이 200개라면, 느린 외부 API를 호출하는 요청 200건이 동시에 들어오는 순간 **스레드풀 고갈(thread pool exhaustion)** — 서버는 멀쩡한데 새 요청을 못 받습니다. 장애 리포트에서 수없이 보셨을 그림입니다.

```kotlin
delay(200)                      // 스레드를 반납하고 200ms 뒤 "재개"
val body = httpGet(url)         // suspend 함수 — 기다리는 동안 스레드는 다른 일을 한다
```

`delay`는 `Thread.sleep`의 Kotlin 버전이 **아닙니다.** 스레드를 재우는 게 아니라 **코루틴을 스레드에서 떼어냅니다.** 그 스레드는 즉시 다른 코루틴을 집어 실행합니다. 스레드 8개로 코루틴 10만 개를 돌릴 수 있는 이유가 이겁니다.

| | Java 스레드 | 코루틴 |
|---|---|---|
| 생성 비용 | ~1MB 스택, OS 자원 | 객체 하나 (수십 바이트) |
| 대기 방식 | 블로킹 (스레드 점유) | 서스펜션 (스레드 반납) |
| 컨텍스트 스위칭 | OS 커널 관여 | 함수 호출 수준 |
| 동시 개수 | 수천 | 수십만 |

## suspend 는 대체 무엇인가

`suspend`는 마법이 아니라 **컴파일러 변환**입니다. 이걸 모르면 코루틴은 평생 주술로 남습니다.

```kotlin
suspend fun loadUser(id: Long): User {
    val row = queryDb(id)      // 중단 지점 1
    val perm = queryPerm(id)   // 중단 지점 2
    return User(row, perm)
}
```

컴파일러는 이 함수를 대략 이렇게 바꿉니다 (CPS 변환, Continuation Passing Style).

```java
// 개념적으로 생성되는 Java 코드
Object loadUser(long id, Continuation<User> cont) {
    // label 로 "어디까지 진행했는지" 기억하는 상태 기계(state machine)
    switch (cont.label) {
        case 0: cont.label = 1; return queryDb(id, cont);   // 여기서 반환하고 스레드 놓음
        case 1: /* row 복원 */ cont.label = 2; return queryPerm(id, cont);
        case 2: /* perm 복원 */ return new User(row, perm);
    }
}
```

핵심 세 가지입니다.

1. **모든 `suspend` 함수에는 숨은 파라미터 `Continuation`이 추가된다.** "이 다음에 뭘 할지"를 담은 콜백입니다.
2. **함수 본문이 상태 기계로 재작성된다.** 중단 지점마다 `label`이 붙고, 재개하면 그 지점부터 이어 실행합니다.
3. **중단이 곧 `return`이다.** 스레드는 그 순간 자유로워집니다.

그래서 `suspend` 함수는 **다른 `suspend` 함수나 코루틴 안에서만** 호출됩니다. `Continuation`을 넘겨줄 사람이 필요하니까요. Java의 콜백 지옥을 컴파일러가 대신 써주는 것 — 이게 코루틴의 정체입니다.

> 면접 단골: "`suspend` 키워드가 하는 일이 뭔가요?" 정답은 "비동기로 만든다"가 아니라 **"CPS 변환으로 상태 기계를 생성하고 Continuation 파라미터를 추가한다"** 입니다.

## 코루틴 빌더 3개

```kotlin
fun main() = runBlocking {          // (1) 블로킹 세계 → 코루틴 세계 진입
    launch { doWork("A") }          // (2) 던지고 잊기, Job 반환
    launch { doWork("B") }
}
```

- **`runBlocking`** — 현재 스레드를 **블로킹하고** 내부 코루틴이 끝날 때까지 기다립니다. `main`과 테스트 코드에서만 쓰세요. 서비스 코드에 `runBlocking`이 보이면 스레드를 블로킹하는 것이니 코루틴을 쓰는 의미가 사라집니다.
- **`launch`** — 결과값이 없는 작업을 시작하고 `Job`을 반환합니다. Java의 `executor.submit(runnable)`에 대응합니다.
- **`coroutineScope`** — `suspend` 함수이고, **자식이 전부 끝나야 반환**합니다. 블로킹하지 않고 중단만 합니다.

`runBlocking`과 `coroutineScope`는 "자식을 기다린다"는 점은 같고 **기다리는 방식**이 다릅니다. 전자는 스레드를 붙잡고, 후자는 놓아줍니다.

## 구조적 동시성 — 이 레슨의 본론

Java에서 백그라운드 작업을 던지면 그 순간 **부모와 연이 끊깁니다.**

```java
ExecutorService pool = Executors.newFixedThreadPool(4);
Future<?> f1 = pool.submit(() -> stepA());
Future<?> f2 = pool.submit(() -> stepB());
// 여기서 메서드가 그냥 끝나버리면? 두 작업은 계속 돈다 (유출)
// f1 이 터지면? f2 는 아무것도 모른 채 계속 돈다
// 취소하려면? 모든 Future 를 내가 들고 다니며 일일이 cancel
```

이게 실무에서 나오는 버그의 모양입니다. 작업 누수, 고아 스레드, 요청은 타임아웃됐는데 뒤에서 계속 도는 DB 쿼리.

코루틴은 **스코프가 자식을 소유**합니다.

```kotlin
suspend fun process() = coroutineScope {
    launch { stepA() }
    launch { stepB() }
}   // 두 자식이 모두 끝나야 이 줄을 통과한다 — 예외 없음
```

구조적 동시성이 보장하는 3가지:

1. **부모는 모든 자식이 끝날 때까지 완료되지 않는다.** 작업 누수가 구조적으로 불가능합니다.
2. **자식 하나가 실패하면 형제들이 취소되고, 예외가 부모로 전파된다.** `try/catch`로 잡을 수 있습니다.
3. **부모가 취소되면 자식 전체가 취소된다.** 재귀적으로요.

```kotlin
suspend fun risky(): String = try {
    coroutineScope {
        launch { delay(50); throw IllegalStateException("재고 부족") }
        launch { delay(500); println("이 줄은 실행되지 않는다") }  // 형제 실패로 취소됨
        "성공"
    }
} catch (e: IllegalStateException) {
    "실패: ${e.message}"
}
```

`ExecutorService`로 이 동작을 직접 구현하려면 `Future` 목록 관리 + 예외 감시 + 전파 취소를 전부 손으로 짜야 합니다. Java 21의 `StructuredTaskScope`가 바로 이 개념을 뒤늦게 가져온 것이고요.

> 실무 경고: `GlobalScope.launch`는 **부모가 없는 코루틴**입니다. 구조적 동시성을 스스로 꺼버리는 스위치예요. 리뷰에서 보이면 `!!`와 같은 취급을 하세요. Spring에서는 보통 요청 스코프나 컴포넌트가 소유한 `CoroutineScope`를 씁니다.

## 연습

주문 처리 파이프라인을 구조적 동시성으로 짭니다. 두 함수를 완성하세요.

1. **`processAll`** — `coroutineScope` 안에서 `launch` 3개로 `handle`을 호출합니다. 순서대로 `inventory`(100ms), `payment`(200ms), `shipping`(300ms). 셋이 **병렬로** 돌고, 셋 다 끝나야 함수가 반환돼야 합니다.
2. **`riskyAll`** — `coroutineScope` 안에서 `launch` 2개를 띄웁니다. 첫 번째는 50ms 뒤 `IllegalStateException("재고 부족")`을 던지고, 두 번째는 500ms 뒤 `println("이 줄은 출력되지 않는다")`를 실행합니다. 정상 종료되면 `"성공"`, 예외를 잡으면 `"실패: 재고 부족"`을 반환하세요.

**핵심 확인 포인트**: `processAll`이 순차 실행이라면 총 600ms, 병렬이면 300ms입니다. 그리고 `riskyAll`에서 두 번째 `launch`의 출력이 **찍히면 안 됩니다** — 형제의 실패가 그를 취소했으니까요.

```kotlin starter
import kotlinx.coroutines.*

suspend fun handle(name: String, ms: Long) {
    delay(ms)
    println("$name 완료 (${ms}ms)")
}

suspend fun processAll() {
    // TODO: coroutineScope 안에서 launch 3개로 handle 을 병렬 호출하세요.
    //       inventory=100, payment=200, shipping=300
}

suspend fun riskyAll(): String {
    // TODO: coroutineScope + try/catch 로 자식 실패 전파를 확인하세요.
    //       자식1: delay(50) 후 IllegalStateException("재고 부족")
    //       자식2: delay(500) 후 println("이 줄은 출력되지 않는다")
    //       정상이면 "성공", 잡으면 "실패: ${e.message}"
    TODO("구현하세요")
}

fun main() = runBlocking {
    println("주문 처리 시작")
    processAll()
    println("모든 하위 작업 완료")
    println(riskyAll())
}
```

```text expected
주문 처리 시작
inventory 완료 (100ms)
payment 완료 (200ms)
shipping 완료 (300ms)
모든 하위 작업 완료
실패: 재고 부족
```
