# Lesson 29 — Kotlin 관용구 — Java 잔재 판별하기

이 레슨은 문법 수업이 아니라 **코드 리뷰 교본**입니다. 팀에 Kotlin을 들이고 6개월쯤 지나면 반드시 나타나는 코드가 있어요. 컴파일도 되고 테스트도 통과하는데, 읽으면 **Java 냄새가 나는 코드**. `.kt` 확장자를 달았을 뿐 사고방식은 Java인 코드죠.

리뷰어에게 필요한 건 "이건 틀렸다"가 아니라 **"이렇게 쓰면 더 낫고, 이유는 이거다"** 를 한 줄로 말하는 능력입니다. 그래서 항목마다 **그대로 PR에 붙여넣을 리뷰 코멘트**를 달아뒀어요. `// Before` 를 보고 **1초 안에 알아채는 연습**을 하세요 — 실무 리뷰는 정독이 아니라 패턴 인식입니다.

## A. null — 가장 많이 걸리는 구역

**1. null 체크 중첩 → 안전 호출 체인** — `?.` 는 중간 어디가 null이든 전체를 null로 만든다.
```kotlin
if (user != null && user.profile != null) name = user.profile.name   // Before
val name = user?.profile?.name                                       // After
```
> "`?.` 로 이으면 중첩 if가 한 줄이 됩니다. 중간 null은 자동으로 전파돼요."

**2. null일 때 기본값 → 엘비스** — 삼항/if 대입은 값이 흩어지고 `val` 로 못 받는다.
```kotlin
val name = if (raw != null) raw else "anonymous"   // Before
val name = raw ?: "anonymous"                      // After
```
> "`?:` 로 줄이면 기본값이 바로 옆에 붙어 읽기 쉽습니다."

**3. null 검증 후 진행 → `?:` early return/throw** — `throw`/`return` 은 `Nothing` 이라 `?:` 오른쪽에 온다.
```kotlin
if (order == null) throw IllegalArgumentException("주문 없음"); process(order)  // Before
val safe = order ?: throw IllegalArgumentException("주문 없음"); process(safe)  // After
```
> "`?:` 로 early throw 하면 아래 전체가 non-null 타입으로 좁혀져서 `?.` 가 더 안 나옵니다."

**4. `!!` 남용 → 설계 수정** — `!!` 는 "null 안정성을 포기한다"는 선언이다.
```kotlin
val total = cart!!.items!!.sumOf { it.price }              // Before
val total = cart?.items?.sumOf { it.price } ?: 0           // After
```
> "`!!` 는 코드 문제가 아니라 설계 신호입니다. 이 값이 정말 null일 수 있나요? 아니면 타입을 non-null로 바꾸죠."

## B. 분기 — if-else 체인의 수명

**5. if-else 체인 → `when`** — 분기 대상이 하나면 `when` 이 의도를 드러낸다.
```kotlin
if (s == "PAID") "결제" else if (s == "READY") "대기" else "기타"      // Before
when (s) { "PAID" -> "결제"; "READY" -> "대기"; else -> "기타" }        // After
```
> "값 하나를 여러 분기로 나누는 건 `when` 이 표준입니다."

**6. sealed/enum에 습관적 `else`** — `else` 를 지우면 **새 타입 추가 시 컴파일 에러**로 알려준다.
```kotlin
when (state) { Paid -> "..."; Ready -> "..."; else -> "알 수 없음" }   // Before
when (state) { Paid -> "..."; Ready -> "..."; Canceled -> "..." }      // After
```
> "sealed 계층에는 `else` 를 빼주세요. 상태가 늘었을 때 컴파일러가 여기를 짚어줍니다."

**7. 조건으로 값 만들기 → 표현식 `if`/`when`** — Kotlin의 `if` 는 값이다.
```kotlin
val grade: String; if (n > 90) grade = "A" else grade = "B"    // Before
val grade = if (n > 90) "A" else "B"                           // After
```
> "`if` 를 표현식으로 쓰면 `var` 하나가 `val` 로 바뀝니다."

