# Lesson 27 — Result 와 runCatching

앞 레슨에서 "예상 가능한 실패는 타입으로"라고 했습니다. Kotlin 표준 라이브러리가 주는 도구가 `kotlin.Result<T>`입니다. 편하지만 **함정이 명확한 도구**라, 언제 쓰고 언제 쓰면 안 되는지가 이 레슨의 전부입니다.

## Result<T> 는 성공 아니면 Throwable

```kotlin
val r: Result<Int> = Result.success(42)
val e: Result<Int> = Result.failure(IllegalStateException("boom"))
```

꺼내는 방법은 여러 가지입니다.

```kotlin
r.isSuccess          // true
r.isFailure          // false
r.getOrNull()        // 42, 실패면 null
r.exceptionOrNull()  // null, 실패면 Throwable
r.getOrThrow()       // 42, 실패면 그 예외를 다시 던진다
r.getOrElse { ex -> -1 }        // 실패면 람다로 대체 (예외를 인자로 받는다)
r.getOrDefault(-1)              // 실패면 그냥 기본값 (예외를 못 본다)
```

`Result<T>`는 **value class**입니다. 성공일 때는 박싱 없이 값 자체를 들고 있어서, 할당 비용이 거의 없어요. 실패일 때만 내부 `Failure` 래퍼를 만듭니다.

## runCatching — try/catch 를 값으로

```kotlin
val port: Result<Int> = runCatching { raw.toInt() }
```

`runCatching`은 블록을 실행해서 성공이면 `Result.success`, **`Throwable`이 나오면** `Result.failure`로 감쌉니다. 수신 객체 버전도 있습니다.

```kotlin
val trimmed = raw.runCatching { substring(1, 5) }   // this == raw
```

### 체이닝 연산자

| 함수 | 성공일 때 | 실패일 때 |
|---|---|---|
| `map { }` | 값 변환 | 그대로 통과 |
| `mapCatching { }` | 값 변환 (**던지면 다시 failure**) | 그대로 통과 |
| `recover { }` | 그대로 통과 | 예외 → 값으로 복구 |
| `recoverCatching { }` | 그대로 통과 | 복구 중 던지면 새 failure |
| `onSuccess { }` | 부수효과 후 자기 자신 반환 | 통과 |
| `onFailure { }` | 통과 | 부수효과 후 자기 자신 반환 |
| `fold(onSuccess, onFailure)` | 두 갈래를 **하나의 값으로** 합친다 | |

`fold`가 핵심입니다. 성공/실패를 모두 소비해서 `Result`를 벗겨내니, **체인의 마지막**에 놓습니다.

```kotlin
val message = runCatching { raw.trim().toInt() }
    .mapCatching { require(it >= 0) { "negative" }; it }
    .fold(
        onSuccess = { "ok=$it" },
        onFailure = { "fail=${it::class.simpleName}" },
    )
```

`map`과 `mapCatching`의 차이를 리뷰에서 자주 봅니다. **`map` 블록에서 예외가 나면 그건 `Result`에 안 잡히고 그대로 터집니다.** 던질 가능성이 있는 변환이면 `mapCatching`을 쓰세요.

## 함정 1 — CancellationException 을 삼킨다

**이게 이 레슨에서 제일 중요합니다.**

`runCatching`의 구현은 이렇습니다.

```kotlin
public inline fun <R> runCatching(block: () -> R): Result<R> {
    return try {
        Result.success(block())
    } catch (e: Throwable) {      // ← Throwable 전부
        Result.failure(e)
    }
}
```

`catch (e: Throwable)`입니다. 앞 레슨에서 "거의 항상 틀린 코드"라고 한 바로 그것이 표준 라이브러리 안에 있어요.

코루틴에서 취소는 `CancellationException`을 던져서 전파됩니다. 그런데 `runCatching`이 그걸 잡아 `Result.failure`로 바꿔버리면 — **취소 신호가 사라집니다.** 코루틴은 자기가 취소된 줄 모르고 계속 돌고, 부모는 자식이 끝나기를 기다리며 멈춰 있습니다.

```kotlin
// 위험: 취소가 동작하지 않는다
suspend fun fetch(): Result<Data> = runCatching {
    client.get(url)        // suspend 호출
}
```

`OutOfMemoryError` 같은 `Error`도 똑같이 삼킵니다.

**리뷰 규칙**: `runCatching`이 감싼 블록 안에 **suspend 호출이 있으면 무조건 지적**하세요. 해결책은 둘 중 하나입니다.

```kotlin
// (a) CancellationException 을 다시 던진다
suspend fun <T> suspendRunCatching(block: suspend () -> T): Result<T> =
    try {
        Result.success(block())
    } catch (e: kotlinx.coroutines.CancellationException) {
        throw e
    } catch (e: Throwable) {
        Result.failure(e)
    }

// (b) 애초에 runCatching 을 쓰지 않고 잡을 예외를 특정한다
try { client.get(url) } catch (e: java.io.IOException) { ... }
```

