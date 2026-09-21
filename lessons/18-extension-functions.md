# Lesson 18 — 확장 함수와 확장 프로퍼티

`StringUtils`, `DateUtils`, `CollectionUtils` 같은 정적 유틸 클래스가 사라지는 지점입니다.
그리고 **정적 디스패치**라는, 리뷰에서 반드시 짚어야 할 함정이 있는 지점이기도 합니다.

## 유틸 클래스가 사라진다

```java
// Java — 함수를 둘 데가 없어서 클래스를 하나 만든다
public final class StringUtils {
    private StringUtils() {}
    public static boolean isValidEmail(String s) { ... }
}
StringUtils.isValidEmail(input);
```
```kotlin
fun String.isValidEmail(): Boolean = contains("@") && substringAfter("@").contains(".")

input.isValidEmail()   // 마치 String 의 메서드처럼
```

차이는 문법이 아니라 **발견 가능성(discoverability)** 입니다. Java에서는 `isValidEmail` 이
어느 유틸 클래스에 있는지 알아야 찾습니다. Kotlin에서는 `input.` 만 찍으면 IDE가 보여줍니다.
**"함수를 데이터 쪽으로 옮긴다"** — 이게 확장 함수의 본질입니다.

함수 안의 `this` 는 수신 객체(receiver)이고, 생략할 수 있습니다. 위 코드의 `contains("@")` 가
사실 `this.contains("@")` 입니다.

## 실제로는 정적 메서드다 — 여기서부터가 진짜

확장 함수는 **클래스를 수정하지 않습니다.** 컴파일하면 수신 객체를 첫 인자로 받는
평범한 정적 메서드가 됩니다. `Main.kt` 에 선언한 `String.isValidEmail()` 은 바이트코드로는
`MainKt.isValidEmail(String)` 입니다. Java에서 부를 때도 정확히 그렇게 부릅니다.

여기서 세 가지가 따라옵니다.

### 1. private 멤버에 접근 못 한다

바깥에 있는 정적 함수니까 당연합니다. 캡슐화를 뚫는 도구가 아닙니다.

### 2. 정적 디스패치 — 오버라이드되지 않는다

```kotlin
open class Payment
class CardPayment : Payment()

fun Payment.label() = "결제"
fun CardPayment.label() = "카드결제"

val p: Payment = CardPayment()
println(p.label())   // "결제" — 런타임 타입이 아니라 선언 타입 기준!
```

멤버 함수였다면 `"카드결제"` 가 나옵니다. 확장 함수는 **컴파일 시점의 정적 타입**으로
어느 함수를 부를지 결정합니다. 다형성이 없어요.

> 면접관 시점: "확장 함수로 다형성을 흉내 낼 수 있나요?" — 정답은 **없다**입니다.
> 타입마다 동작이 달라져야 하면 확장 함수가 아니라 `sealed class` + `when`(L14) 이나
> 인터페이스 멤버로 가야 합니다. 리뷰에서 "부모 타입으로 받아놓고 자식 확장 함수를
> 기대하는 코드"를 보면 여기를 지적하세요.

### 3. 멤버가 이긴다

같은 시그니처의 멤버 함수와 확장 함수가 있으면 **항상 멤버가 호출**됩니다.

```kotlin
class Box { fun size() = 1 }
fun Box.size() = 99

println(Box().size())   // 1 — 확장은 조용히 무시된다 (경고만 뜬다)
```

이게 왜 중요하냐면 — **라이브러리가 버전 업하면서 같은 이름의 멤버를 추가하면,
내 확장 함수가 소리 없이 죽습니다.** 컴파일은 통과하고 동작만 바뀝니다.
표준 라이브러리나 프레임워크 타입에 확장을 붙일 때는 이름을 조금 특이하게 짓는 게
방어책입니다 (`toDto()` 보다 `toOrderDto()`).

## 확장 프로퍼티 — 필드는 못 만든다

```kotlin
val String.lastChar: Char
    get() = this[length - 1]

val <T> List<T>.secondOrNull: T?
    get() = getOrNull(1)

"hello".lastChar      // 'o'
```

주의: **뒷받침 필드(backing field)가 없습니다.** 클래스에 필드를 추가하는 게 아니니까요.
그래서 `val String.cache: Int = 0` 같은 초기화는 컴파일 에러이고, **반드시 `get()` 을 써야** 합니다.
상태를 갖지 못하므로 확장 프로퍼티는 언제나 **계산된 값**입니다.

