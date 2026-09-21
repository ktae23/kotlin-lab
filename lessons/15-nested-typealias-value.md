# Lesson 15 — 중첩·inner 클래스, typealias, value class

세 가지 작은 도구를 묶었습니다. 공통점은 **"Java 에서 하던 습관을 그대로 옮기면 손해 보는 지점"** 이라는 것. 특히 첫 번째는 **Java 와 기본값이 정반대**라 모르면 조용히 메모리 누수가 납니다.

## 중첩 클래스 — 기본값이 Java와 뒤집혀 있다

Java 에서 클래스 안에 클래스를 쓰면 기본이 **inner class**(바깥 인스턴스 참조를 가짐)였습니다.

```java
public class Outer {
    class Inner { }          // 기본: Outer.this 를 몰래 들고 있다
    static class Nested { }  // static 을 붙여야 참조가 끊긴다
}
```

Kotlin 은 반대입니다.

```kotlin
class Outer {
    class Nested { }         // 기본: 바깥 참조 없음 (= Java 의 static class)
    inner class Inner { }    // inner 를 붙여야 바깥 참조를 가진다
}
```

생성 방법부터 다릅니다.

```kotlin
Outer.Nested()      // 바깥 인스턴스 없이 생성
Outer().Inner()     // 바깥 인스턴스가 있어야 생성된다
```

### 왜 이 반전이 중요한가

Java 의 대표적인 메모리 누수 패턴이 이겁니다. `static` 을 빠뜨린 리스너·콜백·`Runnable` 이 바깥 객체를 붙잡고 놓지 않아서, 바깥이 죽어야 할 시점에 GC 가 못 가져갑니다. `Map<K, Outer.Inner>` 를 캐시로 들고 있으면 `Outer` 전체가 따라 살아남죠.

**Kotlin 은 안전한 쪽이 기본입니다.** 대신 방향이 뒤집혔으니 두 가지를 조심하세요.

1. Java 코드를 Kotlin 으로 옮기면서 `static class` → `class` 로 바꾸는 건 맞습니다. 하지만 `class`(비 static) → `class` 로 그대로 옮기면 **바깥 참조가 사라져 컴파일 에러**가 납니다. 이때 `inner` 를 붙이는 게 정답입니다.
2. 반대로 Kotlin 코드에서 `inner` 가 보이면 **"정말 바깥 상태가 필요한가"** 를 물어야 합니다. 대개는 필요 없습니다.

### this@Outer

`inner` 안에서 바깥 인스턴스를 가리키려면 **라벨** 을 씁니다.

```kotlin
class Warehouse(val name: String) {
    inner class Shelf(val no: Int) {
        val name: String = "선반"                       // 이름이 겹친다
        fun describe(): String = "${this@Warehouse.name}#$no"   // 바깥의 name
    }
}
```

`this` 는 가장 가까운 `Shelf`, `this@Warehouse` 는 바깥입니다. Java 의 `Warehouse.this` 와 같은 뜻이고, 이 라벨 문법은 나중에 스코프 함수와 람다에서 똑같이 다시 나옵니다.

> 실무 기준: **중첩은 기본값(`class`) 으로 두고, 바깥 상태를 진짜로 써야 할 때만 `inner`.** DTO·설정·상수 묶음 같은 건 100% 기본값입니다.

## typealias — 긴 타입에 이름 붙이기

```kotlin
typealias OrderBook = MutableMap<UserId, MutableList<OrderId>>
typealias Validator = (String) -> Boolean
typealias JpaPage<T> = org.springframework.data.domain.Page<T>
```

쓰임은 크게 셋입니다.

- **긴 제네릭 타입**을 시그니처마다 반복하지 않기
- **함수 타입**에 의미 있는 이름 주기 (`(String) -> Boolean` 보다 `Validator`)
- **이름 충돌 해소** — 같은 이름 클래스가 두 패키지에 있을 때 `import x.y.Page as JpaPage` 대신

### 한계: 타입 안전성은 1도 주지 않는다

여기가 핵심입니다. `typealias` 는 **컴파일 시점에 그냥 치환**됩니다. 새 타입이 생기는 게 아니에요.

```kotlin
typealias UserIdAlias = Long
typealias OrderIdAlias = Long

fun link(user: UserIdAlias, order: OrderIdAlias) { }

link(order, user)    // 컴파일 통과!! 둘 다 그냥 Long 이다
```

`typealias` 로 도메인 타입을 만들었다고 착각하는 코드를 실무에서 꽤 봅니다. **별명은 가독성 도구지 안전장치가 아닙니다.** 안전이 필요하면 다음 도구를 쓰세요.

## value class — 래퍼의 비용 없이 타입 안전성

```kotlin
@JvmInline
value class UserId(val value: Long)

@JvmInline
value class OrderId(val value: Long)

fun link(user: UserId, order: OrderId) { }

link(orderId, userId)   // 컴파일 에러 — 타입이 다르다
```

