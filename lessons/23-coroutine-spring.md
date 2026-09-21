# Lesson 23 — Spring 에서의 코루틴과 가상 스레드

JDK 21이 나오면서 질문이 하나 늘었습니다. **"가상 스레드(virtual threads)가 있는데 코루틴을 왜 쓰죠?"**

면접에서 거의 확실하게 나오는 질문입니다. 그리고 *"코루틴이 더 빨라서요"* 는 틀린 답입니다. 제대로 정리합시다.

## 먼저: Spring MVC 에서 `suspend` 컨트롤러가 되나?

**됩니다.** Spring Boot 3.x + `spring-boot-starter-web`(MVC, 톰캣) 환경에서도 그냥 됩니다.

```kotlin
@RestController
class OrderController(private val service: OrderService) {

    @GetMapping("/orders/{id}")
    suspend fun get(@PathVariable id: Long): OrderResponse = service.find(id)
}
```

조건은 딱 하나, 클래스패스에 **`kotlinx-coroutines-reactor`** 가 있어야 합니다. Spring이 반환 타입의 `suspend`를 감지하면 `kotlinx.coroutines.reactor.mono { }` 로 감싸서 실행하거든요. 그래서 리액터 브리지가 필요합니다.

> **착각하기 쉬운 지점.** MVC에서 `suspend` 컨트롤러를 쓴다고 **서버 처리량이 늘지 않습니다.** 톰캣 스레드는 여전히 요청 하나를 잡고 있어요(정확히는 서블릿 비동기로 풀렸다가 응답 시점에 다시 잡힘). 얻는 건 **처리량이 아니라 코드 구조** — `async`로 병렬 조회하고 `withTimeout`으로 자르는 게 쉬워지는 것뿐입니다. 진짜 처리량을 원하면 WebFlux로 가거나 가상 스레드를 켜야 합니다.

## WebFlux + 코루틴 — 코루틴의 홈그라운드

```kotlin
// Reactor — 읽기 어렵고 스택트레이스가 지옥
fun get(id: Long): Mono<OrderResponse> =
    orderRepo.findById(id)
        .flatMap { order ->
            Mono.zip(userRepo.findById(order.userId), pointRepo.findById(order.userId))
                .map { t -> OrderResponse.of(order, t.t1, t.t2) }
        }
        .switchIfEmpty(Mono.error(NotFoundException()))

// 코루틴 — 그냥 순차 코드처럼 읽힌다
suspend fun get(id: Long): OrderResponse = coroutineScope {
    val order = orderRepo.findById(id) ?: throw NotFoundException()
    val user = async { userRepo.findById(order.userId) }
    val point = async { pointRepo.findById(order.userId) }
    OrderResponse.of(order, user.await(), point.await())
}
```

**이게 WebFlux + 코루틴을 쓰는 이유 전부입니다.** 논블로킹 성능은 그대로 가져가면서 콜백 체인을 일반 코드처럼 쓰는 것. `Flow` ↔ `Flux`, `suspend T` ↔ `Mono<T>` 는 확장 함수로 왔다 갔다 합니다(`flux.asFlow()`, `flow.asFlux()`, `mono.awaitSingleOrNull()`).

## 가상 스레드(JDK 21) — 무엇이 달라지나

```yaml
# application.yml
spring.threads.virtual.enabled: true
```

이 한 줄이면 톰캣이 요청마다 가상 스레드를 씁니다. 그러면 **기존 블로킹 JDBC 코드를 한 글자도 안 고쳐도** 됩니다. `repo.findById()`가 소켓에서 블로킹되는 순간 JVM이 가상 스레드를 캐리어 스레드에서 **떼어내고(unmount)** 다른 가상 스레드를 올리거든요. OS 스레드는 놀지 않습니다.

| | 코루틴 | 가상 스레드 |
|---|---|---|
| 레벨 | 언어/라이브러리 (컴파일러가 상태머신 변환) | **JVM 런타임** |
| 코드 변경 | `suspend` 전파 필요 (함수 색깔 문제) | **없음** |
| Java 블로킹 라이브러리 | 스레드를 진짜 점유 | 대부분 그냥 동작 |
| 취소 | **구조적 동시성 — 1급 기능** | `interrupt()` — 협조적, 불편 |
| 병렬 합성 | `async`/`awaitAll`/`select`/`Flow` | `StructuredTaskScope`(JDK 21 프리뷰) |
| 백프레셔 스트림 | `Flow` — 성숙 | 없음 |
| 비용 | 객체 하나 수준(수백 바이트) | 스레드 객체 + 힙 스택(수 KB) |

**둘은 경쟁 관계가 아니라 층이 다릅니다.** 가상 스레드는 "블로킹을 싸게 만드는 것", 코루틴은 "동시성을 구조적으로 표현하는 것"입니다.

### 무엇을 언제 쓰나

