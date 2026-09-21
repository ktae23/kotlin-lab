# Lesson 44 — 웹 계층: 컨트롤러, 검증, 예외 처리

컨트롤러는 Kotlin으로 오면 눈에 띄게 짧아집니다. 그런데 이 레슨의 진짜 목적은 짧아지는 게 아니라 **`@field:` 한 글자를 빠뜨려서 검증이 통째로 무시되는 사고**를 막는 겁니다. 이건 테스트를 안 짜면 배포까지 그대로 나갑니다.

## @RestController + data class DTO

```kotlin
@RestController
@RequestMapping("/api/users")
class UserController(
    private val userService: UserService,
) {
    @PostMapping
    fun signUp(@RequestBody @Valid request: SignUpRequest): SignUpResponse =
        userService.signUp(request)

    @GetMapping("/{id}")
    fun find(@PathVariable id: Long): UserResponse =
        userService.find(id)
}
```

생성자 주입(Lesson 17)이 그대로 오고, 핸들러는 **식 본문 한 줄**이 됩니다. `ResponseEntity`는 헤더나 상태 코드를 직접 만져야 할 때만 쓰세요. 대부분은 반환 타입을 DTO로 두는 쪽이 읽기 좋습니다.

## 요청/응답 DTO 는 반드시 분리한다

```kotlin
data class SignUpRequest(val email: String, val nickname: String, val age: Int)
data class UserResponse(val id: Long, val nickname: String)
```

"엔티티 하나로 받고 내보내면 되지 않나" — 절대 안 됩니다. Java에서도 안 됐고 Kotlin에서는 더 안 됩니다.

- **과다 노출.** 엔티티를 그대로 직렬화하면 `passwordHash`, `internalMemo` 같은 필드가 응답에 실립니다. 필드를 추가한 사람은 API 응답이 바뀌는 줄도 모릅니다.
- **과다 바인딩(mass assignment).** 요청을 엔티티로 받으면 클라이언트가 `"role": "ADMIN"` 을 끼워 넣을 수 있습니다. 실제로 터지는 보안 사고입니다.
- **지연 로딩 폭발.** 엔티티에 `@OneToMany` 가 있으면 Jackson이 직렬화하다 컬렉션을 건드려 N+1을 부르거나 `LazyInitializationException`을 냅니다.
- **API 계약이 DB 스키마에 묶입니다.** 컬럼명 하나 바꿨는데 모바일 앱이 깨져요.

그리고 Lesson 16에서 말한 규칙이 여기서 완성됩니다. **엔티티는 일반 `class`, DTO는 `data class`.** DTO는 불변에 `copy()`, `equals()`가 공짜로 오니 테스트에서 `assertEquals(expected, actual)` 한 줄로 끝납니다.

## @field: — 이거 모르면 검증이 조용히 무시된다

**이 레슨에서 딱 하나만 가져간다면 이겁니다.**

```kotlin
data class SignUpRequest(
    @NotBlank val nickname: String,    // ❌ 검증이 안 걸린다
)
```

컴파일도 되고, 서버도 뜨고, 요청도 잘 받습니다. **그런데 빈 닉네임이 그대로 통과합니다.**

### 왜 그런가

Kotlin의 주 생성자 프로퍼티 한 줄은 JVM 바이트코드에서 **여러 개의 요소**로 쪼개집니다.

- 생성자 **파라미터**(`param`)
- 백킹 **필드**(`field`)
- **게터**(`get`) / (var면) 세터

애노테이션을 그냥 붙이면 Kotlin이 정해진 우선순위(`param` → `property` → `field`)로 **가장 먼저 가능한 자리**에 붙입니다. 생성자 프로퍼티에서는 보통 **`param`(생성자 파라미터)** 에 붙죠.

그런데 Hibernate Validator는 **필드나 게터**를 봅니다. 파라미터에 붙은 애노테이션은 쳐다보지 않아요. 애노테이션은 분명히 코드에 있는데 검증기 입장에서는 없는 겁니다.

### 답: use-site target 을 명시한다

```kotlin
data class SignUpRequest(
    @field:Email(message = "올바른 이메일 형식이 아닙니다")
    val email: String,

    @field:NotBlank(message = "닉네임은 필수입니다")
    @field:Size(min = 2, max = 10, message = "닉네임은 2~10자여야 합니다")
    val nickname: String,

    @field:Min(value = 14, message = "만 14세 이상만 가입할 수 있습니다")
    val age: Int,
)
```