Java 에서 이러려면 진짜 래퍼 클래스를 만들어야 했고, 그러면 **객체 할당 비용**이 붙었습니다. 그래서 "그냥 long 쓰자" 로 타협했죠.

Kotlin 의 `value class`(1.5 이전 이름: `inline class`)는 **컴파일러가 대부분의 경우 래퍼를 지우고 안쪽 값만 남깁니다.** 위 `link` 는 바이트코드에서 `link(long, long)` 이 됩니다. 안전성은 컴파일 타임에 받고, 런타임 비용은 0 인 거예요.

### 제약

- **주 생성자에 프로퍼티가 정확히 하나**, 그리고 `val`
- JVM 타깃에서는 **`@JvmInline` 애노테이션 필수**
- 상태를 가지는 `init` 블록은 되지만(검증용으로 아주 유용), backing field 를 추가로 가질 수 없음
- 클래스 상속 불가 (인터페이스 구현은 가능)

```kotlin
@JvmInline
value class Email(val value: String) {
    init {
        require(value.contains("@")) { "이메일 형식 아님: $value" }
    }
}
```

생성자에서 검증하니 **`Email` 타입인 순간 이미 유효합니다.** 서비스 곳곳의 `validateEmail(...)` 호출이 사라집니다.

### 박싱되는 경우 — "대부분" 의 예외

래퍼가 완전히 사라지는 건 아닙니다. 다음 경우엔 실제 객체가 만들어집니다.

- **제네릭 타입 인자**로 쓰일 때 — `List<UserId>`, `Map<UserId, …>`
- **nullable** 일 때 — `UserId?`
- 인터페이스를 구현하고 **그 인터페이스 타입으로 다룰 때**

`List<UserId>` 를 수백만 건 다루는 핫 루프라면 이 비용을 계산해야 합니다. 다만 **대부분의 백엔드 코드(요청 하나에 수십~수백 건)에서는 무시해도 되는 수준**이고, 얻는 안전성이 훨씬 큽니다.

## 셋을 한 문장으로

| 도구 | 새 타입이 생기나 | 런타임 비용 | 언제 |
|---|---|---|---|
| `typealias` | **아니오** (치환일 뿐) | 없음 | 긴 타입 읽기 좋게 |
| `value class` | **예** | 거의 없음 (박싱 예외 있음) | 같은 원시 타입을 구분해야 할 때 |
| `data class` | 예 | 객체 할당 있음 | 필드가 둘 이상 |

## 리뷰에서 지적할 것

**1. 같은 타입 파라미터가 줄줄이 늘어선 시그니처**

```kotlin
fun transfer(fromId: Long, toId: Long, amount: Long, requesterId: Long)
```

`Long` 네 개. **호출부에서 순서를 바꿔 넣어도 컴파일이 통과합니다.** 이건 언젠가 사고가 나는 코드예요. 리뷰에서 이런 걸 보면 두 가지를 제안하세요.

- 최소한 **named argument 강제** (`transfer(fromId = …, toId = …)`)
- 제대로 고치려면 **`value class`** — `AccountId`, `Money` 로 쪼개면 순서를 바꾼 호출이 **컴파일 에러**가 됩니다

> 면접에서 "Kotlin 을 쓰면 뭐가 좋냐"에 `value class` 로 답하면 인상이 다릅니다. **"버그를 테스트가 아니라 컴파일러가 잡게 만든다"** 는 이야기니까요.

**2. 이유 없는 `inner`**

`inner` 가 붙었는데 본문에 `this@Outer` 가 한 번도 안 나오면 **그냥 지우면 됩니다.** 남아 있으면 인스턴스마다 참조가 하나씩 더 붙고, 캐시나 컬렉션에 담는 순간 바깥 객체가 못 죽습니다.

**3. `typealias` 를 도메인 타입처럼 쓰는 코드**

`typealias UserId = Long` 은 문서화 효과만 있고 잘못된 호출을 하나도 막지 못합니다. 안전을 원한 거면 `value class` 로 바꾸자고 하세요.

## 연습

주문 장부 코드를 완성하세요. `assign` 과 `main` 은 그대로 두고 위쪽 세 군데만 채우면 됩니다.

1. **`UserId`, `OrderId`** — 둘 다 `Long` 하나를 감싸는 `value class` (프로퍼티 이름은 `value`)
2. **`typealias OrderBook`** — `MutableMap<UserId, MutableList<OrderId>>` 의 별명
3. **`Warehouse` 안의 두 클래스** — `Slot(val code: String)` 은 **바깥 인스턴스 없이** 생성되고 `describe()` 가 `"slot=A-01"` 형태를 반환, `Shelf(val no: Int)` 는 **바깥 인스턴스가 있어야** 생성되고 `describe()` 가 `"서울창고#3"` 처럼 **바깥 창고 이름**을 붙여 반환