함수로 쓸까 프로퍼티로 쓸까? 기준은 하나 — **인자가 없고, 부수 효과가 없고, 값이 싸게 계산되고,
"객체의 속성"처럼 읽히면 프로퍼티.** 그 외에는 함수입니다.

## nullable 수신 객체 — 표준 라이브러리의 비밀

```kotlin
fun String?.orNA(): String = if (this.isNullOrBlank()) "N/A" else this.trim()

val s: String? = null
println(s.orNA())   // "N/A" — ?. 없이 바로 호출된다
```

수신 타입을 `String?` 으로 잡으면 **null 인 상태로도 호출**됩니다. 정적 메서드라서
`orNA(null)` 을 부르는 것과 같고, 함수 안에서 `this` 가 null 인지 확인하면 되니까요.

`isNullOrEmpty()`, `isNullOrBlank()`, `orEmpty()` 가 전부 이 방식입니다. **직접 만들지 말고
이걸 쓰세요.** 그리고 이 셋을 알면 `if (s != null && s.isNotEmpty())` 같은 코드를
리뷰에서 바로 줄일 수 있습니다.

## 수신 객체 지정 람다 — DSL 의 뿌리

확장의 개념을 람다에 적용한 게 `T.() -> R` 타입입니다.

```kotlin
fun buildQuery(block: StringBuilder.() -> Unit): String =
    StringBuilder().apply(block).toString()

val sql = buildQuery {
    append("SELECT * FROM orders ")   // this 가 StringBuilder — 생략됨
    append("WHERE amount > 10000")
}
```

`(StringBuilder) -> Unit` 이었다면 람다 안에서 `it.append(...)` 를 써야 합니다.
`StringBuilder.() -> Unit` 이면 `this` 가 되어 **접두사 없이** 쓰입니다.
Gradle Kotlin DSL, `kotlinx.html`, Spring의 라우터 DSL이 전부 이 한 줄짜리 트릭입니다.
다음 레슨에서 볼 `apply` / `with` 도 정확히 이 타입으로 선언돼 있습니다.

## 가시성 — 확장은 import 돼야 보인다

확장 함수는 **선언된 패키지 밖에서는 import 해야** 쓸 수 있습니다. 클래스에 진짜로 붙은 게
아니니 당연합니다. 실무에서는 `com.company.order.extensions` 같은 패키지에 모아두기보다,
**쓰는 쪽 모듈에 가깝게** 두는 편이 낫습니다. "모든 확장을 담는 파일"은 결국
`StringUtils` 의 다른 이름이 됩니다.

## 리뷰에서 지적할 것들

| 코드 | 지적 |
|---|---|
| 도메인 클래스에 붙은 확장 함수인데 그 클래스 소스를 내가 소유 | 그냥 멤버 함수로. 확장은 **남의 타입**에 쓰는 도구 |
| 부모 타입 변수로 자식 확장 함수를 기대 | 정적 디스패치. 절대 안 됨 |
| `Extensions.kt` 한 파일에 200줄 | 유틸 클래스 부활. 도메인별로 쪼갤 것 |
| `fun String.toDto()` 처럼 흔한 이름을 남의 타입에 | 멤버 추가되면 조용히 죽음 |
| `val X.foo get() = expensiveCall()` | 프로퍼티는 싸야 한다. 비싸면 함수로 |
| `if (s != null && s.isNotEmpty())` | `s.isNullOrEmpty()` 가 이미 있다 |

## 스코프 함수는?

`let` / `run` / `with` / `apply` / `also` 도 전부 확장 함수입니다(`with` 만 예외).
다만 이 다섯은 **가장 많이 쓰이고 가장 많이 잘못 쓰이는** 함수라 따로 다룰 값어치가 있어서,
**다음 레슨(L19)에서 제대로** 파고듭니다. 여기서는 "저것들도 그냥 확장 함수더라" 만 챙기세요.

## 연습

확장 세 가지를 작성하세요.

**1. `String.masked()`** — 이메일 로컬 파트(`@` 앞)에서 **앞 2글자만 남기고** 나머지를 `*`로 가립니다.
`@`가 없으면 문자열 전체를 같은 규칙으로 가립니다.

**2. `String?.displayName`** — **확장 프로퍼티**. null 이거나 공백뿐이면 `"(이름 없음)"`,
아니면 앞뒤 공백을 제거한 값. **nullable 수신 객체**로 만들어 `?.` 없이 호출되게 하세요.