`@field:` 는 **"이 애노테이션은 백킹 필드에 붙여라"** 는 지시입니다. 이러면 검증이 정상 동작합니다.

> ⚠️ **운영에서 이렇게 터집니다**
> 실패가 **조용합니다.** 예외도 경고 로그도 없습니다. 서비스는 정상으로 보이고, 한 달 뒤 빈 닉네임과 음수 나이가 섞인 데이터를 CS팀이 발견합니다. 이미 들어간 더러운 데이터는 마이그레이션으로 치워야 하죠.
> 방어책은 두 가지입니다. ① `@field:` 를 팀 컨벤션으로 못 박고 리뷰에서 본다. ② **검증 실패 케이스를 테스트로 짠다** — `@field:` 를 빠뜨리면 그 테스트가 빨간불이 됩니다. ②가 진짜 방어선입니다.

실무에서 기억할 건 이 정도입니다.

| 상황 | 타깃 |
|---|---|
| `jakarta.validation` 검증 | `@field:` |
| Jackson `@JsonProperty` | 보통 그냥 써도 동작 (`@get:`으로 명시하면 확실) |
| Swagger/OpenAPI `@Schema` | `@field:` 또는 `@get:` |
| Spring `@Value` (생성자 파라미터) | 그대로 (`param` 이 맞음) |

컨트롤러 파라미터에 **`@Valid` 를 붙이는 것도 잊지 마세요.** DTO에 애노테이션이 아무리 완벽해도 `@Valid` 가 없으면 검증기가 돌지 않습니다. `@field:` 누락과 증상이 똑같아서 디버깅할 때 둘 다 확인해야 합니다.

## @RestControllerAdvice — 전역 예외 처리

```kotlin
@RestControllerAdvice
class GlobalExceptionHandler {

    @ExceptionHandler(MethodArgumentNotValidException::class)
    @ResponseStatus(HttpStatus.BAD_REQUEST)
    fun handleValidation(e: MethodArgumentNotValidException): ErrorResponse.Validation =
        ErrorResponse.Validation(
            errors = e.bindingResult.fieldErrors.map {
                FieldError(it.field, it.defaultMessage ?: "잘못된 값입니다")
            },
        )

    @ExceptionHandler(UserNotFoundException::class)
    @ResponseStatus(HttpStatus.NOT_FOUND)
    fun handleNotFound(e: UserNotFoundException): ErrorResponse.NotFound =
        ErrorResponse.NotFound(e.message ?: "리소스를 찾을 수 없습니다")
}
```

`@Valid` 가 실패하면 `MethodArgumentNotValidException` 이 납니다. 이걸 잡지 않으면 Spring 기본 에러 바디가 그대로 나가는데, 클라이언트가 파싱하기 나쁘고 내부 정보가 새기도 합니다. **프로젝트 시작할 때 `@RestControllerAdvice` 부터 만드세요.**

> 핸들러 순서 주의: `@ExceptionHandler(Exception::class)` 같은 **포괄 핸들러를 만들면 그 아래 구체 핸들러가 가려지는 게 아니라, Spring이 가장 구체적인 타입을 고릅니다.** 문제는 포괄 핸들러가 500으로 뭉개면서 **스택트레이스를 로그에 안 남기는** 경우예요. 포괄 핸들러에서는 반드시 `log.error(e.message, e)` 로 원본을 남기세요. 이거 안 하면 장애 때 원인을 못 찾습니다.

## sealed class 로 에러 응답 모델링

Lesson 5의 `sealed`가 웹 계층에서 진가를 발휘합니다. 에러 응답 모양이 종류마다 다르거든요 — 검증 실패는 필드 목록이 필요하고, 404는 메시지 하나면 됩니다.

```kotlin
sealed interface ErrorResponse {
    data class Validation(val errors: List<FieldError>) : ErrorResponse
    data class NotFound(val message: String) : ErrorResponse
    data class Conflict(val message: String, val conflictedId: Long) : ErrorResponse
}

data class FieldError(val field: String, val message: String)
```

`Map<String, Any>`로 아무거나 담는 것과 비교하면 차이가 분명합니다. **타입마다 필요한 필드가 강제**되고, 에러 종류를 추가하면 처리하지 않은 `when` 이 전부 컴파일 에러가 납니다(Lesson 5).

