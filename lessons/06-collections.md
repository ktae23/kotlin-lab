# Lesson 6 — 컬렉션 API

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

힌트: `sumOf`, `groupBy` + `mapValues`, `toList().sortedByDescending{}.toMap()`, `groupingBy{}.eachCount()`, `filter` + `map`.

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
    println(TODO())

    // 2. 고객별 PAID 합계 (금액 내림차순)
    println(TODO())

    // 3. 상태별 건수
    println(TODO())

    // 4. 3만원 이상 주문의 고객 이름
    println(TODO())
}
```

```text expected
68000
{kim=47000, lee=21000}
{PAID=3, PENDING=1, CANCELED=1}
[kim]
```
