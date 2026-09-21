# Lesson 26 — 예외 — try 가 식이다

Java에서 예외는 **문(statement)** 이었습니다. `try`는 값을 만들지 않고, 값을 밖으로 빼내려면 `try` 바깥에 변수를 미리 선언해야 했죠. Kotlin은 이걸 뒤집습니다. 그리고 그보다 훨씬 큰 결정을 하나 더 했습니다 — **checked exception을 없앴습니다.**

## try 가 값을 만든다

Java에서 익숙한 모양입니다.

```java
int port;                              // 먼저 선언
try {
    port = Integer.parseInt(raw);      // 그 다음 대입
} catch (NumberFormatException e) {
    port = 8080;
}
```

`port`를 `final`로 못 만듭니다. 선언과 초기화가 갈라졌으니까요. Kotlin에서는:

```kotlin
val port = try {
    raw.toInt()
} catch (e: NumberFormatException) {
    8080
}
```

`try`가 식(expression)이라 **블록의 마지막 값이 곧 결과**입니다. `val`로 잡히고, 타입 추론도 됩니다. `if`·`when`이 식인 것과 완전히 같은 원리예요 (Lesson 5).

주의할 점 하나. **`finally` 블록의 값은 결과에 영향을 주지 않습니다.**

```kotlin
val x = try { 1 } finally { 2 }   // x == 1
```

`finally`는 정리(cleanup) 전용입니다. Java에서 `finally` 안의 `return`이 예외를 삼켜버리는 고전 버그가 있었는데, Kotlin도 `finally`에서 `return`하면 똑같이 삼킵니다. **`finally`에서는 절대 return하지 마세요.**

## checked exception 이 없다

Kotlin에는 `throws`가 없습니다. 어떤 예외든 선언 없이 던질 수 있고, 컴파일러는 잡으라고 강요하지 않습니다.

왜 없앴을까요? Java 설계자들도 나중에 인정했듯, checked exception은 **실무에서 두 가지 안티패턴으로만 귀결**됐기 때문입니다.

```java
try {
    doSomething();
} catch (IOException e) {
    // 1) 그냥 삼킨다
}

// 2) 혹은 throws Exception 으로 상향 전파해서 의미를 없앤다
public void handle() throws Exception { ... }
```

거기에 람다와 궁합이 최악입니다. `Stream.map()` 안에서 checked exception을 던지면 컴파일이 안 되죠. 함수형 스타일을 밀면서 checked exception을 유지하는 건 모순이었습니다.

**하지만 대가가 있습니다.** 컴파일러가 더 이상 "이 함수는 실패할 수 있다"고 알려주지 않습니다. 그 정보를 이제 **직접 표현해야** 합니다.

- 타입으로: 실패 가능성을 `T?`, `Result<T>`, sealed 결과 타입으로 드러낸다 (Lesson 27)
- 문서로: KDoc `@throws`로 명시한다
- 이름으로: `getOrNull` vs `get`, `toInt` vs `toIntOrNull` — **표준 라이브러리의 작명 규칙을 따르세요.** `OrNull` 접미사는 "이건 안 던진다"는 계약입니다

> 면접에서 "Kotlin에 checked exception이 없는데 안전성은 어떻게 확보하나요?"는 단골 질문입니다. 답은 "타입으로 끌어올린다"입니다.

### Java 에서 호출할 때 — `@Throws`

Kotlin 함수를 Java에서 호출하면, Java 쪽 컴파일러는 그 함수가 뭘 던지는지 모릅니다. 그래서 Java에서 `catch (IOException e)`를 쓰면 **"도달할 수 없는 catch"** 컴파일 에러가 납니다.

```kotlin
@Throws(java.io.IOException::class)
fun readConfig(path: String): String { ... }
```

`@Throws`는 바이트코드에 `throws` 절을 찍어줍니다. **Java와 섞여 있는 레거시 프로젝트라면 공개 API에 이걸 빠뜨리지 마세요.**

## `use { }` — try-with-resources 의 자리

Java 7의 try-with-resources를 Kotlin은 **문법이 아니라 확장 함수**로 해결했습니다.

```kotlin
// Closeable / AutoCloseable 에 붙은 stdlib 확장 함수
val text = java.io.File("a.txt").bufferedReader().use { it.readText() }
```

`use`는 블록이 정상 종료하든 예외로 터지든 `close()`를 호출하고, **블록의 값을 반환하는 식**입니다. 게다가 블록에서 예외가 나고 `close()`에서도 예외가 나면, `close()` 쪽을 `addSuppressed`로 붙여줍니다 — try-with-resources와 동일한 의미론이에요.

새 문법을 안 만들고 인라인 함수로 끝냈다는 게 포인트입니다. 이런 게 Kotlin이 "문법을 늘리지 않고 라이브러리로 푼다"는 철학의 예입니다.

## `Nothing` 과 throw 가 식이라는 것

