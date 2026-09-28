# Lesson 53 — 실전 미니 API 설계 (졸업 과제)

50개 레슨을 왔습니다. 이제 흩어져 있던 것들을 **하나의 서비스**로 묶습니다. 만들 것은 **사용자 요약 API** — 사용자 정보 + 최근 주문 + 포인트를 한 번에 내려주는 엔드포인트 하나. 작지만 실무 백엔드의 축소판입니다. 외부 호출 합성, 부분 실패, DTO 매핑, 계층 분리가 전부 들어있어요.

## 프로젝트 골격

```
com/example/miniapi/
├── user/
│   ├── UserController.kt       # 표현 — 요청/응답, sealed 결과 렌더링
│   ├── UserSummaryService.kt   # 응용 — 조회 합성, 부분 실패 처리
│   ├── UserRepository.kt       # 영속 — Spring Data JPA
│   ├── UserEntity.kt           # 영속 모델 (일반 class)
│   ├── UserDto.kt              # 표현 모델 (data class) + 확장 함수 매핑
│   └── ApiResult.kt            # sealed 결과 타입
├── order/                      # 같은 구조를 도메인마다 반복
└── common/GlobalExceptionHandler.kt
```

**계층별 폴더(`controller/`, `service/`)가 아니라 도메인별 폴더**로 잡았습니다. 기능 하나를 고칠 때 3개 폴더를 돌아다니지 않아도 돼요. 프로젝트가 커질수록 차이가 벌어집니다.

```kotlin
// build.gradle.kts
plugins {
    kotlin("jvm") version "2.0.21"
    kotlin("plugin.spring") version "2.0.21"   // @Component 계열에 open 자동 부여
    kotlin("plugin.jpa") version "2.0.21"      // @Entity 에 no-arg 생성자 자동 생성
    id("org.springframework.boot") version "3.3.5"
    id("io.spring.dependency-management") version "1.1.6"
}

kotlin {
    jvmToolchain(21)
    compilerOptions { freeCompilerArgs.add("-Xjsr305=strict") }   // Java 애노테이션 신뢰
}

dependencies {
    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("org.springframework.boot:spring-boot-starter-data-jpa")
    implementation("com.fasterxml.jackson.module:jackson-module-kotlin")   // data class 역직렬화
    implementation("org.jetbrains.kotlin:kotlin-reflect")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-reactor")     // suspend 컨트롤러
    runtimeOnly("org.postgresql:postgresql")

    testImplementation("io.kotest:kotest-runner-junit5:5.9.1")
    testImplementation("io.mockk:mockk:1.13.13")             // + springmockk, coroutines-test
}
```

**아래 세 가지가 Kotlin + Spring 프로젝트의 필수 관문**입니다. 없으면 런타임에 이상한 에러를 만나요. `plugin.spring`(all-open)은 Spring이 `@Transactional` 프록시를 만들 수 있게 `open`을 붙여줍니다(Kotlin은 final 기본). `plugin.jpa`(no-arg)는 JPA가 리플렉션으로 찾는 **기본 생성자**를 만들어 줍니다. `-Xjsr305=strict`는 Spring이 붙인 `@Nullable`/`@NonNull`을 Kotlin 타입으로 신뢰해 플랫폼 타입 구멍(L08)을 막습니다.

## 도메인 모델: 엔티티와 DTO는 다른 것

Kotlin 초심자가 **가장 많이 틀리는 부분**입니다. 엔티티를 `data class`로 만들면 세 가지가 터집니다. (1) **`equals`/`hashCode`가 모든 필드를 봅니다** — JPA 엔티티는 **식별자로 동일성**을 판단해야 하는데 이름 하나 바뀌면 다른 객체가 됩니다. `Set`에 넣거나 영속성 컨텍스트에서 비교할 때 터져요. (2) **`toString()`이 연관관계를 타고 갑니다** — 지연 로딩 컬렉션을 건드려 `LazyInitializationException` 또는 N+1 폭발. (3) **`copy()`가 식별자까지 복사합니다** — 의미상 말이 안 됩니다.

