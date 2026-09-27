# Lesson 21 — 컬렉션 1 — 변환

컬렉션은 세 편으로 나눠 갑니다. **이번 편은 "모양을 바꾸는" 쪽** — 원소 하나를 다른 것으로 바꾸거나, 중첩을 펼치거나, 리스트를 맵으로 세우는 일입니다. 줄이는 쪽(`filter` 이후의 집계)은 L22, 정렬·집합·`Sequence` 는 L23 입니다.

Java Stream 을 쓰셨다면 개념은 거의 그대로입니다. 차이는 **보일러플레이트가 사라진다**는 것, 그리고 **몇 개는 Java 에 아예 없다**는 것입니다.

## `.stream()` ... `.collect()` 가 없다

```java
// Java
List<String> names = orders.stream()
    .map(Order::getCustomer)
    .distinct()
    .collect(Collectors.toList());
```
```kotlin
val names = orders
    .map { it.customer }
    .distinct()
```

컬렉션에 확장 함수로 직접 붙어 있어서 스트림으로 감싸고 다시 `collect` 할 필요가 없습니다. 람다 인자가 하나면 이름을 생략하고 `it` 을 씁니다.

## 변환 함수 지도

| Kotlin | Java Stream | 결과 타입 |
|---|---|---|
| `map { }` | `map` | `List<R>` |
| `mapNotNull { }` | 없음 | `List<R>` — null 을 버리며 변환 |
| `mapIndexed { i, x -> }` | 없음 | `List<R>` — 인덱스를 함께 |
| `flatMap { }` | `flatMap` | `List<R>` — 중첩을 한 겹 벗긴다 |
| `associate { k to v }` | `Collectors.toMap` | `Map<K, V>` |
| `associateBy { }` | `Collectors.toMap(f, identity())` | `Map<K, T>` |
| `associateWith { }` | 없음 | `Map<T, V>` |
| `groupBy { }` | `Collectors.groupingBy` | `Map<K, List<T>>` |
| `mapValues { }` / `mapKeys { }` | 없음 | `Map` 을 다시 `Map` 으로 |
| `zip(other)` | 없음 | `List<Pair<A, B>>` |
| `chunked(n)` / `windowed(n)` | 없음 | `List<List<T>>` |
| `distinct()` / `distinctBy { }` | `distinct` / 없음 | `List<T>` |

## `map` 계열 — 세 개를 구분해서 쓴다

```kotlin
val names: List<String> = users.map { it.name }
val nicks: List<String> = users.mapNotNull { it.nickname }         // null 이면 결과에서 빠진다
val rows: List<String> = users.mapIndexed { i, u -> "${i + 1}. ${u.name}" }
```

`mapNotNull` 이 핵심입니다. Java 에서는 `map(...).filter(Objects::nonNull)` 뒤에도 타입이 여전히 nullable 이라 캐스팅이나 `!!` 가 필요했어요. Kotlin 은 **한 단계로 줄면서 타입까지 `List<String>` 으로 좁혀집니다.**

```kotlin
raw.map { it.toIntOrNull() }.filterNotNull()   // ❌ 중간 리스트 하나를 더 만든다
raw.mapNotNull { it.toIntOrNull() }            // ✅
```

`mapIndexed` 는 "인덱스가 필요해서 어쩔 수 없이 `for` 를 돌렸다"는 코드의 답입니다. `var i = 0` 을 선언하고 람다 안에서 `i++` 하는 코드를 보면 이걸 제안하세요.

## `flatMap` — 중첩을 한 겹 벗긴다

`Order` 가 `List<Line>` 을 품고 있을 때, "모든 주문항목"을 얻으려면 `map` 으로는 안 됩니다.

```kotlin
orders.map { it.lines }       // List<List<Line>>  — 아직 중첩이다
orders.flatMap { it.lines }   // List<Line>        — 평평해졌다
```

