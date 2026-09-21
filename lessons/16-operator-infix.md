# Lesson 16 — 연산자 오버로딩, infix, 구조 분해

Java 에서 `a.add(b)` 라고 쓰던 걸 Kotlin 은 `a + b` 로 쓸 수 있습니다. C++ 의 연산자 오버로딩과 다른 점은 **Kotlin 은 규약(convention)으로 제한**한다는 것 — 새 연산자를 만들 수 없고, 정해진 이름의 함수에 `operator` 를 붙이는 것만 됩니다. 그래서 덜 자유롭고, 덜 위험합니다.

## 규약 — 이름이 곧 연산자

```kotlin
data class Money(val won: Int) {
    operator fun plus(other: Money) = Money(won + other.won)
}

Money(1000) + Money(2500)     // 컴파일러가 a.plus(b) 로 바꾼다
```

`operator` 키워드가 없으면 그냥 `plus` 라는 이름의 메서드일 뿐입니다. **이름 + `operator` 조합**이 연산자를 만듭니다.

| 쓰는 모습 | 함수 이름 |
|---|---|
| `a + b` | `plus` |
| `a - b` | `minus` |
| `a * b` | `times` |
| `a / b` | `div` |
| `a % b` | `rem` |
| `-a` | `unaryMinus` |
| `a[i]` | `get` |
| `a[i] = v` | `set` |
| `a(x)` | `invoke` |
| `x in a` | `contains` |
| `a > b`, `a <= b` … | `compareTo` |
| `a..b` | `rangeTo` |
| `for (x in a)` | `iterator` |
| `a += b` | `plusAssign` (또는 `plus`) |
| `val (x, y) = a` | `component1`, `component2` |

몇 가지는 따로 볼 가치가 있습니다.

### compareTo — 하나로 네 기호가 생긴다

```kotlin
class Money(val won: Int) : Comparable<Money> {
    override operator fun compareTo(other: Money): Int = won.compareTo(other.won)
}
```

`Comparable` 의 `compareTo` 는 이미 `operator` 로 선언돼 있어 `override` 만 하면 됩니다. 이 함수 하나로 `<` `>` `<=` `>=` 는 물론 **정렬(`sorted()`)·범위·최대최소가 전부 딸려옵니다.**

### get / set / invoke / contains

```kotlin
operator fun get(x: Int, y: Int) = cells[y * width + x]   // grid[2, 3] — 인자 개수 제한 없음
operator fun set(x: Int, y: Int, v: Int) { ... }          // grid[2, 3] = 7
operator fun invoke(s: String) = s.length >= min          // validator("hi") — 객체를 함수처럼
operator fun contains(day: Int) = day in from..to         // 15 in range
```

`invoke` 는 Gradle Kotlin DSL 의 `dependencies { }` 같은 문법이 굴러가는 원리입니다. `contains` 는 **읽는 순서가 뒤집힌다**는 데 주의하세요 — `x in a` 가 `a.contains(x)` 입니다.

## += 의 함정 — plus 와 plusAssign

여기가 실무에서 실제로 물리는 곳입니다. `a += b` 를 만나면 컴파일러는 **두 가지 경로**를 봅니다.

1. `a.plusAssign(b)` 가 있으면 → **a 자기 자신을 변경**
2. 없으면 `a = a.plus(b)` 로 풀어서 → **새 객체를 만들어 재대입** (그래서 `a` 가 `var` 여야 함)

컬렉션에서 이 차이가 그대로 드러납니다.

```kotlin
var immutable = listOf(1)
val before = immutable
immutable += 2            // List 에는 plusAssign 이 없다 → 새 리스트 생성 + 재대입
// before 는 여전히 [1], immutable 은 [1, 2]

val mutable = mutableListOf(1)
val alias = mutable
mutable += 2              // MutableCollection.plusAssign → 제자리 변경
// alias 도 [1, 2] 가 된다 — 같은 객체니까
```

**똑같이 생긴 `+=` 두 줄이 완전히 다른 일을 합니다.** 불변 쪽은 매번 리스트를 통째로 복사하니, 루프 안에서 `list += item` 을 돌리면 O(n²) 가 됩니다. 리뷰에서 이 패턴을 보면 지적하세요.

> `val` 로 선언된 `MutableList` 에 `+=` 는 안전하고 빠릅니다. `var List` 에 `+=` 는 매번 복사입니다. 둘을 구분해서 읽는 눈이 필요해요.

## infix — 점과 괄호를 지운다

```kotlin
infix fun Money.discount(percent: Int): Money = Money(won * (100 - percent) / 100)

price discount 20        // price.discount(20)
```

조건은 셋입니다.