```kotlin
// ✅ 엔티티는 일반 class + 식별자 기반 동등성
@Entity
@Table(name = "users")
class UserEntity(var name: String, var gradeCode: Int) {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long? = null
        protected set

    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is UserEntity) return false   // is 라서 LAZY 프록시도 통과
        val myId = id ?: return false            // 미영속끼리는 같지 않다
        return myId == other.id
    }
    override fun hashCode(): Int = 31            // 프록시는 서브클래스 — javaClass 는 갈라진다 (L48)
}

// ✅ DTO 는 data class — 불변, equals/toString 공짜
data class UserSummaryResponse(
    val userId: Long, val name: String, val grade: String,
    val orderCount: Int, val recentOrder: String, val point: Int,
)
```

`id` 가 `var ... Long? = null` 인 것도 우연이 아닙니다. `IDENTITY` 전략은 INSERT 후에 id 가 채워지므로 **"아직 저장 안 됨"** 을 표현할 값이 필요한데, 그건 `0` 이 아니라 `null` 이어야 해요. `0` 을 센티넬로 쓰면 `id != 0L` 같은 검사가 코드 곳곳에 번지고, 진짜 id 가 0 인 행이 생기는 날 조용히 깨집니다. **L48 에서 못 박은 형태 그대로 씁니다.**

> **규칙으로 외우세요: 엔티티는 `class`, DTO는 `data class`.** 엔티티는 가변·식별자 기반·영속성 컨텍스트 소속이고, DTO는 불변·값 기반·경계를 넘나드는 것 — 성격이 정반대입니다.

## 결과 타입: 예외 대신 sealed (L14)

Kotlin엔 검사 예외(checked exception)가 없습니다. **"실패할 수 있다"를 시그니처로 표현하려면 반환 타입을 써야 합니다.**

```kotlin
sealed interface ApiResult<out T> {
    data class Ok<T>(val value: T) : ApiResult<T>
    data class NotFound(val what: String) : ApiResult<Nothing>
    data class Failure(val reason: String) : ApiResult<Nothing>
}

@GetMapping("/users/{id}/summary")
suspend fun summary(@PathVariable id: Long): ResponseEntity<Any> =
    when (val result = service.summarize(id)) {
        is ApiResult.Ok       -> ResponseEntity.ok(result.value)
        is ApiResult.NotFound -> ResponseEntity.status(404).body(ErrorBody(result.what))
        is ApiResult.Failure  -> ResponseEntity.status(500).body(ErrorBody(result.reason))
    }
```

`out T` 와 `Nothing`의 조합이 포인트입니다. `Nothing`은 모든 타입의 하위 타입이라, `out` 공변성 덕에 `NotFound`가 **어떤 `ApiResult<T>` 자리에든** 들어갑니다. 실패 케이스마다 제네릭을 안 써도 돼요. 그리고 저 `when`은 **`else` 없이 컴파일**되므로, 나중에 `Conflict`를 추가하면 처리 안 한 모든 `when`이 컴파일 에러를 냅니다.

**예외 vs sealed, 무엇을 언제?** **예상 가능한 도메인 실패**(없는 사용자, 재고 부족, 잔액 부족)는 **sealed 결과 타입** — 호출자가 처리를 강제당합니다. **진짜 예외적 상황**(DB 커넥션 끊김, 버그)은 **예외 + `@RestControllerAdvice`** — 여기까지 타입으로 표현하면 코드가 산으로 갑니다. 둘을 섞는 게 정상이고, 전부 sealed로 하려는 순수주의는 실무에서 지칩니다.

## 매핑: 확장 함수로 (L18)

```kotlin
// UserDto.kt — 엔티티는 DTO를 모른다. 의존 방향이 한쪽이다.
fun Int.toGrade(): String = when (this) { 2 -> "GOLD"; 1 -> "SILVER"; else -> "BRONZE" }

fun UserEntity.toSummary(orders: List<OrderEntity>, point: Int) = UserSummaryResponse(
    userId = id, name = name, grade = gradeCode.toGrade(),
    orderCount = orders.size, recentOrder = orders.firstOrNull()?.title ?: "없음",
    point = point,
)
```

Java에서 MapStruct를 쓰던 자리입니다. 애노테이션 프로세서도, 생성 코드를 뒤질 일도 없어요. **엔티티 클래스에 매핑 코드가 안 들어가서** 의존 방향이 깔끔하고, 복잡한 변환을 `@Mapping(expression = "java(...)")` 같은 문자열이 아니라 **그냥 Kotlin으로** 씁니다. `firstOrNull()?.title ?: "없음"` 한 줄에 L08 과 L22 가 같이 들어있고요.

## 병렬 조회: 코루틴으로 (L33·L52)