`map` 결과에 `flatten()` 을 붙여도 같지만, 리스트를 한 벌 더 만듭니다. `flatMap` 한 번이 맞습니다.

실무에서 이게 나오는 자리는 정해져 있습니다. **중첩 컬렉션을 순회하려고 이중 `for` 를 쓴 코드.**

```java
// Java — 흔히 보는 모양
List<Line> all = new ArrayList<>();
for (Order o : orders) {
    for (Line l : o.getLines()) { all.add(l); }
}
```
```kotlin
val all = orders.flatMap { it.lines }
```

## `associate` 3형제 — 어느 쪽이 키인가

이름이 비슷해서 헷갈리는데, **무엇이 키가 되는지**만 보면 됩니다.

```kotlin
orders.associate { it.id to it.customer }   // Map<Int, String>  키·값을 둘 다 내가 만든다
orders.associateBy { it.id }                // Map<Int, Order>   키만 뽑고 값은 원소 자체
skus.associateWith { stockOf(it) }          // Map<String, Int>  원소가 키, 값을 계산한다
```

| 함수 | 키 | 값 |
|---|---|---|
| `associate { }` | 람다가 만든 `Pair.first` | 람다가 만든 `Pair.second` |
| `associateBy { }` | 람다 결과 | **원소 자체** |
| `associateWith { }` | **원소 자체** | 람다 결과 |

`associateBy` 는 실무에서 특히 자주 씁니다. N+1 을 피하려고 한 번에 조회한 리스트를 id 맵으로 세울 때요.

```kotlin
val productById = products.associateBy { it.id }   // Map<Long, Product>
```

`map { }.toMap()` 을 보면 `associate { }` 로 바꾸라고 하세요. 중간에 `List<Pair<K, V>>` 를 만들지 않습니다.

### `associateBy` 는 중복 키에서 조용히 데이터를 잃는다

이게 이 레슨에서 가장 중요한 한 가지입니다. **키가 유일하지 않으면 원소가 사라집니다. 예외도, 경고도 없습니다.**

```kotlin
listOf(O(1, "a"), O(1, "b"), O(2, "c")).associateBy { it.id }
// → {1=O(id=1, name=b), 2=O(id=2, name=c)}
//   3건이 2건으로 줄었다. 같은 키는 마지막 값이 이긴다.
```

Java 의 `Collectors.toMap` 은 같은 상황에서 **`IllegalStateException("Duplicate key")` 를 던집니다.** 즉 Java 에서는 터져서 알게 되던 버그가, Kotlin 에서는 **조용히 데이터가 빈 채로 프로덕션까지 갑니다.**

> 리뷰 규칙: `associateBy` 를 보면 **"이 키가 유일하다는 보장이 어디 있나요?"** 를 먼저 묻습니다. PK 나 유니크 인덱스면 통과, 그게 아니면 `groupBy` 로 바꾸게 하세요.

```kotlin
orders.associateBy { it.customer }   // ❌ 한 고객이 두 번 주문하면 앞 주문이 사라진다
orders.groupBy { it.customer }       // ✅ Map<String, List<Order>> — 아무것도 잃지 않는다
```

`distinctBy` 를 먼저 걸어 "대표 하나만 남기겠다"를 코드에 드러내는 것도 방법입니다. 중요한 건 **데이터가 줄어드는 일이 의도적으로 보이게** 하는 것입니다.

## `groupBy` — 변환으로서의 그룹핑

`groupBy` 는 `Map<K, List<T>>` 를 만듭니다. 원소를 하나도 버리지 않으니 여기서는 **변환**입니다.

```kotlin
orders.groupBy { it.customer }                                  // Map<String, List<Order>>
orders.groupBy({ it.customer }, { it.id })                       // Map<String, List<Int>> — 값도 변환
orders.groupBy { it.customer }.mapValues { (_, v) -> v.map { it.id } }   // 위와 같은 결과
```

