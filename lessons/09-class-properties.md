# Lesson 9 — 클래스와 프로퍼티

Java에서 DTO 하나 만들려면 필드 선언, 생성자, getter, setter까지 40줄이 나옵니다. Kotlin은 그걸 한 줄로 줄이는데, **줄이 짧아진 게 핵심이 아닙니다.** Kotlin의 프로퍼티는 Java의 필드와 **다른 물건**이에요. 이 차이를 모르면 Kotlin으로 Java를 쓰게 됩니다.

## 주 생성자 — 한 줄이 필드 + 생성자 + 접근자

```java
// Java
public class User {
    private final String name;
    private int age;
    public User(String name, int age) { this.name = name; this.age = age; }
    public String getName() { return name; }
    public int getAge() { return age; }
    public void setAge(int age) { this.age = age; }
}
```

```kotlin
// Kotlin — 동일한 것
class User(val name: String, var age: Int)
```

클래스 이름 뒤 괄호가 **주 생성자(primary constructor)** 입니다. 파라미터에 `val`/`var`를 붙이면 그 자리에서 프로퍼티까지 선언됩니다.

- `val` → 읽기 전용. getter만 생깁니다
- `var` → getter + setter
- **`val`/`var` 없이** 쓰면 그냥 생성자 파라미터입니다. 초기화에만 쓰이고 저장되지 않아요

```kotlin
class User(name: String) {          // val 없음 — 프로퍼티 아님
    val greeting = "안녕, $name"    // 초기화에만 사용되고 name 은 사라진다
}
```

이 구분이 실무에서 중요합니다. **검증용·계산용 입력값은 `val`을 붙이지 마세요.** 붙이면 불필요한 필드가 객체에 남습니다.

기본값도 그냥 줍니다(`class Page(val no: Int = 1, val size: Int = 20)` → `Page(size = 50)`). Java의 생성자 오버로딩 사다리가 통째로 없어져요.

## 부 생성자 — 정말 필요할 때만

주 생성자로 안 되는 경우에만 `constructor` 키워드로 **부 생성자(secondary constructor)** 를 씁니다. 부 생성자는 **반드시 주 생성자에 위임**해야 합니다(`this(...)`).

```kotlin
class Money(val amount: Long, val currency: String) {
    constructor(amount: Long) : this(amount, "KRW")   // 위임 필수
}
```

그런데 위 예제는 **기본값으로 쓰는 게 맞습니다**: `class Money(val amount: Long, val currency: String = "KRW")`.

> 리뷰 포인트: **부 생성자가 보이면 "기본 인자로 대체되나?"를 먼저 물으세요.** 실제로 부 생성자가 필요한 경우는 다른 타입을 받아 변환할 때(`constructor(raw: String) : this(raw.toLong())`) 정도입니다.

## init 블록과 초기화 순서

주 생성자에는 코드를 넣을 자리가 없습니다. 검증·로깅은 `init` 블록에서 합니다.

```kotlin
class Order(val id: String, val quantity: Int) {
    init {
        require(quantity > 0) { "수량은 1 이상이어야 한다" }
    }
}
```

`require`는 실패 시 `IllegalArgumentException`을 던집니다(`check`는 `IllegalStateException`). Java에서 `if (x <= 0) throw new IllegalArgumentException(...)` 하던 걸 대체합니다.

**순서가 헷갈리는 지점이 하나 있습니다.** 프로퍼티 초기화와 `init` 블록은 **각자 따로 실행되는 게 아니라, 본문에 쓰인 순서대로 섞여서** 실행됩니다.

```kotlin
class Demo(name: String) {
    val a = log("1 프로퍼티 a")
    init { log("2 init 블록") }
    val b = log("3 프로퍼티 b")
    init { log("4 두 번째 init") }
}
```

