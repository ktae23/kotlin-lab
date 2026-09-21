# Lesson 37 — 코루틴 테스트 — runTest 와 가상 시간

Lesson 31~36에서 코루틴을 **쓰는** 법을 봤습니다. 이제 **검증하는** 법입니다. 여기를 건너뛴 팀의 코드베이스는 증상이 똑같아요 — 테스트 스위트가 **점점 느려지고**, 가끔 이유 없이 **깨집니다(flaky)**.

원인은 하나입니다. `delay(3000)` 이 들어간 재시도 로직을 테스트하면서 **진짜로 3초를 기다리고 있기 때문**입니다.

## 문제: 시간은 테스트의 적이다

```kotlin
suspend fun fetchWithRetry(): String {
    repeat(3) { attempt ->
        try { return api.call() } catch (e: IOException) { delay(1000L * (attempt + 1)) }
    }
    throw IllegalStateException("재시도 소진")
}
```

지수 백오프 1s + 2s + 3s = **6초**. 이런 테스트가 20개면 2분입니다. 그래서 개발자들이 하는 짓이 정해져 있어요.

- `delay` 를 1ms로 줄인다 → **테스트가 검증하던 동작이 사라진다**
- `Thread.sleep(6100)` 으로 "넉넉히" 기다린다 → **CI가 느린 날 터진다 (flaky)**
- 테스트를 지운다

정답은 셋 다 아닙니다. **시계를 가짜로 바꾸는 것**입니다.

## runTest — 가상 시간(virtual time)

`kotlinx-coroutines-test` 의 `runTest` 안에서는 `delay` 가 **진짜로 기다리지 않습니다.**

```kotlin
@Test
fun `백오프 3회는 6초가 걸린다`() = runTest {
    val elapsed = testScheduler.currentTime   // 가상 시계 (ms)
    assertFailsWith<IllegalStateException> { fetchWithRetry() }
    assertEquals(6000, testScheduler.currentTime - elapsed)   // 실제 실행은 수 밀리초
}
```

어떻게 가능할까요? Lesson 31에서 본 것처럼 `delay` 는 **스레드를 재우지 않습니다.** 코루틴을 중단(suspend)시키고 "N ms 뒤에 재개하라"고 **스케줄러에 등록**할 뿐이에요.

그러니 그 스케줄러를 바꿔치면 됩니다. `TestCoroutineScheduler` 는 실제 시계 대신 **`currentTime` 이라는 숫자 변수**를 들고 있고, 대기 중인 작업이 있으면 그 숫자를 **가장 이른 예약 시각으로 점프**시킨 뒤 곧바로 재개합니다. 기다림이 아니라 **덧셈**입니다.

> 이게 핵심 통찰입니다. "코루틴의 `delay` 는 시간을 쓰는 게 아니라 **시간을 예약**한다." 예약이면 조작할 수 있죠.

## TestDispatcher 두 종류

`runTest` 는 하나의 `TestCoroutineScheduler` 를 공유하는 디스패처를 씁니다. 종류가 둘인데, **차이는 "자식 코루틴을 언제 시작하는가"** 입니다.

| | `StandardTestDispatcher` (기본) | `UnconfinedTestDispatcher` |
|---|---|---|
| `launch { }` 호출 시 | 큐에만 넣고 **바로 실행 안 함** | **즉시** 첫 중단 지점까지 실행 |
| 실행 시점 | 테스트가 양보(`yield`/`advance*`)할 때 | 호출한 그 줄에서 |
| 실제 프로덕션과 닮은 정도 | 가깝다 | 덜 닮았다 |
| 쓰는 곳 | 기본값. 순서를 **명시적으로** 제어 | "일단 시작은 돼 있어야" 하는 간단한 케이스 |

`StandardTestDispatcher` 에서 시간을 굴리는 손잡이는 세 개입니다.

| 함수 | 하는 일 |
|---|---|
| `runCurrent()` | **현재 가상 시각에 예약된 것만** 실행. 시간은 안 움직인다 |
| `advanceTimeBy(ms)` | 가상 시계를 `ms` 만큼 전진시키며 그 사이 예약된 것들을 실행 |
| `advanceUntilIdle()` | 큐가 빌 때까지 전부 실행. 시계는 마지막 예약 시각까지 점프 |

