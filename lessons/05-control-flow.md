# Lesson 5 — 제어 흐름 — if 와 when

Java에서 `if`와 `switch`는 **문(statement)** 이었습니다. 값을 만들지 못하니까 변수를 먼저 선언해 놓고 나중에 채웠죠. Kotlin에서는 둘 다 **식(expression)** 입니다. 값을 내놓습니다.

이 차이 하나가 코드 모양을 통째로 바꿉니다. 이번 레슨이 이 커리큘럼에서 가장 자주 써먹게 될 기초입니다.

## if 가 값을 낸다

```java
// Java
String grade;
if (score >= 90) grade = "A";
else grade = "B";
```
```kotlin
// Kotlin
val grade = if (score >= 90) "A" else "B"
```

`var`가 `val`로 바뀐 게 핵심입니다. 선언과 값이 한 자리에서 만나니 "선언만 해 두고 나중에 채우는" 구간이 사라지고, 그 구간에서 생기던 버그도 같이 사라집니다.

**식으로 쓸 때는 `else`가 필수입니다.** `else`가 없으면 조건이 거짓일 때 내놓을 값이 없으니까요.

```kotlin
val x = if (flag) 1          // ❌ 컴파일 에러 — else 가 없다
if (flag) doSomething()      // ✅ 문으로 쓰면 else 불필요
```

### 블록의 마지막 식이 값이다

한 줄로 안 끝나면 중괄호를 쓰고, **블록의 마지막 식**이 그 가지의 값이 됩니다.

```kotlin
val fee = if (member) {
    val base = 10_000
    val discount = base / 10
    base - discount        // ← 이 줄이 값
} else {
    10_000
}
```

Java의 `return`처럼 명시하지 않습니다. 마지막 줄이 값이라는 규칙은 람다·`when`·`try`에도 똑같이 적용되니, 지금 확실히 익혀 두세요.

### 삼항 연산자가 없는 이유

Kotlin에는 `cond ? a : b`가 없습니다. **`if`가 이미 그 일을 하니까** 문법을 하나 더 둘 이유가 없었던 겁니다. `?:`(엘비스)는 삼항 연산자가 아니라 null 대체 연산자입니다(Lesson 8).

## when — switch의 상위 호환

### 인자 있는 when

```kotlin
when (code) {                         // code 는 Int
    200 -> "OK"
    301, 302 -> "리다이렉트"          // 콤마로 여러 값
    in 400..499 -> "클라이언트 오류"   // 범위
    !in 200..599 -> "규격 밖"         // 부정 범위
    else -> "알 수 없음"
}
```

가지는 **위에서 아래로** 검사되고 **처음 맞는 하나만** 실행됩니다. 아래 두 가지를 Java와 비교해 보세요.

- **fall-through가 없습니다.** Java도 `case x -> ...` 화살표 형태를 쓰면 흘러내리지 않지만, `case x:` 콜론 형태가 여전히 문법에 남아 있어 섞인 코드베이스에서는 `break` 누락 사고가 계속 납니다. Kotlin에는 흘러내릴 수 있는 형태가 **아예 없습니다.**
- **주어 타입과 조건에 제약이 없습니다.** Java 21은 패턴을 쓰면 임의의 참조 타입을 주어로 받습니다. 다만 **상수 라벨은 여전히 `int`·`String`·`enum` 계열뿐**이고, `long`·`double`·`boolean` 을 주어로 주면 `selector type long is not allowed` 로 막힙니다. `when`은 주어 타입도, 가지 조건도(`in 400..499`, `limit - 1`) 제한이 없습니다.

```kotlin
val limit = readLimit()
when (n) {
    limit -> "한도와 같음"          // 상수가 아니어도 된다
    limit - 1 -> "한도 직전"
    else -> "그 외"
}
```

### 타입 분기와 스마트 캐스트

`is` 가지 안에서는 **캐스팅 없이 그 타입으로 쓸 수 있습니다.**

```kotlin
fun describe(value: Any): String = when (value) {
    is Int -> "정수 제곱=${value * value}"      // value 는 여기서 Int
    is String -> "길이=${value.length}"         // 여기서는 String
    else -> "기타"
}
```

Java의 `if (o instanceof String) { String s = (String) o; ... }` 두 줄이 한 줄이 됩니다. 캐스트를 손으로 쓰지 않으니 검사한 타입과 캐스트한 타입이 어긋날 수도 없습니다.

### 인자 없는 when — if-else 체인의 대체재

`when` 뒤에 괄호를 아예 안 쓰면, **각 가지가 독립적인 Boolean 조건**이 됩니다.