**가상 스레드만 켠다** — 대부분의 CRUD API. 기존 MVC + JPA + JDBC 스택에서 코드를 안 고치고 I/O 대기 처리량만 올리고 싶을 때. **비용 대비 효과가 가장 큰 선택**이고 팀 학습 곡선이 0입니다.

**코루틴을 쓴다** — 요청 하나가 **여러 외부 호출을 합성**해야 할 때. 병렬 조회, 타임아웃, 부분 실패, 취소 전파, 스트리밍. `StructuredTaskScope`는 아직 프리뷰고 코루틴만큼 성숙하지 않습니다.

**둘 다 쓴다** — 실제로 가능하고 꽤 좋은 조합입니다.

```kotlin
private val jdbcDispatcher = Executors.newVirtualThreadPerTaskExecutor()
    .asCoroutineDispatcher()

suspend fun summary(id: Long): Summary = coroutineScope {
    val order = async(jdbcDispatcher) { orderRepo.findById(id) }   // 블로킹 JDBC
    val point = async(jdbcDispatcher) { pointRepo.findById(id) }   // 블로킹 JDBC
    Summary(order.await(), point.await())
}
```

### `Dispatchers.IO` vs 가상 스레드 executor

`Dispatchers.IO`는 **상한이 있는 플랫폼 스레드 풀**입니다(기본 64개). 블로킹 호출 65개가 동시에 오면 65번째는 대기해요. 가상 스레드 executor는 사실상 무제한이고 블로킹해도 캐리어 스레드를 안 잡습니다. 그럼 후자가 항상 낫냐 — **아닙니다.**

1. **DB 커넥션 풀이 진짜 상한입니다.** HikariCP가 10개면 가상 스레드 10,000개가 커넥션 하나 받으려고 줄 섭니다. `Dispatchers.IO`의 64는 사실 **의도치 않은 백프레셔** 역할을 하고 있었어요. 무제한으로 풀면 대기 큐가 힙에 쌓입니다.
2. **핀닝(pinning).** `synchronized` 블록 안에서 블로킹하면 가상 스레드가 캐리어 스레드에 **고정**되어 unmount가 안 됩니다. JDK 21 기준 구형 JDBC 드라이버에 `synchronized`가 남아 있는 경우가 있습니다(JDK 24에서 대부분 해소됐지만, 운영 JDK가 21이면 확인 대상입니다).

> **결론.** 블로킹 I/O는 `withContext(Dispatchers.IO)` 가 여전히 안전한 기본값입니다. 가상 스레드 디스패처는 **커넥션 풀 같은 자체 상한이 이미 있는 경우**에 의미가 있습니다.

## 블로킹 호출을 코루틴에서 다루는 법 — 철칙

```kotlin
// ❌ suspend 함수 안에서 그냥 블로킹 — 호출자의 디스패처 스레드를 점유해버린다
suspend fun bad(id: Long): Order = jdbcRepo.findById(id)

// ✅ 반드시 디스패처를 바꿔서
suspend fun good(id: Long): Order = withContext(Dispatchers.IO) { jdbcRepo.findById(id) }
```

WebFlux에서 위쪽을 하면 **이벤트 루프 스레드(`reactor-http-nio`)가 멈추고**, 그 스레드가 담당하던 수천 커넥션이 전부 멈춥니다. 장애 원인 분석하다 보면 이거인 경우가 정말 많아요.

**규칙: `suspend` 함수는 어느 스레드에서 호출되든 안전해야 합니다.** 블로킹이 들어간다면 그 함수가 **스스로** `withContext(Dispatchers.IO)`로 감싸야지 호출자에게 떠넘기면 안 됩니다. 이걸 **main-safety** 라고 부릅니다.

## 구조적 동시성과 요청 취소

코루틴이 가상 스레드보다 확실히 앞서는 지점입니다. 클라이언트가 연결을 끊었는데 서버는 외부 API 3개를 계속 호출하고 있다면 낭비죠.

`coroutineScope`는 **자식 전부가 끝나야 반환**합니다. 그리고 자식 하나가 실패하면 형제들이 **자동 취소**되고 예외가 부모로 전파됩니다. 부모가 취소되면 자식 전부가 취소되고요. WebFlux에서 **클라이언트가 연결을 끊으면** 리액티브 구독이 취소되고, 그게 코루틴 취소로 이어집니다. 즉 **연결 끊김이 외부 호출 3개의 취소까지 자동 전파**됩니다. 스레드 기반이라면 `Future` 핸들을 모아두고 수동으로 `cancel(true)` 를 돌려야 해요.

취소 시 자원 정리는 `try/finally`입니다. 단, 취소된 코루틴에서는 `finally` 안의 `suspend` 호출이 즉시 `CancellationException`을 던지니, 정리에 suspend가 필요하면 `withContext(NonCancellable) { }` 로 감싸세요.

그리고 **`CancellationException`을 삼키지 마세요.**

