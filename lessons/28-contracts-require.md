# Lesson 28 — require · check · error 와 방어적 프로그래밍

앞의 두 레슨이 "실패를 어떻게 전달할까"였다면, 이번엔 **"애초에 잘못된 상태를 못 만들게 하는 법"** 입니다. Java에서 `if (x == null) throw new IllegalArgumentException(...)` 을 손으로 쓰던 자리를, Kotlin은 네 개의 표준 함수로 정리했습니다. 문법이 아니라 **의미 구분**이 이 레슨의 핵심입니다.

## 넷의 의미가 다르다

| 함수 | 검증 대상 | 던지는 것 | 누구의 잘못인가 |
|---|---|---|---|
| `require(cond) { msg }` | **인자(argument)** | `IllegalArgumentException` | **호출자** |
| `check(cond) { msg }` | **상태(state)** | `IllegalStateException` | **자기 자신 / 호출 순서** |
| `error(msg)` | **도달 불가** | `IllegalStateException` | 프로그래머(분기 누락) |
| `assert(cond) { msg }` | 내부 가정 | `AssertionError` | — **기본 비활성** |

```kotlin
class Order(private val items: List<Item>) {
    private var submitted = false

    fun applyCoupon(rate: Double) {
        require(rate in 0.0..1.0) { "rate must be in 0..1: $rate" }   // 인자
        check(!submitted) { "already submitted" }                     // 상태
        ...
    }
}
```

`rate`가 이상한 건 **호출한 쪽이 틀린 것**이고, 이미 제출된 주문에 쿠폰을 먹이는 건 **호출 순서가 틀린 것**입니다. 예외 타입이 다르면 상위 핸들러에서 다르게 처리할 수 있습니다 — 보통 `IllegalArgumentException`은 400, `IllegalStateException`은 409나 500이죠.

> 리뷰에서 자주 보이는 오용: **인자 검증에 `check`** 를 쓰는 것. 동작은 하지만 "누구 잘못인가"라는 정보가 반대로 기록됩니다. HTTP 상태 코드 매핑이 틀어지고, 장애 분류도 틀어집니다.

### `error` 와 `assert`

`error(msg)`는 `throw IllegalStateException(msg)`의 축약인데, 반환 타입이 **`Nothing`** 입니다 (Lesson 26). 그래서 `when`의 `else` 가지에 놓을 수 있습니다.

```kotlin
val fee = when (grade) {
    "A" -> 0
    "B" -> 500
    else -> error("unknown grade: $grade")   // Nothing 이라 when 의 타입은 Int
}
```

`assert`는 JVM의 `-ea` 플래그가 없으면 **아예 실행되지 않습니다.** 프로덕션에서는 보통 꺼져 있죠. 그래서 "있으면 좋은 추가 검사"에만 쓰고, **반드시 지켜야 하는 계약에는 절대 쓰지 마세요.**

## requireNotNull / checkNotNull — 검사 + 스마트 캐스트

```kotlin
fun send(email: String?) {
    val target = requireNotNull(email) { "email must not be null" }
    // target: String (non-null)
    mailer.send(target)
}
```

두 가지를 동시에 합니다. **null이면 던지고, 아니면 non-null 타입의 값을 반환**합니다. 반환값을 안 받아도 됩니다 — 그 아래부터 원래 변수가 스마트 캐스트됩니다.

```kotlin
fun send(email: String?) {
    requireNotNull(email) { "email must not be null" }
    mailer.send(email)      // email 은 String 으로 스마트 캐스트됨. ?. 도 !! 도 불필요
}
```

이게 가능한 이유가 뒤에 나오는 `contract` 입니다.

Java의 `Objects.requireNonNull(email, "...")` 과 대응하지만, **스마트 캐스트가 따라온다는 점**이 다릅니다.

## 메시지 람다는 공짜다

```kotlin
require(user.isActive) { "inactive user: ${user.id}, status=${user.status}" }
```

문자열 템플릿이 들어 있는데 **검증에 성공하면 이 문자열은 만들어지지 않습니다.** 두 가지가 겹쳐서 그렇습니다.

