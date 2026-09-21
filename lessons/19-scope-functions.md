# Lesson 19 — 스코프 함수 완전 정복 — let/run/with/apply/also

Kotlin에서 **가장 많이 쓰이고, 가장 많이 잘못 쓰이는** 다섯 함수입니다.
"한 줄로 줄였다"가 목적이 되는 순간 읽을 수 없는 코드가 나옵니다.
이 레슨의 목표는 다섯 개를 외우는 게 아니라 **"이 자리에는 뭐가 맞나"를 판단하는 기준**을 갖는 겁니다.

## 하는 일은 하나다

다섯 다 하는 일이 같습니다. **객체를 받아서 임시 스코프를 만들고, 블록을 실행한다.**
다른 건 딱 두 가지뿐입니다.

1. **블록 안에서 객체를 어떻게 참조하나** — `it` 인가 `this` 인가
2. **블록이 끝나면 무엇이 나오나** — 객체 자신인가 람다의 마지막 식인가

이 두 축이 2×2 = 4, 거기에 확장이 아닌 `with` 가 하나 더 붙어 다섯입니다. 그게 전부예요.

|  | `it` 로 받음 | `this` 로 받음 |
|---|---|---|
| **람다 결과** 를 반환 | `let` | `run` / `with` |
| **수신 객체** 를 반환 | `also` | `apply` |

대각선 두 개(`let` ↔ `apply`)만 확실히 잡으면 나머지는 따라옵니다.

## 하나씩

### `let` — `it`, 람다 결과 반환

```kotlin
val length: Int? = name?.let { it.trim().length }
```

**제일 중요한 용도는 `?.let { }`** — 앞이 null 이 아닐 때만 블록을 실행합니다(L8).
람다 파라미터라서 **이름을 붙일 수 있다**는 게 `run` 대비 장점입니다.

```kotlin
user?.let { u -> repository.save(u) }   // it 보다 u 가 읽기 쉬울 때
```

### `run` — `this`, 람다 결과 반환

```kotlin
val status = config.run {
    if (tls) "보안 $host:$port" else "평문 $host:$port"
}
```

객체의 프로퍼티를 **여러 번** 읽어서 하나의 값을 계산할 때. `it.` 접두사가 반복되면
`let` 대신 `run` 입니다.

수신 객체 없는 형태도 있습니다 — **변수 스코프를 좁히는** 용도입니다.

```kotlin
val port = run {
    val raw = System.getenv("PORT")   // raw 는 이 블록 밖으로 안 샌다
    raw?.toIntOrNull() ?: 8080
}
```

### `with` — `this`, 람다 결과 반환, **확장 함수가 아님**

```kotlin
val report = with(order) {
    "주문 $id / $amount원 / $customerName"
}
```

`run` 과 하는 일이 같은데 **인자로 받습니다.** 확장이 아니라서 따라오는 결론이 하나 있어요 —
**`?.` 로 이을 수 없습니다.**

```kotlin
order?.run { ... }        // OK — null 이면 통째로 건너뜀
with(order) { ... }       // order 가 nullable 이면 블록 안에서 또 null 체크해야 함
```

그래서 실무 기준은 간단합니다. **null 가능성이 있으면 `run`, non-null 객체를
"이 블록에서 집중해서 다룬다"는 선언이면 `with`.**

### `apply` — `this`, **수신 객체 반환**

```kotlin
val props = java.util.Properties().apply {
    setProperty("user", "admin")
    setProperty("timeout", "3000")
}
```

Java의 "객체 생성 → 세터 여러 번 → 변수에 담기"가 **한 표현식**이 됩니다.
빌더가 없는 클래스에 빌더를 흉내 내는 표준 관용구예요.
시그니처가 `T.(T.() -> Unit): T` — L18에서 본 **수신 객체 지정 람다**가 여기 쓰입니다.

### `also` — `it`, **수신 객체 반환**

```kotlin
val saved = repository.save(order)
    .also { log.info("저장 완료: ${it.id}") }
```

**원본을 그대로 흘려보내면서 곁다리 작업만 얹습니다.** 로깅, 검증, 메트릭.
`apply` 와 반환값은 같지만 `it` 을 쓰기 때문에 **"이건 이 객체와 별개의 일"** 이라는
신호가 됩니다. 이 뉘앙스 차이가 생각보다 크게 읽힙니다.

## 선택 기준표 — 이 표 하나만 외우세요