`mapValues` / `mapKeys` 는 **맵의 모양만 바꾸는 변환**입니다. 키를 그대로 두고 값만 가공할 때 씁니다.

그룹을 만든 뒤 **줄이는 것**(건수, 합계) 은 집계라서 L22 담당입니다. `groupingBy { }.eachCount()` 같은 도구가 거기 있습니다.

## `zip` / `chunked` / `windowed` — 짝짓고 자르기

```kotlin
skus.zip(stocks)                      // List<Pair<String, Int>>
skus.zip(stocks) { s, n -> "$s:$n" }  // 변환 람다를 주면 Pair 없이 바로
ids.chunked(500)                      // 겹치지 않는 배치 — 벌크 API·IN 절 쪼개기
prices.windowed(2) { (a, b) -> b - a } // 겹치는 창 — 증감·추이
```

`chunked(n)` 은 마지막 조각이 `n` 보다 작을 수 있습니다. `windowed(n)` 은 기본적으로 **꽉 찬 창만** 돌려줘서 원소 4개에 `windowed(2)` 면 결과가 3개입니다.

`zip` 에도 조용한 함정이 있습니다. **길이가 다르면 짧은 쪽에서 잘립니다.**

```kotlin
listOf("A", "B", "C").zip(listOf(10, 4, 7, 99))
// → [(A, 10), (B, 4), (C, 7)]   99 는 아무 말 없이 버려진다
```

두 리스트를 인덱스로 짝짓는 코드는 **둘의 길이가 같다는 가정**에 올라타 있습니다. 서로 다른 API 응답을 `zip` 하는 코드를 보면 그 가정이 보장되는지 물어보세요.

## `distinct` / `distinctBy`

```kotlin
skus.distinct()                    // equals/hashCode 기준, 먼저 나온 것이 남는다
lines.distinctBy { it.sku }        // 키 기준, 먼저 나온 원소가 남는다
```

둘 다 **처음 등장한 순서를 유지**합니다. `distinctBy` 를 정렬과 조합해 "그룹별 1등 뽑기"로 쓰는 기법과 집합 연산(`intersect`/`subtract`)은 L23 에서 다룹니다.

## 돌아오는 `Map` 은 `LinkedHashMap` 이다

`associate*` / `groupBy` / `mapValues` 가 만드는 맵은 모두 `LinkedHashMap` 입니다. 즉 **입력 순서가 곧 키 순서**라서 출력이 재현됩니다. Java 에서 `Collectors.toMap` 이 `HashMap` 을 주는 것과 다릅니다.

편하지만 기대지는 마세요. 순서가 계약이라면 정렬로 **명시**하는 게 맞습니다. 순서에 기대는 테스트는 리팩터링 한 번에 깨집니다.

## `Sequence` 는 여기서 다루지 않는다

"단계마다 새 리스트가 생기니 `asSequence()` 로 지연 평가하라"는 이야기는 **언제 이득이고 언제 손해인지**가 본론이라 L23 에서 제대로 다룹니다. 지금은 그냥 리스트로 갑니다 — 실무 대부분이 그걸로 충분합니다.

## 리뷰할 때 보는 것

