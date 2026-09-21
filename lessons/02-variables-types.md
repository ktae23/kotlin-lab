# Lesson 2 — 변수와 기본 타입

Kotlin은 Java와 **기본값이 정반대**입니다. Java에서 `final`은 붙이면 좋은 것이었지만, Kotlin에서 `val`은 **기본으로 쓰고 어쩔 수 없을 때만 `var`로 내려가는** 것입니다. 타입 쪽도 마찬가지예요 — Java가 관대하게 봐주던 암묵적 변환을 Kotlin은 **전부 막습니다.**

## val vs var

```kotlin
val name = "박경태"   // Java의 final String name — 재할당 불가
var count = 0         // 재할당 가능
```

`val`은 **재할당 불가**일 뿐 객체 내부가 불변이라는 뜻은 아닙니다. Java의 `final`과 정확히 같은 의미예요.

```kotlin
val list = mutableListOf(1, 2)
list.add(3)            // OK — 참조는 그대로, 내용만 바뀜
list = mutableListOf() // 컴파일 에러 — 재할당 불가
```

## 왜 val이 기본인가

단순한 스타일 문제가 아닙니다. **`var`는 컴파일러의 능력을 깎아먹습니다.**

```kotlin
class Service(var cached: String?) {
    fun run() {
        if (cached != null) {
            println(cached.length)   // ❌ 컴파일 에러
        }
    }
}
```

검사 직후 다른 스레드가 `cached`를 바꿀 수 있으니 컴파일러가 **스마트 캐스트를 거부**합니다. `val`이었다면 그냥 통과해요.

그리고 Kotlin에서는 `if`/`when`이 **값을 내놓는 표현식**이라 "선언 먼저, 분기에서 채우기"가 `val grade = when { ... }` 한 덩어리가 됩니다. **`var`가 보이면 대부분 표현식으로 없앨 수 있습니다** (Lesson 5).

## 숫자 타입 — 암묵적 확대 변환이 없다

`Byte`(8) · `Short`(16) · `Int`(32) · `Long`(64) · `Float`(32) · `Double`(64). 여기까진 Java와 같습니다. 다른 건 이겁니다.

```kotlin
val i: Int = 10
val l: Long = i          // ❌ 컴파일 에러 — Java 는 통과하던 코드
val l: Long = i.toLong() // 명시적으로 변환해야 한다
```

Java의 widening conversion이 **없습니다.** 귀찮아 보이지만 이유가 있어요. 암묵 변환은 오버로드 해석을 미묘하게 만들고(`f(1)`이 `f(Int)`인지 `f(Long)`인지), 데이터가 조용히 바뀌는 지점을 코드에서 지웁니다. Kotlin은 **변환이 일어나는 자리를 눈에 보이게** 만든 쪽을 택했습니다.

예외가 둘 있습니다.

```kotlin
val l: Long = 1        // ✅ 리터럴은 기대 타입에 맞춰진다
val b: Byte = 1        // ✅ 범위 안이면 OK (val b: Byte = 300 은 에러)
val sum = 1L * 3       // ✅ 산술 연산은 넓은 쪽으로 승격된다 → Long
```

**대입은 막지만 연산은 승격**합니다. 이 구분을 모르면 `toLong()`을 어디에 붙여야 할지 계속 헷갈려요.

변환 함수(`toInt()`, `toLong()`, `toByte()`…)는 **자릅니다. 검사하지 않습니다.**

```kotlin
println(300.toByte())        // 44  — 조용히 잘린다
println(Int.MAX_VALUE + 1)   // -2147483648 — 오버플로도 조용하다
```

> 실무 규칙: **금액·누적 카운트·ID는 처음부터 `Long`.** `Int` 최대값은 약 21억이라, 원 단위 금액 합계는 생각보다 쉽게 넘깁니다. 그리고 `sumOf { it.amount }` 같은 집계가 `Int`로 돌면 넘쳐도 예외 하나 안 납니다.

## 리터럴과 나눗셈

