# Lesson 22 — Kotlin 테스트: Kotest 와 MockK

Java/Spring 5년 하셨으면 JUnit5 + AssertJ + Mockito 조합은 손에 붙어 있을 겁니다. Kotlin에서 **그대로 써도 됩니다.** 실제로 많은 팀이 그렇게 써요. 그런데 Mockito는 Kotlin에서 **구조적으로 불편합니다.** 취향 문제가 아니라, 왜 그런지부터 봅시다.

## Mockito가 Kotlin에서 불편한 진짜 이유

Kotlin 클래스는 **기본이 `final`** 입니다(Lesson 12). Mockito는 서브클래싱으로 mock을 만들고요.

```kotlin
class OrderService(private val repo: OrderRepository)   // final!

val service = mock(OrderService::class.java)   // MockitoException: Cannot mock/spy
```

해결책 세 개가 전부 찜찜합니다. 클래스마다 `open` 붙이기(**테스트 때문에 프로덕션 설계를 훼손**), all-open 플러그인(빌드 복잡도), `mock-maker-inline`(바이트코드 조작, 느림). 결정타는 따로 있는데, **`suspend` 함수 모킹이 지저분합니다.** `suspend fun`은 컴파일되면 `Continuation` 파라미터가 붙은 함수라 `when(repo.find(1))` 같은 스텁이 그대로 안 먹어요.

> **면접 포인트.** "Kotlin에서 왜 MockK를 쓰나요?"는 실제로 나옵니다. 답: *"Kotlin 클래스가 final 기본이라 Mockito는 우회 설정이 필요하고, suspend 함수 모킹이 1급 지원되지 않기 때문"* — 여기까지면 충분합니다.

## MockK — Kotlin을 전제로 만든 모킹 라이브러리

```kotlin
val repo = mockk<OrderRepository>()          // final 클래스도 그냥 됨

every { repo.findById(1L) } returns Order(1L, "맥북")
coEvery { repo.findByIdAsync(1L) } returns Order(1L, "맥북")   // suspend 전용

OrderService(repo).title(1L) shouldBe "맥북"

verify(exactly = 1) { repo.findById(1L) }
coVerify { repo.findByIdAsync(any()) }
```

| Mockito | MockK | 비고 |
|---|---|---|
| `mock(X.class)` | `mockk<X>()` | final 클래스 OK |
| `when(x.f()).thenReturn(v)` | `every { x.f() } returns v` | 람다 안이라 타입 추론됨 |
| (없음) | `coEvery { }` / `coVerify { }` | **suspend 전용** |
| `verify(x).f()` | `verify { x.f() }` | |
| `spy(obj)` | `spyk(obj)` | |
| `mock(RELAXED)` | `mockk(relaxed = true)` | 스텁 안 한 호출은 기본값 |

`relaxed = true`는 편하지만 **남용 금지**입니다. 스텁 안 한 호출이 조용히 `0`/`null`을 반환해서, 통과하는데 아무것도 검증 안 하는 테스트가 됩니다.

## Kotest — 테스트를 문장으로 쓴다

JUnit5는 시나리오를 `createOrder_whenStockInsufficient_throwsException` 같은 메서드 이름에 욱여넣고 `@DisplayName`으로 한글을 덧붙입니다. Kotest는 **문자열이 곧 테스트 이름**입니다.

```kotlin
class OrderServiceTest : StringSpec({
    "재고가 부족하면 주문 생성이 실패한다" {
        shouldThrow<OutOfStockException> { service.create(req) }
    }

    "재고가 충분하면 주문이 생성된다" {
        service.create(req).status shouldBe OrderStatus.CREATED
    }
})
```

### 스펙 스타일 — 두 개만 알면 됩니다

`StringSpec`은 평평한 테스트로 대부분 여기서 끝납니다. 도메인 시나리오가 복잡하면 `BehaviorSpec`:

```kotlin
BehaviorSpec({
    given("재고가 3개인 상품이") {
        val product = Product(id = 1L, stock = 3)
        `when`("5개 주문이 들어오면") {
            val result = runCatching { service.order(product, 5) }
            then("OutOfStockException 이 발생한다") {
                result.exceptionOrNull().shouldBeInstanceOf<OutOfStockException>()
            }
        }
    }
})
```

Given의 준비 코드를 When 여러 개가 공유하니 중복이 줍니다. `when`이 Kotlin 키워드라 백틱이 필요한 게 유일한 흠이에요.