## C. 컬렉션 — 직접 만들지 마세요

**8. 수동 루프 누적 → `sumOf`** — 합계는 표준 함수가 있다.
```kotlin
var sum = 0; for (o in orders) sum += o.amount     // Before
val sum = orders.sumOf { it.amount }               // After
```
> "`sumOf` 하나로 끝납니다. `var` 도 같이 없어져요."

**9. 수동 그룹핑 → `groupBy`** — 빈 리스트 만들고 `getOrPut` 하는 코드는 전부 사라진다.
```kotlin
val m = mutableMapOf<String, MutableList<Order>>(); for (o in x) m.getOrPut(o.c){mutableListOf()}+=o  // Before
val m = orders.groupBy { it.customer }                                                                // After
```
> "`groupBy` 로 대체 가능합니다. 키별 개수만 필요하면 `groupingBy {}.eachCount()` 도 있어요."

**10. id→객체 맵 수동 구성 → `associateBy`**
```kotlin
val byId = mutableMapOf<Long, User>(); for (u in users) byId[u.id] = u   // Before
val byId = users.associateBy { it.id }                                   // After
```
> "`associateBy { it.id }` 가 같은 일을 합니다. 값도 바꾸려면 `associate` 를 보세요."

**11. `filter{}.size` → `count{}`** — 중간 리스트를 만들지 않는다.
```kotlin
val n = orders.filter { it.paid }.size   // Before
val n = orders.count { it.paid }         // After
```
> "`count { }` 로 바꾸면 중간 리스트 할당이 사라집니다."

**12. `filter{}.firstOrNull()` → `firstOrNull{}`** — 전체를 훑지 않고 첫 매치에서 멈춘다.
```kotlin
val first = list.filter { it.active }.firstOrNull()   // Before
val first = list.firstOrNull { it.active }            // After
```
> "조건을 `firstOrNull` 안으로 넣으면 단락 평가됩니다. `.isNotEmpty()` 대신 `any { }` 도 같은 이유로요."

**13. 인덱스 루프 → 구조 분해 / `withIndex`**
```kotlin
for (i in list.indices) { val item = list[i]; println("$i:$item") }   // Before
for ((i, item) in list.withIndex()) println("$i:$item")               // After
```
> "`withIndex()` 로 인덱스와 원소를 같이 받으면 범위 실수가 원천 차단됩니다."

## D. 클래스와 객체

**14. getter/setter 수동 작성 → 프로퍼티**
```kotlin
class User(private val n: String) { fun getName() = n }   // Before
class User(val name: String)                              // After
```
> "Kotlin에서는 `val` 선언이 곧 getter입니다. 접근자를 직접 쓸 이유가 없어요."

**15. 빌더 패턴 → 기본 인자 + 이름 붙인 인자**
```kotlin
Search.Builder().keyword("k").size(20).build()          // Before
Search(keyword = "k", size = 20)                        // After — size: Int = 20
```
> "빌더 대신 기본 인자를 쓰면 클래스 절반이 사라집니다. 호출부 가독성은 이름 붙인 인자로 유지돼요."

**16. `static` 유틸 클래스 → 확장 함수 / 최상위 함수**
```kotlin
object StringUtils { fun isEmail(s: String) = ... }   // Before — StringUtils.isEmail(s)
fun String.isEmail(): Boolean = ...                   // After  — s.isEmail()
```
> "유틸 클래스 대신 확장 함수로 빼면 호출부가 자연어처럼 읽힙니다."

**17. equals/hashCode/toString 수동 → `data class`**
```kotlin
class Money(val amount: Long) { override fun equals(...) ...; override fun hashCode() ... }  // Before
data class Money(val amount: Long)                                                            // After
```
> "값 객체면 `data class` 로 충분합니다. 손으로 쓴 equals는 필드 추가 때 반드시 빠져요."

