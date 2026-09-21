# Lesson 21 — 컬렉션 API

Java Stream API를 쓰셨다면 개념은 거의 그대로입니다. 차이는 **보일러플레이트가 사라진다**는 것과 **기본이 즉시 평가(eager)**라는 점입니다.

## .stream() ... .collect() 가 없다

```java
// Java
List<String> names = orders.stream()
    .filter(o -> o.getAmount() >= 10000)
    .map(Order::getCustomer)
    .distinct()
    .collect(Collectors.toList());
```
```kotlin
val names = orders
    .filter { it.amount >= 10_000 }
    .map { it.customer }
    .distinct()
```

컬렉션에 확장 함수로 직접 붙어 있어서 스트림으로 감싸고 다시 collect할 필요가 없습니다. 람다 인자가 하나면 이름을 생략하고 `it`을 씁니다.

## 자주 쓰는 것들

| Kotlin | Java Stream | 비고 |
|---|---|---|
| `filter` / `map` | 같음 | |
| `sumOf { }` | `mapToInt().sum()` | 한 방에 |
| `groupBy { }` | `Collectors.groupingBy` | `Map<K, List<T>>` |
| `associateBy { }` | `Collectors.toMap` | `Map<K, T>` — id로 인덱싱 |
| `partition { }` | 없음 | `Pair<List, List>`로 두 갈래 |
| `flatMap { }` | 같음 | |
| `firstOrNull { }` | `findFirst()` | Optional 대신 `T?` |
| `any` / `all` / `none` | `anyMatch` 등 | |
| `sortedByDescending { }` | `sorted(comparator.reversed())` | |
| `distinctBy { }` | 없음 | 특정 키 기준 중복 제거 |
| `chunked(n)` / `windowed(n)` | 없음 | 배치 처리에 유용 |

`associateBy`는 실무에서 특히 자주 씁니다. N+1을 피하려고 한 번에 조회한 리스트를 id 맵으로 바꿀 때요.

```kotlin
val productById = products.associateBy { it.id }   // Map<Long, Product>
```

## groupBy 와 eachCount

```kotlin
orders.groupBy { it.status }                      // Map<String, List<Order>>
orders.groupingBy { it.status }.eachCount()       // Map<String, Int>
orders.groupBy({ it.customer }, { it.amount })    // Map<String, List<Int>>
```

## Sequence — 지연 평가가 필요할 때

Kotlin 컬렉션 함수는 **매 단계마다 새 리스트를 만듭니다.** 100만 건에 `filter → map → take(10)`을 걸면 중간 리스트가 두 번 생겨요.

```kotlin
val result = hugeList.asSequence()
    .filter { it.active }
    .map { it.name }
    .take(10)
    .toList()      // 여기서 처음으로 평가된다
```

`asSequence()`가 Java Stream의 지연 평가에 대응합니다.

**언제 쓰나**: 원소가 많고(수만 건 이상) 연산 단계가 여러 개일 때, 또는 `take`/`first`로 조기 종료할 때. **작은 컬렉션에는 오히려 오버헤드**라 쓰지 마세요. 실무 대부분은 그냥 리스트로 충분합니다.

## null 다루기

```kotlin
val names: List<String> = users.mapNotNull { it.nickname }   // null 걸러내며 map
val first: User? = users.firstOrNull { it.active }           // 없으면 null
```

`first { }`는 없으면 예외를 던지고, `firstOrNull { }`은 null을 반환합니다. Java의 `findFirst().orElse(null)` 자리를 대체합니다.

## 연습

주문 목록에서 네 가지 집계를 만들어 출력하세요. **모두 한 줄 체인으로 가능합니다.**

1. `PAID` 주문의 **총 금액**
2. 고객별 `PAID` 주문 **합계 맵** (금액 내림차순)
3. **상태별 주문 건수** 맵
4. 3만원 이상 주문의 **고객 이름 목록**