1. 메시지가 **람다**라 지연 평가된다
2. `require`가 **`inline`** 함수라 람다 객체 할당조차 없다 — 호출 지점에 `if (!cond) throw ...` 로 펼쳐진다

그래서 **메시지를 아끼지 마세요.** 값을 넣으세요.

```kotlin
require(rate in 0.0..1.0)                                  // 실패해도 뭐가 문제인지 모른다
require(rate in 0.0..1.0) { "rate must be in 0..1: $rate" } // 로그만 보고 원인을 안다
```

반대로 `require(cond, "msg")` 처럼 문자열을 직접 넘기는 오버로드는 **없습니다.** `require(cond) { "msg" }` 가 유일한 형태예요. Java 습관으로 괄호 안에 쓰려다 막히면 그 때문입니다.

## init 블록 — 잘못된 객체를 아예 못 만들게

여기가 방어적 프로그래밍의 진짜 자리입니다. 검증을 **메서드마다 흩뿌리지 말고, 생성 시점에 한 번** 하세요.

```kotlin
class Money(val amount: Long, val currency: String) {
    init {
        require(amount >= 0) { "amount must be >= 0: $amount" }
        require(currency.length == 3) { "currency must be ISO-4217: $currency" }
    }
}
```

이러면 **`Money` 인스턴스가 존재한다는 사실 자체가 "금액이 음수가 아니고 통화 코드가 3자리"를 보장**합니다. 이게 불변식(invariant)입니다. 이후 코드 어디에서도 다시 검사할 필요가 없어요.

`data class`에도 똑같이 넣습니다. 다만 `copy()`도 생성자를 타므로 검증을 통과해야 한다는 걸 알아두세요 — 이건 버그가 아니라 **의도된 동작**입니다.

> 면접 포인트: "Kotlin에서 도메인 객체의 불변식을 어디서 검증하나요?" → "`init` 블록. 생성자를 통과한 객체는 항상 유효하므로 이후 검사가 필요 없다."

Java에서 Bean Validation(`@NotNull`, `@Min`)에 익숙하다면, 그건 **경계(요청 DTO)** 에서 쓰고 도메인 안쪽은 `init`으로 지키는 조합이 좋습니다. 애노테이션 검증은 검증기를 거쳐야 작동하지만, `init`은 **우회할 방법이 없습니다.**

## contract — 스마트 캐스트를 내 함수로 확장

`requireNotNull` 뒤에서 스마트 캐스트가 되는 건 마법이 아니라 **계약(contract)** 덕분입니다. 표준 라이브러리는 컴파일러에게 이렇게 알려줍니다.

```kotlin
public inline fun <T : Any> requireNotNull(value: T?): T {
    contract { returns() implies (value != null) }   // "정상 반환했다면 value 는 null 이 아니다"
    ...
}
```

내 함수에도 붙일 수 있습니다.

```kotlin
@kotlin.contracts.ExperimentalContracts
fun validate(s: String?) {
    kotlin.contracts.contract { returns() implies (s != null) }
    requireNotNull(s) { "s must not be null" }
}

fun use(s: String?) {
    validate(s)
    println(s.length)     // contract 덕분에 s 가 String 으로 스마트 캐스트
}
```

주로 쓰는 형태는 두 가지입니다.

- `returns() implies (x != null)` — 정상 반환 시 조건이 참
- `callsInPlace(block, InvocationKind.EXACTLY_ONCE)` — 람다가 정확히 한 번 호출됨 (그래서 `let`/`run` 블록 안에서 `val`을 초기화할 수 있다)

아직 실험적 API라 `@OptIn`이 필요합니다. **직접 쓸 일은 드물지만, 왜 `requireNotNull` 뒤에 `!!`가 필요 없는지** 는 알고 계세요.

## 리뷰에서 잡아야 할 것