출력은 1 → 2 → 3 → 4. 그래서 **`init` 블록에서 아래쪽에 선언된 프로퍼티를 읽으면 컴파일 에러**입니다. 아직 초기화 전이니까요. 부 생성자 본문은 이 모든 것이 끝난 **뒤에** 돕니다.

## 프로퍼티는 필드가 아니라 접근자다

여기가 Lesson 9의 핵심입니다. Kotlin의 `val x`는 **필드가 아니라 "읽는 방법"** 의 선언입니다.

```kotlin
class Rect(val w: Int, val h: Int) {
    val area: Int
        get() = w * h          // 저장 안 함. 부를 때마다 계산
}
```

`area`는 메모리를 차지하지 않습니다. Java였다면 `getArea()` 메서드를 만들고 호출부는 `rect.getArea()`로 썼겠죠. Kotlin은 **호출부가 `rect.area`** 로 같습니다. 즉 **저장된 값이냐 계산된 값이냐를 나중에 바꿔도 호출부가 안 깨집니다.**

> 이게 왜 중요하냐면: Java에서 "필드로 저장 → 나중에 계산으로 변경"은 API 변경이었습니다. Kotlin에선 구현 세부사항이에요. **계산 가능한 값은 저장하지 말고 커스텀 getter로 두세요.** 저장하면 원본이 바뀔 때 같이 안 바뀌는 버그(stale state)가 생깁니다.

커스텀 setter와 **backing field** 도 있습니다. getter/setter 안에서 실제 저장소를 가리킬 때 `field` 라는 이름을 씁니다.

```kotlin
class Temperature {
    var celsius: Double = 0.0
        set(value) {
            require(value >= -273.15) { "절대영도 미만" }
            field = value          // this.celsius = value 로 쓰면 무한 재귀!
        }
}
```

`field`는 컴파일러가 만들어 주는 숨은 저장소입니다. **getter/setter 안에서 `field`를 한 번도 안 쓰면 backing field 자체가 생성되지 않습니다** — 위의 `area`가 그래서 메모리를 안 먹는 겁니다.

## `private set` — 밖에선 읽기만, 안에선 쓰기

Java에서 "읽기만 공개"하려면 필드를 `private`으로 두고 getter만 만들었죠. Kotlin은 **접근자마다 가시성을 따로 줍니다.**

```kotlin
class Cart {
    var total: Long = 0
        private set              // 읽기는 public, 쓰기는 클래스 내부만

    fun add(price: Long) { total += price }
}
```

`cart.total` 은 읽힙니다. `cart.total = 999` 는 **컴파일 에러**입니다. 상태를 가진 클래스의 기본형으로 삼으세요. 이걸 안 쓰면 `var`가 그대로 공개돼서 아무나 내부 상태를 망가뜨립니다.

## `lateinit var` vs `by lazy` — 둘은 용도가 다르다

둘 다 "나중에 초기화"지만 **누가 값을 넣느냐**가 다릅니다.

```kotlin
class Service {
    lateinit var repo: Repository        // 남이(DI 컨테이너가) 넣어준다
    val config: Config by lazy { load() } // 내가 첫 접근 때 만든다
}
```

| | `lateinit var` | `by lazy` |
|---|---|---|
| 값을 넣는 주체 | 외부 | 자기 자신(람다) |
| 변경 | `var` — 가능 | `val` — 불가 |
| 초기화 전 접근 | `UninitializedPropertyAccessException` | 그 자리에서 계산 |
| 제약 | **non-null·`var`만**, `Int`/`Double` 등 원시 타입 불가 | 없음 |
| 스레드 | 보호 없음 | 기본이 동기화(한 번만 계산) |

`by lazy` 는 **한 번 계산되면 영원히 그 값**입니다. 그래서 **변하는 상태를 `by lazy`에 담으면 stale 버그**가 납니다. 값이 바뀔 수 있으면 커스텀 getter를 쓰세요. (`lateinit` 초기화 여부는 `::repo.isInitialized` 로 확인합니다.)