```kotlin
val big = 1_000_000      // 밑줄로 자릿수 구분 (Java 7+ 와 동일)
val hex = 0xFF           // 255 (16진수). 0b1010 은 2진수로 10
val long = 123L          // Long. 1.5f 는 Float — 접미사가 없으면 Double
```

`5 / 2`는 `2`입니다. **정수끼리의 나눗셈은 정수**예요. 한쪽만 실수로 바꾸면 결과가 달라집니다.

```kotlin
println(5 / 2)      // 2
println(5.0 / 2)    // 2.5
println(0.1 + 0.2)  // 0.30000000000000004 — 돈 계산에 Double 을 쓰면 안 되는 이유
```

금액은 `java.math.BigDecimal`이나 **최소 단위 정수(원 단위 `Long`)**로 다룹니다. Java에서 하던 그대로입니다.

## Char는 숫자가 아니다

```kotlin
val c: Char = 'A'
val n: Int = c           // ❌ 에러 — Java 에서는 됐다
println(c.code)          // 65
println('7'.digitToInt())// 7
println('b' - 'a')       // 1   — Char - Char 는 Int
println(c + 1)           // B   — Char + Int 는 Char
```

Java의 `char`는 사실상 16비트 정수라 `int`와 자유롭게 섞였습니다. Kotlin의 `Char`는 **문자 타입**이에요. 참고로 `Char.toInt()`는 1.5에서 deprecated 되고 `code`로 바뀌었습니다 — 오래된 예제를 복붙하면 여기서 걸립니다.

`Boolean`은 `true`/`false`뿐입니다. `&&`/`||`는 단락 평가(short-circuit)를 하고, `and`/`or`는 **양쪽을 항상 평가**합니다. 오른쪽에 부수 효과가 있으면 결과가 달라져요.

## 타입 추론의 한계 — 명시가 나은 곳

```kotlin
val count = 0            // Int 로 추론. Long 이 필요하면 0L 이라고 써야 한다
val list = listOf<String>()   // 빈 컬렉션은 추론할 근거가 없다
```

추론에 맡기지 말아야 할 자리가 셋 있습니다.

1. **공개 API의 반환 타입** — 구현을 바꾸다 반환 타입이 슬쩍 바뀌면 호출부가 깨집니다
2. **Java 메서드 호출 결과** — 플랫폼 타입이라 컴파일러가 null 검사를 안 합니다 (Lesson 8)
3. **숫자 타입이 의미를 갖는 자리** — 금액, ID, 타임스탬프

## Any · Unit · Nothing

| 타입 | 정체 |
|---|---|
| `Any` | 모든 non-null 타입의 최상위 (Java `Object`). 진짜 최상위는 `Any?` |
| `Unit` | "반환값 없음". Java `void`와 달리 **실제 객체**다 (Lesson 1) |
| `Nothing` | **값이 존재하지 않는** 타입. 모든 타입의 하위 타입 |

`Nothing`이 Java에 없는 개념입니다. `throw`와 `return`의 타입이 `Nothing`이라, **엘비스 연산자 오른쪽에 `throw`를 쓸 수 있는** 것이죠 (Lesson 8). `TODO()`의 반환 타입도 `Nothing`이고요.

## 스마트 캐스트와 `as` / `as?`

```kotlin
fun describe(value: Any): Int {
    if (value is String) return value.length   // 여기서 value 는 String — 캐스팅 불필요
    return 0
}

val s = value as String    // 실패하면 ClassCastException
val t = value as? String   // 실패하면 null — 보통 ?: 와 같이 쓴다
```

`instanceof` 뒤에 다시 캐스팅하던 Java 코드가 사라집니다. 단 **`var` 프로퍼티에는 안 먹습니다** (위에서 본 이유).

## 컬렉션: 읽기 전용 vs 불변

```kotlin
val a: List<Int> = listOf(1, 2, 3)          // 읽기 전용 인터페이스 — add 가 아예 없다
val b: MutableList<Int> = mutableListOf(1)  // 변경 가능
```