| 상황 | 쓸 것 | 이유 |
|---|---|---|
| null 이 아닐 때만 실행 | `?.let { }` | 확장 + 람다 결과 |
| 객체를 만들고 설정해서 반환 | `apply { }` | `this` + 자신 반환 |
| 체인 중간에 로그/검증 끼우기 | `also { }` | 부수 효과라는 신호 |
| 객체 프로퍼티 여러 개로 값 계산 (nullable) | `?.run { }` | `this` + 람다 결과 |
| 같은 계산인데 non-null 이 확실 | `with(x) { }` | 의도 선언용 |
| 지역 변수 스코프 좁히기 | `run { }` (수신 없음) | 변수 누출 차단 |
| 그냥 값 하나 변환 | **아무것도 안 씀** | `x.trim()` 이면 충분 |

마지막 줄이 제일 중요합니다. **스코프 함수를 안 쓰는 게 정답인 경우가 제일 많습니다.**
그리고 이 표는 **팀 컨벤션으로 못 박으세요** — 기준이 없으면 매번 "왜 여기만 `with`?"가 나옵니다.

## 안티패턴 — 리뷰에서 이렇게 지적하세요

### 1. 반환값을 안 쓰면서 `let`

```kotlin
user?.let { log.info("사용자: ${it.name}") }   // ✗ 반환값을 버린다
user?.also { log.info("사용자: ${it.name}") }  // △ 의도는 맞지만
if (user != null) log.info("사용자: ${user.name}")  // ✓ 제일 읽힌다
```

`let` 은 **변환**입니다. 변환 결과를 안 쓸 거면 `let` 이 아닙니다.

### 2. `let` 중첩 3단

```kotlin
a?.let { x -> b?.let { y -> c?.let { z -> f(x, y, z) } } }   // ✗
```

`it` 안에 `it` 이 있는 순간 끝입니다. 세 값이 모두 필요하면 **조기 반환**으로 푸세요.

```kotlin
val x = a ?: return
val y = b ?: return
val z = c ?: return
f(x, y, z)
```

### 3. `apply` 안에서 수신 객체와 무관한 일

```kotlin
val order = Order().apply {
    amount = 10000
    notificationService.send(customer)   // ✗ 이게 왜 여기 있나
}
```

`apply` 블록은 **"이 객체를 설정한다"** 는 계약입니다. 다른 객체를 건드리면 깹니다.
그런 건 `also` 로 빼거나 블록 밖으로 내보내세요.

### 4. `this` 와 `it` 이 섞여 뭘 가리키는지 모호해짐

```kotlin
config.apply {
    servers.forEach { it.start() }   // 이 it 은? 바깥 this 는?
}
```

중첩되는 순간 **암묵적 수신 객체는 독**입니다. 두 단계 이상 중첩되면 지역 변수로 푸세요.
**"짧다"와 "읽힌다"는 다릅니다.**

> 면접관 시점: "`let` 과 `also` 의 차이는?" 은 함정 질문이 아닙니다. **반환값**이라고
> 답하면 절반, **"그래서 `also` 는 부수 효과라는 의도를 전달한다"** 까지 가면 만점입니다.
> 스코프 함수는 기능이 아니라 **의도 표현 도구**라는 걸 아는지 보는 질문이에요.

## 연습

메일 설정과 사용자 정보를 다루는 함수 다섯 개를 각각 **지정된 스코프 함수로** 작성하세요.
다섯 개를 전부 구분해서 쓰는 게 이 연습의 전부입니다.

1. `buildConfig()` — **`apply`** 로 `MailConfig` 를 만들고 host/port/tls 를 설정해 반환
2. `logged(config)` — **`also`** 로 `[log] config=host:port` 를 출력하고 설정을 그대로 반환
3. `statusOf(config)` — **`run`** 으로 `tls` 면 `"보안 연결 host:port"`, 아니면 `"평문 연결 host:port"`
4. `normalize(user)` — **`let`** 으로 이메일을 trim + 소문자 변환. 이메일이 없으면 `"(없음)"`
5. `describe(user)` — **`with`** 로 `"이름 (원본: 이메일)"`. 이메일이 null 이면 `원본: null`

```kotlin starter
class MailConfig {
    var host: String = ""
    var port: Int = 0
    var tls: Boolean = false
}

data class User(val name: String, val email: String?)

// TODO 1: apply — host="smtp.example.com", port=587, tls=true
fun buildConfig(): MailConfig = TODO()

// TODO 2: also — "[log] config=smtp.example.com:587" 출력 후 config 그대로 반환
fun logged(config: MailConfig): MailConfig = TODO()

// TODO 3: run — this 문맥에서 tls 에 따라 상태 문자열 계산
fun statusOf(config: MailConfig): String = TODO()

// TODO 4: let — 이메일이 있으면 trim().lowercase(), 없으면 "(없음)"
fun normalize(user: User): String = TODO()

// TODO 5: with — this 문맥에서 name 과 email 을 읽어 한 줄 요약
fun describe(user: User): String = TODO()

fun main() {
    val config = logged(buildConfig())
    println(statusOf(config))

    val users = listOf(User("Kim", "  KT@Example.COM "), User("Lee", null))
    for (u in users) {
        println(describe(u))
        println(normalize(u))
    }
}
```

