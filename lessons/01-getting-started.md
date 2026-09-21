# Lesson 1 — Kotlin 시작 — 식(expression)의 언어

첫 레슨이니 가볍게 갑니다. 다만 여기서 한 가지는 확실히 가져가세요. **Kotlin이 Java와 갈라지는 가장 밑바닥 성질은 "거의 모든 것이 값을 낸다"는 것**입니다. `val`이니 `data class`니 코루틴이니 하는 건 그 위에 얹힌 것들이고요.

## 첫 파일 — 클래스가 없다

```kotlin
fun main() {
    println("hello")
}
```

이게 전부입니다. Java였다면 이랬죠.

```java
public class Main {
    public static void main(String[] args) {
        System.out.println("hello");
    }
}
```

차이를 하나씩 짚으면:

| Java | Kotlin |
|---|---|
| 모든 코드는 클래스 안에 | **최상위(top-level)** 에 함수·프로퍼티 선언 가능 |
| `public static void main(String[] args)` | `fun main()` — 인자 안 써도 됨 |
| `System.out.println` | `println` (kotlin.io 가 자동 임포트) |
| 세미콜론 필수 | **세미콜론 없음** (붙여도 되지만 붙이면 리뷰에서 지적받습니다) |
| `public` 명시 | 기본이 `public` |

최상위 선언이 왜 중요하냐면, **의미 없는 `XxxUtils` 클래스가 사라지기 때문**입니다. Java에서 `private StringUtils() {}` 로 생성자를 막아두던 그 유틸 클래스가, Kotlin에선 함수만 든 파일 하나로 끝납니다. (바이트코드에서는 `StringUtilsKt` 클래스가 자동 생성되므로 Java 쪽에서도 `StringUtilsKt.normalizePhone(...)` 으로 부를 수 있습니다.)

패키지와 임포트는 Java와 거의 같습니다. 다만 **디렉터리 구조와 패키지가 일치할 필요가 없고**(그래도 맞추세요, 안 맞추면 사람이 못 찾습니다), `import com.company.legacy.Order as LegacyOrder` 처럼 **별칭**을 줄 수 있습니다. 이름이 충돌하는 두 DTO를 다룰 때 씁니다.

## 본론 — 문(statement)과 식(expression)

프로그래밍 언어에서 이 둘의 차이는 딱 하나입니다.

> **식(expression)은 값을 낸다. 문(statement)은 내지 않는다.**

Java에서 `if`, `switch`, `try`는 전부 **문**이었습니다. 값을 못 내니까 이런 코드를 쓸 수밖에 없었죠.

```java
// Java — 선언 먼저, 값 채우기 나중
String grade;
if (score >= 90) {
    grade = "A";
} else {
    grade = "F";
}
```

`grade`를 `final`로 만들고 싶어도 못 만듭니다. 선언과 대입이 떨어져 있으니까요. 그래서 Java 개발자는 `score >= 90 ? "A" : "F"` 같은 삼항 연산자로 도망가고, 분기가 늘면 그게 또 지옥이 됩니다.

Kotlin에서는 `if` 자체가 **식**입니다.

```kotlin
val grade = if (score >= 90) "A" else "F"
```

그래서 **Kotlin에는 삼항 연산자(`? :`)가 아예 없습니다.** 문법에서 빠진 게 아니라 **필요가 없어서 안 넣은 것**입니다. `if`가 이미 그 일을 하니까요. 면접에서 "Kotlin에 삼항 연산자가 없는 이유"를 물으면 이렇게 답하면 됩니다.

분기가 여러 개여도 그대로 이어집니다.

```kotlin
val grade =
    if (score >= 90) "A"
    else if (score >= 80) "B"
    else "F"
```

> 주의: **`if`를 식으로 쓸 때는 `else`가 필수**입니다. `else`가 없으면 조건이 거짓일 때 내놓을 값이 없으니까요. 문으로 쓸 때(값을 안 받을 때)는 `else` 없어도 됩니다.

## `try`도 값을 낸다

```kotlin
val port: Int = try {
    System.getenv("PORT").toInt()
} catch (e: NumberFormatException) {
    8080
}
```

Java에서 이걸 하려면 `int port;` 를 먼저 선언하고 `try` 안팎에서 대입해야 했습니다. Kotlin은 `try` 블록의 마지막 표현식이 곧 값입니다. `catch` 블록도 마찬가지고요.

`when`도 식입니다만, 그건 Lesson 5에서 제대로 다룹니다. 지금은 **"Java에서 문이던 것들이 Kotlin에선 값을 낸다"** 는 사실만 붙잡으세요.

## 표현식 본문 함수

함수 몸통이 식 하나라면 중괄호와 `return`을 버릴 수 있습니다.

```kotlin
// 블록 본문 — Java 스타일
fun abs(n: Int): Int {
    return if (n < 0) -n else n
}

// 표현식 본문 — Kotlin 스타일
fun abs(n: Int): Int = if (n < 0) -n else n
```

반환 타입도 추론되므로 생략 가능합니다. 다만 **public API에는 반환 타입을 쓰세요.** 구현을 고치다 반환 타입이 조용히 바뀌면 호출부가 깨집니다. 리뷰에서 제가 실제로 가장 자주 다는 코멘트 중 하나입니다.

```kotlin
fun abs(n: Int) = if (n < 0) -n else n          // private 이면 OK
fun findUser(id: Long): User? = repo.find(id)   // public 이면 타입 명시
```

## `Unit` — `void`와 다르다

반환할 값이 없는 함수는 `Unit`을 반환합니다.

```kotlin
fun log(msg: String): Unit { println(msg) }
fun log(msg: String) { println(msg) }      // Unit 은 생략 가능
```