> 리뷰 포인트: **`lateinit` 남용은 "이 값이 없는 상태가 정말 존재하나?"를 안 물어본 신호**입니다. 생성자에서 받을 수 있으면 생성자에서 받으세요. `lateinit`은 프레임워크가 나중에 주입하는 경우(Spring 필드 주입, 테스트 `@BeforeEach`)로 한정하는 게 좋습니다.

## `const val` vs `val`

```kotlin
const val MAX_RETRY = 3     // 컴파일 타임 상수 — 호출부에 3 이 그대로 박힌다
val startedAt = now()       // 런타임에 결정되는 읽기 전용 값
```

`const val`은 Java의 `static final`에 해당하고, **최상위(top-level)·`object`·`companion object`** 에만 놓을 수 있습니다(`object`/`companion`은 Lesson 13). 타입도 원시 타입과 `String`만 됩니다. 클래스 안에 그냥 `const val`을 쓰면 컴파일 에러예요.

## 리뷰할 때 보는 것

| 코드에서 보이면 | 이렇게 지적한다 |
|---|---|
| `fun getName() = name` 같은 수동 getter | 프로퍼티가 이미 getter다. 메서드를 지워라 |
| 계산 가능한 값을 필드에 저장 | 커스텀 `get()`으로. 저장하면 stale 된다 |
| `var` 가 그냥 public | `private set` 을 붙여 쓰기 경로를 좁혀라 |
| `lateinit` 이 여러 개 | 생성자로 못 받는 이유가 뭔가? |
| `by lazy` 인데 값이 변한다 | lazy 는 한 번만 계산된다. getter로 바꿔라 |
| 부 생성자 여러 개 | 기본 인자로 대체되는지 먼저 확인 |

## 연습

`Account` 클래스를 완성하세요. 아래 규칙을 **하나도 빠뜨리지 않고** 지켜야 합니다.

1. 주 생성자는 `owner`(프로퍼티) 와 `initial`(프로퍼티 **아님**, 초기 잔액)을 받는다
2. `balance` 는 밖에서 **읽기만** 가능하고 쓰기는 클래스 안에서만 — `private set`
3. `init` 블록에서 `initial` 이 음수면 `require` 로 거부한다 (메시지: `초기 잔액은 음수일 수 없다`)
4. 이름만 받는 **부 생성자** 를 두고 잔액 0으로 위임한다
5. `display` 는 **저장하지 말고** 커스텀 getter 로 `"kim: 10000원"` 형태를 만든다
6. `summary` 는 `by lazy` 로 만들고, 계산될 때 `[summary 계산]` 을 출력한다 — 두 번째 접근에서는 다시 출력되지 않아야 한다

```kotlin starter
const val CURRENCY = "원"

class Account(/* TODO: 주 생성자 — owner 는 프로퍼티, initial 은 프로퍼티가 아니다 */) {

    // TODO: balance — 밖에서는 읽기 전용

    // TODO: display — 저장하지 않는 커스텀 getter. "kim: 10000원"

    // TODO: summary — by lazy. 계산 시 "[summary 계산]" 출력 후 "kim 님의 계좌(잔액 12000원)"

    // TODO: init 블록 — initial 음수 거부

    // TODO: 부 생성자 — 이름만 받아 잔액 0 으로 위임

    fun deposit(amount: Long) {
        balance += amount
    }

    fun withdraw(amount: Long): Boolean {
        if (amount > balance) return false
        balance -= amount
        return true
    }
}

fun main() {
    val a = Account("kim", 10_000)
    val b = Account("lee")
    println(a.display)
    println(b.display)

    a.deposit(5_000)
    println(a.display)
    println(a.withdraw(20_000))
    println(a.withdraw(3_000))
    println(a.display)

    println(a.summary)
    println(a.summary)

    a.deposit(1_000)
    println(a.display)
    println(a.summary)

    try {
        Account("park", -1)
    } catch (e: IllegalArgumentException) {
        println("거부: ${e.message}")
    }
}
```

