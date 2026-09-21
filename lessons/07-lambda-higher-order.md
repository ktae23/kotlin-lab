# Lesson 7 — 람다와 고차 함수

Java 8에서 람다를 써보셨다면 "이미 아는 내용"처럼 보일 겁니다. 아닙니다. Java의 람다는 **인터페이스를 흉내 낸 문법 설탕**이고, Kotlin의 람다는 **타입 시스템의 1급 시민**입니다. 이 차이가 컬렉션 API, DSL, 코루틴 문법까지 전부를 결정합니다.

## 함수가 타입이 된다

Java에서는 "함수를 받는 함수"를 쓰려면 먼저 **인터페이스를 찾아야** 했습니다.

```java
// 인자 1개 받고 1개 반환 → Function
int total(List<Order> orders, Function<Order, Integer> discount) { ... }

// 인자 2개 → BiFunction / 반환 없음 → Consumer / 인자 없음 → Supplier
// boolean 반환 → Predicate / int 특화 → IntFunction, ToIntFunction, IntPredicate ...
```

`java.util.function` 패키지에 43개의 인터페이스가 있습니다. 43개가 필요했던 이유는 단 하나 — **Java에는 함수 타입이 없기 때문**입니다.

```kotlin
fun total(orders: List<Order>, discount: (Order) -> Int): Int { ... }
```

`(Order) -> Int`. 이게 타입입니다. 변수에 담고, 리스트에 넣고, 반환할 수 있습니다.

```kotlin
val discount: (Order) -> Int = { it.amount / 10 }
val policies: List<(Order) -> Int> = listOf(discount, { 0 })
fun pick(vip: Boolean): (Order) -> Int = if (vip) discount else { _ -> 0 }
```

`Consumer`는 `(T) -> Unit`, `Supplier`는 `() -> T`, `Predicate`는 `(T) -> Boolean`. 외울 이름이 없습니다. 형태가 곧 타입이니까요.

## 람다 문법 — `it` 과 후행 람다

```kotlin
val plus: (Int, Int) -> Int = { a, b -> a + b }   // 파라미터 -> 본문
val square: (Int) -> Int = { it * it }            // 파라미터 1개면 이름 생략, it
```

`it`은 편의 기능이지 미덕이 아닙니다. **중첩되거나 람다가 3줄을 넘으면 이름을 붙이세요.** `it` 안에 `it`이 있는 코드는 리뷰에서 반려 대상입니다.

Kotlin에만 있는 규칙이 하나 더 있습니다 — **마지막 인자가 함수면 괄호 밖으로 뺄 수 있다.**

```kotlin
orders.filter({ it.vip })   // 문법상 가능하지만
orders.filter { it.vip }    // 이렇게 쓴다

// 인자가 여럿이면 마지막 것만 밖으로
repeat(3) { println(it) }
file.useLines(Charsets.UTF_8) { lines -> lines.count() }
```

이 규칙 때문에 `runBlocking { }`, `transaction { }` 같은 게 **언어 키워드처럼 보이는 함수**가 됩니다. Kotlin DSL의 전부가 여기서 출발합니다.

## 왜 `inline` 인가 — Java가 감추고 있던 비용

Java에서 `Predicate<Order> p = o -> o.getAmount() > threshold;` 는 `threshold`를 캡처하는 순간 **객체를 하나 할당**합니다. Kotlin도 똑같아요. `(Order) -> Int`는 컴파일되면 `Function1<Order, Integer>` 객체가 되고, 호출은 인터페이스 메서드 호출입니다. 루프 안에서 수백만 번 돌면 부담이 됩니다.

`inline`은 **컴파일 타임에 함수 본문과 람다를 호출 지점에 그대로 복사**합니다.

```kotlin
inline fun <T> List<T>.firstMatching(predicate: (T) -> Boolean): T? {
    for (element in this) {
        if (predicate(element)) return element
    }
    return null
}
```

호출하면 컴파일 결과는 그냥 for 루프입니다. **객체 할당 0, 가상 호출 0.** `filter`, `map`, `let`, `apply`, `run` — stdlib의 고차 함수가 전부 `inline`인 이유입니다.

하지만 진짜 중요한 건 성능이 아니라 이겁니다 — **inline 람다 안에서는 `return`이 바깥 함수를 종료합니다.**

```kotlin
fun findVip(orders: List<Order>): Order? {
    orders.forEach { if (it.vip) return it }   // findVip 자체가 return 된다
    return null
}
```