`void`와 결정적으로 다른 점: **`Unit`은 타입이자 값입니다.** 값이 딱 하나뿐인 타입이고, 그 값의 이름도 `Unit`입니다.

```kotlin
val x = println("hi")
println(x)          // kotlin.Unit — 진짜로 값이 하나 나온다
```

"값이 없다"를 표현하려고 **값이 하나뿐인 타입**을 만든 겁니다. 덕분에 제네릭에서 `void`의 예외 취급이 사라져요 — Java에서 `Callable<Void>` 를 쓰며 `return null;` 하던 그 어색함이, Kotlin에선 `() -> Unit` 이라는 평범한 함수 타입이 됩니다.

## REPL과 스크립트

문법을 확인하고 싶을 땐 터미널에서 `kotlinc` 만 치면 REPL이 뜹니다. 파일 하나로 스크립트를 쓰고 싶으면 확장자를 `.kts` 로 하면 되고요 — `fun main()` 없이 최상위에 바로 문장을 씁니다. Gradle의 `build.gradle.kts` 가 바로 그 스크립트입니다 (Lesson 38).

## 리뷰 관점

Java에서 넘어온 코드에서 제가 제일 먼저 보는 것들입니다.

- **줄 끝 세미콜론** — Java 습관. 지웁니다.
- **`var`를 선언하고 `if`로 채우는 코드** — `val x = if (...) ... else ...` 로 바꿉니다. `var`가 사라지면 그 변수는 이후 어디서도 안 바뀐다는 게 타입으로 보장됩니다.
- **한 줄짜리 함수인데 `{ return ... }`** — 표현식 본문으로.
- **함수만 든 `XxxUtils` 클래스** — 최상위 함수로 내립니다.

## 연습

아래 코드는 Java 습관을 그대로 옮긴 것입니다. `main` 은 건드리지 말고 **세 함수를 Kotlin답게** 고치세요.

세 가지를 모두 적용해야 합니다 — ① `return` 과 중괄호를 없애고 **표현식 본문**으로, ② 분기는 **`if` 식**으로, ③ `log` 의 반환 타입을 **명시해서 그 정체를 드러낼 것**.

```kotlin starter
// 클래스 없이 최상위에 바로 선언한다
val APP = "kotlin-lab"

fun abs2(n: Int): Int {
    // TODO: if 를 식으로 써서 표현식 본문 한 줄로
    if (n < 0) {
        return -n
    } else {
        return n
    }
}

fun fee(age: Int): Int {
    // TODO: return 세 개를 if 식 하나로
    if (age < 8) {
        return 0
    } else if (age < 20) {
        return 5000
    } else {
        return 9000
    }
}

fun log(message: String) {
    // TODO: 이 함수가 반환하는 타입은? 생략하지 말고 명시할 것
    println("[" + APP + "] " + message)
}

fun main() {
    log("start")
    println(abs2(-7))
    println(fee(5))
    println(fee(15))
    println(fee(40))
    val tag = if (fee(40) > 8000) "adult" else "child"
    println(tag)
    val r = log("done")
    println(r)
}
```

```text expected
[kotlin-lab] start
7
0
5000
9000
adult
[kotlin-lab] done
kotlin.Unit
```

```text hint
세 함수 모두 몸통이 결국 **값 하나**입니다. `abs2` 는 "`-n` 또는 `n`", `fee` 는 "0 또는 5000 또는 9000", `log` 는 "출력하고 나서 남는 것". 값 하나라면 `{ ... return ... }` 대신 `=` 뒤에 그 값을 바로 쓸 수 있습니다.
---
쓸 도구는 `if` 식 하나뿐입니다. Kotlin의 `if` 는 값을 내놓으므로 `= if (조건) A else B` 형태로 함수 몸통이 됩니다. `fee` 처럼 분기가 셋이면 `else` 자리에 `if` 를 한 번 더 이으면 됩니다. `log` 는 분기가 아니라 **반환 타입 이름**이 핵심입니다.
---
`if` 를 식으로 쓸 때는 **`else` 가 반드시 있어야** 합니다. 값을 못 내놓는 경우가 생기면 안 되니까요. 그리고 `println` 자체가 값을 내놓는 함수라는 점 — 그 값의 타입이 `Unit` 이고, `Unit` 은 `void` 와 달리 **값이 하나뿐인 진짜 타입**입니다. 그래서 `val r = log("done")` 이 컴파일되고, `println(r)` 이 뭔가를 출력할 수 있는 겁니다.
---
뼈대는 이렇습니다. 빈칸만 채우세요.

`fun abs2(n: Int): Int = if (n < 0) ___ else ___`

`fun fee(age: Int): Int = if (age < 8) 0 else if (___) 5000 else 9000`

`fun log(message: String): ___ = println("[" + APP + "] " + message)`
```

```kotlin solution
val APP = "kotlin-lab"

// if 가 식이라 삼항 연산자가 필요 없다. 몸통이 값 하나면 표현식 본문이 정답.
fun abs2(n: Int): Int = if (n < 0) -n else n

// 분기마다 return 하던 걸 if 식으로 이으면 함수 전체가 값 하나가 된다.
fun fee(age: Int): Int = if (age < 8) 0 else if (age < 20) 5000 else 9000

// void 가 아니라 Unit — 값이 하나뿐인 타입이라 val 로 받아 출력할 수 있다.
fun log(message: String): Unit = println("[" + APP + "] " + message)

fun main() {
    log("start")
    println(abs2(-7))
    println(fee(5))
    println(fee(15))
    println(fee(40))
    val tag = if (fee(40) > 8000) "adult" else "child"
    println(tag)
    val r = log("done")
    println(r)
}
```