```kotlin
val label = when {
    stars >= 4 && verified -> "추천"
    stars >= 4 -> "검증 안 된 고평점"
    stars == 3 -> "보통"
    else -> "비추천"
}
```

이게 `if / else if / else` 체인을 대체하는 형태입니다. 서로 다른 변수를 섞어 조건을 걸 수 있다는 게 인자 있는 형태와의 차이예요. **조건이 3갈래를 넘어가면 거의 항상 이 형태가 낫습니다** — 조건들이 세로로 정렬돼서 "무엇을 기준으로 나뉘는가"가 한눈에 보이거든요.

### 주어를 변수로 캡처하기

계산 결과로 분기하면서 그 값도 써야 할 때, 임시 변수를 밖에 두지 말고 `when` 안에서 선언하세요.

```kotlin
when (val port = raw.toIntOrNull()) {
    null -> "형식 오류"
    in 1..1023 -> "예약 포트 $port"
    else -> "사용 가능 $port"
}
```

`port`의 수명이 `when` 블록으로 **정확히 한정**됩니다. 밖에 `val port = ...`를 두면 그 아래 전체에서 계속 살아 있게 되죠. 스코프를 좁히는 건 공짜로 얻는 안전장치입니다.

여기서 `null ->` 가지를 지나면 컴파일러가 **`port`를 non-null로 좁혀 줍니다**(스마트 캐스트). `Int?`인데도 아래 가지에서 `in 1..1023`이 되는 이유입니다.

### 식이냐 문이냐 — else 규칙

| 쓰임 | else | 이유 |
|---|---|---|
| 식 (값을 받음) | **필수** | 어느 가지도 안 맞으면 내놓을 값이 없다 |
| 문 (값을 안 받음) | 선택 | 아무것도 안 하고 넘어가면 그만 |

```kotlin
val name = when (code) { 200 -> "OK"; else -> "기타" }   // 식 — else 필수
when (code) { 200 -> log("정상") }                        // 문 — else 없어도 된다
```

예외는 하나 있습니다. **분기 대상이 `enum`이나 `sealed` 타입이고 모든 경우를 나열했다면 `else` 없이도 식으로 쓸 수 있습니다.** 이게 Kotlin 타입 설계의 핵심 기법인데, Lesson 13·14에서 제대로 다룹니다. 지금은 아래 리뷰 관점만 기억해 두세요.

## Java 21 switch 와 대조 — 무엇이 여전히 우위인가

여기서 **낡은 지식을 그대로 말하면 면접에서 역지적당합니다.** JDK 21의 `switch`는 10년 전 그 `switch`가 아닙니다. 아래는 실제로 `javac --release 21` 로 컴파일·실행해 본 코드입니다.

```java
// Java 21 — 이게 전부 됩니다
static String describe(Object o) {
    return switch (o) {                                  // switch 식 — 값을 반환한다
        case Integer i when i > 10 -> "큰 정수 " + i;      // 타입 패턴 + 가드
        case Integer i -> "정수 " + i;
        case String s -> "길이 " + s.length();            // 캐스트 없이 s 를 쓴다
        case null -> "null";
        default -> "기타";
    };
}

sealed interface Shape permits Circle, Square {}          // Circle·Square 는 record
static String kind(Shape s) {
    return switch (s) {                                   // default 없이 완전성 검사 통과
        case Circle c -> "원";
        case Square q -> "사각형";
    };
}
```

값 반환, 타입 패턴, 가드, 패턴 바인딩(스마트 캐스트에 대응), sealed 완전성 검사 — **Java가 다 따라왔습니다.** 그러니 `when` 의 장점을 이 다섯 개로 설명하면 안 됩니다.

| | Java 21 `switch` | Kotlin `when` |
|---|---|---|
| 값 반환 | 가능 (`->` 식 형태, 블록이면 `yield`) | 가능 |
| 타입 패턴 + 바인딩 | `case String s ->` | `is String ->` (주어를 그대로 쓴다) |
| 가드 | `case Integer i when i > 10 ->` | 주어 없는 `when`, 또는 `is` 가지 안의 `if` |
| enum·sealed 완전성 | 강제 — `default` 없이 통과한다 | 강제 |
| fall-through | `->` 형태는 없음. `:` 형태는 **남아 있음** | 형태 자체가 없음 |
| 주어 타입 | 패턴이면 임의의 참조 타입. `long`·`double`·`boolean` 은 **불가** | 제한 없음 |
| 범위 가지 | 없음 — 가드로 `when i >= 400 && i <= 499` | `in 400..499`, `!in 200..599` |
| 주어 없는 형태 | 없음 (`if / else if` 로 내려간다) | `when { cond -> ... }` |
| 주어를 변수로 캡처 | 없음 | `when (val x = ...)` |
| 식이 기본인가 | 문이 기본 | 어느 쪽이든 자연스럽다 |