`Collections.unmodifiableList()`처럼 런타임 예외를 던지는 게 아니라 **메서드가 없어 컴파일이 안 됩니다.** 다만 **읽기 전용이 불변은 아닙니다** — 같은 객체를 `MutableList`로도 참조 중이면 내용이 바뀌어요. 경계 밖으로 내보낼 땐 `toList()`로 스냅샷을 줍니다 (Lesson 23에서 자세히).

## 초기화 시점 3종

| 문법 | 쓰는 상황 |
|---|---|
| `val x = ...` | 선언 시점에 값을 아는 경우 (기본) |
| `val x by lazy { ... }` | 첫 접근 때 한 번만 계산. 스레드 세이프 |
| `lateinit var x: T` | DI 주입, 테스트 `@BeforeEach` 등 나중에 채워지는 non-null 참조 |

`lateinit`은 초기화 전에 접근하면 `UninitializedPropertyAccessException`이 납니다. **원시 타입에는 못 씁니다.** 남용하면 `!!`와 다를 바 없으니, **생성자 주입으로 `val`을 쓸 수 있으면 그게 항상 낫습니다.**

```kotlin
// Spring — 이 형태가 최선. lateinit 필요 없음
@Service
class OrderService(private val repo: OrderRepository)
```

## const val

컴파일 타임 상수. Java의 `static final`에 대응하며 **호출부에 값이 인라인**됩니다.

```kotlin
const val MAX_RETRY = 3   // top-level 또는 object 안에서만. String 과 기본 타입만 가능
```

## 연습

다섯 개의 함수를 채우세요. 1~4번은 한 줄이고, 걸리는 지점은 **전부 타입 변환**입니다. 5번만 세 줄이고 `Any`에서 타입을 좁히는 문제입니다.

첫 줄은 이미 채워져 있습니다 — `Int`로 계산하면 어떻게 되는지 보여주는 줄이에요. 같은 계산을 넘치지 않게 만드는 게 1번 문제입니다.

```kotlin starter
const val BYTES_PER_MB = 1_048_576

// 1) 파일 개수 × 개당 크기(바이트). Int 곱셈은 넘친다 — Long 으로 정확히 계산할 것
fun totalBytes(fileCount: Int, sizePerFile: Int): Long {
    TODO("여기를 구현하세요")
}

// 2) 바이트를 MB 로 (버림). BYTES_PER_MB 를 쓸 것
fun toMegabytes(bytes: Long): Long {
    TODO("여기를 구현하세요")
}

// 3) 숫자 문자 하나를 Int 로. Char 는 숫자가 아니다
fun digitValue(c: Char): Int {
    TODO("여기를 구현하세요")
}

// 4) 정답 비율을 퍼센트(Double)로. 정수 나눗셈 함정을 피할 것
fun accuracy(correct: Int, total: Int): Double {
    TODO("여기를 구현하세요")
}

// 5) 설정값이 Any 로 들어온다. Int 면 Long 으로 올리고, Long 이면 그대로, 그 외 타입이면 0L
//    (캐스팅 대신 is 와 as? 를 쓸 것)
fun asByteSize(value: Any): Long {
    TODO("여기를 구현하세요")
}

fun main() {
    println(50_000 * 100_000)                        // Int 로 계산하면 이렇게 된다
    println(totalBytes(50_000, 100_000))
    println(toMegabytes(totalBytes(50_000, 100_000)))
    println(digitValue('7') + digitValue('2'))
    println(accuracy(7, 8))
    println(asByteSize(1_024))
    println(asByteSize(5_000_000_000L))
    println(asByteSize("1GB"))
}
```

```text expected
705032704
5000000000
4768
9
87.5
1024
5000000000
0
```