| 코드에서 보이면 | 이렇게 지적한다 |
|---|---|
| `associateBy { }` 인데 키가 PK/유니크가 아니다 | 이 키가 유일하다는 보장이 없으면 중복 키에서 원소가 조용히 사라집니다. `groupBy` 로 바꾸거나 유일성 근거를 주석으로 남겨주세요 |
| `map { }.filterNotNull()` | `mapNotNull { }` 한 단계로 줄입니다. 중간 리스트도 사라지고 반환 타입도 non-null 로 좁혀집니다 |
| 중첩 컬렉션을 이중 `for` 로 펼친다 | `flatMap { it.lines }` 로 바꾸죠. 누적 리스트 변수가 없어집니다 |
| `map { }.flatten()` | `flatMap { }` 으로. 리스트를 한 벌 덜 만듭니다 |
| `map { k to v }.toMap()` | `associate { k to v }` 로. 중간 `List<Pair>` 를 만들지 않습니다 |
| 인덱스가 필요해 `var i = 0` + `i++` | `mapIndexed { i, x -> }` 를 쓰면 카운터가 필요 없습니다 |
| 길이가 다를 수 있는 두 응답을 `zip` 한다 | `zip` 은 짧은 쪽에서 조용히 잘립니다. 길이가 같다는 보장이 없으면 키로 맞춰 조회하세요 |
| `IN` 절이나 벌크 호출에 리스트를 통째로 넘긴다 | `chunked(500)` 으로 배치를 나눠주세요 |
| 맵 순회 순서를 테스트가 검증한다 | `LinkedHashMap` 이라 지금은 통과하지만 계약이 아닙니다. 정렬해서 비교하세요 |

## 연습

주문과 주문항목을 **변환**만으로 다뤄 11줄을 출력하세요. 합계·평균·건수 집계는 이 레슨의 주제가 아닙니다 — 쓰지 마세요.

starter 가 준 `val` 골격(타입이 명시된 변수)을 그대로 채웁니다. 각 변수의 **타입이 이미 답의 절반**입니다.

```kotlin starter
data class Line(val sku: String, val qty: Int)
data class Order(val id: Int, val customer: String, val lines: List<Line>)

val orders = listOf(
    Order(101, "kim", listOf(Line("A-1", 2), Line("B-7", 1))),
    Order(102, "lee", listOf(Line("A-1", 5))),
    Order(103, "kim", listOf(Line("C-3", 1), Line("A-1", 1))),
    Order(104, "park", listOf(Line("B-7", 3))),
)

val skuNames = listOf("A-1", "B-7", "C-3")
val stockApiResponse = listOf(10, 4, 7, 99)        // 폐기된 sku 재고까지 4개가 온다
val rawQty = listOf("12", "7", "x", "3", "", "21") // 외부 CSV 에서 읽은 수량 문자열

fun main() {
    // 1. 모든 주문의 주문항목을 하나의 리스트로 펼친다
    val allLines: List<Line> = TODO("중첩을 한 겹 벗기는 함수")
    println("주문 ${orders.size}건 → 주문항목 ${allLines.size}건")

    // 2. 취급 sku 목록(중복 제거) / 각 sku 가 처음 등장한 항목의 수량
    val handledSkus: List<String> = TODO()
    val firstQtyPerSku: List<Int> = TODO()
    println(handledSkus)
    println(firstQtyPerSku)

    // 3. 명세서 — "1) A-1 x2" 처럼 1부터 번호를 붙인다. 카운터 변수 없이
    val statement: List<String> = TODO()
    println(statement)

    // 4. id 로 인덱싱한 맵과 customer 로 인덱싱한 맵을 둘 다 만든다.
    //    건수가 어떻게 달라지는지, kim 에는 어느 주문이 남는지 눈으로 확인할 것
    val byId: Map<Int, Order> = TODO()
    val byCustomer: Map<String, Order> = TODO()
    println("원본 ${orders.size} / byId ${byId.size} / byCustomer ${byCustomer.size} → kim=${byCustomer["kim"]?.id}")

    // 5. 4번에서 잃은 것을 잃지 않는 방식 — 고객별 주문 id 목록
    val orderIdsByCustomer: Map<String, List<Int>> = TODO()
    println(orderIdsByCustomer)

    // 6. id → customer 맵. 중간에 List<Pair> 를 만들지 말 것
    val customerOf: Map<Int, String> = TODO()
    println(customerOf)

    // 7. rawQty 에서 숫자로 읽히는 것만 Int 로. toIntOrNull() 을 쓰되 두 단계로 나누지 말 것
    val quantities: List<Int> = TODO()
    println(quantities)

    // 8. sku 를 4개씩 배치로 자른다 / quantities 의 연속한 두 값의 차이
    val batches: List<List<String>> = TODO()
    val deltas: List<Int> = TODO()
    println(batches)
    println(deltas)

    // 9. skuNames 와 재고 응답을 인덱스로 짝짓는다 (결과 개수를 보라)
    //    그리고 sku 를 키로, 그 sku 로 주문된 수량 목록을 값으로
    val stock: List<Pair<String, Int>> = TODO()
    val qtyBySku: Map<String, List<Int>> = TODO()
    println(stock)
    println(qtyBySku)
}
```

