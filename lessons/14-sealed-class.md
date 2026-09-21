# Lesson 14 — sealed class 와 when

Java에서 상태나 결과를 표현할 때 쓰던 enum + switch, 또는 추상 클래스 + instanceof 분기가 **컴파일 타임 완전성 검증**으로 바뀝니다.

## 문제: Java에서 "결과"를 표현하기

```java
// enum은 데이터를 못 담는다
enum Result { SUCCESS, FAILURE, LOADING }

// 상속은 담을 수 있지만, 분기에서 컴파일러가 도와주지 않는다
if (r instanceof Success) { ... }
else if (r instanceof Failure) { ... }
// Loading 처리를 빠뜨려도 컴파일은 통과한다 → 런타임 버그
```

## sealed — 상속 계층을 봉인한다

```kotlin
sealed interface ApiResult {
    data class Success(val data: String) : ApiResult
    data class Failure(val code: Int, val message: String) : ApiResult
    data object Loading : ApiResult
}
```

`sealed`는 **하위 타입이 같은 모듈 안에만 존재할 수 있다**는 선언입니다. 컴파일러가 **하위 타입 전체 목록을 안다**는 게 핵심이에요.

- `enum`: 값은 고정, **데이터를 못 담음**
- `sealed`: 하위 타입 고정, **각자 다른 데이터를 담음**
- 일반 상속: 하위 타입 무제한, 컴파일러가 모름

## when 이 완전성을 강제한다

```kotlin
fun describe(result: ApiResult): String = when (result) {
    is ApiResult.Success -> "성공: ${result.data}"
    is ApiResult.Failure -> "실패(${result.code}): ${result.message}"
    ApiResult.Loading    -> "로딩 중"
}
```

두 가지가 동시에 일어납니다.

1. **`else` 절이 필요 없습니다.** 컴파일러가 세 가지가 전부임을 압니다.
2. **분기 안에서 스마트 캐스트됩니다.** `result.data`를 캐스팅 없이 바로 씁니다.

**진짜 가치는 여기입니다** — 나중에 `Timeout` 하위 타입을 추가하면, 그 타입을 처리하지 않은 **모든 `when`이 컴파일 에러**가 납니다. 런타임에 발견될 버그가 컴파일 시점으로 당겨져요.

> 그래서 sealed class를 다루는 `when`에는 **`else`를 붙이지 마세요.** `else`를 붙이는 순간 이 안전망이 사라집니다.

## when 의 다른 얼굴들

```kotlin
// 인자 없는 when — if/else if 체인 대체
val grade = when {
    score >= 90 -> "A"
    score >= 80 -> "B"
    else -> "F"
}

// 여러 값, 범위, 타입
when (x) {
    0, 1 -> "작음"
    in 2..9 -> "한 자리"
    is String -> "문자열"
    else -> "기타"
}

// 검사 대상을 변수로 묶기
when (val r = fetch()) {
    is Success -> r.data
    else -> ""
}
```

## data object

`Loading`처럼 데이터가 없는 하위 타입은 `data object`로 선언합니다. 싱글턴이고, `toString()`이 `Loading`으로 예쁘게 나옵니다.

## 실무에서 어디에 쓰나

- **API 응답 결과** — Success / Failure / Loading
- **도메인 상태 전이** — 주문 상태를 상태별 데이터와 함께 (`Paid(paidAt)`, `Canceled(reason)`)
- **예외 대신 반환값으로 실패 표현** — 검사 예외 없는 Kotlin에서 특히 유용

## 연습

`sealed interface ApiResult`와 세 하위 타입을 정의하고, `describe`를 `when` 표현식으로 완성하세요.

- `Success(data: String)`
- `Failure(code: Int, message: String)`
- `Loading` — 데이터 없음

**조건: `when`에 `else` 절을 쓰지 마세요.** 안 써도 컴파일되면 성공입니다.

```kotlin starter
// TODO: sealed interface ApiResult 와 세 하위 타입을 정의하세요.

fun describe(result: ApiResult): String = TODO("when 으로 완성하세요")

fun main() {
    println(describe(ApiResult.Success("주문 12건")))
    println(describe(ApiResult.Failure(503, "서비스 불가")))
    println(describe(ApiResult.Loading))
}
```

```text expected
성공: 주문 12건
실패(503): 서비스 불가
로딩 중
```

```text hint
`main`이 `ApiResult.Success(...)`, `ApiResult.Loading` 처럼 **`ApiResult.` 를 앞에 붙여** 호출하고 있습니다. 이 한 가지가 세 하위 타입을 **어디에 선언해야 하는지**를 알려 줍니다. 그리고 `else` 없이 컴파일돼야 한다는 조건은, 컴파일러가 **하위 타입 목록 전체를 알고 있을 때만** 성립합니다 — 그걸 보장하는 키워드가 무엇이었죠?
---
필요한 건 `sealed interface` 선언과 그 **안에 중첩된** 세 타입, 그리고 `when (result)` + `is` 입니다. 데이터를 담는 둘과 담지 않는 하나는 **선언 방식이 다릅니다.**
---
`Success`/`Failure`는 각자 다른 값을 들고 다니니 `data class`, `Loading`은 상태가 없어 **인스턴스가 하나면 충분**하니 `data object`(싱글턴)입니다. 이 차이가 `when` 분기에도 그대로 드러나요 — 타입을 검사해야 하는 쪽은 `is ApiResult.Success ->` 로 쓰고 그 순간 스마트 캐스트되어 `result.data`를 캐스팅 없이 바로 쓰지만, `Loading`은 **값이 하나뿐**이라 `is` 없이 `ApiResult.Loading ->` 로 동등 비교합니다. 출력 문구는 문자열 템플릿 `"실패(${result.code}): ${result.message}"` 처럼 만드세요.
---
뼈대는 이렇습니다.

`sealed interface ApiResult { ... }` 안에 `data class Success(val data: String) : ApiResult` 를 먼저 넣고, 같은 자리에 `Failure`(`data class`, 파라미터 둘)와 `Loading`(`data ___`)을 나란히 선언하세요.

`describe` 는 `fun describe(result: ApiResult): String = when (result) { ___ }` 이고, 중괄호 안은 `is ApiResult.Success -> "성공: ${result.data}"` 를 포함한 **세 줄**입니다. `else` 는 없습니다.
```

```kotlin solution
// 하위 타입을 인터페이스 안에 중첩해 ApiResult.Success 로 접근하게 한다.
// 데이터가 없는 Loading 은 인스턴스가 하나뿐이니 data object.
sealed interface ApiResult {
    data class Success(val data: String) : ApiResult
    data class Failure(val code: Int, val message: String) : ApiResult
    data object Loading : ApiResult
}

// else 가 없어도 컴파일된다 = 컴파일러가 하위 타입 전체를 알고 있다는 증거.
fun describe(result: ApiResult): String = when (result) {
    is ApiResult.Success -> "성공: ${result.data}"
    is ApiResult.Failure -> "실패(${result.code}): ${result.message}"
    ApiResult.Loading -> "로딩 중"
}

fun main() {
    println(describe(ApiResult.Success("주문 12건")))
    println(describe(ApiResult.Failure(503, "서비스 불가")))
    println(describe(ApiResult.Loading))
}
```
