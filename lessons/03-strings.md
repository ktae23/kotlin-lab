# Lesson 3 — 문자열 — 템플릿, raw string, String API

문자열은 "쉬운 주제"로 취급받지만, **실무 Java 코드에서 가장 지저분한 부분도 문자열**입니다. `+` 로 이어 붙인 SQL, `String.format` 의 `%s` 자리 세기, `StringBuilder` 를 손으로 돌리는 루프. Kotlin은 이걸 거의 다 문법으로 걷어냅니다.

## 문자열 템플릿

```kotlin
val name = "박경태"
val count = 3

println("안녕하세요 $name 님, 주문 ${count}건")
println("합계 ${count * 1000}원")
```

규칙은 두 개뿐입니다.

- `$식별자` — 변수 하나면 중괄호 없이
- `${식}` — 식이면 중괄호. 프로퍼티 접근(`${user.name}`)이나 함수 호출(`${list.size}`)도 여기 들어갑니다

Java와 비교해 보죠.

```java
log.info("주문 " + orderId + " 실패: " + e.getMessage() + " (재시도 " + retry + "회)");   // Java
```
```kotlin
log.info("주문 $orderId 실패: ${e.message} (재시도 ${retry}회)")                          // Kotlin
```

`String.format` 의 진짜 문제는 **인자 순서가 바뀌거나 하나 빠져도 컴파일이 통과한다**는 것입니다. 런타임에 `MissingFormatArgumentException` 으로 터지죠. 템플릿은 변수를 그 자리에 직접 쓰니 그런 사고가 구조적으로 불가능합니다.

> **성능 오해 하나 짚고 갑니다.** "템플릿은 결국 문자열 연결이라 느리다"는 말은 틀립니다. 컴파일러가 `StringBuilder`(또는 `invokedynamic` 기반 concat)로 바꿔 줍니다. **루프 안에서 `+=` 로 누적하는 것만 피하면** 성능 고민할 일이 없습니다. 그리고 그 루프 누적은 뒤에 나올 `joinToString` 으로 대부분 사라집니다.

### `$` 자체를 출력하려면

```kotlin
println("가격 ${'$'}9.99")     // 가격 $9.99
println("가격 \$9.99")          // 이스케이프도 가능
```

raw string(`"""`)에는 **이스케이프가 없으므로** `${'$'}` 만 통합니다. 정규식이나 셸 스크립트를 raw string으로 쓸 때 자주 걸립니다.

## raw string `"""`

이스케이프가 통째로 없는 문자열입니다. 개행도 그대로 살아 있고요.

```java
String regex = "\\d{3}-\\d{4}";                    // Java — 백슬래시 지옥
String json = "{\"id\": 1, \"name\": \"kim\"}";
```
```kotlin
// Kotlin
val regex = """\d{3}-\d{4}"""
val json = """{"id": 1, "name": "kim"}"""
```

**가장 많이 쓰는 곳은 SQL 입니다.**

```kotlin
val sql = """
    SELECT o.id, o.amount
    FROM orders o
    WHERE o.status = 'PAID'
      AND o.created_at >= ?
""".trimIndent()
```

### `trimIndent()` 와 `trimMargin()`

raw string은 **소스 코드의 들여쓰기까지 문자열에 포함**됩니다. 그대로 두면 로그와 쿼리에 공백이 줄줄이 붙죠. 그래서 둘 중 하나를 반드시 붙입니다.

| | 동작 |
|---|---|
| `trimIndent()` | 모든 줄의 **공통 최소 들여쓰기**를 계산해 제거. 앞뒤 빈 줄도 제거 |
| `trimMargin()` | 각 줄에서 `|` **(마진 접두사)까지** 잘라냄. 접두사는 인자로 바꿀 수 있음 |

```kotlin
val a = """
    line1
      line2
""".trimIndent()          // "line1\n  line2" — 상대 들여쓰기는 보존된다
```

일부러 앞 공백을 남겨야 하는 경우(ASCII 아트, 들여쓴 YAML)엔 `trimMargin`, 보통은 `trimIndent` 를 씁니다.

> **함정:** `trimIndent()` 는 컴파일 타임 마법이 아니라 **런타임 함수**입니다. 템플릿이 먼저 치환되고 그 결과에 대해 들여쓰기를 계산해요. 그래서 `${여러 줄짜리 값}` 을 끼워 넣으면 그 값의 둘째 줄 이후가 들여쓰기 계산을 망가뜨립니다. 여러 줄 값을 넣을 땐 `trimIndent()` 를 먼저 적용하고 붙이세요.

## 자주 쓰는 String API

Java에서 직접 만들거나 Apache Commons(`StringUtils`)를 끌어오던 것들이 대부분 표준에 있습니다.