- **`if (x == null) throw IllegalArgumentException(...)`** → `requireNotNull(x) { ... }`. 세 줄이 한 줄이 되고 스마트 캐스트가 따라옵니다.
- **인자 검증에 `check`, 상태 검증에 `require`** — 의미가 반대로 기록되고 HTTP 매핑이 틀어집니다.
- **검증 없이 nullable을 `!!` 로 통과** — `!!`는 "검증했다"가 아니라 "검증을 포기했다"입니다. 터졌을 때 메시지가 없어서 원인 파악이 안 됩니다. `requireNotNull(x) { "왜 있어야 하는지" }` 로 바꾸세요.
- **메시지 없는 `require(cond)`** — 공짜인데 안 쓸 이유가 없습니다.
- **`assert` 로 계약 검증** — 프로덕션에서 꺼져 있습니다.
- **같은 검증을 메서드마다 반복** — `init`으로 올리세요.
- **`require` 로 비즈니스 실패 표현** — "잔액 부족"은 프로그래머 실수가 아니라 **예상 가능한 도메인 실패**입니다. sealed 결과 타입이 맞습니다 (Lesson 27). `require`는 **계약 위반** 전용이에요.

## 연습

계좌 클래스를 완성하세요. **`require` / `check` / `requireNotNull` / `error` 를 각각 의미에 맞게** 쓰는 게 목적입니다. 헬퍼 `fail { }` 은 이미 주어져 있습니다 — 예외 타입과 메시지를 문자열로 찍어줍니다.

- `init` — `id`는 공백이면 안 되고(`"id must not be blank"`), `initial`은 0 이상(`"initial must be >= 0"`). 둘 다 **인자 검증**.
- `deposit` / `withdraw` — 금액은 양수여야 하고(`"amount must be positive: $amount"` — **인자**), 계좌는 열려 있어야 하며(`"account is closed: $id"` — **상태**), 출금은 잔액이 충분해야 한다(`"insufficient balance: $balance < $amount"` — **상태**). 검사 순서도 이 순서입니다.
- `rateOf` — `when`의 `else`에서 `error("unknown grade: $grade")`.
- `label` — null이면 `"label must not be null"`. 그 뒤로는 **`?.` 도 `!!` 도 쓰지 말 것** (스마트 캐스트).

```kotlin starter
// 테스트 헬퍼 — 최상단 경계라서 광범위 catch 를 썼다. 실무 코드에서는 이렇게 쓰지 말 것.
fun fail(block: () -> Unit): String =
    try {
        block()
        "no error"
    } catch (e: Exception) {
        "${e::class.simpleName}: ${e.message}"
    }

class Account(val id: String, initial: Long) {
    var balance: Long = initial
        private set
    private var closed = false

    init {
        // TODO: id 와 initial 검증 — 누구의 잘못인가?
    }

    fun deposit(amount: Long) {
        // TODO: 인자 검증 -> 상태 검증 -> 반영
    }

    fun withdraw(amount: Long) {
        // TODO: 인자 검증 -> 상태 검증(닫힘, 잔액) -> 반영
    }

    fun close() {
        closed = true
    }
}

fun rateOf(grade: String): Int = when (grade) {
    "A" -> 1
    "B" -> 2
    else -> TODO("도달 불가를 표현하세요")
}

fun label(raw: String?): String {
    TODO("requireNotNull 뒤에는 ?. 도 !! 도 필요 없다")
}

fun main() {
    val acc = Account("acc-1", 1_000)
    acc.deposit(500)
    acc.withdraw(200)
    println("${acc.id} balance=${acc.balance} rate=${rateOf("B")}")

    println(fail { Account("  ", 0) })
    println(fail { Account("acc-2", -1) })
    println(fail { acc.deposit(0) })
    println(fail { acc.withdraw(9_999) })
    println(fail { rateOf("Z") })
    println(label("  hello  "))
    println(fail { label(null) })

    acc.close()
    println(fail { acc.deposit(100) })
}
```

```text expected
acc-1 balance=1300 rate=2
IllegalArgumentException: id must not be blank
IllegalArgumentException: initial must be >= 0
IllegalArgumentException: amount must be positive: 0
IllegalStateException: insufficient balance: 1300 < 9999
IllegalStateException: unknown grade: Z
HELLO
IllegalArgumentException: label must not be null
IllegalStateException: account is closed: acc-1
```