**18. 가변 컬렉션 노출 → 읽기 전용 타입으로 반환**
```kotlin
class Cart { val items = mutableListOf<Item>() }                        // Before — 밖에서 add 가능
class Cart { private val _items = mutableListOf<Item>()
             val items: List<Item> get() = _items }                      // After
```
> "`MutableList` 를 그대로 노출하면 캡슐화가 뚫립니다. 반환 타입을 `List` 로 좁혀주세요."

## E. 문자열

**19. `StringBuilder` 수동 조립 → `joinToString`**
```kotlin
val sb = StringBuilder(); for (n in names) { sb.append(n).append(", ") }   // Before — 끝 콤마 버그
val s = names.joinToString(", ")                                            // After
```
> "`joinToString` 은 구분자/접두사/접미사/생략을 다 받습니다. 마지막 콤마 버그가 사라져요."

**20. `String.format` / `+` 연결 → 문자열 템플릿**
```kotlin
String.format("주문 %d: %s", id, name)   // Before
"주문 $id: $name"                        // After
```
> "템플릿으로 쓰면 인자 순서 실수가 없어집니다. 여러 줄은 `trimIndent()` 붙인 `\"\"\"` 를 쓰세요."

## F. 함수

**21. 오버로딩 3종 → 기본 인자 1개**
```kotlin
fun send(m: String); fun send(m: String, retry: Int); fun send(m: String, retry: Int, log: Boolean)  // Before
fun send(m: String, retry: Int = 0, log: Boolean = false)                                            // After
```
> "오버로딩 대신 기본 인자로 합치죠. 조합이 늘어도 함수는 하나입니다."

**22. 콜백 인터페이스 → 함수 타입**
```kotlin
interface OnDone { fun onDone(v: String) }; fun run(cb: OnDone)   // Before
fun run(onDone: (String) -> Unit)                                  // After
```
> "SAM 인터페이스 대신 함수 타입을 받으면 호출부가 후행 람다로 깔끔해집니다."

## G. 스코프 함수와 초기화 — 오용 구역

**23. 스코프 함수 오용** — 5개를 다 외울 필요는 없고 **`let`(변환) / `apply`(설정) / `also`(부수효과)** 셋이면 실무의 9할이다.
```kotlin
val u = User(); u.name = "kim"; u.age = 20; save(u)     // Before
val u = User().apply { name = "kim"; age = 20 }; save(u) // After
```
> "`apply` 는 객체 설정, `let` 은 값 변환, `also` 는 로깅 같은 부수효과입니다. 중첩해서 `it` 이 두 겹 되면 그냥 이름 붙인 변수를 쓰세요."

**24. `lateinit` 남용 → 생성자 주입 / `by lazy`**
```kotlin
lateinit var repo: OrderRepository            // Before — 초기화 전 접근 시 런타임 예외
class Service(private val repo: OrderRepository)  // After
```
> "`lateinit` 은 프레임워크가 강제할 때만. 생성자 주입으로 바꾸면 불변 + 테스트 용이 둘 다 얻습니다."

## 정리

| 신호 | 의심할 것 |
|---|---|
| `!!`, 중첩 null 체크 | 타입 설계 |
| `var` + for 루프 누적 | 표준 컬렉션 함수 |
| `else ->` 가 sealed에 붙음 | 분기 완전성 상실 |
| `MutableList` 반환 | 캡슐화 |
| `lateinit`, 빌더 | 초기화 설계 |

면접에서 "Kotlin으로 코드 리뷰 해보세요"가 나오면 채점 기준이 정확히 이 표입니다.

## 연습

아래는 **Java 습관 그대로 옮겨온 리포트 코드**입니다. 동작은 맞지만 관용구가 전혀 없어요.

