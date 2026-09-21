# Lesson 4 — 연산자와 범위

이번 레슨의 절반은 `==` 하나에 씁니다. **Java와 의미가 정확히 뒤집힌 유일한 연산자**라서, 여기를 모르고 넘어가면 나중에 원인을 못 찾는 버그를 만듭니다. 나머지 절반은 범위(range)인데, 이건 반대로 "알면 그냥 코드가 짧아지는" 즐거운 쪽입니다.

## `==` 와 `===` — Java와 정반대

```kotlin
val a = "kotlin"
val b = String(charArrayOf('k', 'o', 't', 'l', 'i', 'n'))

a == b     // true  — 내용 비교 (equals 호출)
a === b    // false — 참조 비교 (같은 객체인가)
```

Java를 5년 쓰셨다면 손가락이 이미 `equals()` 를 치고 있을 겁니다. 정리하면 이렇습니다.

| 하고 싶은 것 | Java | Kotlin |
|---|---|---|
| 내용이 같은가 (구조적 동등성) | `a.equals(b)` | `a == b` |
| 같은 객체인가 (참조 동일성) | `a == b` | `a === b` |

**`==` 는 `equals()` 호출로 컴파일됩니다.** 정확히는 `a?.equals(b) ?: (b === null)` 로요. 그래서 왼쪽이 null이어도 NPE가 나지 않습니다.

```kotlin
val s: String? = null
s == "hello"      // false — 예외 아님
```

Java에서 NPE를 피하려고 `"hello".equals(s)` 처럼 **상수를 앞에 두던 관용구가 Kotlin에선 필요 없습니다.** 그런 코드가 보이면 Java 잔재로 지적하세요.

### 언제 `===` 를 쓰나

실무에서는 거의 안 씁니다. 쓰는 경우는 두 가지 정도예요.

- 캐시/풀이 **같은 인스턴스를 돌려주는지** 검증할 때
- `equals` 를 직접 구현하면서 `if (this === other) return true` 최적화를 넣을 때

> 면접 단골: "`==` 로 충분한데 `===` 는 왜 있나요?" → **동등성(equality)과 동일성(identity)은 다른 질문**이고, Java는 참조 타입에서 `==` 를 동일성에 써버려 동등성 쪽이 메서드 호출로 밀려났습니다. Kotlin은 **더 자주 쓰는 쪽에 더 짧은 기호**를 줬습니다.

## 연산자는 함수 호출의 별명이다

Kotlin 연산자는 전부 **정해진 이름의 함수**로 번역됩니다.

| 식 | 실제 호출 |
|---|---|
| `a + b` | `a.plus(b)` |
| `a in b` | `b.contains(a)` |
| `a[i]` | `a.get(i)` |
| `a < b` | `a.compareTo(b) < 0` |
| `a..b` | `a.rangeTo(b)` |

`compareTo` 연동이 특히 실무에서 유용합니다. `Comparable` 을 구현한 타입이면 **부등호를 그냥 쓸 수 있습니다.**

```kotlin
val d1 = java.time.LocalDate.of(2026, 1, 1)
val d2 = java.time.LocalDate.of(2026, 3, 1)

if (d1 < d2) println("d1 이 먼저")        // Java: d1.isBefore(d2) / compareTo(d2) < 0
if (java.math.BigDecimal("1.0") < java.math.BigDecimal("2.0")) println("ok")
```

`BigDecimal` 비교는 특히 조심할 값어치가 있습니다. **`compareTo` 는 스케일을 무시하지만 `equals` 는 무시하지 않습니다.** `BigDecimal("1.0") == BigDecimal("1.00")` 은 **false** 예요 (`equals` 가 스케일까지 보니까). 금액 비교는 `==` 가 아니라 `compareTo(other) == 0` 이어야 합니다 — Java에서도 같은 함정이지만, Kotlin에서 `==` 가 짧아진 만큼 더 자주 밟습니다.

## 범위 (Range)

```kotlin
1..10          // 1, 2, ... 10        (양끝 포함)
1 until 10     // 1, 2, ... 9         (끝 제외)
1..<10         // until 과 동일 — Kotlin 1.9+ 신 문법
10 downTo 1    // 10, 9, ... 1
1..10 step 3   // 1, 4, 7, 10
'a'..'f'       // CharRange
```

`..<` 는 `until` 의 새 표기입니다. **`until` 보다 이쪽을 권합니다** — `a until b` 는 읽을 때 끝 포함 여부가 헷갈리는데, `..` 와 `..<` 는 기호만 보고 구분되니까요.

범위는 **객체**입니다. 변수에 담아 넘길 수 있고, 비어 있을 수도 있습니다.

```kotlin
val valid: IntRange = 1..12
println(valid.first)     // 1
println(valid.last)      // 12

println((5..1).isEmpty())    // true — 거꾸로면 빈 범위. 예외가 아니다
```