Java 람다에서는 절대 불가능한 동작입니다(`non-local return`). 그래서 Kotlin의 `forEach`가 for 루프를 실제로 대체할 수 있는 겁니다.

### `noinline` 과 `crossinline`

inline 함수의 람다 파라미터에는 제약이 따라붙습니다. 그걸 푸는 두 키워드입니다.

```kotlin
// 람다를 변수에 담거나 다른 곳으로 넘겨야 하면 → noinline
inline fun run(before: () -> Unit, noinline after: () -> Unit) {
    before()
    register(after)   // 객체로 저장해야 하므로 인라인 불가
}

// 람다가 다른 실행 컨텍스트(스레드, 콜백)로 넘어가면 → crossinline
inline fun async(crossinline block: () -> Unit) {
    Thread { block() }.start()   // 여기서 non-local return 은 말이 안 된다
}
```

`crossinline`은 "인라인은 하되 **`return`은 금지**"라는 뜻입니다. 나중에 실행될 코드가 이미 끝난 함수를 return 할 수는 없으니까요.

> 실무 기준: **람다를 받는 짧은 함수면 `inline`을 붙이고, 그 외에는 붙이지 마세요.** 본문이 긴 함수에 inline을 붙이면 호출 지점마다 코드가 복사돼 바이트코드가 부풉니다. IDE가 경고로 알려줍니다.

## 함수 참조 `::` — 람다를 쓰지 않아도 될 때

```kotlin
fun vipDiscount(order: Order): Int = if (order.vip) order.amount / 10 else 0

orders.totalWith { vipDiscount(it) }   // 람다로 감싸기
orders.totalWith(::vipDiscount)        // 함수 참조 — 이게 낫다
```

| 형태 | 의미 |
|---|---|
| `::vipDiscount` | 최상위 함수 참조 |
| `Order::amount` | 프로퍼티 참조 → `(Order) -> Int` |
| `String::uppercase` | 멤버 함수 참조 → `(String) -> String` |
| `::Order` | **생성자** 참조 |
| `service::send` | 특정 인스턴스에 바인딩된 참조 |

Java의 `Order::getAmount`와 거의 같지만, Kotlin은 생성자와 프로퍼티까지 동일한 문법으로 덮습니다. `list.map(::Order)` 처럼 쓸 수 있어요.

## Java 경계 — SAM 변환

Kotlin에서 Java 인터페이스를 넘길 때는 람다가 그대로 통합니다.

```kotlin
executor.submit { doWork() }              // Runnable 로 자동 변환 (SAM 변환)
button.setOnClickListener { handle(it) }  // OnClickListener 로 변환
```

**반대 방향에 함정이 있습니다.** Kotlin 함수 타입은 Java에서 보면 `Function1<A, B>`이고, 호출은 `.invoke(a)` 입니다. Java에서 쓸 API라면 `fun interface`로 선언하세요.

```kotlin
fun interface DiscountPolicy {   // Java 에서 람다로 쓸 수 있다
    fun apply(order: Order): Int
}
```

> 면접에서 자주 나옵니다: **"Kotlin 람다는 항상 객체를 만드나요?"** → 아니오. `inline` 함수에 넘기면 객체가 생기지 않고, 캡처가 없는 람다는 싱글턴으로 재사용됩니다. 이걸 모르면 "Kotlin은 람다 때문에 느리다"는 근거 없는 말을 하게 됩니다.

## 연습

주문 목록을 다루는 고차 함수 두 개와 함수 참조를 구현합니다.

1. `List<Order>.totalWith(discount: (Order) -> Int): Int` — 각 주문에 할인 함수를 적용해 `amount - discount(order)` 의 합을 반환
2. `List<T>.firstMatching(predicate: (T) -> Boolean): T?` — 조건을 만족하는 **첫 원소**를 반환, 없으면 null. **`inline`으로 선언하고 루프 안에서 `return`** 하세요 (stdlib `find` 를 쓰지 말 것)
3. `vipDiscount` — vip면 금액의 10%, 아니면 0. `main`에서 **함수 참조(`::`)** 로 넘깁니다