```kotlin
@Service
class UserSummaryService(
    private val users: UserRepository,
    private val orders: OrderRepository,
    private val points: PointClient,
) {
    suspend fun summarize(id: Long): ApiResult<UserSummaryResponse> = try {
        coroutineScope {
            val user = users.findById(id)
                ?: return@coroutineScope ApiResult.NotFound("user id=$id")
            val orderJob = async { orders.findByUserId(id) }   // 주문과 포인트는
            val pointJob = async { points.fetch(id) }          // 서로 독립 → 병렬
            ApiResult.Ok(user.toSummary(orderJob.await(), pointJob.await()))
        }
    } catch (e: CancellationException) {
        throw e                       // 취소는 실패가 아니다 — 반드시 다시 던진다
    } catch (e: IllegalStateException) {
        ApiResult.Failure(e.message ?: "unknown")
    }
}
```

**첫째, 사용자 조회는 병렬이 아닙니다.** 사용자가 없으면 나머지는 할 필요가 없으니까요. *"독립적인 것만 병렬"* — 무작정 다 `async`로 감싸는 게 아닙니다. **둘째, `try`가 `coroutineScope` 바깥에 있습니다.** 이게 중요해요. `async` 자식이 실패하면 **형제가 취소되고 예외는 `coroutineScope` 경계에서 다시 던져집니다.** `await()` 주위에서만 잡으면 스코프가 또 던져요. 구조적 동시성은 "자식의 실패는 부모의 실패"라는 규칙이고, 그래서 **경계 바깥에서 잡아야** 합니다.

**셋째, `CancellationException` 을 맨 앞에서 다시 던집니다.** 이 레슨에서 가장 안 보이는 함정이에요. JVM 에서 `kotlinx.coroutines.CancellationException` 은 결국 `java.util.concurrent.CancellationException` 이고, **그 상위 클래스가 `java.lang.IllegalStateException`** 입니다(`CancellationException::class.java.superclass` 를 찍어 보면 `class java.lang.IllegalStateException` 이 나옵니다). 즉 `catch (e: IllegalStateException)` 은 **취소까지 같이 잡습니다.** `catch (e: Exception)` 이었다면 리뷰에서 바로 걸렸을 텐데 `IllegalStateException` 은 충분히 좁아 보여서 아무도 안 봐요. 잡히는 순간 **취소된 요청이 `Failure` 를 반환하며 정상 흐름인 척** 이어지고, L52 에서 금지한 **좀비 코루틴**이 그렇게 태어납니다. 규칙은 단순합니다 — **코루틴 안에서 예외를 잡을 땐 `CancellationException` 을 먼저 재던진다.** 잡는 타입이 `Exception` 이든 `IllegalStateException` 이든 똑같이 적용됩니다.

## 각 계층에서 Kotlin이 주는 것

| 계층 | Kotlin이 해주는 일 |
|---|---|
| **Controller** | `suspend` 로 병렬 합성 · sealed + `when` 완전성 · 기본값 있는 쿼리 파라미터 |
| **Service** | 생성자 주입이 곧 기본 문법(`@Autowired` 불필요) · `coroutineScope` · 확장 함수 매핑 |
| **Repository** | `?` 로 "없을 수 있음"을 타입에 명시 · `?:` 로 즉시 분기 |
| **Model** | 엔티티는 `class`, DTO는 `data class` · 기본값 + 이름 있는 인자로 빌더 대체 |
| **Test** | 픽스처 팩토리 함수 · MockK `coEvery` · Kotest `StringSpec` |

가장 큰 변화는 줄 수가 아니라 **"컴파일러가 잡아주는 것의 범위"** 입니다. null 누락, `when` 분기 누락, 불변 위반 — Java에서 리뷰어가 눈으로 찾던 것들이 컴파일 에러로 올라옵니다.

## 이 프로젝트를 이력서에 어떻게 쓸까

솔직히 말씀드립니다. **"Kotlin으로 CRUD API를 만들었습니다"는 아무 임팩트가 없습니다.** 5년차에게 기대하는 건 문법 습득이 아니라 **판단**이에요.

**나쁜 예** — *"Kotlin과 Spring Boot를 사용하여 REST API 개발 / 코루틴을 적용하여 성능 개선 / Kotest, MockK를 활용한 단위 테스트 작성."* "썼다"만 있고 "왜, 그래서 뭐가"가 없습니다. 면접관은 물어볼 게 없어서 넘어갑니다.