```kotlin
@Test
fun `순서를 눈으로 확인한다`() = runTest {
    val log = mutableListOf<String>()
    launch { delay(1000); log += "느림" }
    launch { delay(300); log += "빠름" }

    assertEquals(emptyList(), log)        // 아직 아무것도 시작 안 함 (Standard)
    advanceTimeBy(500)
    assertEquals(listOf("빠름"), log)     // 300ms 것만 실행됨
    advanceUntilIdle()
    assertEquals(listOf("빠름", "느림"), log)
}
```

`runTest` 는 블록이 끝날 때 **남은 작업을 자동으로 `advanceUntilIdle`** 해줍니다. 그래서 단순한 테스트는 손잡이를 안 만져도 통과해요.

## Dispatchers.setMain — Main 디스패처 교체

`Dispatchers.Main` 은 안드로이드/UI 런타임이 주입하는 디스패처라 **JVM 단위 테스트에는 존재하지 않습니다.** 그대로 두면 `IllegalStateException: Module with the Main dispatcher had failed to initialize` 가 납니다.

```kotlin
class ViewModelTest {
    private val dispatcher = StandardTestDispatcher()

    @BeforeEach fun setUp() = Dispatchers.setMain(dispatcher)
    @AfterEach  fun tearDown() = Dispatchers.resetMain()   // 반드시 되돌린다
}
```

`resetMain()` 을 빼먹으면 **다음 테스트 클래스까지 오염**됩니다. 이게 "혼자 돌리면 되는데 전체 돌리면 깨지는" 테스트의 단골 원인이에요.

서버 사이드 Spring이라면 `Dispatchers.Main` 을 쓸 일이 거의 없습니다. 대신 다음 절이 훨씬 중요합니다.

## 디스패처는 주입받아라

```kotlin
class OrderService(private val repo: OrderRepository) {
    suspend fun load(id: Long) = withContext(Dispatchers.IO) { repo.find(id) }   // ✗ 테스트 불가
}

class OrderService(
    private val repo: OrderRepository,
    private val io: CoroutineDispatcher = Dispatchers.IO,                        // ✓ 기본값 + 주입
) {
    suspend fun load(id: Long) = withContext(io) { repo.find(id) }
}
```

테스트에서는 `OrderService(repo, StandardTestDispatcher(testScheduler))` 로 넣습니다. 그러면 `withContext` 안의 `delay` 까지 **같은 가상 시계** 위에서 돕니다.

`Dispatchers.IO` 를 함수 본문에 하드코딩하면 그 함수는 **영원히 실제 스레드풀 위에서만** 돕니다. Lesson 30 체크리스트의 "디스패처 하드코딩"이 바로 이 얘기예요.

## Flow 테스트

유한한 Flow는 `toList()` 하나면 끝입니다.

```kotlin
@Test fun `변환 결과를 모은다`() = runTest {
    val result = flowOf(1, 2, 3).map { it * 10 }.toList()
    assertEquals(listOf(10, 20, 30), result)
}
```

문제는 **끝나지 않는 Flow** (`StateFlow`, 이벤트 스트림). `toList()` 하면 영원히 멈춥니다. 방법은 두 가지.

```kotlin
// 1) 개수를 정해 끊는다
val first3 = infiniteFlow.take(3).toList()

// 2) 수집을 별도 코루틴으로 띄우고 나중에 취소한다
val collected = mutableListOf<Int>()
val job = launch { stateFlow.collect { collected += it } }
advanceUntilIdle()
job.cancel()
```

2번에서 `job.cancel()` 을 빼면 `runTest` 가 **"끝나지 않은 자식이 있다"** 며 실패합니다. 친절한 실패예요 — 프로덕션이었다면 누수(leak)였을 테니까.

## 취소와 타임아웃 테스트

```kotlin
@Test fun `타임아웃이 걸린다`() = runTest {
    assertFailsWith<TimeoutCancellationException> {
        withTimeout(1000) { delay(2000) }
    }
    assertEquals(1000, currentTime)   // 정확히 1000ms 지점에서 끊긴 것까지 검증된다
}
```

가상 시간의 진가가 여기서 나옵니다. **"타임아웃이 났다"** 만이 아니라 **"정확히 1000ms에 났다"** 를 0초 만에 검증합니다. 실제 시계로는 절대 못 하는 일이에요.