**그래서 남은 실제 우위는 이 다섯 개입니다.** 면접에서는 이것만 말하세요.

1. **주어 없는 `when { }`** — Java에 대응물이 없습니다. `if / else if` 체인으로 내려가야 하고, 그러면 조건의 세로 정렬이 깨집니다.
2. **`in`/범위 가지** — `in 400..499`, `!in 200..599`, `in listOf(...)`. Java는 가드 안에 부등식을 손으로 씁니다.
3. **식이 기본값** — Kotlin은 `val x = when ...` 이 첫 선택입니다. Java는 문이 기본이라 "식으로 쓸 수도 있다"에 머물고, 그래서 실무 코드에는 여전히 문 형태가 압도적으로 많습니다.
4. **fall-through 가 문법에 없음** — Java는 안전한 화살표 형태를 **골라야** 합니다. 고를 수 있다는 건 안 고를 수도 있다는 뜻이고, 리뷰에서 그걸 봐야 한다는 뜻입니다.
5. **`when (val x = ...)` 캡처** — 주어를 계산하면서 그 값을 가지 안에서 쓰고, 수명을 `when` 블록으로 한정합니다. Java는 밖에 변수를 선언해야 합니다.

## 리뷰에서 이렇게 지적한다

**1. `if / else if` 가 3갈래를 넘으면 `when`을 제안한다.**
체인이 길어지면 각 줄의 `else if (` 가 시각적 잡음이 됩니다. 인자 없는 `when`은 조건만 세로로 남아서 빠진 경우를 눈으로 찾을 수 있어요.

**2. 습관적으로 붙인 `else` 를 의심한다.**
`when`에 `else -> throw IllegalStateException()` 같은 게 달려 있으면 물어보세요. 분기 대상이 enum이나 sealed라면, `else`를 지우는 순간 **"새 케이스가 추가됐는데 처리 안 함"을 컴파일러가 잡아 줍니다.** `else`를 달아 두면 그 검사를 스스로 꺼 버리고 런타임까지 미루는 겁니다. 이건 Lesson 14의 핵심 주제라 지금부터 눈에 익혀 두면 좋습니다.

**3. `when` 가지 안에 로직이 길게 들어가면 함수로 뽑는다.**
가지 하나가 10줄이 넘어가면 `when`이 주는 "한눈에 보이는 분기표" 효과가 사라집니다.

## 연습

`when`의 네 가지 형태를 각각 한 번씩 씁니다. 네 함수 모두 **`if / else if` 체인 없이** 작성하세요 (`describe`의 Boolean 가지에서만 `if` 식을 씁니다).

```kotlin starter
// 1) 인자 있는 when — 상수, 콤마, 범위
fun statusText(code: Int): String {
    // TODO: 200 -> "OK", 301·302 -> "리다이렉트",
    //       400~499 -> "클라이언트 오류", 500~599 -> "서버 오류", 그 외 -> "알 수 없음"
    TODO()
}

// 2) 타입 분기 + 스마트 캐스트
fun describe(value: Any): String {
    // TODO: Int -> "정수 제곱=<제곱값>", String -> "길이=<길이>",
    //       Boolean -> true 면 "참" false 면 "거짓" (여기서만 if 식 사용), 그 외 -> "기타"
    TODO()
}

// 3) 주어 캡처 — when (val x = ...)
fun parsePort(raw: String): String {
    // TODO: raw.toIntOrNull() 결과를 port 로 캡처해서
    //       null -> "형식 오류", 1~1023 -> "예약 포트 <port>",
    //       1024~65535 -> "사용 가능 <port>", 그 외 -> "범위 밖 <port>"
    TODO()
}

// 4) 인자 없는 when — 서로 다른 변수를 섞은 조건
fun review(stars: Int, verified: Boolean): String {
    // TODO: 검증 안 됐는데 별 4개 이상 -> "검증 안 된 고평점", 별 4개 이상 -> "추천",
    //       별 3개 -> "보통", 그 외 -> "비추천"
    TODO()
}

fun main() {
    println(statusText(200))
    println(statusText(302))
    println(statusText(404))
    println(statusText(503))
    println(statusText(100))

    println(describe(7))
    println(describe("kotlin"))
    println(describe(true))
    println(describe(3.14))

    println(parsePort("abc"))
    println(parsePort("80"))
    println(parsePort("8080"))
    println(parsePort("70000"))

    println(review(5, true))
    println(review(5, false))
    println(review(3, true))
    println(review(1, true))
}
```