```kotlin
fun totalAmount(orders: List<Order>): Int {
    var sum = 0
    for (o in orders) { sum = sum + o.amount }
    return sum
}
fun paidCount(orders: List<Order>): Int {
    var c = 0
    for (o in orders) { if (o.status == "PAID") c = c + 1 }
    return c
}
fun couponLabel(order: Order): String {
    if (order.coupon != null) { return order.coupon.lowercase() } else { return "쿠폰없음" }
}
fun statusText(status: String): String {
    if (status == "PAID") return "결제완료"
    else if (status == "PENDING") return "결제대기"
    else if (status == "CANCELED") return "취소됨"
    else return "알수없음"
}
```

같은 출력을 내되 **`var` 와 `for` 루프를 하나도 쓰지 않고** 다시 쓰세요. 나머지 세 함수도 채웁니다.

- `customerTotals` — 고객별 금액 합계를 **키 오름차순**으로 (`groupBy` + `toSortedMap`)
- `idList` — `#1, #2, ...` 형태로 이어붙이기 (`joinToString`)
- `topSpender` — 금액이 가장 큰 주문 하나 (`maxByOrNull`)

```kotlin starter
data class Order(val id: Int, val customer: String, val amount: Int, val coupon: String?, val status: String)

val orders = listOf(
    Order(1, "kim", 12000, "WELCOME", "PAID"),
    Order(2, "lee", 8000, null, "PENDING"),
    Order(3, "kim", 30000, "VIP10", "PAID"),
    Order(4, "park", 5000, null, "CANCELED"),
    Order(5, "lee", 17000, null, "PAID"),
)

// TODO: var / for 없이 합계
fun totalAmount(list: List<Order>): Int = TODO()

// TODO: filter{}.size 말고
fun paidCount(list: List<Order>): Int = TODO()

// TODO: if (x != null) 말고
fun couponLabel(order: Order): String = TODO()

// TODO: if-else 체인 말고
fun statusText(status: String): String = TODO()

// TODO: groupBy + mapValues + toSortedMap
fun customerTotals(list: List<Order>): Map<String, Int> = TODO()

// TODO: joinToString
fun idList(list: List<Order>): String = TODO()

// TODO: maxByOrNull, 비어 있으면 "없음"
fun topSpender(list: List<Order>): String = TODO()

fun main() {
    println("합계: ${totalAmount(orders)}")
    println("결제완료 건수: ${paidCount(orders)}")
    println("쿠폰: ${orders.joinToString(" / ") { couponLabel(it) }}")
    println("상태: ${listOf("PAID", "PENDING", "CANCELED", "REFUND").joinToString(" / ") { statusText(it) }}")
    println("고객별: ${customerTotals(orders).entries.joinToString(", ") { "${it.key}=${it.value}" }}")
    println("주문목록: ${idList(orders)}")
    println("최고액: ${topSpender(orders)}")
    println("최고액(빈 목록): ${topSpender(emptyList())}")
}
```

```text expected
합계: 72000
결제완료 건수: 3
쿠폰: welcome / 쿠폰없음 / vip10 / 쿠폰없음 / 쿠폰없음
상태: 결제완료 / 결제대기 / 취소됨 / 알수없음
고객별: kim=42000, lee=25000, park=5000
주문목록: #1, #2, #3, #4, #5
최고액: #3 kim 30000
최고액(빈 목록): 없음
```

