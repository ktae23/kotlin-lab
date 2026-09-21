# Lesson 12 — async/await 와 병렬 분해

백엔드에서 제일 자주 만나는 동시성 시나리오는 딱 하나입니다. **"외부 호출 3개를 동시에 던지고, 다 모이면 합쳐서 응답한다."** 이 레슨은 그걸 제대로 짜는 법입니다.

## launch 와 async

Lesson 10의 `launch`는 결과값이 없었습니다(`Job` 반환). 결과가 필요하면 `async`입니다.

```kotlin
val deferred: Deferred<User> = async { fetchUser(id) }
val user: User = deferred.await()
```

`Deferred<T>`는 `Job`을 상속한 **결과 있는 Job**입니다. Java의 `Future<T>`와 닮았지만 결정적 차이가 있습니다.

| | `Future.get()` | `Deferred.await()` |
|---|---|---|
| 대기 | **스레드 블로킹** | 중단 (스레드 반납) |
| 예외 | `ExecutionException`으로 래핑 | 원래 예외 그대로 |
| 취소 전파 | 수동 | 부모-자식 구조로 자동 |
| 형제 실패 | 서로 모름 | 서로 취소 |

`CompletableFuture`로 `thenCombine`을 엮어본 적 있다면, 그 체인이 아래 코드로 줄어드는 걸 보게 됩니다.

## 순차 vs 병렬 — await 를 어디에 두는가

이 차이가 신입과 경력을 가르는 한 줄입니다.

```kotlin
// 순차 — 900ms. async 를 썼는데도 병렬이 아니다!
suspend fun bad(): String {
    val a = async { fetchProfile() }.await()   // 여기서 이미 기다림
    val b = async { fetchOrders() }.await()
    val c = async { fetchPoints() }.await()
    return "$a $b $c"
}

// 병렬 — 300ms
suspend fun good(): String = coroutineScope {
    val a = async { fetchProfile() }   // 셋 다 시작만 시킨다
    val b = async { fetchOrders() }
    val c = async { fetchPoints() }
    "${a.await()} ${b.await()} ${c.await()}"   // 그 다음에 모은다
}
```

규칙은 **"전부 시작한 뒤에 전부 기다린다."** `async` 호출과 `await` 호출 사이에 다른 `async`가 들어갈 자리를 만드는 겁니다. `await()`을 `async` 바로 옆에 붙이는 순간 동기 호출과 똑같아집니다.

> 코드 리뷰에서 `async { ... }.await()` 한 줄이 보이면 거의 항상 버그입니다. 그건 그냥 `withContext`로 쓰면 될 코드예요.

개수가 유동적이면 `awaitAll`을 씁니다.

```kotlin
suspend fun fetchAll(ids: List<Long>): List<User> = coroutineScope {
    ids.map { id -> async { fetchUser(id) } }.awaitAll()
}
```

`map { async { } }`로 전부 띄우고 `awaitAll()`로 한 번에 모읍니다. **`map { async { }.await() }`로 쓰면 순차 실행**이니 조심하세요. 같은 함정의 리스트 버전입니다.

## 병렬 분해 (parallel decomposition)

하나의 논리적 작업을 독립적인 조각으로 쪼개 동시에 실행하고 합치는 패턴입니다. 대시보드 API가 교과서적 예시죠.

```kotlin
suspend fun loadDashboard(userId: Long): Dashboard = coroutineScope {
    val profile = async { userClient.get(userId) }
    val orders  = async { orderClient.count(userId) }
    val points  = async { pointClient.balance(userId) }
    Dashboard(profile.await(), orders.await(), points.await())
}
```

이 함수의 성질을 하나씩 보세요.

- **바깥에서 보면 그냥 `suspend` 함수** 하나입니다. 호출자는 내부가 병렬인지 몰라도 됩니다.
- **`coroutineScope`라서 셋이 다 끝나야 반환**합니다. 누수 없습니다.
- **호출자가 취소되면 세 HTTP 호출이 전부 취소**됩니다. 요청 타임아웃 때 자원이 정리된다는 뜻입니다.
- **하나가 터지면 나머지 둘이 즉시 취소되고** 예외가 올라옵니다.

마지막 항목이 핵심입니다. 포인트 조회가 실패하면 프로필/주문 호출을 계속 붙잡고 있을 이유가 없습니다. `CompletableFuture.allOf`는 이걸 안 해줍니다 — 실패해도 나머지는 계속 돌아요.

## 실패 격리 — SupervisorJob 과 supervisorScope

그런데 항상 "하나 터지면 전부 취소"가 맞을까요? 아닙니다.

> 대시보드에 위젯 5개가 있는데 뉴스 위젯 하나가 죽었다고 페이지 전체를 500으로 돌려주면, 그건 설계 실패입니다.

기본 `Job`은 **실패를 양방향으로 전파**합니다 (자식→부모→형제들). `SupervisorJob`은 **아래에서 위로 가는 전파를 끊습니다.** 자식이 실패해도 부모와 형제는 멀쩡합니다.