서비스 계층에서도 같은 패턴이 유용합니다. "이미 가입된 이메일" 같은 **예상되는 실패는 예외가 아니라 반환값**으로 표현하세요. 그러면 컨트롤러가 `when` 으로 분기하면서 컴파일러의 완전성 검사를 받습니다.

```kotlin
@PostMapping
fun signUp(@RequestBody @Valid request: SignUpRequest): ResponseEntity<*> =
    when (val result = userService.signUp(request)) {   // SignUpResult (sealed)
        is SignUpResult.Success -> ResponseEntity.ok(UserResponse(result.id, request.nickname))
        is SignUpResult.DuplicateEmail -> ResponseEntity.status(HttpStatus.CONFLICT)
            .body(ErrorResponse.Conflict("이미 가입된 이메일입니다", result.existingId))
    }
```

예외는 **예외적인 것**에만 쓰세요.

## 연습

Spring 없이 **웹 계층의 뼈대를 그대로** 만들어 봅니다. 요청 DTO → 검증 → sealed 응답 → 렌더링.

1. `validate(request)` — `FieldError` 목록을 반환하세요. **에러가 있어도 첫 번째에서 멈추지 말고 전부 모으세요** (실제 `@Valid` 도 그렇게 동작합니다). `buildList { }` 가 편합니다.
   - `email` 에 `@` 가 없으면 → `"올바른 이메일 형식이 아닙니다"`
   - `nickname` 이 공백이면 → `"닉네임은 필수입니다"`, 그게 아닌데 길이가 2~10 밖이면 → `"닉네임은 2~10자여야 합니다"`
   - `age` 가 14~120 밖이면 → `"만 14세 이상만 가입할 수 있습니다"`
2. `signUp(request)` — 에러가 없으면 `Success(1001L, nickname)`, 있으면 `ValidationError(errors)`.
3. `render(response)` — `when` 으로 분기하세요. **`else` 절 금지** (Lesson 5).
   - 성공: `"200 OK id=1001 nickname=김개발"`
   - 실패: `"400 BAD_REQUEST "` 뒤에 `"필드: 메시지"` 를 `", "` 로 이어 붙입니다 (`joinToString`).

```kotlin starter
data class SignUpRequest(
    val email: String,
    val nickname: String,
    val age: Int,
)

data class FieldError(val field: String, val message: String)

sealed interface ApiResponse {
    data class Success(val id: Long, val nickname: String) : ApiResponse
    data class ValidationError(val errors: List<FieldError>) : ApiResponse
}

// TODO: 검증 규칙을 직접 구현하세요. 에러는 전부 모아서 반환합니다.
fun validate(request: SignUpRequest): List<FieldError> = TODO("구현하세요")

// TODO: 에러가 없으면 Success(1001L, nickname), 있으면 ValidationError(errors)
fun signUp(request: SignUpRequest): ApiResponse = TODO("구현하세요")

// TODO: when 으로 분기해 문자열을 만드세요. else 절을 쓰지 마세요.
fun render(response: ApiResponse): String = TODO("구현하세요")

fun main() {
    println(render(signUp(SignUpRequest("kim@corp.io", "김개발", 38))))
    println(render(signUp(SignUpRequest("not-an-email", "김개발", 38))))
    println(render(signUp(SignUpRequest("kim@corp.io", "  ", 10))))
}
```

```text expected
200 OK id=1001 nickname=김개발
400 BAD_REQUEST email: 올바른 이메일 형식이 아닙니다
400 BAD_REQUEST nickname: 닉네임은 필수입니다, age: 만 14세 이상만 가입할 수 있습니다
```