취소 테스트는 `job.cancelAndJoin()` 후 `finally` 블록이 돌았는지, `isCancelled` 가 참인지를 봅니다 (Lesson 32).

## 리뷰 관점 — 테스트 코드에서 잡을 것

| 보이면 | 왜 문제인가 | 뭐라고 말할까 |
|---|---|---|
| 테스트에 `Thread.sleep` | 스레드를 진짜로 재운다. 느리고 flaky | "`runTest` 안에서 `advanceUntilIdle()` 로 바꾸죠" |
| 테스트에 `runBlocking` | 실제 시계로 돈다. `delay` 를 진짜 기다림 | "`runTest` 를 쓰면 가상 시간이 적용됩니다" |
| `delay` 를 1ms로 줄여둠 | 검증 대상이던 타이밍이 사라짐 | "시간을 줄이지 말고 시계를 바꿉시다" |
| `Dispatchers.IO` 하드코딩 | 테스트에서 갈아끼울 수 없음 | "디스패처를 생성자 파라미터로 빼주세요" |
| `GlobalScope.launch` | 테스트가 끝나도 살아 있음 | "스코프 주인을 명시하고 구조적 동시성에 맡기죠" |
| 수집 코루틴을 취소 안 함 | 테스트 누수 | "`job.cancel()` 을 넣거나 `take(n)` 으로 끊으세요" |

한 줄 요약: **테스트가 느리면 설계가 잘못된 것이다.** 코루틴 테스트에서 시간은 값이지 비용이 아닙니다.

## 연습

`kotlinx-coroutines-test` 는 이 환경의 클래스패스에 **없습니다.** 그러니 **직접 만들어 봅니다.** 위에서 설명한 `TestCoroutineScheduler` 의 뼈대는 생각보다 단순해요 — **"예약 목록 + 숫자 시계"** 가 전부입니다.

`TestScheduler` 를 완성하세요.

- `delay(ms)` — `suspendCoroutine` 으로 코루틴을 멈추고, `(현재시각 + ms, 순번, 이어갈 continuation)` 을 예약 목록에 넣는다
- `runNext()` — 예약 중 **가장 이른 것**(동점이면 순번이 작은 것)을 꺼내 `currentTime` 을 그 시각으로 옮기고 재개한다
- `advanceUntilIdle()` — 예약이 빌 때까지 반복
- `advanceTimeBy(ms)` — 목표 시각 이하인 예약만 실행하고, 마지막에 시계를 **목표 시각까지** 맞춘다

그리고 `RetryClient` 는 `delay` 를 직접 부르지 않고 **`sleep` 을 주입**받습니다. 테스트에서는 가상 시계를, 프로덕션에서는 진짜 `delay` 를 넣는 구조예요.

