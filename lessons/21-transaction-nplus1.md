# Lesson 21 — 트랜잭션과 N+1

JPA에서 사람이 가장 많이 다치는 두 곳입니다. 하나는 **`@Transactional`이 안 붙은 줄도 모르고 도는 코드**, 다른 하나는 **쿼리 1번인 줄 알았는데 501번 나가는 코드**. 둘 다 조용히 동작하다가 운영에서 터집니다.

## 1부 — `@Transactional`이 Kotlin에서 조용히 안 먹는 경우

Spring의 `@Transactional`은 **프록시 AOP**로 동작합니다. 빈을 감싼 대리 객체가 메서드 앞뒤에서 `begin`/`commit`을 하는 구조예요. 그래서 **프록시를 만들 수 없거나, 프록시를 거치지 않으면** 애노테이션은 주석과 다를 바 없습니다.

### (1) final 클래스 — Kotlin 고유의 함정

```java
// Java — 클래스는 기본이 open
@Service
public class MemberService {
    @Transactional
    public void register(...) { ... }
}
```

```kotlin
// Kotlin — 클래스도 메서드도 기본이 final
@Service
class MemberService {          // = public final class MemberService
    @Transactional
    fun register(...) { ... }  // = public final void register(...)
}
```

CGLIB 프록시는 대상 클래스를 **상속**해서 만듭니다. `final`이면 상속이 안 되죠. Java에서는 겪을 일이 없던 문제가 Kotlin에서는 기본값입니다.

해결은 `allOpen` 플러그인입니다.

```kotlin
// build.gradle.kts
plugins {
    kotlin("plugin.spring") version "1.9.25"   // allOpen 프리셋
}
```

`plugin.spring`은 `@Component`, `@Service`, `@Repository`, `@Controller`, `@Configuration`, **`@Transactional`**, `@Async`가 붙은 클래스를 자동으로 `open`으로 바꿔줍니다(바이트코드 레벨). Spring Initializr로 Kotlin 프로젝트를 만들면 기본 포함돼 있어서 대부분 모르고 지나가요. **직접 build.gradle을 쓰거나 커스텀 애노테이션을 만들면 이게 빠집니다.**

```kotlin
// 커스텀 애노테이션을 쓴다면 allOpen 에 직접 등록해야 함
allOpen {
    annotation("com.example.MyTransactionalService")
}
```

### (2) private / internal 메서드

```kotlin
@Service
class OrderService {
    @Transactional
    private fun doWork() { ... }     // 프록시가 가로챌 수 없음 — 무시됨
}
```

프록시는 **public 메서드만** 오버라이드합니다. `private`은 물론이고, Kotlin의 `internal`도 위험합니다. `internal fun`은 JVM 바이트코드에서 이름이 `doWork$module_name`처럼 **맹글링(mangling)** 되면서 `public`으로 컴파일되는데, 프록시가 만드는 시그니처와 어긋나 동작이 예측 불가해집니다. **트랜잭션 경계가 되는 메서드는 반드시 `public`으로** 두세요.

### (3) self-invocation — 가장 많이 당하는 것

```kotlin
@Service
class OrderService(private val repo: OrderRepository) {

    fun placeOrders(requests: List<OrderRequest>) {
        requests.forEach { save(it) }     // ← this.save(it) — 프록시를 안 거침
    }

    @Transactional
    fun save(request: OrderRequest) { ... }   // 트랜잭션 없이 실행됨
}
```

`placeOrders` 안에서 `save`를 부르면 그건 **프록시가 아니라 진짜 객체(`this`)의 메서드 호출**입니다. 프록시를 통과하지 않으니 트랜잭션이 안 열려요. Java에서도 똑같은 함정이지만, Kotlin은 `this.`를 생략하는 스타일이 더 흔해서 눈에 덜 띕니다.