```text expected
OK
리다이렉트
클라이언트 오류
서버 오류
알 수 없음
정수 제곱=49
길이=6
참
기타
형식 오류
예약 포트 80
사용 가능 8080
범위 밖 70000
추천
검증 안 된 고평점
보통
비추천
```

```text hint
네 함수 모두 몸통이 `when` 하나뿐이라 **표현식 본문**(`fun f(...): T = when ...`)으로 쓸 수 있습니다. `TODO()` 와 중괄호를 통째로 지우고 `= when` 으로 시작한다고 생각하세요. 그리고 네 개가 각각 **다른 형태**입니다 — 괄호에 값을 주는 형태(1·2·3)와 괄호가 아예 없는 형태(4).
---
형태별로 쓸 도구입니다. 1번은 콤마(`301, 302 ->`)와 범위(`in 400..499 ->`). 2번은 타입 검사(`is Int ->`) — 가지 안에서는 캐스트 없이 바로 `value * value`, `value.length` 를 부를 수 있습니다. 3번은 `when (val port = raw.toIntOrNull())`. 4번은 괄호 없이 `when { 조건 -> 값 }`.
---
순서가 의미를 갖습니다. 가지는 위에서 아래로 검사되고 **처음 맞는 하나만** 실행돼요. 4번에서 "검증 안 된 고평점"을 "추천"보다 **아래**에 두면 영원히 도달하지 못합니다 — 별 4개 이상이면 위쪽 `stars >= 4` 가 먼저 잡아채니까요. 3번의 함정은 `toIntOrNull()` 이 `Int?` 를 준다는 것인데, `null ->` 가지를 먼저 두면 그 아래에서는 컴파일러가 non-null 로 좁혀 줍니다. 문자열 안에 값을 넣을 때는 `"예약 포트 $port"`.
---
뼈대는 이렇습니다.

1번: `fun statusText(code: Int): String = when (code) { 200 -> "OK"; 301, 302 -> "리다이렉트"; ___ -> "클라이언트 오류"; ... ; else -> "알 수 없음" }` (실제로는 줄바꿈해서 쓰세요)

2번: `is Int -> "정수 제곱=${___}"`, `is Boolean -> if (value) "참" else "거짓"`

3번: `when (val port = ___) { null -> "형식 오류"; in 1..1023 -> ___; ... }`

4번: `when { !verified && stars >= 4 -> ___; stars >= 4 -> "추천"; ___ -> "보통"; else -> "비추천" }`
```

```kotlin solution
// 콤마로 여러 값을, in 으로 범위를 한 가지에 묶는다. 순서대로 검사되므로 구체적인 것부터.
fun statusText(code: Int): String = when (code) {
    200 -> "OK"
    301, 302 -> "리다이렉트"
    in 400..499 -> "클라이언트 오류"
    in 500..599 -> "서버 오류"
    else -> "알 수 없음"
}

// is 가지 안에서는 캐스트 없이 해당 타입으로 쓸 수 있다 (스마트 캐스트).
fun describe(value: Any): String = when (value) {
    is Int -> "정수 제곱=${value * value}"
    is String -> "길이=${value.length}"
    is Boolean -> if (value) "참" else "거짓"
    else -> "기타"
}

// 주어를 when 안에서 선언하면 port 의 수명이 이 블록으로 한정된다.
// null 가지를 지나면 컴파일러가 port 를 Int 로 좁혀 주므로 아래에서 범위 검사가 된다.
fun parsePort(raw: String): String = when (val port = raw.toIntOrNull()) {
    null -> "형식 오류"
    in 1..1023 -> "예약 포트 $port"
    in 1024..65535 -> "사용 가능 $port"
    else -> "범위 밖 $port"
}

// 괄호 없는 when — 서로 다른 변수를 섞은 조건을 세로로 정렬한다. 좁은 조건이 위.
fun review(stars: Int, verified: Boolean): String = when {
    !verified && stars >= 4 -> "검증 안 된 고평점"
    stars >= 4 -> "추천"
    stars == 3 -> "보통"
    else -> "비추천"
}

fun main() {
    println(statusText(200))
    println(statusText(302))
    println(statusText(404))
    println(statusText(503))
    println(statusText(100))

    println(describe(7))
    println(describe("kotlin"))
    println(describe(true))
    println(describe(3.14))

    println(parsePort("abc"))
    println(parsePort("80"))
    println(parsePort("8080"))
    println(parsePort("70000"))

    println(review(5, true))
    println(review(5, false))
    println(review(3, true))
    println(review(1, true))
}
```