```text expected
주문 4건 → 주문항목 6건
[A-1, B-7, C-3]
[2, 1, 1]
[1) A-1 x2, 2) B-7 x1, 3) A-1 x5, 4) C-3 x1, 5) A-1 x1, 6) B-7 x3]
원본 4 / byId 4 / byCustomer 3 → kim=103
{kim=[101, 103], lee=[102], park=[104]}
{101=kim, 102=lee, 103=kim, 104=park}
[12, 7, 3, 21]
[[A-1, B-7, A-1, C-3], [A-1, B-7]]
[-5, -4, 18]
[(A-1, 10), (B-7, 4), (C-3, 7)]
{A-1=[2, 5, 1], B-7=[1, 3], C-3=[1]}
```

```text hint
전부 **모양을 바꾸는** 일입니다. 합계도, 개수도, 평균도 없어요. 각 `val` 의 **선언된 타입**이 답을 좁혀줍니다 — `List<Line>` 에서 `List<String>` 으로 가면 `map` 계열, `List<T>` 에서 `Map<K, V>` 로 가면 `associate` 계열, `List<Line>` 에서 `List<List<...>>` 로 가면 자르는 함수예요. 4번은 **답을 맞히는 문제가 아니라 손해를 보는 문제**입니다. 두 맵의 `size` 를 비교해 보세요.
---
도구는 이렇습니다. 1번 `flatMap`, 2번 `distinct()` 와 `distinctBy { }`, 3번 `mapIndexed`, 4번 `associateBy`, 5번 `groupBy` + `mapValues`, 6번 `associate`, 7번 `mapNotNull`, 8번 `chunked(4)` 와 `windowed(2)`, 9번 `zip` 과 `associateWith`. 9번 뒷줄에서 특정 sku 의 수량만 고르는 건 `filter` + `map` 이면 됩니다.
---
구조와 함정. (1) 4번에서 `byCustomer` 가 3건인 이유는 `associateBy` 가 **중복 키를 만나면 마지막 값으로 덮어쓰기** 때문입니다. kim 의 101 이 사라지고 103 이 남아요 — Java `Collectors.toMap` 이라면 여기서 예외가 났을 자리입니다. 5번이 그 처방(`groupBy`)이고요. (2) 8번 `windowed(2)` 는 원소 4개에서 **꽉 찬 창만** 만들어 결과가 3개입니다. 람다 인자를 `{ (prev, next) -> next - prev }` 로 구조 분해해 받을 수 있습니다. (3) 9번 `zip` 은 재고 응답이 4개인데도 결과가 **3개**입니다 — 짧은 쪽에서 잘리고 99 는 조용히 버려져요. (4) 3번을 `var i = 0` 으로 풀지 마세요. 그게 `mapIndexed` 가 있는 이유입니다.
---
뼈대입니다. 빈칸만 채우세요.

1번: `orders.___ { it.lines }`

2번: `allLines.map { it.sku }.___()` / `allLines.___ { it.sku }.map { it.qty }`

3번: `allLines.___ { i, line -> "${i + 1}) ${line.sku} x${line.qty}" }`

4번: `orders.___ { it.id }` / `orders.___ { it.customer }`

5번: `orders.___ { it.customer }.___ { (_, list) -> list.map { it.id } }`

6번: `orders.___ { it.id to it.customer }`

7번: `rawQty.___ { it.toIntOrNull() }`

8번: `allLines.map { it.sku }.___(4)` / `quantities.___(2) { (prev, next) -> next - prev }`

9번: `skuNames.___(stockApiResponse)` / `skuNames.___ { sku -> allLines.filter { it.sku == sku }.map { it.qty } }`
```

