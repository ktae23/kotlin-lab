# Lesson 14 — sealed class 와 when

Java에서 상태나 결과를 표현할 때 쓰던 enum + switch, 또는 추상 클래스 + instanceof 분기가 **컴파일 타임 완전성 검증**으로 바뀝니다.

## 문제: Java에서 "결과"를 표현하기

```java
// enum 도 데이터는 담는다. 단 모든 상수가 같은 필드 구조를 공유한다
enum Result {
    SUCCESS(200), FAILURE(500), LOADING(0);
    final int code;
    Result(int code) { this.code = code; }
}
// "성공일 때만 data, 실패일 때만 code + message" 처럼
// 상수마다 다른 데이터 구조는 표현할 수 없다

// 상속은 담을 수 있지만, 분기에서 컴파일러가 도와주지 않는다
if (r instanceof Success) { ... }
else if (r instanceof Failure) { ... }
// Loading 처리를 빠뜨려도 컴파일은 통과한다 → 런타임 버그
```

Java 17 의 `sealed interface Result permits Success, Failure, Loading` 이 바로 이 문제를 풀려고 들어온 기능입니다. Kotlin 은 1.0 부터 갖고 있었고, `permits` 목록 없이 **선언 위치만으로** 같은 일을 합니다.

## sealed — 상속 계층을 봉인한다

```kotlin
sealed interface ApiResult {
    data class Success(val data: String) : ApiResult
    data class Failure(val code: Int, val message: String) : ApiResult
    data object Loading : ApiResult
}
```

`sealed`는 **하위 타입이 같은 모듈 그리고 같은 패키지 안에만 존재할 수 있다**는 선언입니다. 컴파일러가 **하위 타입 전체 목록을 안다**는 게 핵심이에요.

- `enum`: 인스턴스가 상수마다 하나씩 고정, **모든 상수가 같은 필드 구조**
- `sealed`: 하위 타입 고정, **하위 타입마다 다른 데이터 구조**
- 일반 상속: 하위 타입 무제한, 컴파일러가 모름

### 제약 네 가지 — 다 "목록을 알 수 있게" 하려는 것

**1. 같은 모듈 + 같은 패키지.** 파일은 달라도 됩니다(Kotlin 1.5 이후). 하지만 패키지를 넘으면 막혀요.

```
error: a class can only extend a sealed class or interface declared in the same package.
```

라이브러리를 만들 때 이게 의미가 큽니다. **내 sealed 계층에는 외부가 끼어들 수 없습니다.** `when` 이 영원히 완전하다는 보장이 여기서 나옵니다.

**2. 생성자는 `private` 아니면 `protected`.** 기본값이 `protected` 고, `public constructor` 를 쓰면 바로 막힙니다 — `error: constructor must be private or protected in sealed class`. sealed 타입 자체를 바깥에서 `new` 할 수 없다는 뜻이에요.

**3. 익명 객체로 확장 못 함.** `object : ApiResult { }` 는 `error: anonymous object cannot extend a sealed class` 입니다. 이름 없는 하위 타입이 생기면 목록이 깨지니까요.

**4. sealed 클래스 자신은 추상 클래스.** 직접 인스턴스를 만들 수 없고, `open` 을 붙일 필요도 없습니다(하위 타입 상속은 기본 허용).

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

### 값을 안 쓰는 `when` — 문(statement)으로 쓸 때

값을 받지 않고 분기만 하는 `when` 도 **똑같이 완전성을 요구받습니다.**

```kotlin
fun handle(result: ApiResult) {
    when (result) {                     // 반환값을 안 쓴다
        is ApiResult.Success -> render(result.data)
        is ApiResult.Failure -> showError(result.code)
    }                                   // Loading 을 빠뜨렸다
}
```

```
error: 'when' expression must be exhaustive. Add the 'is Loading' branch or an 'else' branch.
```

이게 **Kotlin 1.6 까지는 경고였다가 1.7 부터 에러**가 됐습니다. 오래된 코드를 최신 컴파일러로 올릴 때 갑자기 터지는 자리라 알아 두면 좋아요. 덕분에 "결과를 안 쓰니까 대충 두 개만 처리" 가 불가능해졌습니다.

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