해결:
- **클래스를 분리**한다 (가장 깔끔). `OrderProcessor`를 따로 만들어 주입받기.
- 자기 자신을 주입받는다 (`@Lazy private val self: OrderService`) — 동작은 하지만 냄새가 납니다.
- `TransactionTemplate`을 직접 쓴다.

> **면접 빈출** — "`@Transactional`이 동작하지 않는 경우를 말해보세요." 표준 답: ① private/protected 메서드 ② 같은 클래스 내부 호출(self-invocation) ③ 예외를 잡아먹어 롤백이 안 되는 경우 ④ `RuntimeException`이 아닌 checked exception (기본은 롤백 안 함). **Kotlin이면 여기에 ⑤ allOpen 미적용으로 final 클래스 → CGLIB 프록시 생성 불가**를 추가하세요. 이거 하나로 "Kotlin 실무 해봤구나"가 전달됩니다.

### (4) 예외와 롤백

```kotlin
@Transactional
fun register(cmd: RegisterCommand) {
    try {
        repo.save(Member(cmd.name))
    } catch (e: Exception) {
        log.error("실패", e)        // 예외를 삼킴 → 롤백 안 됨, 커밋됨
    }
}
```

Kotlin에는 checked exception이 없어서 `throws` 선언이 사라집니다. 그만큼 **"이 메서드가 뭘 던지는지"가 안 보여요.** 트랜잭션 메서드 안에서 `catch`로 예외를 삼키면 조용히 커밋됩니다. 잡았으면 **다시 던지거나** `TransactionAspectSupport.currentTransactionStatus().setRollbackOnly()`를 호출하세요.

### (5) 읽기 전용 트랜잭션

```kotlin
@Transactional(readOnly = true)
fun findAll(): List<MemberResponse> = repo.findAll().map(MemberResponse::from)
```

`readOnly = true`면 Hibernate가 **플러시 모드를 MANUAL로 바꿔 더티 체킹용 스냅샷을 만들지 않습니다.** 조회 결과가 많을수록 메모리·CPU 절약이 큽니다. DB에 따라 읽기 전용 커넥션(복제본)으로 라우팅되기도 하고요.

실무 관행: **클래스에 `@Transactional(readOnly = true)`를 걸고, 쓰기 메서드에만 `@Transactional`을 덮어씁니다.**

```kotlin
@Service
@Transactional(readOnly = true)
class MemberService(private val repo: MemberRepository) {

    fun find(id: Long): MemberResponse = ...           // 읽기 전용

    @Transactional                                      // 여기만 쓰기
    fun register(cmd: RegisterCommand): Long = ...
}
```

실수로 조회 메서드에서 엔티티를 바꿔도 UPDATE가 안 나갑니다. 안전망이에요.

## 2부 — N+1

### 어떻게 생기나

```kotlin
@Transactional(readOnly = true)
fun listOrders(): List<OrderResponse> {
    val orders = orderRepository.findAll()        // 쿼리 1번
    return orders.map {
        OrderResponse(it.id!!, it.member.name)    // ← 여기서 주문 수만큼 쿼리
    }
}
```

`order.member`는 `LAZY` 프록시입니다. `.name`을 건드리는 순간 초기화되면서 `select * from member where id = ?`가 나갑니다. 주문이 500건이면 **1 + 500 = 501번.**

개발 DB에는 주문이 3건이라 4번이고, 아무도 못 느낍니다. 운영에 올라가서 트래픽이 붙으면 커넥션 풀이 마르고 API가 타임아웃 납니다. **N+1은 성능 문제가 아니라 장애 원인**입니다.

`EAGER`로 바꾸면? 더 나빠집니다. `findAll()`은 JPQL이라 EAGER도 즉시 조인하지 않고 **로딩 후 하나씩 추가 조회**해서 결국 같은 N+1이 되고, 필요 없는 쿼리까지 항상 나갑니다. **연관관계는 전부 `LAZY`로 두는 게 원칙**이고, 필요한 곳에서 명시적으로 함께 가져오는 게 답입니다.