```kotlin starter
data class Order(val id: Int, val customer: String, val amount: Int, val status: String)

val orders = listOf(
    Order(1, "kim", 15_000, "PAID"),
    Order(2, "lee", 8_000, "PENDING"),
    Order(3, "kim", 32_000, "PAID"),
    Order(4, "park", 5_000, "CANCELED"),
    Order(5, "lee", 21_000, "PAID"),
)

fun main() {
    // 1. PAID 총 금액
    val paidTotal: Int = TODO("filter + sumOf")
    println(paidTotal)

    // 2. 고객별 PAID 합계 (금액 내림차순)
    val byCustomer: Map<String, Int> = TODO("groupBy + mapValues, 그리고 정렬")
    println(byCustomer)

    // 3. 상태별 건수
    val byStatus: Map<String, Int> = TODO("groupingBy + eachCount")
    println(byStatus)

    // 4. 3만원 이상 주문의 고객 이름
    val bigSpenders: List<String> = TODO("filter + map")
    println(bigSpenders)
}
```

```text expected
68000
{kim=47000, lee=21000}
{PAID=3, PENDING=1, CANCELED=1}
[kim]
```

```text hint
네 줄 모두 "리스트를 하나의 값으로 접는" 일입니다. 먼저 각 줄이 **최종적으로 무슨 타입을 내놔야 하는지** 적어보세요 — 1번은 `Int`, 2번과 3번은 `Map`, 4번은 `List<String>`. 목표 타입이 정해지면 쓸 함수는 거의 자동으로 좁혀집니다. Java 였다면 `Collectors.___` 자리에 들어갈 이름이 Kotlin 에서는 그냥 확장 함수 이름이에요.
---
도구는 이렇습니다. 합계는 `sumOf { }`, 키로 묶는 건 `groupBy { }`, 묶인 값을 다시 가공하는 건 `mapValues { }`, **건수만** 필요하면 `groupBy` 대신 `groupingBy { }.eachCount()`. 마지막 줄은 `filter` + `map` 이면 끝납니다. 3번에서 `groupBy` 로 리스트를 만든 뒤 `size` 를 세는 것도 답은 맞지만, 중간 리스트를 만들지 않는 `groupingBy` 쪽이 이 레슨이 노리는 지점입니다.
---
까다로운 건 2번의 **정렬**입니다. `Map` 에는 정렬 함수가 없어요. 그래서 `toList()` 로 `List<Pair<String, Int>>` 를 만들고 → `sortedByDescending { }` 로 값 기준 정렬 → `toMap()` 으로 되돌립니다. `toMap()` 이 만드는 건 `LinkedHashMap` 이라 **방금 잡은 순서가 그대로 유지**됩니다. 이게 Java 의 `LinkedHashMap::new` 를 넘기던 `Collectors.toMap` 3인자 버전을 대신해요. 3번의 출력 순서(`PAID, PENDING, CANCELED`)도 같은 이유 — `eachCount()` 는 **처음 등장한 순서**를 지킵니다.
---
뼈대입니다. 빈칸만 채우세요.

1번: `orders.filter { it.status == "PAID" }.___ { it.amount }`

2번: `orders.filter { ... }.groupBy { it.customer }.mapValues { (_, list) -> list.sumOf { ___ } }.toList().sortedByDescending { ___ }.toMap()`

3번: `orders.___ { it.status }.eachCount()`

4번: `orders.filter { it.amount >= ___ }.map { ___ }`
```

```kotlin solution
data class Order(val id: Int, val customer: String, val amount: Int, val status: String)

val orders = listOf(
    Order(1, "kim", 15_000, "PAID"),
    Order(2, "lee", 8_000, "PENDING"),
    Order(3, "kim", 32_000, "PAID"),
    Order(4, "park", 5_000, "CANCELED"),
    Order(5, "lee", 21_000, "PAID"),
)

fun main() {
    // 1. PAID 총 금액
    println(orders.filter { it.status == "PAID" }.sumOf { it.amount })

    // 2. 고객별 PAID 합계 (금액 내림차순)
    //    Map 은 정렬이 안 되니 toList() 로 펴서 정렬하고, toMap() 이 LinkedHashMap 이라 순서가 유지된다.
    println(
        orders.filter { it.status == "PAID" }
            .groupBy { it.customer }
            .mapValues { (_, list) -> list.sumOf { it.amount } }
            .toList()
            .sortedByDescending { (_, total) -> total }
            .toMap()
    )

    // 3. 상태별 건수 — groupBy 로 중간 리스트를 만들지 않고 groupingBy + eachCount
    println(orders.groupingBy { it.status }.eachCount())

    // 4. 3만원 이상 주문의 고객 이름
    println(orders.filter { it.amount >= 30_000 }.map { it.customer })
}
```