```text hint
1~4번은 모두 **"계산이 어느 타입에서 일어나는가"** 하나를 묻습니다. 1번은 `Int * Int` 가 `Int` 라서 결과를 `Long` 으로 받아도 이미 늦었다는 게 핵심이에요 — **곱하기 전에** 타입이 올라가 있어야 합니다. 4번도 똑같은 모양입니다. `Int / Int` 는 소수점을 버리고, 그 뒤에 `Double` 로 바꿔봐야 버려진 값은 안 돌아옵니다. 5번만 결이 다릅니다 — `Any` 에 담긴 값의 **실제 타입을 좁히는** 문제예요.
---
쓸 도구는 변환 함수뿐입니다. `toLong()`, `toDouble()`, 그리고 문자에는 `digitToInt()`. Kotlin 에서 **대입은 암묵 변환이 없지만 산술 연산은 넓은 쪽으로 승격**된다는 걸 기억하세요 — 한쪽만 `Long` 이면 곱셈 전체가 `Long` 에서 일어나고, 한쪽만 `Double` 이면 나눗셈이 실수로 바뀝니다. 2번은 `Long / Int` 라 그대로 `Long` 이 나옵니다. 5번의 도구는 `is` 와 `as?` 두 개입니다.
---
함정 셋. (1) 3번에서 `c.toInt()` 는 Kotlin 1.5부터 없어졌고, `c.code` 는 `'7'` 의 코드값인 **55** 를 줍니다. 원하는 건 7이니 `digitToInt()` 예요 (`c - '0'` 도 답은 같지만 의도가 덜 드러납니다). (2) 4번은 퍼센트니까 100을 곱해야 하는데, `100` 을 그냥 곱하면 여전히 `Int` 계산입니다 — 리터럴 자체를 실수로 쓰는 게 가장 짧습니다. (3) 5번에서 `value is Int` 로 들어간 가지 안의 `value` 는 이미 `Int` 라 **캐스팅 없이 `toLong()` 을 바로 부를 수 있습니다**(스마트 캐스트). `as` 로 내리면 실패할 때 `ClassCastException` 이니, 실패해도 되는 자리에는 `as?` 를 쓰고 그 결과가 null 인지 봅니다.
---
뼈대입니다. 빈칸만 채우세요.

1번: `return fileCount.___() * sizePerFile`

2번: `return bytes / ___`

3번: `return c.___()`

4번: `return correct * ___ / total`

5번: `if (value ___ Int) return value.toLong()` 다음 줄에 `val l = value ___ Long`, 마지막은 `return if (l != null) ___ else 0L`
```

```kotlin solution
const val BYTES_PER_MB = 1_048_576

// 곱하기 전에 한쪽을 Long 으로 올린다 — 결과 타입만 Long 이면 이미 넘친 뒤다.
fun totalBytes(fileCount: Int, sizePerFile: Int): Long = fileCount.toLong() * sizePerFile

// Long / Int 는 Long. 대입은 암묵 변환이 없어도 산술은 넓은 쪽으로 승격된다.
fun toMegabytes(bytes: Long): Long = bytes / BYTES_PER_MB

// Char 는 숫자가 아니다. code 는 55(문자 코드), digitToInt 는 7(자릿값).
fun digitValue(c: Char): Int = c.digitToInt()

// 100.0 을 곱해 나눗셈 자체를 Double 로 끌어올린다. correct / total 을 먼저 하면 0 이다.
fun accuracy(correct: Int, total: Int): Double = correct * 100.0 / total

fun asByteSize(value: Any): Long {
    if (value is Int) return value.toLong()   // is 로 좁히면 value 는 여기서 Int — 캐스팅 불필요
    val l = value as? Long                    // 실패해도 되는 자리라 as 가 아니라 as?
    return if (l != null) l else 0L           // null 검사 뒤 l 은 다시 Long 으로 좁혀진다
}

fun main() {
    println(50_000 * 100_000)                        // Int 로 계산하면 이렇게 된다
    println(totalBytes(50_000, 100_000))
    println(toMegabytes(totalBytes(50_000, 100_000)))
    println(digitValue('7') + digitValue('2'))
    println(accuracy(7, 8))
    println(asByteSize(1_024))
    println(asByteSize(5_000_000_000L))
    println(asByteSize("1GB"))
}
```