`throw`는 Kotlin에서 **식**이고, 타입은 `Nothing`입니다. `Nothing`은 **값이 하나도 없는 타입** — 즉 "정상적으로 반환되지 않는다"는 뜻이고, 모든 타입의 하위 타입입니다.

그래서 이게 됩니다:

```kotlin
val user = repo.find(id) ?: throw NotFoundException("user: $id")
val port = config["port"]?.toIntOrNull() ?: error("port 설정이 잘못됨")
```

`?:`의 오른쪽에는 왼쪽과 같은 타입이 와야 하는데, `Nothing`은 모든 타입의 하위 타입이라 **어디든 들어갑니다.** `return`, `break`, `continue`도 같은 이유로 `?:` 오른쪽에 올 수 있습니다.

`when`에서도 마찬가지입니다.

```kotlin
val rate = when (grade) {
    "A" -> 0.1
    "B" -> 0.05
    else -> throw IllegalArgumentException("unknown grade: $grade")
}
```

반환 타입을 `Nothing`으로 선언하면 컴파일러가 **그 뒤 코드를 도달 불가로 인식**합니다.

```kotlin
fun fail(msg: String): Nothing = throw IllegalStateException(msg)

fun f(x: String?): Int {
    val v = x ?: fail("x is null")
    return v.length        // v 는 String 으로 스마트 캐스트됨
}
```

## 예외 계층과 커스텀 예외

Kotlin의 `Throwable` 아래 `Error`와 `Exception`이 있고, 그 아래 `RuntimeException`이 있는 구조는 Java와 같습니다. 다만 **전부 unchecked처럼 다뤄집니다.**

커스텀 예외는 그냥 클래스입니다.

```kotlin
sealed class OrderException(message: String, cause: Throwable? = null) :
    RuntimeException(message, cause)

class OrderNotFound(val orderId: Long) : OrderException("order not found: $orderId")
class PaymentDeclined(val reason: String) : OrderException("payment declined: $reason")
```

두 가지만 지키세요.

1. **`cause`를 버리지 마세요.** `catch (e: SQLException) { throw MyException("실패") }` 는 원인을 통째로 날립니다. `throw MyException("실패", e)`로 연결하세요.
2. **예외에 필드를 담으세요.** 위 `orderId`처럼요. 메시지 문자열을 다시 파싱하는 코드를 만들지 않으려면 필요합니다.

## 예외인가, 결과 타입인가

여기가 실무에서 제일 많이 갈리는 지점입니다. 기준은 하나예요.

> **예상 가능한 실패는 타입으로, 예상 못 한 실패는 예외로.**

| 상황 | 선택 |
|---|---|
| 입력 검증 실패 (형식·범위) | 타입 (`T?` / sealed) |
| 조회 결과 없음 | 타입 (`T?`) |
| 비즈니스 규칙 위반 (잔액 부족) | sealed 결과 타입 또는 도메인 예외 |
| DB 커넥션 끊김, 디스크 오류 | 예외 |
| 프로그래머 실수 (계약 위반) | 예외 (`require`/`check` — Lesson 28) |

"조회 결과 없음"에 `NotFoundException`을 던지는 코드가 굉장히 많은데, **그게 정말 예외 상황인지** 물어보세요. 호출자가 "없으면 기본값"을 원한다면 그건 예외가 아니라 `null`입니다. 예외로 만들면 호출자는 정상 흐름을 `try`로 감싸야 하고, 스택 트레이스 생성 비용도 냅니다.

반대로 **"터지면 요청을 끝내야 하는 것"** 까지 `Result`로 감싸면 호출 체인이 전부 오염됩니다. 그건 그냥 던지고 전역 핸들러(`@ControllerAdvice`)에서 받는 게 맞습니다. 다음 레슨(Lesson 27)에서 `Result`와 sealed 타입을 비교합니다.

## 리뷰에서 잡아야 할 것

- **`catch (e: Exception)` 으로 전부 삼키기** — 뭘 잡으려는 건지 특정하세요. 광범위 catch는 `NullPointerException` 같은 버그까지 숨깁니다. 최상단 경계(컨트롤러 어드바이스, 배치 잡 루프)가 아니면 쓰지 마세요.
- **빈 catch 블록** — 로그도 없이 `catch (e: X) {}` 는 장애 조사를 불가능하게 만듭니다. 정말 무시해도 되면 **왜 무시해도 되는지 주석**을 다세요.
- **예외로 흐름 제어** — 루프 탈출용 예외, "없으면 예외"로 분기하는 코드. 스택 트레이스 채우는 비용이 분기 하나보다 수백 배 비쌉니다.
- **`catch (e: Throwable)`** — `OutOfMemoryError`, `StackOverflowError`까지 잡습니다. 거의 항상 틀린 코드입니다.
- **`CancellationException` 을 잡는 것** — 코루틴에서 취소는 `CancellationException`으로 전파됩니다. 이걸 `catch (e: Exception)`으로 삼키면 **취소가 동작하지 않습니다.** 코루틴 파트에서 다시 다루지만, 지금부터 "광범위 catch는 취소도 먹는다"를 기억해 두세요.
- **`cause` 없이 재던지기** — 원인 체인이 끊깁니다.