### 해결 1 — fetch join

```java
// Java
@Query("select o from Order o join fetch o.member")
List<Order> findAllWithMember();
```

```kotlin
// Kotlin — 동일
@Query("select o from Order o join fetch o.member")
fun findAllWithMember(): List<Order>
```

한 번의 조인으로 다 가져옵니다. **주의: 컬렉션(`@OneToMany`) fetch join은 페이징과 함께 못 씁니다.** Hibernate가 `HHH000104` 경고를 찍고 **전체를 메모리로 올린 뒤 잘라냅니다.** 데이터가 많으면 OOM이에요. 로그에 이 경고가 보이면 즉시 고쳐야 합니다.

### 해결 2 — `@EntityGraph`

```kotlin
@EntityGraph(attributePaths = ["member", "items"])
override fun findAll(): List<Order>
```

JPQL을 안 쓰고 선언적으로 fetch join을 겁니다. 메서드 이름 쿼리에도 붙일 수 있어 Spring Data와 궁합이 좋습니다. 내부적으로는 **left outer join**이라 fetch join과 같은 페이징 제약을 받습니다.

### 해결 3 — `@BatchSize` (컬렉션 + 페이징의 정답)

```kotlin
@Entity
class Member(...) {
    @BatchSize(size = 100)
    @OneToMany(mappedBy = "member", fetch = FetchType.LAZY)
    val orders: MutableList<Order> = mutableListOf()
}
```

또는 전역 설정:

```yaml
spring:
  jpa:
    properties:
      hibernate:
        default_batch_fetch_size: 100
```

프록시를 초기화할 때 **`where id in (?, ?, ..., ?)`로 100개씩 모아서** 가져옵니다. 1 + N이 **1 + ceil(N/100)**이 돼요. 페이징과 함께 쓸 수 있고, 카테시안 곱도 안 생깁니다.

> 실무 권장: **`default_batch_fetch_size`를 전역으로 100~1000 걸어두세요.** 놓친 N+1의 피해를 자동으로 줄여주는 가장 가성비 좋은 설정입니다. 그 위에 핫한 경로만 fetch join으로 최적화합니다.

### `LazyInitializationException`과 OSIV

```
org.hibernate.LazyInitializationException:
  could not initialize proxy [Member#1] - no Session
```

영속성 컨텍스트(=Session)가 닫힌 뒤에 LAZY 프록시를 건드리면 납니다. 영속성 컨텍스트의 생존 범위는 **기본적으로 트랜잭션 범위**예요. `@Transactional` 메서드를 빠져나오면 준영속(detached) 상태가 됩니다.

그런데 Spring Boot는 기본값이 `spring.jpa.open-in-view=true`입니다. **영속성 컨텍스트를 컨트롤러·뷰 렌더링까지 열어둡니다.** 그래서 서비스 밖에서 LAZY를 건드려도 그냥 동작해요. 편하지만 대가가 있습니다.

| | OSIV ON (기본) | OSIV OFF |
|---|---|---|
| 컨텍스트 범위 | 요청 시작 ~ 응답 종료 | `@Transactional` 메서드 안 |
| DB 커넥션 | **응답 끝날 때까지 점유** | 트랜잭션 끝나면 즉시 반납 |
| LAZY 접근 | 컨트롤러에서도 가능 | **`LazyInitializationException`** |
| 장애 양상 | 트래픽 몰리면 **커넥션 풀 고갈** | 컴파일 아닌 런타임 에러로 조기 발각 |

커넥션을 응답 끝까지 쥐고 있다는 게 핵심입니다. API가 외부 호출이라도 하면 그 시간 내내 커넥션이 묶여요. 트래픽이 늘면 풀이 마르고 **전체 API가 같이 죽습니다.**

```yaml
spring:
  jpa:
    open-in-view: false
```