> 팀에 처음 도입할 땐 **`StringSpec` 하나로 통일**하세요. 스타일이 10개인데 팀원마다 다른 걸 쓰면 그게 더 큰 비용입니다.

### 매처 — AssertJ와 비교

```kotlin
assertThat(x).isEqualTo(y)       →  x shouldBe y
assertThat(list).hasSize(3)      →  list shouldHaveSize 3
assertThat(s).startsWith("OR")   →  s shouldStartWith "OR"
assertThatThrownBy { }.isInstanceOf(E::class.java)  →  shouldThrow<E> { }
```

`shouldBe`는 **`infix` 함수**(Lesson 7)입니다. Kotlin 문법만으로 DSL이 나오는 거지 마법이 아니에요 — 연습에서 직접 만듭니다. 그리고 `order.shouldNotBeNull()` 뒤에는 **스마트 캐스트가 걸려서** `order.title`을 `?.` 없이 바로 씁니다(`contract` 덕분). AssertJ엔 없는 이점입니다.

## 테스트 픽스처는 기본값 있는 팩토리 함수

Java에서 빌더나 `@Builder`를 쓰던 자리가 **기본값 + 이름 있는 인자**로 끝납니다.

```kotlin
fun order(
    id: Long = 1L,
    status: OrderStatus = OrderStatus.CREATED,
    amount: Int = 10_000,
) = Order(id, status, amount)

val canceled = order(status = OrderStatus.CANCELED)   // 관심 있는 필드만
```

**테스트 가독성의 핵심이 이겁니다.** `order(status = CANCELED)`를 보면 "이 테스트는 상태만 신경 쓴다"가 바로 보여요. 빌더 체인 다섯 줄보다 낫습니다. `data class`라면 `copy()`로도 같은 효과고요.

## `@SpringBootTest` vs 슬라이스 테스트

Kotlin 이야기는 아니지만 실무에서 가장 많이 틀리는 부분이라 짚습니다.

| | 뜨는 것 | 속도 | 언제 |
|---|---|---|---|
| 순수 단위 테스트 | 없음 | 수 ms | **기본값.** 서비스 로직 |
| `@DataJpaTest` | JPA + 내장DB/Testcontainers | ~1초 | 쿼리·매핑 검증 |
| `@WebMvcTest` | MVC 계층 + 컨트롤러만 | ~1초 | 직렬화·검증·상태코드 |
| `@SpringBootTest` | **전체 컨텍스트** | 수~수십 초 | 종단 시나리오 **소수만** |

Kotlin + Boot 3.x 에서는 **테스트 클래스도 생성자 주입**이 됩니다(`class OrderControllerTest(private val mvc: MockMvc)`). `@Autowired` 필드 범벅이 사라져요. 다만 `@MockkBean`(springmockk)은 여전히 필드 주입이라 `lateinit var`가 필요합니다.

> **경고.** `@SpringBootTest`를 습관적으로 붙이는 팀은 1년 뒤 CI가 20분 걸립니다. *"이 테스트가 정말 스프링 컨텍스트를 필요로 하는가?"* — 서비스 로직 테스트는 대부분 **아닙니다.** 생성자에 mock 넣고 끝내세요.

## 코루틴 테스트 — `runTest` 와 가상 시간

`delay(1000)`이 든 코드를 테스트할 때 진짜 1초를 기다릴 순 없죠.

```kotlin
@Test
fun `재시도는 3번까지 한다`() = runTest {      // kotlinx-coroutines-test
    service.fetchWithRetry() shouldBe "성공"   // 내부에 delay(1000) 세 번
}                                              // 실제 소요: 수 ms
```

`runTest`는 **가상 시간(virtual time)** 스케줄러를 씁니다. `delay(1000)`을 만나면 시계를 즉시 1000ms 앞으로 돌려버려요. 수동으로 밀 땐 `advanceTimeBy(5_000)` + `runCurrent()`.

**함정:** `runTest` 안이라도 `Thread.sleep()`이나 `Dispatchers.IO`로 빠지는 코드는 **가상 시간이 안 먹습니다.** 진짜 대기해요. 그래서 디스패처를 주입 가능하게 설계해야 합니다.