```kotlin starter
// TODO 1: UserId, OrderId 를 value class 로 정의하세요. (프로퍼티 이름은 value)

// TODO 2: typealias OrderBook 을 정의하세요.

class Warehouse(val name: String) {
    // TODO 3: Slot(중첩) 과 Shelf(inner) 를 정의하세요.
}

fun assign(book: OrderBook, user: UserId, order: OrderId) {
    val list = book[user]
    if (list == null) book[user] = mutableListOf(order) else list.add(order)
}

fun main() {
    val user = UserId(7L)
    val book: OrderBook = mutableMapOf()
    assign(book, user, OrderId(1001L))
    assign(book, user, OrderId(1002L))

    val orders = book[user]
    println("${user.value} -> ${orders?.size}")
    println(orders?.get(1)?.value)

    println(user == UserId(7L))
    println(user)

    val w = Warehouse("서울창고")
    println(Warehouse.Slot("A-01").describe())
    println(w.Shelf(3).describe())
}
```

```text expected
7 -> 2
1002
true
UserId(value=7)
slot=A-01
서울창고#3
```

```text hint
`main` 의 마지막 두 줄이 **두 중첩 클래스의 차이를 그대로 보여 줍니다.** 하나는 `Warehouse.Slot(...)` 으로 **타입 이름에서 바로** 만들고, 다른 하나는 `w.Shelf(3)` 으로 **인스턴스에서** 만들죠. Kotlin 에서 이 둘을 가르는 키워드가 하나 있고, **기본값은 Java 와 반대** 라는 걸 떠올려 보세요.
---
쓸 것은 `@JvmInline value class`, `typealias`, 그리고 `inner` 입니다. `value class` 는 JVM 에서 애노테이션이 **필수**이고 주 생성자 프로퍼티가 **정확히 하나** 여야 합니다. `typealias` 는 새 타입을 만드는 게 아니라 **긴 타입을 그 자리에 그대로 치환**하는 별명이라, `= ` 오른쪽에 원래 타입을 통째로 씁니다.
---
`Shelf.describe()` 가 바깥의 `name` 을 써야 하는데, `Shelf` 자기 자신에는 `name` 이 없습니다. `inner` 를 붙이면 바깥 인스턴스를 들고 있게 되고 그때 `this@Warehouse.name` 으로 접근합니다 (Java 의 `Warehouse.this.name`). `Slot` 은 바깥이 전혀 필요 없으니 **아무 키워드도 붙이지 않는 기본 중첩** 그대로 두세요 — 이게 Java 의 `static class` 에 해당합니다. `println(user)` 가 `UserId(value=7)` 로 나오는 건 `value class` 가 `toString`/`equals` 를 자동 생성하기 때문이라 따로 쓸 게 없습니다.
---
뼈대는 이렇습니다.

`@JvmInline value class UserId(val ___: Long)` — `OrderId` 도 같은 꼴

`typealias OrderBook = MutableMap<___, MutableList<___>>`

`class Warehouse(val name: String) { class Slot(val code: String) { fun describe(): String = "slot=$___" }  ___ class Shelf(val no: Int) { fun describe(): String = "${this@___.name}#$no" } }`
```

```kotlin solution
// 둘 다 속은 Long 이지만 타입이 달라 서로 바꿔 넣으면 컴파일 에러가 난다. 런타임엔 래퍼가 지워진다.
@JvmInline
value class UserId(val value: Long)

@JvmInline
value class OrderId(val value: Long)

// 별명일 뿐 새 타입이 아니다 — 시그니처 가독성을 위한 것.
typealias OrderBook = MutableMap<UserId, MutableList<OrderId>>

class Warehouse(val name: String) {
    // 기본 중첩 = Java 의 static class. 바깥 참조가 없다.
    class Slot(val code: String) {
        fun describe(): String = "slot=$code"
    }

    // inner 를 붙여야 바깥 인스턴스를 들고 있고, this@Warehouse 로 접근한다.
    inner class Shelf(val no: Int) {
        fun describe(): String = "${this@Warehouse.name}#$no"
    }
}

fun assign(book: OrderBook, user: UserId, order: OrderId) {
    val list = book[user]
    if (list == null) book[user] = mutableListOf(order) else list.add(order)
}

fun main() {
    val user = UserId(7L)
    val book: OrderBook = mutableMapOf()
    assign(book, user, OrderId(1001L))
    assign(book, user, OrderId(1002L))

    val orders = book[user]
    println("${user.value} -> ${orders?.size}")
    println(orders?.get(1)?.value)

    println(user == UserId(7L))
    println(user)

    val w = Warehouse("서울창고")
    println(Warehouse.Slot("A-01").describe())
    println(w.Shelf(3).describe())
}
```
