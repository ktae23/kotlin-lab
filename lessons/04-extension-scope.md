# Lesson 4 — 확장 함수와 스코프 함수

`StringUtils`, `DateUtils` 같은 정적 유틸 클래스가 사라지는 지점입니다.

## 확장 함수

기존 클래스에 **소스를 건드리지 않고** 메서드를 추가한 것처럼 쓸 수 있습니다.

```java
// Java — 유틸 클래스에 모아두고 정적 호출
public class StringUtils {
    public static boolean isValidEmail(String s) { ... }
}
StringUtils.isValidEmail(input);
```
```kotlin
fun String.isValidEmail(): Boolean = contains("@") && contains(".")

input.isValidEmail()   // 마치 String의 메서드처럼
```

함수 안에서 `this`는 수신 객체(receiver)이고, 생략할 수 있습니다.

### 실제로는 정적 메서드다

확장 함수는 **클래스를 진짜로 수정하지 않습니다.** 컴파일하면 수신 객체를 첫 인자로 받는 정적 메서드가 됩니다. 여기서 두 가지가 따라옵니다.

1. **private 멤버에 접근 못 합니다.**
2. **정적 디스패치입니다.** 오버라이드되지 않아요.

```kotlin
open class Base
class Derived : Base()

fun Base.name() = "Base"
fun Derived.name() = "Derived"

val x: Base = Derived()
println(x.name())   // "Base" — 선언 타입 기준!
```

멤버 함수와 확장 함수 이름이 겹치면 **항상 멤버가 이깁니다.** 이 두 가지만 알면 함정은 피할 수 있습니다.

### nullable 수신 객체

이게 강력합니다.

```kotlin
fun String?.orEmptyTrimmed(): String = this?.trim() ?: ""

val s: String? = null
println(s.orEmptyTrimmed())   // ?. 없이 바로 호출 가능
```

수신 타입이 `String?`이면 **null인 상태로도 호출**됩니다. 함수 안에서 `this`가 null인지 확인하면 돼요. 표준 라이브러리의 `isNullOrEmpty()`, `orEmpty()`가 이 방식입니다.

## 스코프 함수 5개

Kotlin 초보가 가장 남용하는 부분입니다. **처음에는 `let`과 `apply` 둘만 쓰세요.**

| 함수 | 객체 참조 | 반환값 | 주 용도 |
|---|---|---|---|
| `let` | `it` | 람다 결과 | null 체크 후 변환 |
| `apply` | `this` | **객체 자신** | 객체 설정 후 반환 |
| `run` | `this` | 람다 결과 | 객체 문맥에서 계산 |
| `also` | `it` | **객체 자신** | 로깅·디버깅 등 부수 효과 |
| `with` | `this` | 람다 결과 | 확장 아님. 인자로 받음 |

외울 축은 두 개뿐입니다: **(1) 객체를 `it`으로 받나 `this`로 받나, (2) 객체를 반환하나 람다 결과를 반환하나.**

### let — null 안전 변환

```kotlin
val length: Int? = name?.let { it.trim().length }
```

### apply — 설정 후 자신을 반환

```kotlin
val props = Properties().apply {
    setProperty("user", "admin")
    setProperty("timeout", "3000")
}
```

Java의 "객체 만들고 → 세터 여러 번 호출 → 변수에 담기"가 한 표현식이 됩니다.

### also — 체인 중간에 끼어들기

```kotlin
val result = compute()
    .also { log.debug("계산 결과: $it") }
    .filter { it > 0 }
```

원본을 그대로 흘려보내면서 로깅만 얹습니다.

> **경고**: 스코프 함수를 중첩하면 `it`과 `this`가 뭘 가리키는지 순식간에 안 보이게 됩니다. 두 단계 이상 중첩되면 그냥 지역 변수로 풀어 쓰세요. "짧다"와 "읽힌다"는 다릅니다.

## 연습

확장 함수 두 개를 작성하세요.

**1. `String.masked()`** — 이메일 로컬 파트(`@` 앞)에서 **앞 2글자만 남기고** 나머지를 `*`로 가립니다. `@`가 없으면 문자열 전체를 같은 규칙으로 가립니다.

**2. `Int?.orZero()`** — null이면 `0`, 아니면 그 값. **nullable 수신 객체**로 만들어 `?.` 없이 호출되게 하세요.

```kotlin starter
// TODO 1: String.masked()
// TODO 2: Int?.orZero()

fun main() {
    println("kyungtae@example.com".masked())
    println("ab@x.com".masked())
    println("secret".masked())

    val n: Int? = null
    println(n.orZero() + 5.orZero())
}
```

```text expected
ky******@example.com
ab@x.com
se****
5
```

```text hint
`masked()`는 문자열을 **두 조각**으로 나눠서 보세요 — 가려야 할 앞부분(`@` 앞)과 그대로 둘 뒷부분(`@`부터 끝까지). `@`가 없는 `"secret"`은 별도 알고리즘이 아니라 **"뒷부분이 빈 문자열"인 같은 경우**일 뿐입니다. `orZero()`는 전혀 다른 질문이에요 — `val n: Int? = null` 인데 `n.orZero()`가 `?.` 없이 컴파일되려면, **수신 타입 자체가** 무엇이어야 할까요?
---
쓸 도구: `substringBefore("@")`, `substringAfter("@")`, `contains("@")`, 앞 두 글자만 남기는 `take(2)`, 별을 n개 만드는 `"*".repeat(n)`. `orZero()`는 엘비스 연산자 `?:` 하나로 끝납니다.
---
별의 개수는 `local.length - 2`인데, 로컬 파트가 두 글자 이하면 **음수가 되어 `repeat`이 예외를 던집니다.** `coerceAtLeast(0)`으로 바닥을 막으세요 — `"ab@x.com"`이 한 글자도 안 가려진 채 그대로 나오는 게 정확히 이 0개 케이스입니다. 그리고 `substringBefore`는 **구분자가 없으면 문자열 전체를 돌려주므로** `"secret"`도 분기 없이 같은 코드 경로를 탑니다. `orZero()`는 수신 타입을 `Int?`로 선언하면 함수 안의 `this`가 nullable이 되고, 그러면 `this ?: 0` 한 줄이면 됩니다.
---
뼈대는 이렇습니다.

`masked()` 본문은 세 줄이에요. `val local = substringBefore("@")` 로 앞부분을 떼고, `val rest = if (contains("@")) "@" + substringAfter("@") else ""` 로 뒷부분을 만든 뒤, `return local.take(2) + "*".repeat(___) + rest` 의 빈칸만 채우면 됩니다.

`orZero()` 는 `fun ___.orZero(): Int = this ?: 0`
```

```kotlin solution
// @ 앞뒤로 쪼개면 "@ 없음" 은 뒤쪽이 빈 문자열인 같은 경우가 된다 — 분기가 하나로 줄어든다.
fun String.masked(): String {
    val local = substringBefore("@")
    val rest = if (contains("@")) "@" + substringAfter("@") else ""
    return local.take(2) + "*".repeat((local.length - 2).coerceAtLeast(0)) + rest
}

// 수신 타입을 Int? 로 잡아야 null 인 변수에서도 ?. 없이 호출된다.
fun Int?.orZero(): Int = this ?: 0

fun main() {
    println("kyungtae@example.com".masked())
    println("ab@x.com".masked())
    println("secret".masked())

    val n: Int? = null
    println(n.orZero() + 5.orZero())
}
```