```kotlin
class OrderService(
    private val repo: OrderRepository,
    private val dispatcher: CoroutineDispatcher = Dispatchers.IO,   // 주입 가능
) {
    suspend fun load(id: Long) = withContext(dispatcher) { repo.findBlocking(id) }
}
val service = OrderService(repo, UnconfinedTestDispatcher())        // 테스트에서
```

**디스패처를 하드코딩하지 마세요.** 이거 하나가 코루틴 테스트 난이도의 절반입니다.

## 연습

테스트 라이브러리를 못 쓰는 환경이라고 가정하고, **Kotest와 MockK의 핵심 아이디어를 직접 만들어 봅시다.** 이걸 만들어 보면 `shouldBe`와 `coVerify`가 마법이 아니라는 게 손에 잡힙니다.

세 가지를 완성하세요.

1. **`shouldBe` 매처** — `infix` 함수. 두 값이 다르면 `AssertionError("expected <기댓값> but was <실제값>")`를 던집니다.
2. **`TestRunner.test`** — 이름과 `suspend` 블록을 받아 `runBlocking`으로 실행하고, 성공하면 `PASS  이름`, `AssertionError`가 나면 `FAIL  이름 — 메시지`를 출력하며 각각 집계합니다. (`runTest` 대신 `runBlocking`을 쓰는 게 유일한 차이입니다)
3. **`SpyUserRepository.findName`** — 호출된 `id`를 `calls`에 기록하고 `rows`에서 찾아 반환합니다. MockK의 `coVerify`가 하는 일을 수동으로 하는 겁니다.

`report()`는 이미 되어 있습니다. 마지막 테스트는 **일부러 실패하도록** 두세요 — 실패 출력 형식까지 확인하는 게 목적입니다.

```kotlin starter
import kotlinx.coroutines.runBlocking

// ── 1. 간이 테스트 러너 (Kotest 흉내) ───────────────
class TestRunner {
    private var passed = 0
    private var failed = 0

    fun test(name: String, block: suspend () -> Unit) {
        // TODO: runBlocking 으로 block() 을 실행하세요.
        //       성공 → passed++ 후 "PASS  $name" 출력
        //       AssertionError → failed++ 후 "FAIL  $name — ${e.message}" 출력
    }

    fun report() {
        println("----")
        println("총 ${passed + failed}개 · 성공 $passed · 실패 $failed")
    }
}

// ── 2. 간이 매처 (AssertJ 흉내) ─────────────────────
infix fun <T> T.shouldBe(expected: T) {
    // TODO: 다르면 AssertionError("expected <$expected> but was <$this>") 를 던지세요.
}

// ── 3. 프로덕션 코드 (수정하지 마세요) ──────────────
interface UserRepository {
    suspend fun findName(id: Long): String?
}

class UserService(private val repo: UserRepository) {
    suspend fun displayName(id: Long): String = repo.findName(id)?.uppercase() ?: "UNKNOWN"
}

// ── 4. 간이 스파이 (MockK 흉내) ─────────────────────
class SpyUserRepository(private val rows: Map<Long, String>) : UserRepository {
    val calls = mutableListOf<Long>()

    override suspend fun findName(id: Long): String? {
        // TODO: id 를 calls 에 기록하고, rows 에서 찾아 반환하세요.
        TODO("구현하세요")
    }
}

fun main() {
    val runner = TestRunner()
    val repo = SpyUserRepository(mapOf(1L to "seojun"))
    val service = UserService(repo)

    runner.test("존재하는 사용자는 이름을 대문자로 반환한다") {
        service.displayName(1L) shouldBe "SEOJUN"
    }
    runner.test("없는 사용자는 UNKNOWN 을 반환한다") {
        service.displayName(99L) shouldBe "UNKNOWN"
    }
    runner.test("리포지토리는 호출된 id 를 순서대로 기록한다") {
        repo.calls shouldBe listOf(1L, 99L)
    }
    runner.test("일부러 실패시키는 테스트 — 실패 출력 형식 확인") {
        service.displayName(1L) shouldBe "seojun"
    }

    runner.report()
}
```

```text expected
PASS  존재하는 사용자는 이름을 대문자로 반환한다
PASS  없는 사용자는 UNKNOWN 을 반환한다
PASS  리포지토리는 호출된 id 를 순서대로 기록한다
FAIL  일부러 실패시키는 테스트 — 실패 출력 형식 확인 — expected <seojun> but was <SEOJUN>
----
총 4개 · 성공 3 · 실패 1
```