| 함수 | 하는 일 |
|---|---|
| `trim()` / `trimStart()` / `trimEnd()` | 공백 제거 |
| `split(",")` | `List<String>` 반환 (Java의 배열이 아님) |
| `substringBefore("=")` / `substringAfter("=")` | 구분자 기준 자르기. **없으면 원본 반환** |
| `substringBeforeLast` / `substringAfterLast` | 마지막 구분자 기준 (파일 확장자 뽑을 때) |
| `replace("a", "b")` | 치환 |
| `padStart(8, '0')` / `padEnd(8)` | 자리 채우기 |
| `repeat(30)` | 반복 — 구분선 그을 때 |
| `startsWith` / `endsWith` / `contains` | 포함 검사 |
| `lines()` | 개행 기준 분리 (`\r\n` 도 처리) |
| `uppercase()` / `lowercase()` | 대소문자 (`toUpperCase` 는 **deprecated**) |

`substringBefore` 계열은 **구분자가 없으면 예외 대신 원본을 그대로 돌려줍니다.** `indexOf` 로 -1 검사하던 코드가 통째로 사라지죠. 기본값을 따로 주고 싶으면 두 번째 인자로 넘깁니다.

```kotlin
"A-1042".substringAfter("=")            // "A-1042" (구분자 없음 → 원본)
"A-1042".substringAfter("=", "unknown") // "unknown"
```

## `isEmpty` vs `isBlank`

**실무에서 가장 많이 나는 문자열 버그**입니다.

```kotlin
val s = "   "
s.isEmpty()   // false — 길이가 0이 아니니까
s.isBlank()   // true  — 공백뿐이니까
```

사용자 입력, 폼 데이터, CSV 컬럼은 **공백만 들어오는 경우가 압도적으로 많습니다.** 그래서 검증에는 거의 항상 `isBlank` 가 맞습니다. (Spring의 `@NotBlank` 와 `@NotEmpty` 가 갈라진 이유도 똑같죠.)

기본값을 주는 짝꿍도 있습니다.

```kotlin
val memo = input.ifBlank { "메모 없음" }     // 공백뿐이면 대체
val title = raw.ifEmpty { "(제목 없음)" }    // 길이 0일 때만 대체
val name: String = nullableName.orEmpty()   // null 이면 "" (String? → String)
```

`ifBlank`/`ifEmpty` 의 인자는 람다라 **대체값 계산이 필요할 때만 실행**됩니다.

## `joinToString` — 손으로 만든 StringBuilder 를 없앤다

```java
StringBuilder sb = new StringBuilder();                 // Java — 실무에서 매일 보는 코드
for (int i = 0; i < names.size(); i++) {
    if (i > 0) sb.append(", ");
    sb.append(names.get(i));
}
String result = sb.toString();
```
```kotlin
val result = names.joinToString(", ")                   // Kotlin
```

구분자·접두사·접미사·개수 제한까지 인자로 받습니다.

```kotlin
ids.joinToString(prefix = "(", postfix = ")", separator = ",")   // (1,2,3)
logs.joinToString("\n", limit = 10, truncated = "... 이하 생략")
```

SQL의 `IN` 절을 만들 때, 로그에 리스트를 찍을 때 거의 매번 씁니다. **`StringBuilder` 를 손으로 돌리는 코드가 보이면 십중팔구 `joinToString` 한 줄입니다.**

## 리뷰 관점

| 이런 코드를 보면 | 이렇게 지적합니다 |
|---|---|
| `String.format("%s님 %d건", n, c)` | 템플릿으로. 인자 순서 사고를 컴파일 타임에 막는다 |
| `"a" + var1 + "b" + var2 + "c"` | 템플릿으로. 가독성 문제지 성능 문제가 아니다 |
| `if (s == null \|\| s.trim().isEmpty())` | `s.isNullOrBlank()` |
| `s.isEmpty()` 로 입력 검증 | 공백 입력이 통과한다. `isBlank()` |
| 루프 + `StringBuilder.append` | `joinToString` |
| `"\\d+"` 같은 이스케이프 범벅 | raw string |
| `trimIndent()` 없는 `"""` SQL | 쿼리에 공백이 그대로 들어간다 |
| `toUpperCase()` | deprecated. `uppercase()` |

## 연습

결제 로그 한 줄을 파싱해 영수증을 만듭니다. `main` 은 건드리지 말고 다섯 함수를 채우세요.

**루프(`for`)나 `if` 없이** 전부 String API 와 템플릿만으로 됩니다. `memo` 는 공백뿐이라는 점에 주의하세요 — 어떤 검사를 써야 걸러지는지가 이 문제의 핵심입니다.

