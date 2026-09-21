# Lesson 30 — 코드 품질 — 컨벤션, ktlint, detekt, 리뷰 체크리스트

Lesson 29에서 "Java 잔재를 알아보는 눈"을 만들었습니다. 그런데 리뷰어가 그걸 **손으로 다 잡으면 안 됩니다.**

좋은 팀의 코드 리뷰에는 공백·네이밍·import 순서 얘기가 **한 줄도 없습니다.** 그건 이미 도구가 잡았기 때문이에요. 사람은 도구가 못 보는 것 — **설계, 경계, 실패 경로** — 만 봅니다. 이 레슨은 그 분업을 세팅하는 법입니다.

> 면접 질문: "코드 리뷰에서 주로 뭘 보세요?" 여기서 "네이밍이랑 컨벤션요"라고 답하면 5년차 점수가 안 나옵니다. **"컨벤션은 ktlint/detekt로 CI에서 막고, 리뷰에서는 ○○을 봅니다"** 가 정답 라인입니다.

## 공식 코딩 컨벤션

JetBrains가 [공식 컨벤션](https://kotlinlang.org/docs/coding-conventions.html)을 문서로 못 박아뒀습니다. Java의 구글/오라클 스타일 논쟁 같은 게 없어요. **그냥 공식을 따르면 됩니다.**

### 네이밍

| 대상 | 규칙 | 예 |
|---|---|---|
| 패키지 | 전부 소문자, 언더스코어 없음 | `com.acme.order.domain` |
| 클래스·인터페이스 | PascalCase, 명사 | `OrderService`, `Payable` |
| 함수 | camelCase, 동사로 시작 | `findById`, `isExpired` |
| 프로퍼티 | camelCase | `totalAmount` |
| 상수 (`const val`, 최상위 `val`) | SCREAMING_SNAKE_CASE | `MAX_RETRY` |
| 백킹 프로퍼티 | 밑줄 접두사 | `_items` / `items` |
| 테스트 함수 | 백틱으로 한글 문장 허용 | ``fun `만료된 쿠폰은 적용되지 않는다`()`` |

백틱 네이밍은 **테스트에서만** 쓰세요. 프로덕션 코드에 백틱 이름을 쓰면 Java 호출부에서 깨집니다.

### 포맷팅 — 기억할 건 몇 개 안 됩니다

- 들여쓰기 **스페이스 4칸**, 탭 금지
- 줄 길이 제한은 공식 문서에 없지만 팀에서 **120자**로 정하는 게 일반적 (ktlint 기본값)
- `{` 는 같은 줄 끝에, `}` 는 새 줄에
- **후행 람다(trailing lambda)**: 마지막 파라미터가 함수 타입이면 괄호 밖으로 뺀다
  ```kotlin
  items.filter({ it.paid })   // ✗
  items.filter { it.paid }    // ✓  — 괄호가 비면 괄호까지 생략
  ```
- 파라미터가 많아 줄이 넘치면 **전부 한 줄씩**. 두세 개만 접지 않는다
- `import` 와일드카드(`*`) 금지 — IDE가 자동으로 접으려 하니 설정에서 꺼두세요

### 표현식 본문(expression body)은 언제 쓰나

```kotlin
fun total(o: Order): Int = o.price * o.count          // ✓ 한 표현식
fun report(o: Order): String {                        // ✓ 본문이 여러 단계면 블록
    val lines = o.items.map { it.name }
    return lines.joinToString()
}
```

기준은 **"한 표현식인가"** 이지 "짧은가"가 아닙니다. 그리고 **공개(public) 함수는 반환 타입을 생략하지 마세요.** 표현식 본문에서 타입을 생략하면 구현을 바꿨을 때 공개 API 시그니처가 **조용히 바뀝니다.**

## ktlint vs detekt — 역할이 다릅니다

둘 다 쓰는 게 표준입니다. 겹치는 게 아니라 **층이 다릅니다.**

| | **ktlint** | **detekt** |
|---|---|---|
| 보는 것 | 형식 (공백, 줄바꿈, import 순서, 네이밍) | 의미 (복잡도, 버그 냄새, 잠재 위험) |
| 비유 | 맞춤법 검사기 | 논리 검토 |
| 자동 수정 | **가능** (`--format`) | 대부분 불가 (사람이 판단) |
| 규칙 커스터마이즈 | 제한적 (공식 스타일 고정이 장점) | `detekt.yml` 로 전면 조정 |
| 대표 지적 | "import 정렬 안 됨" | "이 함수 60줄인데 쪼개세요" |

**순서가 중요합니다.** ktlint로 형식을 먼저 통일해야 diff가 깨끗해지고, 그래야 detekt와 사람이 **의미 변화만** 볼 수 있습니다.

### Gradle 연동 개요

Gradle 자체는 Lesson 38~41에서 다루지만, 모양만 봐두세요.

```kotlin
// build.gradle.kts
plugins {
    id("org.jlleitschuh.gradle.ktlint") version "12.1.1"
    id("io.gitlab.arturbosch.detekt") version "1.23.6"
}

detekt {
    config.setFrom("$rootDir/config/detekt.yml")
    buildUponDefaultConfig = true   // 기본 규칙 위에 우리 설정을 덮어쓴다
}
```

- 로컬: `./gradlew ktlintFormat` (고쳐줌) → `./gradlew detekt` (보고만)
- CI: `./gradlew ktlintCheck detekt` 를 **`test` 앞에** 둡니다. 형식 위반은 테스트 돌리기 전에 떨어뜨리는 게 빠릅니다
- **게이트로 걸 때 주의**: 레거시 코드에 detekt를 처음 켜면 위반이 수천 건 나옵니다. `detektBaseline` 으로 기존 위반을 **베이스라인에 동결**하고, 새 코드만 막으세요. 이거 모르고 켰다가 롤백하는 팀이 정말 많습니다

## detekt가 잡아주는 대표 규칙

| 규칙 | 의미 | 왜 위험한가 |
|---|---|---|
| `LongMethod` | 함수가 기준 줄 수 초과 | 책임이 여러 개라는 신호. 테스트가 어려워짐 |
| `LongParameterList` | 파라미터 과다 | 인자 순서 실수. 값 객체로 묶으라는 신호 |
| `ComplexCondition` | `&&`/`||` 가 뒤엉킨 조건 | 읽는 사람마다 해석이 달라짐. 이름 붙인 `val` 로 빼라 |
| `CyclomaticComplexMethod` | 분기 경로 과다 | 테스트 케이스 수가 폭발 |
| `TooGenericExceptionCaught` | `catch (e: Exception)` | 잡을 생각 없던 예외까지 삼킨다 |
| `SwallowedException` | catch 블록이 비었거나 원인을 안 넘김 | 장애 원인이 로그에서 사라진다 |
| `MagicNumber` | 의미 없는 숫자 리터럴 | `86400` 이 뭔지 6개월 뒤엔 아무도 모름 |
| `ReturnCount` | return 지점 과다 | 흐름 추적 난이도 |
| `UnusedPrivateMember` | 죽은 코드 | 리팩터링 누락의 흔적 |

이 중 실무에서 **진짜 장애로 이어지는 건 `TooGenericExceptionCaught` 와 `SwallowedException`** 입니다. 나머지는 가독성 문제지만 이 둘은 **원인 규명 자체를 불가능하게** 만들어요.

## API 설계 원칙 — 도구가 못 잡는 영역

여기부터가 사람이 볼 몫입니다.

**1. 공개 표면을 최소화한다.** Kotlin 기본 가시성은 `public` 입니다. 모듈 밖에서 쓸 게 아니면 `internal`, 클래스 밖에서 안 쓰면 `private`. 공개한 건 되돌리기 어렵습니다.

**2. 불변을 기본값으로.** `val` 우선, `data class` 는 `copy` 로 변경. 가변 상태는 동시성 사고의 씨앗입니다.

**3. 가변 컬렉션을 반환하지 않는다.**
```kotlin
fun items(): MutableList<Item>   // ✗ 호출자가 내부를 고칠 수 있다
fun items(): List<Item>          // ✓
```

**4. nullable을 타입으로 표현한다.** "없음"을 `-1`, `""`, `Int.MIN_VALUE` 같은 **매직 값으로 표현하지 마세요.** `null` 이나 sealed 결과 타입을 쓰세요 (Lesson 14).

**5. 함수 인자는 3~4개까지.** 넘으면 값 객체로 묶습니다. `Boolean` 파라미터 두 개 이상이면 호출부에서 `f(true, false)` 가 되어 아무도 못 읽습니다 — 이름 붙인 인자를 강제하거나 enum으로 바꾸세요.

**6. 예외는 복구 가능한 것만.** 호출자가 아무것도 할 수 없는 상황이면 예외 대신 실패를 **타입에 담아** 반환하는 쪽이 낫습니다.

## 코드 리뷰 체크리스트

이 레슨의 산출물입니다. 그대로 팀 위키에 붙여 쓰세요.

| 영역 | 확인할 것 | 보이면 할 말 |
|---|---|---|
| **null** | `!!` 가 있는가 / 플랫폼 타입을 타입 명시 없이 받았는가 | "이 값이 정말 null일 수 있나요? 타입 설계부터 봅시다" |
| **분기 완전성** | sealed·enum `when` 에 `else` 가 붙었는가 | "`else` 를 빼면 상태 추가 때 컴파일러가 잡아줍니다" |
| **컬렉션** | 수동 루프+`var` 누적 / `filter{}.size` / 큰 리스트에 체인 다단 | "`sumOf`·`count`·`groupBy` 로 대체됩니다" |
| **가시성·불변성** | `public` 이 기본값으로 방치됐는가 / `var` 프로퍼티 / 가변 컬렉션 반환 | "여긴 `internal` 로 좁히고 반환 타입을 `List` 로 바꾸죠" |
| **예외** | `catch (e: Exception)` / 빈 catch / 원인 예외 미전달 | "잡을 예외를 좁히고, 삼킬 거면 왜 삼키는지 주석을 남겨주세요" |
| **코루틴** | `runBlocking` 이 프로덕션 코드에 / `GlobalScope` / 디스패처 하드코딩 / `CancellationException` 을 catch | "스코프 주인이 누구죠? 디스패처는 생성자로 주입합시다" (Lesson 31·32·36) |
| **성능** | N+1 쿼리 / 루프 안 I/O / 불필요한 중간 컬렉션 | "여기 `asSequence()` 로 바꾸거나 쿼리를 한 번에 가져오죠" |
| **테스트** | 실패 경로 테스트가 있는가 / 테스트가 구현 세부에 결합됐는가 | "성공 케이스만 있네요. null·빈 목록·예외 경로도 필요합니다" |

체크리스트를 위에서부터 순서대로 보는 게 중요합니다. **null → 분기 → 예외** 가 장애 빈도 순이에요.

## 연습

도구를 쓸 수 없는 환경이니 **직접 만들어 봅니다.** detekt의 핵심 구조는 사실 단순합니다 — `규칙 = (이름, 메시지, 판정 함수)` 목록을 소스의 각 줄에 돌리고 위반을 모으는 것.

아래 `source` 에 대해 **7개 규칙**을 구현하고 보고서를 출력하세요.

| 규칙 이름 | 판정 |
|---|---|
| `ClassNaming` | 줄이 `class` + 소문자로 시작하는 이름 |
| `MagicNumber` | 두 자리 이상 숫자 리터럴 |
| `MaxLineLength` | 줄 길이가 `MAX_LINE`(90) 초과 |
| `NotNullAssertion` | `!!` 포함 |
| `PreferVal` | 줄이 `var ` 로 시작 |
| `SwallowedException` | `catch (...) { }` — 본문이 빈 catch |
| `TooGenericExceptionCaught` | `catch (e: Exception)` 또는 `Throwable` |

출력은 **줄 번호 → 규칙 이름** 순으로 정렬합니다. 규칙별 집계도 **규칙 이름 오름차순**으로요. (정렬이 없으면 출력이 실행마다 달라질 수 있습니다 — 이것도 리뷰 포인트입니다.)

```kotlin starter
const val MAX_LINE = 90

val source = """
    class orderService {
        var cache: MutableMap<String, Int> = mutableMapOf()

        fun process(id: String): Int {
            val user = findUser(id)!!
            val label = if (user.grade == "VIP") "우수회원" else if (user.grade == "GOLD") "골드회원" else "일반회원"
            try {
                return user.point * 86400
            } catch (e: Exception) { }
        }
    }
""".trimIndent()

data class Violation(val line: Int, val rule: String, val message: String)

class Rule(val name: String, val message: String, val check: (String) -> Boolean)

// TODO: 규칙 7개를 이름 오름차순으로 정의한다
val rules: List<Rule> = TODO()

// TODO: 각 줄에 모든 규칙을 적용하고 (줄 번호, 규칙 이름) 순으로 정렬해 반환
fun analyze(src: String): List<Violation> = TODO()

fun main() {
    val violations = analyze(source)
    println("=== 간이 정적 분석 ===")
    violations.forEach { println("L${it.line}".padEnd(5) + it.rule.padEnd(28) + it.message) }
    println("--- 규칙별 집계 ---")
    violations.groupingBy { it.rule }.eachCount().toSortedMap()
        .forEach { (rule, n) -> println("$rule = $n") }
    println("총 ${violations.size}건 / 검사 규칙 ${rules.size}개")
}
```

```text expected
=== 간이 정적 분석 ===
L1   ClassNaming                 클래스 이름은 PascalCase 로 쓰세요
L2   PreferVal                   var 대신 val 을 먼저 고려하세요
L5   NotNullAssertion            !! 는 설계 문제 신호입니다
L6   MaxLineLength               한 줄이 90 자를 넘습니다
L8   MagicNumber                 매직 넘버는 이름 있는 상수로 빼세요
L9   SwallowedException          예외를 삼키지 마세요
L9   TooGenericExceptionCaught   Exception 을 통째로 잡지 마세요
--- 규칙별 집계 ---
ClassNaming = 1
MagicNumber = 1
MaxLineLength = 1
NotNullAssertion = 1
PreferVal = 1
SwallowedException = 1
TooGenericExceptionCaught = 1
총 7건 / 검사 규칙 7개
```

```text hint
구조부터 잡으세요. `Rule` 의 마지막 파라미터가 `(String) -> Boolean` 이므로 **후행 람다**로 쓸 수 있습니다 — `Rule("이름", "메시지") { 줄 -> 판정 }`. 그러면 `rules` 는 그냥 `listOf(...)` 일곱 줄이 됩니다. 검사기는 규칙을 **데이터로 다루는 게** 핵심이에요. if-else 체인으로 짜면 규칙 추가가 코드 수정이 되지만, 목록이면 항목 추가로 끝납니다.
---
판정은 대부분 정규식입니다. `Regex("""...""").containsMatchIn(줄)` 을 쓰세요 — 원시 문자열(`"""`) 안에서는 역슬래시를 이스케이프하지 않아도 됩니다. 필요한 패턴은 `^\s*class\s+[a-z]`, `\b\d{2,}\b`, `^\s*var\s`, `catch\s*\([^)]*\)\s*\{\s*\}`, `catch\s*\(\s*\w+\s*:\s*(Exception|Throwable)\s*\)` 다섯 개. `NotNullAssertion` 은 `it.contains("!!")`, `MaxLineLength` 는 `it.length > MAX_LINE` 로 정규식이 필요 없습니다.
---
`analyze` 는 "줄마다 × 규칙마다"라 결과가 **줄당 0개 이상**입니다. `flatMapIndexed { idx, line -> ... }` 를 쓰면 인덱스와 평탄화를 한 번에 해결해요 (줄 번호는 `idx + 1`). 안쪽은 `rules.filter { it.check(line) }.map { Violation(...) }`. 마지막 정렬은 기준이 두 개이므로 `sortedWith(compareBy({ it.line }, { it.rule }))` 입니다 — `sortedBy` 는 기준 하나만 받습니다. 정렬을 빼먹으면 L9의 두 규칙 순서가 규칙 정의 순서에 끌려다니게 됩니다.
---
뼈대입니다. 빈칸만 채우면 돼요.

`val rules = listOf(Rule("ClassNaming", "클래스 이름은 PascalCase 로 쓰세요") { Regex("""^\s*class\s+[a-z]""").___(it) }, ... )`

`Rule("MaxLineLength", "한 줄이 ${'$'}MAX_LINE 자를 넘습니다") { it.___ > MAX_LINE }`

`fun analyze(src: String) = src.lines().___ { idx, line -> rules.filter { r -> r.check(line) }.map { r -> Violation(idx + 1, r.name, r.message) } }.sortedWith(___({ it.line }, { it.rule }))`
```

```kotlin solution
const val MAX_LINE = 90

val source = """
    class orderService {
        var cache: MutableMap<String, Int> = mutableMapOf()

        fun process(id: String): Int {
            val user = findUser(id)!!
            val label = if (user.grade == "VIP") "우수회원" else if (user.grade == "GOLD") "골드회원" else "일반회원"
            try {
                return user.point * 86400
            } catch (e: Exception) { }
        }
    }
""".trimIndent()

data class Violation(val line: Int, val rule: String, val message: String)

class Rule(val name: String, val message: String, val check: (String) -> Boolean)

// 규칙을 if-else 체인이 아니라 '데이터 목록'으로 둔다 — 규칙 추가가 항목 추가로 끝난다.
val rules: List<Rule> = listOf(
    Rule("ClassNaming", "클래스 이름은 PascalCase 로 쓰세요") {
        Regex("""^\s*class\s+[a-z]""").containsMatchIn(it)
    },
    Rule("MagicNumber", "매직 넘버는 이름 있는 상수로 빼세요") {
        Regex("""\b\d{2,}\b""").containsMatchIn(it)
    },
    Rule("MaxLineLength", "한 줄이 $MAX_LINE 자를 넘습니다") {
        it.length > MAX_LINE
    },
    Rule("NotNullAssertion", "!! 는 설계 문제 신호입니다") {
        it.contains("!!")
    },
    Rule("PreferVal", "var 대신 val 을 먼저 고려하세요") {
        Regex("""^\s*var\s""").containsMatchIn(it)
    },
    Rule("SwallowedException", "예외를 삼키지 마세요") {
        Regex("""catch\s*\([^)]*\)\s*\{\s*\}""").containsMatchIn(it)
    },
    Rule("TooGenericExceptionCaught", "Exception 을 통째로 잡지 마세요") {
        Regex("""catch\s*\(\s*\w+\s*:\s*(Exception|Throwable)\s*\)""").containsMatchIn(it)
    },
)

// 정렬이 있어야 출력이 결정적이다 — 보고서는 항상 같은 순서여야 diff 가 의미를 가진다.
fun analyze(src: String): List<Violation> =
    src.lines()
        .flatMapIndexed { idx, line ->
            rules.filter { rule -> rule.check(line) }
                .map { rule -> Violation(idx + 1, rule.name, rule.message) }
        }
        .sortedWith(compareBy({ it.line }, { it.rule }))

fun main() {
    val violations = analyze(source)
    println("=== 간이 정적 분석 ===")
    violations.forEach { println("L${it.line}".padEnd(5) + it.rule.padEnd(28) + it.message) }
    println("--- 규칙별 집계 ---")
    violations.groupingBy { it.rule }.eachCount().toSortedMap()
        .forEach { (rule, n) -> println("$rule = $n") }
    println("총 ${violations.size}건 / 검사 규칙 ${rules.size}개")
}
```