- **멤버 함수이거나 확장 함수**일 것 (최상위 일반 함수는 안 됨)
- **파라미터가 정확히 하나**, 기본값이나 `vararg` 없이
- `infix` 키워드를 붙일 것

표준 라이브러리에도 이미 많습니다 — `to`(Pair 생성), `until`, `downTo`, `step`, `and`, `or`, `shl`.

```kotlin
val pair = "key" to 1        // Pair("key", 1)
for (i in 0 until 10) { }
```

`mapOf("a" to 1, "b" to 2)` 가 특별한 문법처럼 보이지만 **그냥 infix 함수**입니다. 마법이 아니에요.

infix 는 **DSL 을 만들 때** 빛납니다. 다만 **우선순위가 산술 연산자보다 낮고 명시적 괄호가 없어서** 섞어 쓰면 헷갈립니다. `a shl 2 + 3` 은 `a shl (2 + 3)` 입니다.

## 구조 분해 선언

```kotlin
val (name, email) = member
```

컴파일러는 이걸 이렇게 바꿉니다.

```kotlin
val name = member.component1()
val email = member.component2()
```

`data class` 는 주 생성자 프로퍼티 순서대로 `componentN()` 을 자동 생성합니다 (Lesson 12). **일반 클래스에도 직접 만들면 똑같이 동작합니다.**

```kotlin
class Period(val startDay: Int, val endDay: Int) {
    operator fun component1() = startDay
    operator fun component2() = endDay
}

val (start, end) = Period(1, 31)
```

`Map.Entry` 에도 확장으로 `component1`/`component2` 가 정의돼 있어서 `for ((key, value) in map) { }` 가 됩니다. 관심 없는 자리는 `val (_, email) = member` 처럼 `_` 로 건너뜁니다.

### 위치 기반이라는 위험

구조 분해는 **이름이 아니라 순서**로 풀립니다.

```kotlin
data class Point(val x: Int, val y: Int)
val (y, x) = point        // 컴파일 통과! 값이 뒤바뀐 채로
```

그래서 **주 생성자 프로퍼티 순서를 바꾸는 리팩터링은 조용히 호출부를 망가뜨립니다.** 프로퍼티가 3개를 넘으면 구조 분해 대신 그냥 `member.name` 으로 접근하는 게 안전합니다.

## 리뷰에서 지적할 것

**1. 의미가 불분명한 연산자 오버로딩**

```kotlin
operator fun User.plus(role: Role): User      // 사용자 + 역할 = ??
operator fun Report.minus(other: Report)      // 보고서를 뺀다고?
```

기준은 하나입니다. **"도메인 전문가가 그 기호를 자연스럽게 말하는가."** `Money + Money`, `Vector * Int`, `Duration - Duration` 은 좋습니다. `User + Role` 은 `user.addRole(role)` 이 낫습니다.

특히 **`invoke` 오버로딩은 IDE 의 "사용처 찾기"를 무력화**합니다. 호출부에 함수 이름이 아예 안 남으니까요. DSL 을 만드는 게 아니면 피하세요.

**2. infix 남용**

```kotlin
infix fun OrderService.process(order: Order) = ...
orderService process order        // 읽기 어렵다
```

infix 는 **두 값 사이의 관계를 표현할 때**(`a to b`, `1 until 10`) 자연스럽습니다. **동작을 지시하는 함수**에 붙이면 그냥 점을 지운 것뿐이라 IDE 자동완성도 안 되고 가독성만 떨어집니다.

**3. 연산자만 만들고 `equals`/`hashCode` 를 안 만든 값 객체** — `Money(1000) + Money(500)` 은 되는데 `Money(1500) == Money(1500)` 이 `false` 면 최악입니다. 값 객체라면 `data class` 로 만들거나 `equals` 를 같이 구현하세요.

## 연습

`Money` 에 연산자를 붙이고, infix 할인 함수와 구조 분해를 구현하세요. `main` 은 그대로 둡니다.

1. **`Money` 의 연산자 3개** — `a + b`(원끼리 더함), `a * 3`(정수배), `a < b`(원 기준 비교)
2. **`infix fun Money.discount(percent: Int): Money`** — `won * (100 - percent) / 100`
3. **`Period` 의 구조 분해** — `val (start, end) = Period(1, 31)` 이 되도록

`main` 의 마지막 네 줄은 `+=` 가 불변/가변 컬렉션에서 어떻게 다른지 보여 주는 부분이라 건드리지 않아도 통과합니다.