```text hint
전부 **"루프로 뭘 하려던 건지"** 를 한 단어로 말해보는 게 출발입니다. 더하기=합계, 세기=개수, 묶기=그룹, 이어붙이기=연결, 가장 큰 것=최댓값. Kotlin 표준 라이브러리에는 그 다섯 개가 **이미 이름 그대로** 있습니다. 직접 만들지 마세요.
---
쓸 함수는 이렇습니다 — `sumOf { }`, `count { }`, `groupBy { }`, `mapValues { }`, `toSortedMap()`, `joinToString(구분자) { }`, `maxByOrNull { }`. null 처리는 `?.` + `?:` 두 개면 되고, 분기는 `when (status) { ... }` 입니다. 모두 **표현식 본문**(`fun f(...) = ...`)으로 한 줄에 들어갑니다.
---
함정 세 가지. ① `couponLabel` 에서 `order.coupon` 은 `String?` 이라 `.lowercase()` 를 바로 못 붙입니다 — `?.` 로 잇고 `?:` 로 받으세요. ② `customerTotals` 의 `mapValues` 람다는 `(키, 값)` 쌍을 받으므로 `{ (_, v) -> v.sumOf { ... } }` 처럼 구조 분해하면 깔끔합니다. 안쪽 람다 파라미터 이름을 `it` 으로 두면 바깥 `it` 과 충돌하니 이름을 주세요. ③ `topSpender` 는 빈 목록에서 null 이므로 `?.let { }` 로 문자열을 만들고 `?:` 로 `"없음"` 을 줍니다.
---
뼈대입니다. 빈칸만 채우면 돼요.

`fun totalAmount(list: List<Order>) = list.___ { it.amount }`

`fun paidCount(list: List<Order>) = list.___ { it.status == "PAID" }`

`fun couponLabel(order: Order) = order.coupon___lowercase() ___ "쿠폰없음"`

`fun statusText(status: String) = when (status) { "PAID" -> "결제완료"; ...; ___ -> "알수없음" }`

`fun customerTotals(list: List<Order>) = list.groupBy { it.customer }.mapValues { (_, v) -> v.___ { o -> o.amount } }.___()`

`fun topSpender(list: List<Order>) = list.___ { it.amount }?.let { "#${it.id} ${it.customer} ${it.amount}" } ?: "없음"`
```

```kotlin solution
data class Order(val id: Int, val customer: String, val amount: Int, val coupon: String?, val status: String)

val orders = listOf(
    Order(1, "kim", 12000, "WELCOME", "PAID"),
    Order(2, "lee", 8000, null, "PENDING"),
    Order(3, "kim", 30000, "VIP10", "PAID"),
    Order(4, "park", 5000, null, "CANCELED"),
    Order(5, "lee", 17000, null, "PAID"),
)

fun totalAmount(list: List<Order>): Int = list.sumOf { it.amount }

// filter{}.size 는 중간 리스트를 만든다. count{} 는 세기만 한다.
fun paidCount(list: List<Order>): Int = list.count { it.status == "PAID" }

// 실패 경로(null)를 ?. 로 흘려보내고 ?: 로 한 번에 받는다.
fun couponLabel(order: Order): String = order.coupon?.lowercase() ?: "쿠폰없음"

fun statusText(status: String): String = when (status) {
    "PAID" -> "결제완료"
    "PENDING" -> "결제대기"
    "CANCELED" -> "취소됨"
    else -> "알수없음"
}

// toSortedMap 으로 키 순서를 확정해야 출력이 항상 같다.
fun customerTotals(list: List<Order>): Map<String, Int> =
    list.groupBy { it.customer }
        .mapValues { (_, v) -> v.sumOf { o -> o.amount } }
        .toSortedMap()

fun idList(list: List<Order>): String = list.joinToString(", ") { "#${it.id}" }

fun topSpender(list: List<Order>): String =
    list.maxByOrNull { it.amount }?.let { "#${it.id} ${it.customer} ${it.amount}" } ?: "없음"

fun main() {
    println("합계: ${totalAmount(orders)}")
    println("결제완료 건수: ${paidCount(orders)}")
    println("쿠폰: ${orders.joinToString(" / ") { couponLabel(it) }}")
    println("상태: ${listOf("PAID", "PENDING", "CANCELED", "REFUND").joinToString(" / ") { statusText(it) }}")
    println("고객별: ${customerTotals(orders).entries.joinToString(", ") { "${it.key}=${it.value}" }}")
    println("주문목록: ${idList(orders)}")
    println("최고액: ${topSpender(orders)}")
    println("최고액(빈 목록): ${topSpender(emptyList())}")
}
```