`Loading`처럼 데이터가 없는 하위 타입은 `data object`로 선언합니다. 싱글턴이고, `toString()`이 `Loading`으로 예쁘게 나옵니다. (`data` 를 빼고 그냥 `object Loading : ApiResult` 라고 써도 동작은 같지만, `toString()` 이 `Loading@1b6d3586` 이 되어 로그에서 읽히지 않습니다.)

## `sealed class` 냐 `sealed interface` 냐

둘 다 되는 자리에서 뭘 고를지 기준이 필요합니다.

| | `sealed class` | `sealed interface` |
|---|---|---|
| 공통 **상태**(프로퍼티 값) | 생성자로 받아 저장 가능 | 불가 (추상 프로퍼티만) |
| 하위 타입이 **다른 계층에도** 속하기 | 불가 (부모 클래스는 하나) | 가능 (`Circle : Shape, Drawable`) |
| 기본값 | — | **이쪽을 먼저 고려** |

기준은 L11 과 같습니다. **공통 상태를 들고 있어야 하면 `sealed class`, 아니면 `sealed interface`.** 실무에서는 후자가 더 자주 맞습니다 — 결과 타입이 직렬화 인터페이스나 도메인 인터페이스를 겸해야 하는 일이 흔하거든요.

```kotlin
sealed class DomainEvent(val occurredAt: Long)          // 모든 이벤트가 시각을 갖는다 → class
sealed interface Shape { fun area(): Double }           // 계약만 → interface
```

## 계층이 커지면 — `when` 대신 다형성

하위 타입이 열 개가 되고 그걸 분기하는 `when` 이 코드베이스 곳곳에 열 군데 생기면, **하위 타입 하나를 추가할 때 열 군데를 고쳐야 합니다.** 컴파일러가 전부 잡아 주긴 하지만 "잡아 주니까 괜찮다"와 "설계가 맞다"는 다른 얘기예요.

판단 기준은 **동작이 타입에 붙는 것이냐, 쓰는 쪽에 붙는 것이냐** 입니다.

- **타입마다 고유한 동작**(면적 계산, 상태 전이 규칙) → sealed 타입의 **추상 메서드**로 올리세요. 하위 타입을 추가하면 컴파일러가 그 클래스 안에서 바로 막습니다
- **쓰는 맥락마다 달라지는 동작**(HTTP 응답 변환, 화면 문구, 로그 포맷) → 그건 `when` 이 맞습니다. 도메인 타입이 화면 문구를 알 이유가 없으니까요

즉 `when` 이 늘어나는 것 자체는 문제가 아니고, **도메인 로직이 `when` 으로 새어 나가는 게** 문제입니다.

## 실무에서 어디에 쓰나

- **API 응답 결과** — Success / Failure / Loading
- **도메인 상태 전이** — 주문 상태를 상태별 데이터와 함께 (`Paid(paidAt)`, `Canceled(reason)`)
- **예외 대신 반환값으로 실패 표현** — 검사 예외 없는 Kotlin에서 특히 유용 (L27 의 `Result` 와 이어집니다)

## 리뷰할 때 보는 것

| 코드에서 보이면 | 이렇게 지적한다 |
|---|---|
| sealed 타입 `when` 에 `else` | 안전망을 버리는 코드다. 하위 타입이 늘어도 컴파일러가 안 잡아 준다. 분기를 전부 나열하라 |
| 하위 타입을 다른 패키지에 두려 함 | 컴파일되지 않는다. sealed 계층은 **같은 모듈 + 같은 패키지**다. 패키지 구조를 도메인 기준으로 다시 잡아라 |
| enum + `when` 안에서 `!!` 나 캐스팅 | 케이스마다 데이터가 다르다는 신호다. sealed 로 바꾸면 `!!` 가 통째로 사라진다 |
| `data` 없는 `object Loading` | `toString()` 이 해시가 찍힌다. `data object` 로 |
| sealed 하위 타입에서 반복되는 프로퍼티 | 공통 상태면 `sealed class` 주 생성자로 올려라 |
| 같은 `when` 분기가 세 군데 이상 반복 | 타입 고유 동작이면 sealed 타입의 추상 메서드로 올려라. 맥락별 변환이면 그대로 둬도 된다 |
| 하위 타입이 하나뿐인 sealed | 추상화 비용만 남았다. 그냥 클래스로 쓰고, 두 번째 케이스가 생길 때 봉인하라 |

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