**좋은 예** — **선택 → 근거 → 효과**가 한 줄에 다 있습니다.

> **사용자 요약 API — Kotlin 2.0 / Spring Boot 3.3 / JDK 21**
> - 독립적인 외부 조회 2건을 `coroutineScope` + `async` 로 병렬화. 응답 시간을 **두 호출의 합 → 최댓값**으로 단축
> - 도메인 실패(사용자 없음)는 `sealed interface` 반환 타입으로, 시스템 예외는 `@RestControllerAdvice` 로 분리. 컨트롤러의 `when` 이 `else` 없이 컴파일되어 **새 실패 케이스 추가 시 처리 누락이 컴파일 에러로 검출**됨
> - JPA 엔티티는 `data class` 대신 식별자 기반 `equals/hashCode` 를 가진 일반 클래스로 설계 — 연관관계 `toString()` 으로 인한 지연 로딩 사고 방지
> - 블로킹 JDBC 호출은 `withContext(Dispatchers.IO)` 로 감싸 main-safety 보장

**그리고 이 셋은 거의 확실히 물어봅니다.** 미리 답을 만들어 두세요.

1. **"엔티티를 `data class`로 안 한 이유가 뭔가요?"** → 위의 `equals`/`toString`/`copy` 세 가지. 여기서 막히면 "블로그 보고 따라 썼구나"가 들통납니다.
2. **"가상 스레드를 쓰면 코루틴이 필요 없지 않나요?"** → L52 의 답변. 층이 다르다는 것부터.
3. **"`async` 하나가 실패하면 어떻게 되나요?"** → 형제 취소 + 부모로 전파 + `coroutineScope` 바깥에서 잡아야 함. 실제로 짜 본 사람만 아는 지점이라 변별력이 큽니다.

마지막 조언 둘. **GitHub에 올릴 거면 README에 "왜"를 쓰세요.** 코드는 어차피 다 비슷해 보입니다. *"엔티티와 DTO를 왜 분리했는가"*, *"어디는 병렬이고 어디는 아닌가"* 를 적어두면 그 README 자체가 포트폴리오입니다. 그리고 **작게 유지하세요.** 기능 20개짜리 미완성보다, 엔드포인트 3개인데 테스트가 있고 설계 근거가 적힌 게 훨씬 강합니다.

## 리뷰할 때 보는 것

졸업 과제답게, 앞의 레슨들에서 하나씩 배운 것이 여기 다 모입니다. **이 표 하나로 Kotlin + Spring PR 을 한 바퀴 돌 수 있어야** 합니다.

| 코드에서 보이면 | 이렇게 지적한다 |
|---|---|
| `@Entity` 가 `data class` 이거나 `@Id` 가 `val id: Long = 0` | 일반 `class` + `var id: Long? = null` 로. "아직 저장 안 됨" 은 `0` 이 아니라 `null` 이 표현해야 하고, `id != 0L` 센티넬은 진짜 id 가 0 인 행에서 깨진다 |
| 엔티티 `hashCode()` 가 `javaClass.hashCode()` | LAZY 프록시는 서브클래스라 값이 갈라진다. `Hibernate.getClass(this).hashCode()` 나 진짜 상수로 바꿔라 |
| 엔티티가 컨트롤러 시그니처에 있다 | `data class` DTO 로 변환해 내보내라. 컬럼 추가가 API 스펙 변경이 되고 LAZY 직렬화 사고가 따라온다. 매핑은 엔티티 안이 아니라 확장 함수로 빼서 의존 방향을 한쪽으로 고정하라 |
| 예상 가능한 도메인 실패를 예외로 던진다 | `sealed interface` 반환 타입으로 바꿔라. 호출자가 `when` 으로 처리를 강제당하고, 케이스가 늘면 컴파일 에러로 드러난다 |
| sealed 결과를 분기하는 `when` 에 `else` | 지워라. `else` 가 있으면 새 실패 케이스를 추가해도 이 자리가 조용히 통과한다 |
| 서로 의존하는 호출까지 `async` 로 감쌌다 | `async` 는 독립적인 것에만. 앞 결과가 없으면 뒤를 할 이유가 없는 조회는 순차로 두어라 |
| `try` 가 `coroutineScope` **안쪽**에 있다 | 자식의 실패는 스코프 **경계**에서 다시 던져지므로 `await()` 주위에서 잡으면 놓친다. `try` 를 경계 바깥으로 빼라 |
| 코루틴 안의 `catch` 에 `CancellationException` 재던지기가 없다 | `catch (e: IllegalStateException)` 도 취소를 삼킨다(상위 타입이다). `catch (e: CancellationException) { throw e }` 를 맨 앞에 두어라 |