```text hint
기대 출력의 **예외 타입**을 먼저 보세요. `IllegalArgumentException` 이 나와야 하는 줄과 `IllegalStateException` 이 나와야 하는 줄이 갈려 있습니다. 그게 곧 `require` 와 `check` 중 무엇을 쓸지를 알려줍니다 — **인자가 틀렸나(호출자 잘못), 상태가 틀렸나(호출 순서 잘못)**.
---
`require(조건) { "메시지" }` 와 `check(조건) { "메시지" }` 는 **조건이 참일 때 통과**합니다. Java 의 `if (!cond) throw ...` 와 방향이 반대라는 점에 주의하세요. 공백만 있는 문자열도 걸러야 하니 `isEmpty()` 가 아니라 `isBlank()` 계열입니다 — 조건이 참일 때 통과해야 하므로 부정형인 `isNotBlank()` 가 그대로 들어맞습니다. 도달 불가는 `error("...")` 이고, 반환 타입이 `Nothing` 이라 `when` 의 `else` 에 그대로 놓을 수 있습니다.
---
검사 **순서**가 출력에 그대로 드러납니다. `acc.withdraw(9_999)` 는 금액이 양수이고 계좌도 열려 있으니 세 번째 검사(잔액)에서 걸리고, 마지막 `acc.deposit(100)` 은 계좌가 닫힌 뒤라 상태 검사에서 걸립니다. 그러니 `withdraw` 는 **금액 -> 닫힘 -> 잔액** 순서여야 합니다. `label` 은 `requireNotNull(raw) { "..." }` 한 줄 뒤에 `raw.trim().uppercase()` 를 그냥 쓰면 됩니다 — 스마트 캐스트가 되니까요.
---
뼈대입니다.

`init`: `require(id.___()) { "id must not be blank" }` 와 `require(initial >= 0) { "initial must be >= 0" }`

`deposit`: `require(amount > 0) { "amount must be positive: $amount" }` -> `___(!closed) { "account is closed: $id" }` -> `balance += amount`

`withdraw`: 위 두 줄 다음에 `check(balance >= amount) { "insufficient balance: $balance < $amount" }` -> `balance -= amount`

`label`: `requireNotNull(raw) { "label must not be null" }` -> `return raw.trim().___()`
```

```kotlin solution
// 테스트 헬퍼 — 최상단 경계라서 광범위 catch 를 썼다. 실무 코드에서는 이렇게 쓰지 말 것.
fun fail(block: () -> Unit): String =
    try {
        block()
        "no error"
    } catch (e: Exception) {
        "${e::class.simpleName}: ${e.message}"
    }

class Account(val id: String, initial: Long) {
    var balance: Long = initial
        private set
    private var closed = false

    // 불변식은 생성 시점에 한 번. 이후 어떤 메서드도 id·balance 의 유효성을 다시 묻지 않는다.
    init {
        require(id.isNotBlank()) { "id must not be blank" }
        require(initial >= 0) { "initial must be >= 0" }
    }

    fun deposit(amount: Long) {
        require(amount > 0) { "amount must be positive: $amount" }   // 호출자 잘못
        check(!closed) { "account is closed: $id" }                  // 호출 순서 잘못
        balance += amount
    }

    fun withdraw(amount: Long) {
        require(amount > 0) { "amount must be positive: $amount" }
        check(!closed) { "account is closed: $id" }
        check(balance >= amount) { "insufficient balance: $balance < $amount" }
        balance -= amount
    }

    fun close() {
        closed = true
    }
}

fun rateOf(grade: String): Int = when (grade) {
    "A" -> 1
    "B" -> 2
    else -> error("unknown grade: $grade")   // Nothing 타입이라 when 의 타입은 Int 로 유지된다
}

fun label(raw: String?): String {
    requireNotNull(raw) { "label must not be null" }
    return raw.trim().uppercase()   // 스마트 캐스트 — ?. 도 !! 도 없다
}

fun main() {
    val acc = Account("acc-1", 1_000)
    acc.deposit(500)
    acc.withdraw(200)
    println("${acc.id} balance=${acc.balance} rate=${rateOf("B")}")

    println(fail { Account("  ", 0) })
    println(fail { Account("acc-2", -1) })
    println(fail { acc.deposit(0) })
    println(fail { acc.withdraw(9_999) })
    println(fail { rateOf("Z") })
    println(label("  hello  "))
    println(fail { label(null) })

    acc.close()
    println(fail { acc.deposit(100) })
}
```