```kotlin starter
class Money(val won: Int) {
    // TODO 1: plus, times, compareTo 를 operator 로 구현하세요.

    override fun toString(): String = "${won}원"
}

// TODO 2: infix fun Money.discount(percent: Int): Money

class Period(val startDay: Int, val endDay: Int) {
    // TODO 3: 구조 분해가 되도록 규약 함수를 구현하세요.
}

fun main() {
    val a = Money(1000)
    val b = Money(2500)

    println(a + b)
    println(a * 3)
    println(a < b)
    println(b discount 20)

    val (start, end) = Period(1, 31)
    println("$start~$end")

    var prices = listOf(Money(100))
    val snapshot = prices
    prices += Money(200)
    println("immutable: ${snapshot.size} -> ${prices.size}")

    val basket = mutableListOf(Money(100))
    val alias = basket
    basket += Money(200)
    println("mutable: ${alias.size}")
}
```

```text expected
3500원
3000원
true
2000원
1~31
immutable: 1 -> 2
mutable: 2
```

```text hint
연산자 오버로딩은 **자유가 아니라 규약**입니다. `+` 를 쓰고 싶으면 아무 이름이나 붙이는 게 아니라 **정해진 이름의 함수**에 `operator` 키워드를 붙여야 해요. `a + b`, `a * 3`, `a < b`, `val (x, y) = p` 각각에 대응하는 함수 이름이 무엇이었는지 표를 다시 보세요. 특히 비교는 **네 개의 기호(`<` `>` `<=` `>=`)가 함수 하나**에서 나옵니다.
---
필요한 이름은 `plus`, `times`, `compareTo`, `component1`, `component2` 다섯입니다. `compareTo` 는 `Int` 를 반환하고, 직접 계산하지 말고 `won.compareTo(other.won)` 처럼 **Int 의 것을 위임**하면 됩니다. `discount` 에는 `infix` 를 붙이는데 조건이 있어요 — **파라미터가 정확히 하나**이고 **멤버이거나 확장 함수**여야 합니다. 여기서는 `Money` 의 확장 함수로 만드세요.
---
`a * 3` 에서 왼쪽이 `Money`, 오른쪽이 `Int` 입니다. 그래서 `times` 의 파라미터 타입은 `Money` 가 아니라 `Int` 이고 반환은 `Money` 예요 — **연산자는 양쪽 타입이 같을 필요가 없습니다.** 구조 분해는 이름이 아니라 **순서**로 풀립니다. `val (start, end)` 에서 `start` 는 `component1()`, `end` 는 `component2()` 의 결과이니 `startDay` 를 1번에 놓아야 `1~31` 이 나옵니다. `component1`/`component2` 에도 `operator` 를 빠뜨리면 그냥 평범한 함수가 되어 구조 분해가 안 됩니다.
---
뼈대는 이렇습니다.

`operator fun plus(other: Money) = Money(won + other.won)` / `operator fun times(n: ___) = Money(won * n)` / `operator fun compareTo(other: Money): Int = won.___(other.won)`

`infix fun Money.discount(percent: Int): Money = Money(won * (100 - ___) / 100)`

`operator fun component1() = ___` 와 `operator fun component2() = ___`
```

```kotlin solution
class Money(val won: Int) {
    // operator 키워드가 붙어야 + * < 가 이 함수들로 연결된다.
    operator fun plus(other: Money) = Money(won + other.won)

    // 양쪽 타입이 같을 필요가 없다 — Money * Int
    operator fun times(n: Int) = Money(won * n)

    // 이 하나로 < > <= >= 네 기호가 전부 동작한다.
    operator fun compareTo(other: Money): Int = won.compareTo(other.won)

    override fun toString(): String = "${won}원"
}

// infix 조건: 확장(또는 멤버) + 파라미터 정확히 하나.
infix fun Money.discount(percent: Int): Money = Money(won * (100 - percent) / 100)

class Period(val startDay: Int, val endDay: Int) {
    // data class 가 아니어도 componentN 을 직접 주면 구조 분해가 된다. 순서가 곧 의미다.
    operator fun component1() = startDay
    operator fun component2() = endDay
}

fun main() {
    val a = Money(1000)
    val b = Money(2500)

    println(a + b)
    println(a * 3)
    println(a < b)
    println(b discount 20)

    val (start, end) = Period(1, 31)
    println("$start~$end")

    // List 에는 plusAssign 이 없다 → prices = prices.plus(...) 로 풀려 새 리스트가 생긴다.
    var prices = listOf(Money(100))
    val snapshot = prices
    prices += Money(200)
    println("immutable: ${snapshot.size} -> ${prices.size}")

    // MutableCollection.plusAssign → 제자리 변경이라 별칭까지 같이 바뀐다.
    val basket = mutableListOf(Money(100))
    val alias = basket
    basket += Money(200)
    println("mutable: ${alias.size}")
}
```