코루틴은 뒤에서 제대로 다룹니다. 지금은 **"`runCatching` + suspend = 버그"** 만 외워두세요.

## 함정 2 — 반환 타입으로 쓰기

`Result`는 원래 **반환 타입으로 쓰는 게 금지**돼 있었습니다. Kotlin 1.3에서 도입될 때 "나중에 더 나은 에러 타입을 넣을 여지를 남기자"는 이유로 컴파일러가 막았어요. 1.5부터 풀렸지만, 그 이력이 남긴 교훈이 있습니다.

- `Result<T>`는 **실패 이유를 `Throwable`로만** 표현합니다. 도메인 실패의 종류를 구분하려면 예외 클래스 계층을 만들고 `when (e) { is A -> ... }` 로 타입 검사를 해야 하는데, **컴파일러가 완전성을 검사해주지 않습니다.**
- `Result`는 `map`/`fold` 같은 표준 함수만 가집니다. 도메인 언어가 아니에요.
- 공개 API 시그니처에 `Result<T>`가 있으면 Java 호출자가 거의 못 씁니다 (value class라 이름이 뭉개집니다).

## Result vs 직접 만든 sealed 결과 타입

```kotlin
sealed interface PayResult {
    data class Approved(val txId: String) : PayResult
    data class Declined(val reason: String) : PayResult
    data class LimitExceeded(val limit: Long) : PayResult
}

when (result) {
    is PayResult.Approved -> ...
    is PayResult.Declined -> ...
    is PayResult.LimitExceeded -> ...
    // else 가 필요 없다 — 케이스를 빠뜨리면 컴파일 에러
}
```

| | `Result<T>` | sealed 결과 타입 |
|---|---|---|
| 실패 표현 | `Throwable` 하나 | **종류별 타입** |
| `when` 완전성 | 안 됨 | **컴파일러가 검사** |
| 실패에 데이터 첨부 | 예외에 필드 추가 | 프로퍼티로 자연스럽게 |
| 보일러플레이트 | 없음 | 타입 선언 필요 |
| 성격 | **예외를 값으로 포장** | **도메인 모델링** |

정리하면:

> **도메인 실패는 sealed, 예외를 값으로 잡는 건 `Result`.**

`Result`가 맞는 자리는 "남의 코드가 던지는 예외를 내 흐름 안으로 끌어들이는 경계"입니다 — 외부 API 호출, 파싱, 직렬화. 내 도메인이 정의한 실패(한도 초과, 재고 없음)를 `Result.failure(LimitExceededException(...))`로 감싸는 건 **타입 정보를 예외 안에 숨기는 것**이고, 호출자는 다시 `is` 검사로 풀어야 합니다.

그리고 실패가 **한 가지뿐이고 이유도 필요 없다면** — 그냥 `T?`가 답입니다. `toIntOrNull()`이 `Result<Int>`가 아닌 이유죠.

## 리뷰에서 잡아야 할 것

- **`runCatching` 을 suspend 블록에 감싸기** — 취소가 깨집니다. 위의 함정 1.
- **도메인 실패에 `Result<T>` 남용** — 실패 종류가 둘 이상이면 sealed로 가세요.
- **`getOrNull()` 로 실패 원인 버리기** — 로그에 "실패했습니다"만 남고 왜인지가 사라집니다. 원인이 필요 없으면 애초에 `T?`를 반환하는 함수로 만드세요.
- **`runCatching { }.getOrThrow()`** — 감쌌다가 바로 다시 던지는 건 아무 의미가 없습니다. `try` 없이 그냥 호출하세요.
- **`onFailure { }` 만 쓰고 결과를 버리기** — `Result`는 값입니다. 안 쓰면 실패가 조용히 사라집니다.
- **`map { }` 안에서 던질 수 있는 코드** — `mapCatching`이어야 합니다.

## 연습

문자열로 들어온 금액을 처리하는 세 함수를 완성하세요. **`Result` 를 쓸 자리와 sealed 를 쓸 자리를 구분하는 게 목적**입니다.

- `describe` — `runCatching`으로 `toInt()`를 감싸고, `mapCatching`으로 음수를 걸러낸 뒤, `fold`로 문자열을 만든다. 성공은 `"ok=값"`, 실패는 `"fail=예외클래스이름"`.
- `toWonOrZero` — 실패를 `0`으로 **복구**한다. `recover`를 쓸 것.
- `classify` — 도메인 실패를 `Amount` sealed 타입으로 표현한다. **예외도 `Result`도 쓰지 말 것.**