```text expected
[log] config=smtp.example.com:587
보안 연결 smtp.example.com:587
Kim (원본:   KT@Example.COM )
kt@example.com
Lee (원본: null)
(없음)
```

```text hint
다섯 자리에 뭐가 들어갈지는 **두 축**으로 정해집니다. 1번과 2번은 **수신 객체를 반환**해야 하고(`apply`/`also`), 3·4·5번은 **람다 결과를 반환**해야 합니다(`run`/`let`/`with`). 그중 `this` 로 받는 건 `apply`/`run`/`with`, `it` 으로 받는 건 `also`/`let` 이에요.
---
`apply` 는 블록 안에서 `host = ...` 처럼 **접두사 없이** 프로퍼티에 대입합니다. `also` 는 `it.host` 처럼 `it` 을 거칩니다. `run` 과 `with` 는 블록의 **마지막 식**이 그대로 반환값이 되니 `return` 을 쓰지 마세요. `let` 은 `user.email?.let { ... }` 형태로 쓰고, null 일 때의 값은 `?:` 로 받습니다.
---
`statusOf` 에서 `run` 을 쓰면 블록 안이 `if (tls) "보안 연결 $host:$port" else "평문 연결 $host:$port"` 한 줄입니다 — `config.` 접두사가 전부 사라지는 게 `run` 을 쓰는 이유예요. `describe` 의 `with(user)` 안에서 `email` 이 null 이면 문자열 템플릿 `$email` 이 자동으로 `null` 을 찍어줍니다(별도 분기 불필요). `normalize` 에서 `?.let` 뒤에 `?: "(없음)"` 을 붙이면 null 케이스가 끝납니다. 그리고 `logged` 는 **출력만 하고 config 를 그대로 흘려보내야** 하므로 `also` 말고는 답이 없습니다.
---
뼈대는 이렇습니다. 빈칸만 채우세요.

`fun buildConfig(): MailConfig = MailConfig().___ { host = "smtp.example.com"; port = 587; tls = true }`

`fun logged(config: MailConfig): MailConfig = config.___ { println("[log] config=${it.host}:${it.port}") }`

`fun statusOf(config: MailConfig): String = config.___ { if (tls) "보안 연결 $host:$port" else "평문 연결 $host:$port" }`

`fun normalize(user: User): String = user.email?.___ { it.trim().lowercase() } ?: "(없음)"`

`fun describe(user: User): String = ___(user) { "$name (원본: $email)" }`
```

```kotlin solution
class MailConfig {
    var host: String = ""
    var port: Int = 0
    var tls: Boolean = false
}

data class User(val name: String, val email: String?)

// apply: this 로 받고 수신 객체를 반환 → 생성 직후 설정에 딱 맞는다.
fun buildConfig(): MailConfig = MailConfig().apply {
    host = "smtp.example.com"
    port = 587
    tls = true
}

// also: 원본을 그대로 흘려보내면서 로깅만 얹는다. it 이라 "곁다리 작업"이라는 신호가 된다.
fun logged(config: MailConfig): MailConfig = config.also {
    println("[log] config=${it.host}:${it.port}")
}

// run: this 로 받아 프로퍼티 여러 개를 접두사 없이 읽고, 마지막 식이 반환값이 된다.
fun statusOf(config: MailConfig): String = config.run {
    if (tls) "보안 연결 $host:$port" else "평문 연결 $host:$port"
}

// let: null 이 아닐 때만 변환. 실패 경로는 ?: 하나로 받는다.
fun normalize(user: User): String = user.email?.let { it.trim().lowercase() } ?: "(없음)"

// with: 확장이 아니라 인자로 받는다. non-null 객체를 한 블록에서 집중해 다룬다는 선언.
fun describe(user: User): String = with(user) {
    "$name (원본: $email)"
}

fun main() {
    val config = logged(buildConfig())
    println(statusOf(config))

    val users = listOf(User("Kim", "  KT@Example.COM "), User("Lee", null))
    for (u in users) {
        println(describe(u))
        println(normalize(u))
    }
}
```