```kotlin starter
import kotlin.coroutines.Continuation
import kotlin.coroutines.EmptyCoroutineContext
import kotlin.coroutines.resume
import kotlin.coroutines.startCoroutine
import kotlin.coroutines.suspendCoroutine
import kotlinx.coroutines.runBlocking

class TestScheduler {
    var currentTime = 0L
        private set

    private var seq = 0L
    private val pending = mutableListOf<Scheduled>()

    private class Scheduled(val at: Long, val seq: Long, val cont: Continuation<Unit>)

    // 코루틴을 시작만 시킨다 (첫 중단 지점까지 즉시 실행)
    fun launch(block: suspend () -> Unit) {
        block.startCoroutine(Continuation(EmptyCoroutineContext) { it.getOrThrow() })
    }

    // TODO: suspendCoroutine 으로 멈추고 pending 에 예약을 넣는다
    suspend fun delay(ms: Long): Unit = TODO()

    // TODO: 가장 이른 예약 하나를 실행한다. 실행했으면 true, 없으면 false
    private fun runNext(): Boolean = TODO()

    // TODO: 예약이 빌 때까지
    fun advanceUntilIdle() {
    }

    // TODO: 목표 시각까지만. 마지막에 currentTime 을 목표 시각으로 맞춘다
    fun advanceTimeBy(ms: Long) {
    }
}

class RetryClient(private val sleep: suspend (Long) -> Unit) {
    var attempts = 0
        private set

    // TODO: failTimes 회 실패(시도 후 1s, 2s, 3s... 백오프) 뒤 마지막 시도에서 "OK"
    suspend fun fetch(failTimes: Int): String = TODO()
}

fun main() = runBlocking {
    val started = System.currentTimeMillis()

    val sched = TestScheduler()
    val done = mutableListOf<String>()
    sched.launch { sched.delay(1000); done += "느린작업 완료 @${sched.currentTime}ms" }
    sched.launch { sched.delay(300); done += "빠른작업 완료 @${sched.currentTime}ms" }

    println("[1] 시작 직후 — 가상시간 ${sched.currentTime}ms, 완료 ${done.size}건")
    sched.advanceTimeBy(500)
    println("[2] 500ms 진행 — 가상시간 ${sched.currentTime}ms, 완료 ${done.size}건")
    sched.advanceUntilIdle()
    println("[3] 끝까지 진행 — 가상시간 ${sched.currentTime}ms, 완료 ${done.size}건")
    done.forEach { println("    $it") }

    val retrySched = TestScheduler()
    val client = RetryClient(retrySched::delay)
    var result = "미완료"
    retrySched.launch { result = client.fetch(3) }
    retrySched.advanceUntilIdle()
    println("[4] 백오프 재시도 — 결과 $result, 시도 ${client.attempts}회, 가상 소요 ${retrySched.currentTime}ms")

    println("[5] 실제 경과 1초 미만: ${System.currentTimeMillis() - started < 1000}")
}
```

```text expected
[1] 시작 직후 — 가상시간 0ms, 완료 0건
[2] 500ms 진행 — 가상시간 500ms, 완료 1건
[3] 끝까지 진행 — 가상시간 1000ms, 완료 2건
    빠른작업 완료 @300ms
    느린작업 완료 @1000ms
[4] 백오프 재시도 — 결과 OK, 시도 4회, 가상 소요 6000ms
[5] 실제 경과 1초 미만: true
```

```text hint
가장 중요한 감각부터. **`delay` 는 기다리는 게 아니라 "나를 나중에 깨워달라"고 등록하고 멈추는 것**입니다. 그 "나"에 해당하는 물건이 `Continuation` 이고, `suspendCoroutine { cont -> ... }` 이 그걸 손에 쥐여줍니다. 블록 안에서 `cont` 를 어딘가 보관만 하고 리턴하면 코루틴은 **멈춘 채로** 남아요. 나중에 `cont.resume(Unit)` 을 부르는 순간 멈췄던 그 줄 다음부터 이어집니다. 시계를 "진행시킨다"는 건 결국 **보관해둔 continuation 을 순서대로 깨우는 것**뿐입니다.
---
쓸 도구는 import 에 다 있습니다. `suspendCoroutine { cont -> pending += Scheduled(currentTime + ms, seq++, cont) }`, 그리고 재개는 `cont.resume(Unit)`. 가장 이른 예약을 고르는 건 기준이 둘(`at`, `seq`)이라 `pending.minWithOrNull(compareBy({ it.at }, { it.seq }))` 입니다. `advanceTimeBy` 는 `while (pending.any { it.at <= target }) runNext()` 로 돌리세요. `RetryClient.fetch` 는 `repeat(failTimes) { i -> attempts++; sleep(1000L * (i + 1)) }` 뒤에 `attempts++` 하고 `"OK"` 를 반환합니다.
---
함정 셋. ① `runNext` 안의 순서가 중요합니다 — **`currentTime` 을 먼저 옮기고 나서** `resume` 해야 합니다. 반대로 하면 재개된 코루틴이 읽는 `currentTime` 이 옛날 값이라 `@300ms` 가 `@0ms` 로 찍혀요. ② `resume` 을 부르면 그 코루틴이 **그 자리에서 동기적으로** 이어 달리다가 또 `delay` 를 만나 `pending` 에 추가할 수 있습니다. 그래서 목록을 for 로 순회하면 안 되고, **매번 최솟값을 다시 고르는** 루프여야 합니다. ③ `advanceTimeBy(500)` 은 300ms 예약만 실행하지만 시계는 **500ms** 여야 합니다 — 루프가 끝난 뒤 `currentTime = target` 을 한 번 더 찍어주세요. ④ `seq` 는 같은 시각에 예약된 둘의 순서를 고정해 **출력을 결정적으로** 만드는 장치입니다.
---
뼈대입니다. 빈칸만 채우면 돼요.

`suspend fun delay(ms: Long): Unit = suspendCoroutine { cont -> pending += Scheduled(___ + ms, seq++, cont) }`

`private fun runNext(): Boolean { val next = pending.___(compareBy({ it.at }, { it.seq })) ?: return false; pending.remove(next); currentTime = ___; next.cont.___(Unit); return true }`

`fun advanceUntilIdle() { while (___()) { } }`

`fun advanceTimeBy(ms: Long) { val target = currentTime + ms; while (pending.any { it.at <= ___ }) runNext(); currentTime = ___ }`

`suspend fun fetch(failTimes: Int): String { repeat(failTimes) { i -> attempts++; sleep(___) }; attempts++; return "OK" }`
```