컬렉션의 유효 인덱스 범위는 `indices` 로 바로 얻습니다.

```kotlin
val list = listOf("a", "b", "c")
println(list.indices)        // 0..2
if (i in list.indices) list[i]
```

## `in` — 이번 레슨에서 실무 가치가 가장 높은 것

```kotlin
// Java
if (age >= 1 && age <= 12) { ... }
```
```kotlin
// Kotlin
if (age in 1..12) { ... }
```

경계 검사를 `&&` 로 쓰면 **부등호 방향과 등호 포함 여부를 네 군데서 틀릴 수 있습니다.** `in 1..12` 는 틀릴 구석이 없어요. 리뷰에서 `a >= X && a <= Y` 를 보면 저는 항상 바꿔 달라고 합니다.

`in` 은 범위 전용이 아닙니다. **`contains` 가 있는 모든 것**에 씁니다.

```kotlin
"ADMIN" in roles              // List.contains
'k' in "kotlin"               // String.contains
"kot" in "kotlin"             // 부분 문자열
key in map                    // Map 의 키 검사
c in '0'..'9'                 // CharRange
status !in setOf(PAID, DONE)  // 부정형
```

`!in` 이 있다는 게 은근히 큽니다. Java에서는 `!list.contains(x)` 처럼 **부정 기호가 식 맨 앞**에 붙어 긴 식에서 놓치기 쉬웠죠.

> `Character.isDigit(c)` 같은 Java 유틸 대신 `c in '0'..'9'` 를 쓰라는 말은 아닙니다. Kotlin에는 `c.isDigit()`, `c.isLetter()` 가 이미 있어요. 다만 **`'a'..'f'` 처럼 표준에 없는 구간**은 CharRange 가 가장 읽기 쉽습니다.

## 비트 연산은 왜 중위 함수인가

Kotlin에는 `&`, `|`, `^`, `<<`, `>>` 기호가 **없습니다.**

```kotlin
val READ  = 1 shl 2      // Java: 1 << 2
val WRITE = 1 shl 1
val mask  = READ or WRITE
val hasRead = (mask and READ) != 0
val flipped = mask xor READ
val shifted = mask shr 1
val unsigned = -8 ushr 1  // 부호 없는 오른쪽 시프트 (Java 의 >>>)
```

기호를 뺀 이유는 **Java에서 `&`/`|` 가 논리 연산과 비트 연산 양쪽에 쓰여 혼동을 줬기 때문**입니다. Kotlin은 논리는 `&&`/`||`, 비트는 이름 있는 함수로 완전히 갈랐습니다.

> **함정 하나.** 중위 함수는 **산술 연산자보다 우선순위가 낮습니다.**
> `1 shl 2 + 1` 은 `(1 shl 2) + 1 = 5` 가 아니라 **`1 shl (2 + 1) = 8`** 입니다.
> 비트 연산을 다른 연산과 섞을 땐 **괄호를 반드시** 치세요. 반대로 `(mask and READ) != 0` 에서는 중위 함수가 `!=` 보다 우선순위가 높아 괄호가 없어도 되지만, 그래도 씁니다. 읽는 사람이 우선순위 표를 외우고 있을 거라 기대하면 안 됩니다.

## 리뷰 관점

| 이런 코드를 보면 | 이렇게 지적합니다 |
|---|---|
| `a.equals(b)` | `a == b`. Kotlin의 `==` 가 이미 equals 다 |
| `"CONST".equals(s)` (null 회피용 순서 뒤집기) | `s == "CONST"`. Kotlin `==` 는 null 안전하다 |
| `a >= 1 && a <= 10` | `a in 1..10` |
| `!list.contains(x)` | `x !in list` |
| `i >= 0 && i < list.size` | `i in list.indices` |
| `BigDecimal` 을 `==` 로 비교 | 스케일까지 비교된다. `compareTo(other) == 0` |
| `until` 과 `..` 를 섞어 씀 | `..<` 로 통일하면 끝 포함 여부가 기호로 보인다 |
| 비트 연산과 산술을 괄호 없이 섞음 | 중위 함수 우선순위가 낮다. 괄호 필수 |

## 연습

권한 마스크와 나이 구간을 다루는 유틸 네 개를 채우세요. `main` 은 건드리지 않습니다.

**`when` 은 아직 배우지 않았으니 쓰지 말고**, 비교는 `&&` 대신 `in` 과 범위로, 비트 검사는 중위 함수로 하세요.