끄면 어떻게 되냐면 — **서비스 계층 안에서 필요한 걸 다 로딩해서 DTO로 변환해 내보내야 합니다.** 불편한 게 아니라, 원래 그래야 하는 겁니다. Lesson 19·20에서 말한 "엔티티는 안, DTO는 밖" 경계가 OSIV를 끄는 순간 **강제**됩니다. 끄면 그동안 숨어 있던 LAZY 접근이 전부 예외로 드러나는데, 그게 바로 고쳐야 할 목록이에요.

> 새 프로젝트라면 **처음부터 `open-in-view: false`로 시작하세요.** 나중에 끄는 건 훨씬 아픕니다.

## 연습

N+1이 실제로 쿼리를 몇 번 날리는지 **카운터로 세어서** batch fetch와 비교합니다. (실제 DB/JPA 없이, 쿼리 호출을 세는 가짜 DB를 씁니다.)

`FakeDb`는 주어져 있습니다. 모든 조회 메서드가 호출될 때마다 `queryCount`가 1씩 오릅니다.

1. `loadWithNPlusOne()` — `findAllOrders()`로 주문 전체를 가져온 뒤, **주문 하나마다** `findMemberById()`를 호출해 `"주문 {주문id} -> {회원이름}"` 문자열 리스트를 만드세요. (LAZY 프록시를 하나씩 초기화하는 상황)
2. `loadWithBatch()` — `findAllOrders()` 후, 주문들의 `memberId`를 **중복 없이 모아** `findMembersByIds()`를 **딱 한 번** 호출하고, 그 결과를 `id -> MemberRow` 맵으로 만들어 조회하세요. 결과 문자열은 1번과 **완전히 같아야** 합니다.

주문은 5건, 회원은 3명입니다. 목표는 **6번 → 2번**.

힌트: `map { it.memberId }.toSet()`, `associateBy { it.id }`, `map.getValue(key)`.

```kotlin starter
data class MemberRow(val id: Long, val name: String)
data class OrderRow(val id: Long, val memberId: Long)

object FakeDb {
    var queryCount = 0
        private set

    private val members = listOf(
        MemberRow(1L, "박경태"),
        MemberRow(2L, "김하나"),
        MemberRow(3L, "이두리"),
    )

    private val orders = listOf(
        OrderRow(101L, 1L),
        OrderRow(102L, 2L),
        OrderRow(103L, 1L),
        OrderRow(104L, 3L),
        OrderRow(105L, 2L),
    )

    fun reset() {
        queryCount = 0
    }

    fun findAllOrders(): List<OrderRow> {
        queryCount++
        return orders
    }

    fun findMemberById(id: Long): MemberRow {
        queryCount++
        return members.first { it.id == id }
    }

    fun findMembersByIds(ids: Collection<Long>): List<MemberRow> {
        queryCount++
        return members.filter { it.id in ids }
    }
}

// TODO: 주문마다 회원을 하나씩 조회 (N+1)
fun loadWithNPlusOne(): List<String> {
    TODO("구현하세요")
}

// TODO: 회원 id 를 모아 한 번에 조회 (batch fetch)
fun loadWithBatch(): List<String> {
    TODO("구현하세요")
}

fun main() {
    FakeDb.reset()
    val lazyResult = loadWithNPlusOne()
    lazyResult.forEach { println(it) }
    println("[N+1] 쿼리 실행 횟수: ${FakeDb.queryCount}")

    FakeDb.reset()
    val batchResult = loadWithBatch()
    println("[batch] 결과 동일: ${batchResult == lazyResult}")
    println("[batch] 쿼리 실행 횟수: ${FakeDb.queryCount}")
}
```

```text expected
주문 101 -> 박경태
주문 102 -> 김하나
주문 103 -> 박경태
주문 104 -> 이두리
주문 105 -> 김하나
[N+1] 쿼리 실행 횟수: 6
[batch] 결과 동일: true
[batch] 쿼리 실행 횟수: 2
```