```kotlin starter
data class Order(val id: String, val amount: Int, val vip: Boolean)

// TODO 1: 할인 정책을 함수 타입으로 받는 고차 함수 totalWith 를 구현하세요.
//         fun List<Order>.totalWith(discount: (Order) -> Int): Int

// TODO 2: inline 고차 함수 firstMatching 을 구현하세요. (find 사용 금지)
//         inline fun <T> List<T>.firstMatching(predicate: (T) -> Boolean): T?

// TODO 3: vip 면 금액의 10%, 아니면 0 을 반환하는 vipDiscount 함수를 만드세요.

fun main() {
    val orders = listOf(
        Order("A-1", 10_000, vip = true),
        Order("A-2", 20_000, vip = false),
        Order("A-3", 30_000, vip = true),
    )

    println(orders.totalWith { 0 })
    println(orders.totalWith(::vipDiscount))
    println(orders.firstMatching { it.amount >= 20_000 }?.id)
    println(orders.firstMatching { it.amount > 100_000 }?.id)
}
```

```text expected
60000
56000
A-2
null
```

```text hint
세 과제의 성격이 다릅니다. 1번은 **함수를 값으로 받아 쓰는 쪽**, 2번은 **inline 이 왜 필요한지 몸으로 아는 쪽**, 3번은 **람다 대신 이름을 넘기는 쪽**이에요. 1번부터 보면, 시그니처는 이미 주어져 있습니다 — `discount: (Order) -> Int`. 이건 그냥 **파라미터**고, 본문에서 `discount(어떤주문)` 처럼 **호출하면 됩니다.** Java 의 `Function<Order,Integer> f` 를 받아 `f.apply(o)` 하던 것과 정확히 같되, `.apply` 가 없을 뿐이에요.
---
쓸 도구입니다. 1번은 확장 함수라 수신 객체가 곧 `this` — `this.sumOf { }` 를 `sumOf { }` 로 줄여 쓸 수 있고, 각 원소마다 `it.amount - discount(it)` 를 내놓으면 됩니다. 2번은 stdlib `find` 금지니까 `for (element in this)` 루프 + 조건 만족 시 `return element`, 끝까지 못 찾으면 `return null`. 3번은 **최상위 함수**로 선언해야 `::vipDiscount` 로 참조할 수 있습니다 (클래스 안이면 `Something::vipDiscount` 가 돼요).
---
2번에서 `inline` 을 빼면 어떻게 되는지가 이 연습의 핵심입니다. 사실 `firstMatching` 자체의 `return` 은 inline 없이도 됩니다 — 하지만 **호출하는 쪽**이 넘긴 람다 안에서 `return` 을 쓰려면 inline 이 필수예요. 그리고 `predicate(element)` 호출이 매번 `Function1.invoke()` 라는 인터페이스 호출이 되는데, `inline` 을 붙이면 컴파일러가 본문과 람다를 호출 지점에 **복사**해서 그냥 for 루프로 만들어 버립니다. 객체 할당 0, 가상 호출 0. `filter`·`map`·`let` 이 전부 inline 인 이유가 이것이고, 그래서 `forEach` 안의 `return` 이 바깥 함수를 끝낼 수 있는 겁니다. 반환 타입 `T?` 는 "못 찾으면 null" 을 타입으로 말하는 것 — Java 의 `Optional<T>` 자리입니다.
---
뼈대입니다. 빈칸을 채우세요.

`fun List<Order>.totalWith(discount: (Order) -> Int): Int = sumOf { it.amount - ___ }`

`inline fun <T> List<T>.firstMatching(predicate: (T) -> Boolean): T? { for (element in this) { if (___) return ___ }; return null }`

`fun vipDiscount(order: Order): Int = if (order.vip) ___ else 0`
```

```kotlin solution
data class Order(val id: String, val amount: Int, val vip: Boolean)

// 할인 정책을 (Order) -> Int 라는 "타입"으로 받는다. Java 의 Function<Order,Integer> 자리.
fun List<Order>.totalWith(discount: (Order) -> Int): Int =
    sumOf { it.amount - discount(it) }

// inline 이라 람다가 호출 지점에 펼쳐진다 — 객체 할당 없이 그냥 for 루프가 되고, non-local return 도 가능해진다.
inline fun <T> List<T>.firstMatching(predicate: (T) -> Boolean): T? {
    for (element in this) {
        if (predicate(element)) return element
    }
    return null
}

// 최상위 함수라야 ::vipDiscount 로 참조할 수 있다.
fun vipDiscount(order: Order): Int = if (order.vip) order.amount / 10 else 0

fun main() {
    val orders = listOf(
        Order("A-1", 10_000, vip = true),
        Order("A-2", 20_000, vip = false),
        Order("A-3", 30_000, vip = true),
    )

    println(orders.totalWith { 0 })
    println(orders.totalWith(::vipDiscount))
    println(orders.firstMatching { it.amount >= 20_000 }?.id)
    println(orders.firstMatching { it.amount > 100_000 }?.id)
}
```