## 연습

졸업 과제입니다. 위 설계를 **순수 Kotlin 한 파일**로 압축했습니다. Spring 없이도 뼈대는 똑같습니다.

빈칸 다섯 개를 채우세요.

1. **`ApiResult`** — `sealed interface`. `Ok<T>(value)`, `NotFound(what)`, `Failure(reason)`. 실패 타입은 `ApiResult<Nothing>` 을 구현합니다. (L14)
2. **`Int.toGrade()`** — `2 → "GOLD"`, `1 → "SILVER"`, 나머지 `"BRONZE"`. (L18)
3. **`UserEntity.toSummary()`** — 엔티티 + 주문 목록 + 포인트를 `UserSummary` DTO로. `recentOrder` 는 첫 주문의 `title`, 없으면 `"없음"`. (L08·L18·L22)
4. **`summarize()`** — 사용자를 먼저 조회해 없으면 `NotFound`. 있으면 주문·포인트를 `async` 둘로 **병렬** 조회. **`CancellationException` 은 먼저 다시 던지고**, `IllegalStateException` 은 `Failure` 로. **`try` 는 `coroutineScope` 바깥**에 두세요. (L33·L52)
5. **`render()`** — `when` 으로 `[200]`/`[404]`/`[500]` 형식 문자열. **`else` 금지.** (L14)

`PointRepository` 는 `userId == 3L` 일 때 일부러 터집니다. 세 경로를 모두 지나가는 게 목적입니다.

```kotlin starter
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking

// ── 1. 영속 계층 모델 (엔티티 흉내 — data class 가 아니다) ──
class UserEntity(val id: Long, val name: String, val gradeCode: Int)
class OrderEntity(val id: Long, val userId: Long, val title: String)

// ── 2. sealed 결과 타입 ─────────────────────────────
// TODO: sealed interface ApiResult<out T> 와 세 하위 타입을 정의하세요.
//       Ok<T>(value: T) / NotFound(what: String) / Failure(reason: String)
//       실패 두 개는 ApiResult<Nothing> 을 구현합니다.

// ── 3. DTO (표현 계층 모델) ─────────────────────────
data class UserSummary(
    val userId: Long,
    val name: String,
    val grade: String,
    val orderCount: Int,
    val recentOrder: String,
    val point: Int,
)

// ── 4. 확장 함수로 매핑 ─────────────────────────────
fun Int.toGrade(): String = TODO("2 -> GOLD, 1 -> SILVER, 그 외 -> BRONZE")

fun UserEntity.toSummary(orders: List<OrderEntity>, point: Int): UserSummary =
    TODO("UserSummary 로 매핑하세요. recentOrder 는 첫 주문 title, 없으면 \"없음\"")

// ── 5. Repository 계층 (수정하지 마세요) ────────────
class UserRepository {
    private val rows = listOf(
        UserEntity(1, "이서준", 2),
        UserEntity(3, "김하늘", 0),
    )

    suspend fun findById(id: Long): UserEntity? {
        delay(30)
        return rows.firstOrNull { it.id == id }
    }
}

class OrderRepository {
    suspend fun findByUserId(userId: Long): List<OrderEntity> {
        delay(80)
        return listOf(
            OrderEntity(101, userId, "맥북 프로 16"),
            OrderEntity(102, userId, "기계식 키보드"),
        )
    }
}

class PointRepository {
    suspend fun findByUserId(userId: Long): Int {
        delay(50)
        if (userId == 3L) error("포인트 서비스 장애")
        return 12_000
    }
}

// ── 6. Service 계층 ─────────────────────────────────
class UserSummaryService(
    private val users: UserRepository,
    private val orders: OrderRepository,
    private val points: PointRepository,
) {
    suspend fun summarize(id: Long): ApiResult<UserSummary> {
        // TODO: try 를 coroutineScope 바깥에 두고,
        //       사용자가 없으면 NotFound, 있으면 async 둘로 병렬 조회 후 Ok,
        //       CancellationException 은 그대로 다시 던지고(먼저!),
        //       IllegalStateException 은 Failure 로 변환하세요.
        TODO("구현하세요")
    }
}

// ── 7. Controller 계층 ──────────────────────────────
fun render(result: ApiResult<UserSummary>): String =
    TODO("when 으로 [200]/[404]/[500] 을 만드세요. else 금지")

fun main() = runBlocking {
    val service = UserSummaryService(UserRepository(), OrderRepository(), PointRepository())

    listOf(1L, 99L, 3L).forEach { id ->
        println(render(service.summarize(id)))
    }
}
```