```kotlin solution
data class Line(val sku: String, val qty: Int)
data class Order(val id: Int, val customer: String, val lines: List<Line>)

val orders = listOf(
    Order(101, "kim", listOf(Line("A-1", 2), Line("B-7", 1))),
    Order(102, "lee", listOf(Line("A-1", 5))),
    Order(103, "kim", listOf(Line("C-3", 1), Line("A-1", 1))),
    Order(104, "park", listOf(Line("B-7", 3))),
)

val skuNames = listOf("A-1", "B-7", "C-3")
val stockApiResponse = listOf(10, 4, 7, 99)        // 폐기된 sku 재고까지 4개가 온다
val rawQty = listOf("12", "7", "x", "3", "", "21") // 외부 CSV 에서 읽은 수량 문자열

fun main() {
    // 1. 중첩을 펼치는 건 map 이 아니라 flatMap 이다. map 이면 List<List<Line>> 이 된다.
    val allLines: List<Line> = orders.flatMap { it.lines }
    println("주문 ${orders.size}건 → 주문항목 ${allLines.size}건")

    // 2. distinct 는 값 기준, distinctBy 는 키 기준. 둘 다 먼저 나온 것이 남는다.
    val handledSkus: List<String> = allLines.map { it.sku }.distinct()
    val firstQtyPerSku: List<Int> = allLines.distinctBy { it.sku }.map { it.qty }
    println(handledSkus)
    println(firstQtyPerSku)

    // 3. 인덱스가 필요하면 수동 카운터가 아니라 mapIndexed.
    val statement: List<String> = allLines.mapIndexed { i, line -> "${i + 1}) ${line.sku} x${line.qty}" }
    println(statement)

    // 4. associateBy 는 키가 유일할 때만 안전하다. customer 로 잡으면 kim 의 101 이 조용히 사라진다.
    val byId: Map<Int, Order> = orders.associateBy { it.id }
    val byCustomer: Map<String, Order> = orders.associateBy { it.customer }
    println("원본 ${orders.size} / byId ${byId.size} / byCustomer ${byCustomer.size} → kim=${byCustomer["kim"]?.id}")

    // 5. 키가 유일하지 않으면 associateBy 가 아니라 groupBy 다. 값 가공은 mapValues.
    val orderIdsByCustomer: Map<String, List<Int>> =
        orders.groupBy { it.customer }.mapValues { (_, list) -> list.map { it.id } }
    println(orderIdsByCustomer)

    // 6. 키와 값을 둘 다 계산하면 map { }.toMap() 이 아니라 associate 한 방.
    val customerOf: Map<Int, String> = orders.associate { it.id to it.customer }
    println(customerOf)

    // 7. map { }.filterNotNull() 두 단계가 아니라 mapNotNull 한 단계.
    val quantities: List<Int> = rawQty.mapNotNull { it.toIntOrNull() }
    println(quantities)

    // 8. chunked 는 겹치지 않게 자르고(배치), windowed 는 겹치는 창을 만든다(추이).
    val batches: List<List<String>> = allLines.map { it.sku }.chunked(4)
    val deltas: List<Int> = quantities.windowed(2) { (prev, next) -> next - prev }
    println(batches)
    println(deltas)

    // 9. zip 은 짧은 쪽에서 조용히 잘린다(99 가 버려진다). associateWith 는 원소가 키, 람다가 값.
    val stock: List<Pair<String, Int>> = skuNames.zip(stockApiResponse)
    val qtyBySku: Map<String, List<Int>> =
        skuNames.associateWith { sku -> allLines.filter { it.sku == sku }.map { it.qty } }
    println(stock)
    println(qtyBySku)
}
```