```kotlin starter
const val LOG = "2026-09-21T10:33 | orderId=A-1042 | amount=125000 | tags=결제,정기,VIP | memo=   "

fun orderId(log: String): String {
    TODO("substringAfter / substringBefore 로 A-1042 만 뽑는다")
}

fun amount(log: String): Int {
    TODO("125000 을 Int 로")
}

// "결제,정기,VIP" 를 "결제 · 정기 · VIP" 로
fun tags(log: String): String {
    TODO("split 과 joinToString")
}

// memo 가 비었거나 공백뿐이면 "(없음)"
fun memo(log: String): String {
    TODO("isEmpty 가 아니다")
}

// raw string + 템플릿으로 아래 형태를 만든다 (들여쓰기 없이 6줄)
fun receipt(log: String): String {
    TODO("\"\"\" 와 trimIndent, 금액은 padStart(10, '.')")
}

fun main() {
    println(receipt(LOG))
    println("환율 ${'$'}1 = 1,380원")
    val blank = "   "
    println(blank.isEmpty())
    println(blank.isBlank())
}
```

```text expected
========================
주문 A-1042
금액 ....125000
태그 결제 · 정기 · VIP
메모 (없음)
========================
환율 $1 = 1,380원
false
true
```

```text hint
`substringAfter("orderId=")` 는 **구분자 뒤 전부**를 가져옵니다. 뒤쪽 `| amount=...` 까지 딸려오니 거기서 한 번 더 잘라야 하죠 — 이번엔 `substringBefore("|")`. 잘라낸 끝에는 공백이 남으니 `trim()` 으로 마무리합니다. `amount` 도 완전히 같은 모양이고 마지막에 `toInt()` 만 붙습니다.
---
`tags` 는 `split(",")` 로 `List<String>` 을 만든 뒤 `joinToString(" · ")` 로 다시 합칩니다. `memo` 는 로그의 맨 끝이라 `substringBefore` 가 필요 없고, **공백뿐인 값**이 관건입니다 — `isEmpty` 로는 안 걸리고 `isBlank` 로 걸립니다. 기본값을 주는 짝꿍 함수가 `ifBlank { }` 예요.
---
`receipt` 는 `"""` 안에 여섯 줄을 쓰고 `.trimIndent()` 를 붙이면 됩니다. 각 줄의 값은 `${...}` 로 끼워 넣고요. 구분선은 `"=".repeat(24)` 인데, 이건 식이므로 중괄호가 필요합니다 — `${"=".repeat(24)}`. 금액은 먼저 문자열로 만든 뒤(`toString()`) `padStart(10, '.')` 를 불러야 합니다. `Int` 에는 `padStart` 가 없으니까요.
---
뼈대는 이렇습니다.

`fun orderId(log: String): String = log.substringAfter("orderId=").___("|").trim()`

`fun tags(log: String): String = log.substringAfter("tags=").substringBefore("|").trim().split(",").___(" · ")`

`fun memo(log: String): String = log.substringAfter("memo=").trim().___ { "(없음)" }`

`receipt` 본문은 `= """` 로 시작해 `주문 ${orderId(log)}` 같은 줄들을 쓰고 `""".trimIndent()` 로 닫습니다.
```

```kotlin solution
const val LOG = "2026-09-21T10:33 | orderId=A-1042 | amount=125000 | tags=결제,정기,VIP | memo=   "

// substringAfter 로 뒤를, substringBefore 로 앞을 — indexOf 와 -1 검사가 통째로 사라진다.
fun orderId(log: String): String = log.substringAfter("orderId=").substringBefore("|").trim()

fun amount(log: String): Int = log.substringAfter("amount=").substringBefore("|").trim().toInt()

fun tags(log: String): String =
    log.substringAfter("tags=").substringBefore("|").trim().split(",").joinToString(" · ")

// 공백뿐인 입력은 isEmpty 로 안 걸린다. 검증은 거의 항상 isBlank 쪽이다.
fun memo(log: String): String = log.substringAfter("memo=").trim().ifBlank { "(없음)" }

// raw string 은 들여쓰기까지 문자열에 들어가므로 trimIndent() 가 필수다.
fun receipt(log: String): String = """
    ${"=".repeat(24)}
    주문 ${orderId(log)}
    금액 ${amount(log).toString().padStart(10, '.')}
    태그 ${tags(log)}
    메모 ${memo(log)}
    ${"=".repeat(24)}
""".trimIndent()

fun main() {
    println(receipt(LOG))
    println("환율 ${'$'}1 = 1,380원")
    val blank = "   "
    println(blank.isEmpty())
    println(blank.isBlank())
}
```