```text expected
[200] UserSummary(userId=1, name=이서준, grade=GOLD, orderCount=2, recentOrder=맥북 프로 16, point=12000)
[404] 없음: user id=99
[500] 실패: 포인트 서비스 장애
```

```text hint
경로가 세 개입니다. 정상(id=1), 사용자 없음(id=99), 그리고 **부분 실패**(id=3 — 사용자와 주문은 멀쩡한데 포인트만 터짐). 앞의 둘은 쉽습니다. 어려운 건 셋째고, 질문은 하나예요 — **`async` 자식이 던진 예외는 정확히 어디서 튀어나오는가?** `await()` 줄일 것 같지만 아닙니다. 구조적 동시성에서 "자식의 실패는 부모의 실패"이므로, 예외는 **스코프 경계에서 다시 던져집니다.** 그럼 잡는 자리도 경계 바깥이어야겠죠.
---
도구는 이미 배운 것들입니다. 결과 타입은 `sealed interface ApiResult<out T>` 에 실패 쪽만 `ApiResult<Nothing>`, 등급 변환과 `render` 는 `when`(단 `render` 는 `else` 없이), 매핑의 "없으면 없음"은 `firstOrNull()?.title ?: "없음"`, 병렬은 `async { }` 둘 + `await()`, 그리고 사용자 없음의 조기 이탈은 `?: return@coroutineScope` 입니다. `error("...")` 가 던지는 게 `IllegalStateException` 이라는 것도 알아두세요. 그리고 `catch` 는 **두 개**입니다 — 좁은 것이 먼저 와야 한다는 Java 시절 규칙 그대로예요.
---
`summarize` 의 형태가 이 과제의 전부입니다. `try` 를 `coroutineScope` **안쪽**에 두면 이렇게 됩니다 — 포인트 조회가 터지면 형제 `async` 가 취소되고, 예외는 `try` 를 통과해 빠져나간 뒤 **스코프 경계에서 다시 던져지므로** `catch` 가 이미 지나가 버린 상태입니다. 결과는 `Failure` 가 아니라 예외가 `main` 까지 올라가 버리는 것. 그래서 `try` 가 **바깥**이어야 합니다. 조기 이탈은 `?: return@coroutineScope ApiResult.NotFound(...)` — 스코프 람다에서 값을 내는 문법이고, 이 자리의 `ApiResult<Nothing>` 이 `ApiResult<UserSummary>` 로 받아지는 건 `out T` 공변성 덕분입니다. `catch` 순서에는 이유가 있습니다 — `CancellationException` 은 `IllegalStateException` 의 **하위 타입**이라, 뒤에 두면 영원히 닿지 않고 취소가 `Failure` 로 둔갑합니다. 이번 연습은 아무것도 취소하지 않아 출력이 같지만, **실무에서 이 한 줄이 좀비 코루틴을 만듭니다.** `render` 의 `when` 은 `else` 를 쓰지 마세요. 세 분기를 다 적으면 컴파일러가 완전성을 확인해 주고, 나중에 케이스가 늘면 **그때 컴파일 에러로** 알려줍니다.
---
뼈대는 이렇습니다. `try` 와 `coroutineScope` 의 **순서**를 그대로 지키세요.

`suspend fun summarize(id: Long): ApiResult<UserSummary> = try { coroutineScope { ... } } catch (e: ___) { throw e } catch (e: ___) { ApiResult.Failure(e.message ?: "unknown") }`

`coroutineScope` 안쪽은 네 줄입니다 — `val user = users.findById(id) ?: return@___ ApiResult.NotFound("user id=$id")`, `val orderJob = ___ { orders.findByUserId(id) }`, `val pointJob = ___ { points.findByUserId(id) }`, `ApiResult.Ok(user.toSummary(orderJob.___(), pointJob.___()))`

`fun render(result: ApiResult<UserSummary>): String = when (result) { is ApiResult.Ok -> "[200] ${result.___}"; is ApiResult.NotFound -> "[404] 없음: ${result.___}"; is ApiResult.Failure -> "[500] 실패: ${result.___}" }`
```