## 연습

설정 파일을 읽는 작은 로더를 완성하세요. 세 가지를 씁니다 — **`use { }`**, **`?: throw`**, **식으로서의 `try`**.

- `load` — `Config`를 `use`로 열어 `"key=value"` 줄을 `Map`으로 만든다. 블록을 벗어나면 `close()`가 호출되어야 한다.
- `parsePort` — `raw`가 null이면 `ConfigException("missing: port")`을 던지고, 숫자가 아니면 `fallback`을 반환한다. **`if` 없이** `?:` 와 식 `try`로 작성한다.

```kotlin starter
class ConfigException(message: String) : RuntimeException(message)

class Config(private val name: String, private val lines: List<String>) : AutoCloseable {
    fun read(): List<String> = lines
    override fun close() = println("closed: $name")
}

fun load(config: Config): Map<String, String> {
    TODO("use { } 로 열고 key=value 를 Map 으로")
}

fun parsePort(raw: String?, fallback: Int): Int {
    TODO("?: throw 와 식으로서의 try")
}

fun main() {
    val props = load(Config("app.conf", listOf("port=8080", "host=localhost")))
    println(props)
    println(parsePort(props["port"], 80))

    val bad = load(Config("bad.conf", listOf("port=abc")))
    println(parsePort(bad["port"], 80))

    val result = try {
        parsePort(bad["host"], 80)
    } catch (e: ConfigException) {
        "caught: ${e.message}"
    }
    println(result)
}
```

```text expected
closed: app.conf
{port=8080, host=localhost}
8080
closed: bad.conf
80
caught: missing: port
```

```text hint
`use { }` 는 `AutoCloseable` 에 붙은 stdlib 확장 함수이고, **블록의 마지막 값을 그대로 반환하는 식**입니다. 그래서 `return config.use { ... }` 로 값을 바로 꺼낼 수 있어요. `try/finally` 를 직접 쓸 필요가 없습니다.
---
`"port=8080"` 을 쪼개는 건 `split("=", limit = 2)` 입니다. `limit = 2` 를 주는 이유를 생각해 보세요 — 값 안에 `=` 가 또 있으면 어떻게 될까요? 쪼갠 리스트를 `Map` 으로 모을 땐 `associate { }` 에 `Pair` 를 넘기면 됩니다 (`k to v`). 구조 분해 `val (k, v) = ...` 도 쓸 수 있어요.
---
`parsePort` 는 두 단계입니다. (1) null 이면 던진다 — `?:` 오른쪽에 `throw` 를 둘 수 있는 건 `throw` 가 `Nothing` 타입의 **식**이기 때문입니다. (2) 숫자 변환 실패는 기본값 — `try { ... } catch (e: NumberFormatException) { fallback }` 자체가 값이니 그대로 `return` 하세요. `toIntOrNull()` 을 쓰면 편하지만, 이번 연습은 **식 `try` 를 손에 익히는 게 목적**이라 `toInt()` 로 가세요.
---
뼈대입니다. 빈칸만 채우면 됩니다.

`load`: `return config.use { c -> c.read().associate { val (k, v) = it.split("=", limit = ___); k to v } }`

`parsePort`: `val text = raw ?: throw ___` 다음 줄에 `return try { text.___() } catch (e: NumberFormatException) { ___ }`
```

```kotlin solution
class ConfigException(message: String) : RuntimeException(message)

class Config(private val name: String, private val lines: List<String>) : AutoCloseable {
    fun read(): List<String> = lines
    override fun close() = println("closed: $name")
}

// use 는 블록의 값을 그대로 돌려주는 식이라, 결과를 바깥 변수로 빼낼 필요가 없다.
fun load(config: Config): Map<String, String> =
    config.use { c ->
        c.read().associate { line ->
            val (k, v) = line.split("=", limit = 2)
            k to v
        }
    }

fun parsePort(raw: String?, fallback: Int): Int {
    // throw 는 Nothing 타입의 식이라 ?: 오른쪽에 올 수 있다.
    val text = raw ?: throw ConfigException("missing: port")
    return try {
        text.toInt()
    } catch (e: NumberFormatException) {
        fallback
    }
}

fun main() {
    val props = load(Config("app.conf", listOf("port=8080", "host=localhost")))
    println(props)
    println(parsePort(props["port"], 80))

    val bad = load(Config("bad.conf", listOf("port=abc")))
    println(parsePort(bad["port"], 80))

    val result = try {
        parsePort(bad["host"], 80)
    } catch (e: ConfigException) {
        "caught: ${e.message}"
    }
    println(result)
}
```