```kotlin solution
import kotlin.coroutines.Continuation
import kotlin.coroutines.EmptyCoroutineContext
import kotlin.coroutines.resume
import kotlin.coroutines.startCoroutine
import kotlin.coroutines.suspendCoroutine
import kotlinx.coroutines.runBlocking

class TestScheduler {
    var currentTime = 0L
        private set

    private var seq = 0L
    private val pending = mutableListOf<Scheduled>()

    private class Scheduled(val at: Long, val seq: Long, val cont: Continuation<Unit>)

    fun launch(block: suspend () -> Unit) {
        block.startCoroutine(Continuation(EmptyCoroutineContext) { it.getOrThrow() })
    }

    // 기다리지 않는다. continuation 을 보관하고 멈출 뿐이다.
    suspend fun delay(ms: Long): Unit = suspendCoroutine { cont ->
        pending += Scheduled(currentTime + ms, seq++, cont)
    }

    // 시계를 먼저 옮기고 재개해야, 재개된 코루틴이 올바른 currentTime 을 읽는다.
    private fun runNext(): Boolean {
        val next = pending.minWithOrNull(compareBy({ it.at }, { it.seq })) ?: return false
        pending.remove(next)
        currentTime = next.at
        next.cont.resume(Unit)
        return true
    }

    // resume 중에 새 예약이 들어올 수 있으므로 매번 최솟값을 다시 고른다.
    fun advanceUntilIdle() {
        while (runNext()) { /* 예약이 빌 때까지 */ }
    }

    fun advanceTimeBy(ms: Long) {
        val target = currentTime + ms
        while (pending.any { it.at <= target }) runNext()
        currentTime = target
    }
}

// 지연을 주입받는다 — 테스트에선 가상 시계, 프로덕션에선 진짜 delay.
class RetryClient(private val sleep: suspend (Long) -> Unit) {
    var attempts = 0
        private set

    suspend fun fetch(failTimes: Int): String {
        repeat(failTimes) { i ->
            attempts++
            sleep(1000L * (i + 1))
        }
        attempts++
        return "OK"
    }
}

fun main() = runBlocking {
    val started = System.currentTimeMillis()

    val sched = TestScheduler()
    val done = mutableListOf<String>()
    sched.launch { sched.delay(1000); done += "느린작업 완료 @${sched.currentTime}ms" }
    sched.launch { sched.delay(300); done += "빠른작업 완료 @${sched.currentTime}ms" }

    println("[1] 시작 직후 — 가상시간 ${sched.currentTime}ms, 완료 ${done.size}건")
    sched.advanceTimeBy(500)
    println("[2] 500ms 진행 — 가상시간 ${sched.currentTime}ms, 완료 ${done.size}건")
    sched.advanceUntilIdle()
    println("[3] 끝까지 진행 — 가상시간 ${sched.currentTime}ms, 완료 ${done.size}건")
    done.forEach { println("    $it") }

    val retrySched = TestScheduler()
    val client = RetryClient(retrySched::delay)
    var result = "미완료"
    retrySched.launch { result = client.fetch(3) }
    retrySched.advanceUntilIdle()
    println("[4] 백오프 재시도 — 결과 $result, 시도 ${client.attempts}회, 가상 소요 ${retrySched.currentTime}ms")

    println("[5] 실제 경과 1초 미만: ${System.currentTimeMillis() - started < 1000}")
}
```