```text expected
kim: 10000원
lee: 0원
kim: 15000원
false
true
kim: 12000원
[summary 계산]
kim 님의 계좌(잔액 12000원)
kim 님의 계좌(잔액 12000원)
kim: 13000원
kim 님의 계좌(잔액 12000원)
거부: 초기 잔액은 음수일 수 없다
```

```text hint
주 생성자 파라미터에 `val` 을 붙이면 프로퍼티가 되고, 안 붙이면 초기화에만 쓰이고 사라집니다. `owner` 는 나중에 `display` 에서 써야 하고, `initial` 은 `balance` 에 옮겨 담은 뒤엔 필요 없습니다. 이 차이가 곧 답입니다.
---
쓰는 도구 네 가지: 접근자 가시성 `private set`, 저장하지 않는 `get() = ...`, 첫 접근 때 한 번만 도는 `by lazy { }`, 그리고 `init { require(조건) { "메시지" } }`. 부 생성자는 `constructor(...) : this(...)` 로 주 생성자에 위임합니다.
---
구조는 이렇습니다. `balance` 는 `var ... = 0L` 로 선언하고 바로 다음 줄에 `private set` 만 씁니다(값 대입은 `init` 에서). `display` 는 `val display: String get() = ...` — 등호(`=`)로 값을 주는 게 아니라 **다음 줄에 `get()`** 을 쓴다는 게 함정입니다. 등호로 주면 그 순간 계산돼서 저장돼 버려 `deposit` 후에도 안 바뀝니다. `by lazy` 블록은 **마지막 줄이 반환값**이라 `println` 을 먼저 쓰고 문자열을 뒤에 둡니다. 마지막 출력에서 `summary` 가 12000 그대로인 건 버그가 아니라 lazy 의 본질입니다.
---
뼈대입니다. 빈칸만 채우세요.

`class Account(val owner: String, ___: Long) {` / `var balance: Long = 0L` + 다음 줄 `___ set` / `val display: String ___() = "$owner: $balance$CURRENCY"` / `val summary: String by ___ { println("[summary 계산]"); "$owner 님의 계좌(잔액 $balance$CURRENCY)" }` / `init { ___(initial >= 0) { "초기 잔액은 음수일 수 없다" }; balance = initial }` / `constructor(owner: String) : ___(owner, 0L)`
```

```kotlin solution
const val CURRENCY = "원"

class Account(val owner: String, initial: Long) {

    // 밖에서는 읽기만. 쓰기는 deposit/withdraw 를 통해서만 일어난다.
    var balance: Long = 0L
        private set

    // 저장하지 않는다 — balance 가 바뀌면 자동으로 따라온다.
    val display: String
        get() = "$owner: $balance$CURRENCY"

    // lazy 는 첫 접근에 한 번만 계산되고 그 값으로 고정된다.
    val summary: String by lazy {
        println("[summary 계산]")
        "$owner 님의 계좌(잔액 $balance$CURRENCY)"
    }

    init {
        require(initial >= 0) { "초기 잔액은 음수일 수 없다" }
        balance = initial
    }

    constructor(owner: String) : this(owner, 0L)

    fun deposit(amount: Long) {
        balance += amount
    }

    fun withdraw(amount: Long): Boolean {
        if (amount > balance) return false
        balance -= amount
        return true
    }
}

fun main() {
    val a = Account("kim", 10_000)
    val b = Account("lee")
    println(a.display)
    println(b.display)

    a.deposit(5_000)
    println(a.display)
    println(a.withdraw(20_000))
    println(a.withdraw(3_000))
    println(a.display)

    println(a.summary)
    println(a.summary)

    a.deposit(1_000)
    println(a.display)
    println(a.summary)

    try {
        Account("park", -1)
    } catch (e: IllegalArgumentException) {
        println("거부: ${e.message}")
    }
}
```