```kotlin
// ❌ 취소 메커니즘이 망가진다 — 취소됐는데도 계속 도는 좀비 코루틴이 생긴다
try { externalCall() } catch (e: Exception) { log.error(e) }

// ✅
try {
    externalCall()
} catch (e: CancellationException) {
    throw e
} catch (e: Exception) {
    log.error(e)
}
```

## 면접에서 이렇게 답하세요

> **"가상 스레드가 코루틴을 대체하나요?"**
>
> *"대체하지 않습니다. 층이 다릅니다. 가상 스레드는 JVM 런타임이 블로킹 비용을 낮추는 것이고, 코루틴은 언어 수준에서 동시성을 구조적으로 표현하는 것입니다. 단순 블로킹 CRUD API라면 가상 스레드만 켜는 게 코드 변경 없이 처리량을 올리는 최선입니다. 반면 요청 하나가 여러 외부 호출을 합성하고 부분 실패와 취소 전파가 필요하면 코루틴의 구조적 동시성이 유리합니다. 둘을 같이 쓸 수도 있는데, 그때는 커넥션 풀이 실질 상한이라는 점과 `synchronized` 핀닝을 함께 봐야 합니다."*

여기까지 말하면 "실제로 고민해 본 사람"으로 읽힙니다.

## 연습

순차 실행과 병렬 실행의 **동작 차이를 눈으로 확인**하고, 취소가 자원 정리로 이어지는 걸 확인합니다. 시간은 출력하지 않습니다 — **완료 순서**가 증거입니다.

`blockingFetch`는 `Thread.sleep`을 쓰는 블로킹 API입니다 (JDBC라고 생각하세요). 세 가지를 완성하세요.

1. **`fetch`** — `blockingFetch`를 `withContext(Dispatchers.IO)`로 감싸고, 결과를 받으면 `[태그] 완료: 결과`를 출력한 뒤 반환합니다. (main-safety 규칙)
2. **`parallel`** — `coroutineScope` 안에서 `async` 3개로 동시에 띄우고 `awaitAll`로 모읍니다.
3. **취소 블록** — `launch` 안에 `try/finally`를 두고, `finally`에서 `[취소] 정리: 커넥션 반납`을 출력합니다. `delay(10_000)`은 취소돼서 절대 완료되지 않습니다.

지연 시간은 결제 150ms, 배송 100ms, 리뷰 50ms 입니다. 순차는 **호출 순서대로**, 병렬은 **짧은 것부터** 완료됩니다. `awaitAll`의 결과는 두 경우 모두 **선언 순서**라는 점도 확인하세요.

```kotlin starter
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.awaitAll
import kotlinx.coroutines.cancelAndJoin
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.withContext

// 블로킹 API (JDBC / RestTemplate 이라고 생각하세요) — 수정하지 마세요
fun blockingFetch(name: String, millis: Long): String {
    Thread.sleep(millis)
    return name
}

// 블로킹 호출을 코루틴에서 안전하게 감싸기
suspend fun fetch(name: String, millis: Long, tag: String): String {
    // TODO: withContext(Dispatchers.IO) 로 blockingFetch 를 감싸고,
    //       결과를 받으면 "[$tag] 완료: $결과" 를 출력한 뒤 반환하세요.
    TODO("구현하세요")
}

suspend fun sequential(): List<String> {
    println("[순차] 시작")
    val a = fetch("결제", 150, "순차")
    val b = fetch("배송", 100, "순차")
    val c = fetch("리뷰", 50, "순차")
    return listOf(a, b, c)
}

suspend fun parallel(): List<String> = coroutineScope {
    println("[병렬] 시작")
    // TODO: async 3개로 결제(150)·배송(100)·리뷰(50) 를 동시에 띄우고
    //       awaitAll 로 선언 순서대로 모아 반환하세요. 태그는 "병렬".
    TODO("구현하세요")
}

fun main() = runBlocking {
    println("결과=${sequential()}")
    println("결과=${parallel()}")

    // 구조적 동시성: 부모가 취소되면 자식의 finally 가 반드시 돈다
    println("[취소] 시작")
    val job = launch(Dispatchers.IO) {
        // TODO: try 안에서 delay(10_000) 후 "[취소] 여기는 절대 출력되지 않는다" 를 출력하고,
        //       finally 에서 "[취소] 정리: 커넥션 반납" 을 출력하세요.
    }
    delay(100)
    job.cancelAndJoin()
    println("[취소] 요청 종료")
}
```

```text expected
[순차] 시작
[순차] 완료: 결제
[순차] 완료: 배송
[순차] 완료: 리뷰
결과=[결제, 배송, 리뷰]
[병렬] 시작
[병렬] 완료: 리뷰
[병렬] 완료: 배송
[병렬] 완료: 결제
결과=[결제, 배송, 리뷰]
[취소] 시작
[취소] 정리: 커넥션 반납
[취소] 요청 종료
```