> 음수 검증에는 `require(조건) { "메시지" }` 를 쓰세요. 조건이 거짓이면 `IllegalArgumentException`을 던집니다 (Lesson 28에서 제대로 다룹니다).

```kotlin starter
sealed interface Amount {
    data class Valid(val won: Int) : Amount
    data class NotANumber(val raw: String) : Amount
    data class Negative(val won: Int) : Amount
}

fun render(a: Amount): String = when (a) {
    is Amount.Valid -> "valid ${a.won}"
    is Amount.NotANumber -> "not-a-number '${a.raw}'"
    is Amount.Negative -> "negative ${a.won}"
}

fun describe(raw: String): String {
    TODO("runCatching -> mapCatching -> fold")
}

fun toWonOrZero(raw: String): Int {
    TODO("recover 로 실패를 0 으로")
}

fun classify(raw: String): Amount {
    TODO("도메인 실패는 sealed 로")
}

fun main() {
    listOf("1200", " 300 ", "-50", "abc").forEach { println(describe(it)) }
    println(listOf("1200", "abc").map(::toWonOrZero))
    listOf("1200", "-50", "abc").forEach { println(render(classify(it))) }
}
```

```text expected
ok=1200
ok=300
fail=IllegalArgumentException
fail=NumberFormatException
[1200, 0]
valid 1200
negative -50
not-a-number 'abc'
```

```text hint
세 함수가 각각 다른 도구를 씁니다. `describe` 는 **예외를 값으로 포장**하는 자리(`Result`), `classify` 는 **도메인 실패를 모델링**하는 자리(sealed)입니다. 같은 입력을 다루지만 목적이 다릅니다. 입력에 공백이 있으니(`" 300 "`) 변환 전에 `trim()` 이 필요합니다.
---
`describe`: `runCatching { }` 안에서 `toInt()` 를 부르고, 음수 검증은 `mapCatching { }` 안에서 합니다 — `map` 이 아니라 `mapCatching` 인 이유는 **블록에서 던진 예외를 다시 failure 로 받기** 위해서입니다. 마지막은 `fold(onSuccess = { }, onFailure = { })`. 실패 쪽 람다의 인자는 `Throwable` 이고, 클래스 이름은 `it::class.simpleName` 으로 꺼냅니다.
---
`toWonOrZero`: `recover { }` 는 **실패일 때만** 실행되어 `Result` 를 성공으로 되돌립니다. 복구가 끝났으니 더 실패할 일이 없고, 그래서 `getOrThrow()` 로 꺼내도 안전합니다. `classify`: 여기서는 예외를 만들지 마세요. `toIntOrNull()` 이 null 을 주면 `NotANumber`, 음수면 `Negative`, 아니면 `Valid` — `?: return` 패턴이 잘 맞습니다.
---
뼈대입니다.

`describe`: `return runCatching { raw.trim().___() }.mapCatching { require(it >= 0) { "negative" }; it }.fold(onSuccess = { "ok=$it" }, onFailure = { "fail=${it::class.___}" })`

`toWonOrZero`: `return runCatching { raw.trim().toInt() }.___ { 0 }.getOrThrow()`

`classify`: `val n = raw.trim().___() ?: return Amount.NotANumber(raw)` 다음 줄에 `return if (n < 0) ___ else ___`
```

```kotlin solution
sealed interface Amount {
    data class Valid(val won: Int) : Amount
    data class NotANumber(val raw: String) : Amount
    data class Negative(val won: Int) : Amount
}

fun render(a: Amount): String = when (a) {
    is Amount.Valid -> "valid ${a.won}"
    is Amount.NotANumber -> "not-a-number '${a.raw}'"
    is Amount.Negative -> "negative ${a.won}"
}

// 예외를 값으로 포장하는 자리 — map 이 아니라 mapCatching 이어야 require 의 예외가 failure 로 잡힌다.
fun describe(raw: String): String =
    runCatching { raw.trim().toInt() }
        .mapCatching { require(it >= 0) { "negative" }; it }
        .fold(
            onSuccess = { "ok=$it" },
            onFailure = { "fail=${it::class.simpleName}" },
        )

fun toWonOrZero(raw: String): Int =
    runCatching { raw.trim().toInt() }
        .recover { 0 }
        .getOrThrow()

// 도메인 실패는 예외도 Result 도 아닌 타입으로 — when 완전성을 컴파일러가 지켜준다.
fun classify(raw: String): Amount {
    val n = raw.trim().toIntOrNull() ?: return Amount.NotANumber(raw)
    return if (n < 0) Amount.Negative(n) else Amount.Valid(n)
}

fun main() {
    listOf("1200", " 300 ", "-50", "abc").forEach { println(describe(it)) }
    println(listOf("1200", "abc").map(::toWonOrZero))
    listOf("1200", "-50", "abc").forEach { println(render(classify(it))) }
}
```