```kotlin starter
val ROLES = listOf("USER", "ADMIN", "OWNER")

const val READ = 1 shl 2
const val WRITE = 1 shl 1
const val EXEC = 1

// 1..120 을 벗어나면 "invalid", 1..12 child, 13..19 teen, 20..64 adult, 그 위는 senior
fun ageGroup(age: Int): String {
    TODO("in 과 !in 으로. a >= x && a <= y 는 금지")
}

// 10 부터 1 까지 3씩 줄이며 공백으로 이어 붙인다 → "10 7 4 1"
fun countdown(): String {
    TODO("downTo 와 step, 그리고 joinToString")
}

// 0-9 또는 a-f 이면 true
fun isHex(c: Char): Boolean {
    TODO("CharRange 두 개")
}

// 마스크를 "rwx" 형태로. 비트가 꺼져 있으면 '-'
fun perm(mask: Int): String {
    TODO("and 로 비트 검사")
}

fun main() {
    println(ageGroup(7))
    println(ageGroup(15))
    println(ageGroup(40))
    println(ageGroup(70))
    println(ageGroup(0))
    println(countdown())
    println(isHex('c'))
    println(isHex('g'))
    println(perm(READ or WRITE))
    println(perm(7))
    println("ADMIN" in ROLES)
    println("ROOT" !in ROLES)
    val a = "kotlin"
    val b = String(charArrayOf('k', 'o', 't', 'l', 'i', 'n'))
    println(a == b)
    println(a === b)
}
```

```text expected
child
teen
adult
senior
invalid
10 7 4 1
true
false
rw-
rwx
true
true
true
false
```

```text hint
`ageGroup` 은 **가장 먼저 걸러야 할 것**이 무엇인지 생각하세요. 유효하지 않은 값을 맨 앞에서 쳐내면 나머지 분기가 단순해집니다. 부정 검사는 `!in` 으로 한 번에 씁니다. 나머지 구간은 `in 1..12` 처럼 범위를 그대로 쓰면 되고요.
---
`countdown` 에 쓸 도구는 세 개입니다 — `downTo`(거꾸로), `step`(간격), 그리고 지난 레슨의 `joinToString`. 범위는 **객체**라서 `joinToString` 을 바로 부를 수 있습니다. `isHex` 는 `||` 로 이은 CharRange 두 개, `perm` 은 `and` 로 비트를 하나씩 확인하고 `if` 식으로 문자를 고른 뒤 이어 붙입니다.
---
`10 downTo 1 step 3` 은 `(10 downTo 1) step 3` 으로 묶여 10, 7, 4, 1 을 냅니다 — 중위 함수는 왼쪽부터 결합해요. `perm` 에서 비트가 켜졌는지는 `(mask and READ) != 0` 로 봅니다. `mask and READ` 의 결과는 `true/false` 가 아니라 **`Int`** 라는 점이 핵심이에요. `== 1` 이 아니라 `!= 0` 으로 비교해야 하는 이유는 READ 가 4이기 때문입니다.
---
뼈대는 이렇습니다.

`fun ageGroup(age: Int): String = if (age ___ 1..120) "invalid" else if (age in 1..12) "child" else if (...) ... else "senior"`

`fun countdown(): String = (10 ___ 1 ___ 3).joinToString(" ")`

`fun isHex(c: Char): Boolean = c in '0'..'9' || c in ___`

`fun perm(mask: Int): String = (if ((mask ___ READ) != 0) "r" else "-") + ... + ...`
```

```kotlin solution
val ROLES = listOf("USER", "ADMIN", "OWNER")

const val READ = 1 shl 2
const val WRITE = 1 shl 1
const val EXEC = 1

// 유효하지 않은 값을 !in 으로 먼저 쳐내면 나머지 분기가 단순해진다.
fun ageGroup(age: Int): String =
    if (age !in 1..120) "invalid"
    else if (age in 1..12) "child"
    else if (age in 13..19) "teen"
    else if (age in 20..64) "adult"
    else "senior"

// 범위는 객체라서 그대로 joinToString 할 수 있다.
fun countdown(): String = (10 downTo 1 step 3).joinToString(" ")

fun isHex(c: Char): Boolean = c in '0'..'9' || c in 'a'..'f'

// and 의 결과는 Boolean 이 아니라 Int — 그래서 != 0 으로 본다.
fun perm(mask: Int): String =
    (if ((mask and READ) != 0) "r" else "-") +
        (if ((mask and WRITE) != 0) "w" else "-") +
        (if ((mask and EXEC) != 0) "x" else "-")

fun main() {
    println(ageGroup(7))
    println(ageGroup(15))
    println(ageGroup(40))
    println(ageGroup(70))
    println(ageGroup(0))
    println(countdown())
    println(isHex('c'))
    println(isHex('g'))
    println(perm(READ or WRITE))
    println(perm(7))
    println("ADMIN" in ROLES)
    println("ROOT" !in ROLES)
    val a = "kotlin"
    val b = String(charArrayOf('k', 'o', 't', 'l', 'i', 'n'))
    println(a == b)
    println(a === b)
}
```