```kotlin
suspend fun loadWidgets(): List<String> = supervisorScope {
    val widgets = listOf(
        async { weatherApi() },
        async { newsApi() },      // 얘가 터져도
        async { stockApi() }      // 얘는 계속 돈다
    )
    widgets.map { d -> runCatching { d.await() }.getOrElse { "FAIL" } }
}
```

두 가지를 같이 기억하세요.

1. **`supervisorScope`는 형제 취소만 막습니다.** 예외 자체는 사라지지 않고 `await()` 시점에 던져지므로, **호출부에서 반드시 잡아야** 합니다. 안 잡으면 그대로 위로 터집니다.
2. **`coroutineScope` 안에서 `SupervisorJob()`을 직접 만들어 넘기면 안 됩니다.** `async(SupervisorJob()) { }` 같은 코드는 부모-자식 관계를 끊어버려서 구조적 동시성이 깨집니다. 스코프 함수인 `supervisorScope`를 쓰세요.

| 상황 | 선택 |
|---|---|
| 셋 다 있어야 응답이 성립 (결제 = 잔액+한도+사기탐지) | `coroutineScope` |
| 일부 실패해도 나머지로 화면이 성립 (대시보드 위젯) | `supervisorScope` |

## 실무 체크리스트

- 외부 API 병렬 호출은 **각각 `withTimeout`으로 감싸세요.** 하나가 무한정 늘어지면 전체가 그만큼 늘어집니다.
- `async` 남발은 금물입니다. **호출 간 의존성이 없을 때만** 병렬입니다. `A`의 결과가 `B`의 입력이면 그냥 순차로 쓰세요.
- 병렬 호출 수만큼 **하류 시스템의 부하가 곱해집니다.** 리스트 1000건에 `map { async { } }`를 걸면 DB에 동시 커넥션 1000개를 요구하는 셈입니다. 이럴 땐 `chunked()`로 나누거나 `Semaphore`로 동시 실행 수를 제한하세요.

## 연습

대시보드 API 시나리오를 병렬 분해로 구현합니다.

1. **`loadDashboard`** — `coroutineScope` 안에서 `fetchProfile`, `fetchOrderCount`, `fetchPoints`를 **동시에** 호출한 뒤 `"kim / 주문 3건 / 포인트 120"` 형태의 문자열로 합칩니다. 세 함수는 각각 300ms이므로, 순차면 900ms·병렬이면 300ms입니다.
2. **`loadWidgets`** — `supervisorScope` 안에서 `async` 3개를 띄웁니다. 각각 `delay(100)` 후 `"weather"` 반환 / `RuntimeException("news down")` 던지기 / `"stock"` 반환. 세 `Deferred`를 순회하며 `runCatching`으로 `await()`해서, 성공하면 값을 실패하면 `"FAIL"`을 담은 리스트를 반환하세요.

`main`은 `measureTimeMillis`로 1번의 소요 시간을 재서 **600ms 미만인지 Boolean으로만** 출력합니다 (시간 자체는 실행마다 다르니까요). 순차로 짜면 900ms가 나와서 `false`가 됩니다.

**핵심 확인 포인트**: 2번에서 `supervisorScope`를 `coroutineScope`로 바꿔보세요. `runCatching`으로 개별 `await()`을 감쌌는데도 **`loadWidgets()` 호출 자체가 `RuntimeException("news down")`으로 터집니다.** 자식의 실패가 이미 스코프를 실패시켰기 때문에, `await()`을 아무리 잘 감싸도 `coroutineScope`가 마지막에 예외를 다시 던져요. 실패 격리는 `try/catch`로 되는 게 아니라 **스코프 선택으로** 되는 겁니다.

```kotlin starter
import kotlinx.coroutines.*
import kotlin.system.measureTimeMillis

suspend fun fetchProfile(): String { delay(300); return "kim" }
suspend fun fetchOrderCount(): Int { delay(300); return 3 }
suspend fun fetchPoints(): Int { delay(300); return 120 }

suspend fun loadDashboard(): String {
    // TODO: coroutineScope 안에서 async 3개로 동시에 호출한 뒤 await 으로 합치세요.
    //       결과 형식: "kim / 주문 3건 / 포인트 120"
    TODO("구현하세요")
}

suspend fun loadWidgets(): List<String> {
    // TODO: supervisorScope 안에서 async 3개를 띄우세요.
    //       1) delay(100) 후 "weather"
    //       2) delay(100) 후 RuntimeException("news down") 던지기
    //       3) delay(100) 후 "stock"
    //       각각 runCatching { await() } 으로 받아 실패는 "FAIL" 로 대체한 리스트 반환
    TODO("구현하세요")
}

fun main() = runBlocking {
    lateinit var dashboard: String
    val elapsed = measureTimeMillis { dashboard = loadDashboard() }
    println("대시보드: $dashboard")
    println("병렬 실행됨(600ms 미만): ${elapsed < 600}")
    println("위젯: ${loadWidgets()}")
}
```

```text expected
대시보드: kim / 주문 3건 / 포인트 120
병렬 실행됨(600ms 미만): true
위젯: [weather, FAIL, stock]
```