```text hint
`@Valid` 는 필드 하나가 틀렸다고 거기서 멈추지 않습니다. **모든 필드를 검사한 뒤 위반을 전부 모아** `MethodArgumentNotValidException` 에 담아 던지죠. 그래서 `validate` 도 "첫 에러를 만나면 return" 이 아니라 **에러를 쌓아 올리는** 구조여야 합니다. `render` 는 반대로 생각하세요 — `ApiResponse` 가 `sealed` 라는 사실 자체가 `else` 를 불필요하게 만듭니다.
---
쌓아 올리는 도구는 `buildList { }` 입니다. 블록 안에서 `add(...)` 를 부르기만 하면 그대로 리스트가 돼요. 판정에는 `contains("@")`, `isBlank()`, 그리고 범위 검사에 `!in 2..10` / `!in 14..120` 이 쓰입니다. `render` 는 `when (response) { is ApiResponse.Success -> ... }` 처럼 **하위 타입을 전부 나열**하고, 실패 메시지 연결에는 `joinToString(", ") { }` 를 쓰세요.
---
검증 세 덩어리(email / nickname / age)는 서로 독립이라 `if` 를 **나란히** 놓습니다. `else if` 로 이으면 첫 에러에서 멈추는 코드가 돼요. 예외가 하나 있습니다: nickname 은 "공백" 과 "길이" 가 **같은 필드 안의 우선순위 관계**라 여기만 `if (isBlank) ... else if (length !in 2..10) ...` 로 묶어야 합니다. 공백 `"  "` 는 길이로 보면 2자라 통과해 버리거든요. 그리고 `render` 의 `when` 에서 `else` 를 빼두면 나중에 `ApiResponse` 에 `Conflict` 를 추가하는 순간 컴파일러가 이 자리를 짚어줍니다 — `else` 를 쓰면 그 안전망이 사라집니다.
---
뼈대는 이렇습니다. 빈칸만 채우면 돼요.

`validate` 는 `buildList { }` 안에 `if (!request.email.contains("@")) add(FieldError("email", ___))` / `if (request.nickname.isBlank()) add(___) else if (request.nickname.length !in ___) add(___)` / `if (request.age !in ___) add(___)` 세 덩어리.

`signUp` 은 `val errors = validate(request)` 뒤에 `if (errors.isEmpty()) ApiResponse.Success(1001L, request.nickname) else ApiResponse.___(errors)`.

`render` 는 `when (response) { is ApiResponse.Success -> "200 OK id=${response.id} nickname=${response.nickname}" ; is ApiResponse.ValidationError -> "400 BAD_REQUEST " + response.errors.joinToString(___) { ___ } }`.
```

```kotlin solution
data class SignUpRequest(
    val email: String,
    val nickname: String,
    val age: Int,
)

data class FieldError(val field: String, val message: String)

sealed interface ApiResponse {
    data class Success(val id: Long, val nickname: String) : ApiResponse
    data class ValidationError(val errors: List<FieldError>) : ApiResponse
}

// @Valid 처럼 첫 에러에서 멈추지 않고 전부 모은다. buildList 안에서는 add 로 쌓기만 하면 된다.
fun validate(request: SignUpRequest): List<FieldError> = buildList {
    if (!request.email.contains("@")) {
        add(FieldError("email", "올바른 이메일 형식이 아닙니다"))
    }
    // 공백 검사가 길이 검사보다 우선 — 둘 다 걸리면 "필수" 메시지 하나만 나가야 한다.
    if (request.nickname.isBlank()) {
        add(FieldError("nickname", "닉네임은 필수입니다"))
    } else if (request.nickname.length !in 2..10) {
        add(FieldError("nickname", "닉네임은 2~10자여야 합니다"))
    }
    if (request.age !in 14..120) {
        add(FieldError("age", "만 14세 이상만 가입할 수 있습니다"))
    }
}

// 예상되는 실패는 예외가 아니라 sealed 반환값으로 표현한다.
fun signUp(request: SignUpRequest): ApiResponse {
    val errors = validate(request)
    return if (errors.isEmpty()) {
        ApiResponse.Success(1001L, request.nickname)
    } else {
        ApiResponse.ValidationError(errors)
    }
}

// else 가 없으므로, ApiResponse 에 케이스를 추가하면 여기가 컴파일 에러로 알려준다.
fun render(response: ApiResponse): String = when (response) {
    is ApiResponse.Success -> "200 OK id=${response.id} nickname=${response.nickname}"
    is ApiResponse.ValidationError ->
        "400 BAD_REQUEST " + response.errors.joinToString(", ") { "${it.field}: ${it.message}" }
}

fun main() {
    println(render(signUp(SignUpRequest("kim@corp.io", "김개발", 38))))
    println(render(signUp(SignUpRequest("not-an-email", "김개발", 38))))
    println(render(signUp(SignUpRequest("kim@corp.io", "  ", 10))))
}
```