```kotlin solution
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking

// ── 1. 영속 계층 모델 (엔티티 흉내 — data class 가 아니다) ──
class UserEntity(val id: Long, val name: String, val gradeCode: Int)
class OrderEntity(val id: Long, val userId: Long, val title: String)

// ── 2. sealed 결과 타입 ─────────────────────────────
// out T + Nothing 조합: 실패 타입 하나가 모든 ApiResult<T> 자리에 들어간다.
sealed interface ApiResult<out T> {
    data class Ok<T>(val value: T) : ApiResult<T>
    data class NotFound(val what: String) : ApiResult<Nothing>
    data class Failure(val reason: String) : ApiResult<Nothing>
}

// ── 3. DTO (표현 계층 모델) ─────────────────────────
data class UserSummary(
    val userId: Long,
    val name: String,
    val grade: String,
    val orderCount: Int,
    val recentOrder: String,
    val point: Int,
)

// ── 4. 확장 함수로 매핑 ─────────────────────────────
fun Int.toGrade(): String = when (this) {
    2 -> "GOLD"
    1 -> "SILVER"
    else -> "BRONZE"
}

// 엔티티는 DTO 를 모른다 — 의존 방향이 한쪽이다.
fun UserEntity.toSummary(orders: List<OrderEntity>, point: Int): UserSummary = UserSummary(
    userId = id,
    name = name,
    grade = gradeCode.toGrade(),
    orderCount = orders.size,
    recentOrder = orders.firstOrNull()?.title ?: "없음",
    point = point,
)

// ── 5. Repository 계층 (수정하지 마세요) ────────────
class UserRepository {
    private val rows = listOf(
        UserEntity(1, "이서준", 2),
        UserEntity(3, "김하늘", 0),
    )

    suspend fun findById(id: Long): UserEntity? {
        delay(30)
        return rows.firstOrNull { it.id == id }
    }
}

class OrderRepository {
    suspend fun findByUserId(userId: Long): List<OrderEntity> {
        delay(80)
        return listOf(
            OrderEntity(101, userId, "맥북 프로 16"),
            OrderEntity(102, userId, "기계식 키보드"),
        )
    }
}

class PointRepository {
    suspend fun findByUserId(userId: Long): Int {
        delay(50)
        if (userId == 3L) error("포인트 서비스 장애")
        return 12_000
    }
}

// ── 6. Service 계층 ─────────────────────────────────
class UserSummaryService(
    private val users: UserRepository,
    private val orders: OrderRepository,
    private val points: PointRepository,
) {
    // try 가 coroutineScope 바깥이다. 자식의 실패는 스코프 경계에서 다시 던져지므로
    // await() 주위에서 잡으면 놓친다.
    suspend fun summarize(id: Long): ApiResult<UserSummary> = try {
        coroutineScope {
            // 사용자 조회는 병렬이 아니다 — 없으면 나머지를 할 이유가 없다.
            val user = users.findById(id)
                ?: return@coroutineScope ApiResult.NotFound("user id=$id")
            val orderJob = async { orders.findByUserId(id) }   // 주문과 포인트는
            val pointJob = async { points.findByUserId(id) }   // 서로 독립 → 병렬
            ApiResult.Ok(user.toSummary(orderJob.await(), pointJob.await()))
        }
    } catch (e: CancellationException) {
        // CancellationException 의 상위가 IllegalStateException 이라, 이 줄이 없으면
        // 아래 catch 가 취소까지 삼켜 좀비 코루틴이 된다. 취소는 실패가 아니다.
        throw e
    } catch (e: IllegalStateException) {
        ApiResult.Failure(e.message ?: "unknown")
    }
}

// ── 7. Controller 계층 ──────────────────────────────
// else 가 없다. 나중에 결과 타입이 늘면 이 when 이 컴파일 에러로 알려준다.
fun render(result: ApiResult<UserSummary>): String = when (result) {
    is ApiResult.Ok -> "[200] ${result.value}"
    is ApiResult.NotFound -> "[404] 없음: ${result.what}"
    is ApiResult.Failure -> "[500] 실패: ${result.reason}"
}

fun main() = runBlocking {
    val service = UserSummaryService(UserRepository(), OrderRepository(), PointRepository())

    listOf(1L, 99L, 3L).forEach { id ->
        println(render(service.summarize(id)))
    }
}
```