**3. `Payment.label()` 과 `CardPayment.label()`** — 확장 함수 두 개.
`Payment` 쪽은 `"결제 N원"`, `CardPayment` 쪽은 `"카드결제 N원 (발급사)"`.
`main` 에서 **선언 타입이 무엇이냐에 따라 결과가 달라지는 것**을 확인하세요.

```kotlin starter
open class Payment(val amount: Int)
class CardPayment(amount: Int, val issuer: String) : Payment(amount)

// TODO 1: fun String.masked(): String
// TODO 2: val String?.displayName: String
// TODO 3: fun Payment.label(): String  /  fun CardPayment.label(): String

fun main() {
    println("kyungtae@example.com".masked())
    println("ab@x.com".masked())
    println("secret".masked())

    val missing: String? = null
    println(missing.displayName)
    println("   ".displayName)
    println("  Kim  ".displayName)

    val p: Payment = CardPayment(10000, "NH")
    println(p.label())
    println((p as CardPayment).label())
}
```

```text expected
ky******@example.com
ab@x.com
se****
(이름 없음)
(이름 없음)
Kim
결제 10000원
카드결제 10000원 (NH)
```

```text hint
셋은 서로 다른 질문입니다. `masked()` 는 **평범한 확장 함수**, `displayName` 은 **확장 프로퍼티**(그것도 nullable 수신), `label()` 두 개는 **정적 디스패치를 눈으로 확인**하는 문제예요. 마지막 두 줄이 다른 값을 내야 한다는 게 핵심입니다 — 같은 객체인데도요.
---
`masked()` 에 쓸 도구: `substringBefore("@")`, `substringAfter("@")`, `contains("@")`, `take(2)`, `"*".repeat(n)`. `displayName` 은 `isNullOrBlank()` 와 `trim()`. `label()` 은 문자열 템플릿만 있으면 됩니다.
---
`masked()` — 별의 개수는 `local.length - 2` 인데 로컬 파트가 두 글자 이하면 음수가 되어 `repeat` 이 예외를 던집니다. `coerceAtLeast(0)` 으로 바닥을 막으세요. `substringBefore` 는 **구분자가 없으면 문자열 전체를 돌려주므로** `"secret"` 도 분기 없이 같은 경로를 탑니다. `displayName` 은 확장 프로퍼티라 **뒷받침 필드가 없으니 `= 값` 이 아니라 `get()` 을 써야** 컴파일됩니다. `label()` 은 `p` 의 선언 타입이 `Payment` 이므로 런타임 객체가 `CardPayment` 여도 `Payment.label()` 이 불립니다 — 그게 정답입니다.
---
뼈대는 이렇습니다.

`masked()` 본문 세 줄: `val local = substringBefore("@")` / `val rest = if (contains("@")) "@" + substringAfter("@") else ""` / `return local.take(2) + "*".repeat(___) + rest`

확장 프로퍼티: `val String?.displayName: String` 다음 줄에 `get() = if (___) "(이름 없음)" else ___`

확장 함수 둘: `fun Payment.label() = "결제 ${amount}원"` 과 `fun CardPayment.label() = "카드결제 ${amount}원 (${___})"`
```

```kotlin solution
open class Payment(val amount: Int)
class CardPayment(amount: Int, val issuer: String) : Payment(amount)

// @ 앞뒤로 쪼개면 "@ 없음" 은 뒤쪽이 빈 문자열인 같은 경우가 된다 — 분기가 하나로 줄어든다.
fun String.masked(): String {
    val local = substringBefore("@")
    val rest = if (contains("@")) "@" + substringAfter("@") else ""
    return local.take(2) + "*".repeat((local.length - 2).coerceAtLeast(0)) + rest
}

// 확장 프로퍼티는 뒷받침 필드가 없으므로 반드시 get() 으로 계산해 돌려준다.
// 수신 타입을 String? 로 잡아야 null 인 변수에서도 ?. 없이 읽힌다.
val String?.displayName: String
    get() = if (isNullOrBlank()) "(이름 없음)" else trim()

fun Payment.label() = "결제 ${amount}원"
fun CardPayment.label() = "카드결제 ${amount}원 ($issuer)"

fun main() {
    println("kyungtae@example.com".masked())
    println("ab@x.com".masked())
    println("secret".masked())

    val missing: String? = null
    println(missing.displayName)
    println("   ".displayName)
    println("  Kim  ".displayName)

    // p 의 런타임 타입은 CardPayment 지만 선언 타입이 Payment 라 Payment.label() 이 불린다.
    val p: Payment = CardPayment(10000, "NH")
    println(p.label())
    println((p as CardPayment).label())
}
```
