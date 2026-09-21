# Lesson 17 — 생성자 주입과 설정 바인딩

Spring 진영에서 "필드 주입 쓰지 마라, 생성자 주입 써라"는 10년 넘은 잔소리입니다. Java에서는 생성자, 필드 선언, 때로는 `@RequiredArgsConstructor`까지 동원해야 지킬 수 있는 원칙이었죠.

**Kotlin에서는 생성자 주입이 그냥 제일 짧습니다.** 원칙을 지키는 게 가장 편한 길이 되는, 보기 드문 경우입니다.

## 생성자 주입 — 한 줄로 끝난다

```java
// Java — Lombok 없이
@Service
public class OrderService {
    private final OrderRepository repository;
    private final PaymentClient paymentClient;

    public OrderService(OrderRepository repository, PaymentClient paymentClient) {
        this.repository = repository;
        this.paymentClient = paymentClient;
    }
}
```

```kotlin
// Kotlin
@Service
class OrderService(
    private val repository: OrderRepository,
    private val paymentClient: PaymentClient,
)
```

**선언과 대입이 한 곳에서 끝납니다.** `private val`이 프로퍼티 선언이자 생성자 파라미터예요. Lombok도 필요 없고, 의존성을 추가할 때 고쳐야 할 곳이 세 군데에서 한 군데로 줄어듭니다.

생성자가 하나면 Spring은 `@Autowired` 없이도 그 생성자를 씁니다. **붙이지 마세요.** (생성자가 둘 이상일 때만 하나를 지목하는 용도로 필요합니다.)

## 필드 주입이 Kotlin에서 더 나쁜 이유

Java의 필드 주입을 Kotlin으로 그대로 옮기면 이렇게 됩니다.

```kotlin
@Service
class OrderService {
    @Autowired lateinit var repository: OrderRepository   // 하지 마세요
}
```

Java에서 필드 주입이 나쁜 이유(테스트 시 목 주입 불가, 순환 참조 은폐, 불변성 포기)는 그대로 있고, **Kotlin에서는 두 개가 더 붙습니다.**

- **`val`을 포기해야 합니다.** 주입 시점에 값을 바꿔야 하니 `var`여야 하죠. 불변 기본값(Lesson 2)을 버리는 겁니다.
- **`lateinit`은 null 안정성을 런타임으로 되돌립니다.** 타입은 `OrderRepository`(non-null)인데, 주입 전에 접근하면 `UninitializedPropertyAccessException`이 납니다. Lesson 1에서 컴파일 타임으로 당겨놨던 문제를 다시 런타임으로 밀어내는 거예요.

> 실무에서 `lateinit`이 정당한 곳은 **테스트 클래스의 `@Autowired` 필드**와 프레임워크가 강제하는 소수 지점뿐입니다. 프로덕션 빈에 `lateinit var` 가 보이면 리뷰에서 잡으세요.

## 순환 참조 — Kotlin에서는 못 숨긴다

`A`가 `B`를, `B`가 `A`를 주입받는 상황. 필드 주입에서는 Spring이 빈을 먼저 만들고 나중에 필드를 채우기 때문에 **애플리케이션이 그냥 뜹니다.** 설계 결함이 몇 달 숨어 있죠.

생성자 주입에서는 `A`를 만들려면 `B`가 완성돼 있어야 하고 그 반대도 마찬가지라, **기동 시점에 바로 터집니다.**

```
The dependencies of some of the beans form a cycle:
   orderService -> paymentService -> orderService
```

Spring Boot 2.6부터 순환 참조는 기본 차단이고, `spring.main.allow-circular-references=true`로 풀 수 있습니다. **풀지 마세요.** 그건 설계 문제를 설정으로 덮는 겁니다. 답은 공통 로직을 제3의 빈으로 빼거나, 의존 방향을 한쪽으로 정리하는 것입니다.

## @ConfigurationProperties — data class 로 받기

`@Value("${...}")`를 프로퍼티마다 뿌리는 방식은 오타가 런타임까지 살아남고, 설정값이 코드 전역에 흩어집니다. 관련 설정은 **한 덩어리로 묶어 타입으로** 받으세요.

```yaml
mail:
  host: smtp.corp.io
  port: 587
  from: noreply@corp.io
```

```kotlin
@ConfigurationProperties(prefix = "mail")
data class MailProperties(
    val host: String,
    val port: Int = 25,
    val from: String? = null,
)
```

`val`만 있는 불변 data class가 그대로 설정 객체가 됩니다. 주 생성자 파라미터 이름이 프로퍼티 키와 매칭돼요.

**Boot 3에서의 변화**: Boot 2에서는 생성자 바인딩에 `@ConstructorBinding`을 붙여야 했지만, **Boot 3부터는 생성자가 하나뿐이면 자동으로 생성자 바인딩**입니다. 애노테이션을 붙이면 오히려 "클래스에 붙이면 안 된다"는 에러를 만날 수 있어요. 옛날 블로그 보고 따라 쓰다 걸리는 함정입니다.

활성화는 둘 중 하나로 합니다.

```kotlin
@ConfigurationPropertiesScan          // 메인 클래스에 — 권장
@SpringBootApplication
class Application

// 또는 개별 등록
@EnableConfigurationProperties(MailProperties::class)
```

### 기본값과 nullable — 의미가 다르다

```kotlin
data class MailProperties(
    val host: String,          // 필수. 없으면 기동 실패
    val port: Int = 25,        // 선택. 없으면 25
    val from: String? = null,  // 선택. 없으면 null
)
```

이 세 줄에 **설정 정책이 전부 문서화**돼 있습니다. `host`는 non-null에 기본값도 없으니 설정 누락 시 **애플리케이션이 뜨지 않습니다.** 운영에서 DB 비밀번호 빠진 채로 기동돼 첫 요청에서 죽는 것보다, 기동 자체가 실패하는 게 100배 낫습니다.

`port`처럼 **기본값이 쓰이려면 인자를 아예 넘기지 않아야** 합니다. `source["port"] ?: 25` 처럼 호출부에서 기본값을 다시 적으면 기본값이 두 군데가 되고, 언젠가 갈라집니다. (연습에서 직접 겪어보게 해뒀습니다.)

검증은 `init` 블록이나 `jakarta.validation` 으로 붙입니다.

```kotlin
@ConfigurationProperties(prefix = "mail")
@Validated
data class MailProperties(
    @field:NotBlank val host: String,
    @field:Min(1) val port: Int = 25,
)
```

`@field:` 가 붙은 이유는 Lesson 18에서 제대로 다룹니다. 지금은 **"Kotlin 프로퍼티에 검증 애노테이션을 붙일 땐 `@field:` 가 필요하다"**만 기억해두세요.

## @Bean 함수

`@Configuration` 클래스의 `@Bean` 메서드는 Kotlin에서 **식 본문(expression body)** 으로 짧아집니다.

```kotlin
@Configuration
class ClientConfig {

    @Bean
    fun mailSender(props: MailProperties): MailSender =
        MailSender(props.host, props.port)

    @Bean
    fun restClient(builder: RestClient.Builder): RestClient =
        builder.baseUrl("https://api.corp.io").build()
}
```

`@Bean` 함수의 파라미터는 **그 자체가 의존성 주입**입니다. 컨테이너가 타입으로 찾아 넣어주죠.

> ⚠️ `@Configuration` 클래스도 **CGLIB 프록시 대상**입니다(`@Bean` 메서드 간 호출에서 싱글턴을 보장하려고). Lesson 16의 `plugin.spring`이 `@Configuration`을 열어주지 않으면 여기서도 터집니다. **반환 타입은 생략하지 말고 명시하세요** — 추론된 타입이 구현 클래스로 잡히면 빈 타입 매칭이 의도와 달라질 수 있습니다.

`@Bean` 함수는 **내가 소유하지 않은 클래스**(외부 라이브러리)를 빈으로 만들 때 씁니다. 내 코드는 `@Service` 같은 스테레오타입으로 등록하는 게 짧고 명확해요.

## 연습

Spring 없이 **생성자 주입과 설정 바인딩을 손으로** 만들어 봅니다. 컨테이너가 하는 일이 사실 별거 아니라는 걸 보는 게 목적입니다.

1. `bind(source)` — 맵에서 값을 꺼내 `MailProperties`로 바인딩하세요.
   - `host` 가 없거나 비어 있으면 `init` 의 `require`가 던지게 두세요 (`source["host"] ?: ""`).
   - **`port` 키가 없으면 data class 의 기본값 `25`가 쓰여야 합니다.** 호출부에 `25`를 다시 적으면 안 됩니다. 인자를 아예 넘기지 않는 분기를 만드세요 (이름 있는 인자가 편합니다).
2. `BeanContainer.get(type)` — 등록된 빈을 타입으로 찾아 반환하세요. 없으면 `error("bean 없음: ${type.name}")`.

`main`은 이미 **컨테이너에서 꺼낸 빈을 생성자에 넣어 다음 빈을 만드는** 흐름으로 짜여 있습니다. Spring이 기동할 때 하는 일이 정확히 이겁니다.

```kotlin starter
data class MailProperties(
    val host: String,
    val port: Int = 25,
    val from: String? = null,
) {
    init {
        require(host.isNotBlank()) { "host 는 필수입니다" }
    }
}

class MailSender(private val props: MailProperties) {
    fun send(to: String): String =
        "${props.from ?: "noreply@corp.io"} -> $to via ${props.host}:${props.port}"
}

class BeanContainer {
    private val beans = mutableMapOf<Class<*>, Any>()

    fun register(bean: Any) {
        beans[bean.javaClass] = bean
    }

    // TODO: 타입으로 빈을 찾아 반환하세요. 없으면 error("bean 없음: ${type.name}")
    fun <T : Any> get(type: Class<T>): T = TODO("구현하세요")
}

// TODO: source 를 MailProperties 로 바인딩하세요. port 키가 없으면 기본값 25 가 쓰여야 합니다.
fun bind(source: Map<String, String>): MailProperties = TODO("구현하세요")

fun main() {
    val container = BeanContainer()
    container.register(bind(mapOf("host" to "smtp.corp.io", "port" to "587")))
    container.register(MailSender(container.get(MailProperties::class.java)))

    println(container.get(MailSender::class.java).send("kim@corp.io"))
    println(bind(mapOf("host" to "localhost")))
    println(runCatching { bind(mapOf("port" to "25")) }.exceptionOrNull()?.message)
    println(runCatching { container.get(String::class.java) }.exceptionOrNull()?.message)
}
```

```text expected
noreply@corp.io -> kim@corp.io via smtp.corp.io:587
MailProperties(host=localhost, port=25, from=null)
host 는 필수입니다
bean 없음: java.lang.String
```

```text hint
DI 컨테이너의 정체는 **`Class` 를 키로 쓰는 맵** 하나입니다. `register` 가 이미 그렇게 담고 있으니(`beans[bean.javaClass] = bean`), `get` 은 같은 키로 꺼내기만 하면 돼요. 바인딩 쪽은 다른 감각이 필요합니다 — Kotlin의 기본값은 **"인자를 넘기지 않았을 때"** 만 쓰이므로, "값이 없다"를 `null` 로 표현해서 넘기면 기본값은 영원히 안 쓰입니다.
---
`get` 은 맵 조회 뒤 `?: error("bean 없음: ${type.name}")` 로 없는 경우를 끊고, 반환은 `type.cast(bean)` 으로 합니다 (`as T` 는 제네릭이 지워져서 컴파일러가 경고를 냅니다). `bind` 는 `source["port"]` 가 `null` 인지로 **분기**하고, 호출할 때 `MailProperties(host = ..., from = ...)` 처럼 **이름 있는 인자**를 쓰면 원하는 파라미터만 골라 넘길 수 있습니다.
---
`bind` 의 핵심은 "`port` 를 안 넘기는 경로를 실제로 만드는 것"입니다. `MailProperties(host, source["port"]?.toInt() ?: 25, from)` 처럼 쓰고 싶어지지만 그러면 `25` 가 data class 와 호출부 **두 군데**에 적히고 언젠가 갈라집니다. `if (port == null) MailProperties(host = ..., from = ...)` 과 `else MailProperties(host = ..., port = ..., from = ...)` 두 갈래로 나누세요. `host` 는 `source["host"] ?: ""` 로 **그대로 넘겨서** data class 의 `init` 안 `require` 가 던지게 둬야 `host 는 필수입니다` 메시지가 나옵니다 — `bind` 에서 미리 검사하면 안 됩니다. `from` 은 없으면 `null` 이고 기본값도 `null` 이라 그냥 넘겨도 됩니다.
---
뼈대는 이렇습니다. 빈칸만 채우면 돼요.

`get`: `val bean = beans[type] ?: error(___); return type.cast(bean)`

`bind`: `val host = source["host"] ?: ""` / `val from = source["from"]` / `val port = source["port"]` 를 꺼낸 뒤 `return if (port == null) MailProperties(host = host, from = from) else MailProperties(host = host, port = ___, from = from)`
```

```kotlin solution
data class MailProperties(
    val host: String,
    val port: Int = 25,
    val from: String? = null,
) {
    init {
        require(host.isNotBlank()) { "host 는 필수입니다" }
    }
}

class MailSender(private val props: MailProperties) {
    fun send(to: String): String =
        "${props.from ?: "noreply@corp.io"} -> $to via ${props.host}:${props.port}"
}

class BeanContainer {
    private val beans = mutableMapOf<Class<*>, Any>()

    fun register(bean: Any) {
        beans[bean.javaClass] = bean
    }

    // 컨테이너가 하는 일의 전부: 타입을 키로 찾아 그 타입으로 캐스팅해 돌려준다.
    fun <T : Any> get(type: Class<T>): T {
        val bean = beans[type] ?: error("bean 없음: ${type.name}")
        return type.cast(bean)
    }
}

// port 키가 없으면 인자를 아예 넘기지 않는다 = data class 의 기본값 25 가 쓰인다.
// 호출부에 25 를 다시 적으면 기본값이 두 군데가 되고 언젠가 갈라진다.
// host 는 빈 문자열 그대로 넘겨 init 의 require 가 던지게 둔다.
fun bind(source: Map<String, String>): MailProperties {
    val host = source["host"] ?: ""
    val from = source["from"]
    val port = source["port"]
    return if (port == null) MailProperties(host = host, from = from)
    else MailProperties(host = host, port = port.toInt(), from = from)
}

fun main() {
    val container = BeanContainer()
    container.register(bind(mapOf("host" to "smtp.corp.io", "port" to "587")))
    container.register(MailSender(container.get(MailProperties::class.java)))

    println(container.get(MailSender::class.java).send("kim@corp.io"))
    println(bind(mapOf("host" to "localhost")))
    println(runCatching { bind(mapOf("port" to "25")) }.exceptionOrNull()?.message)
    println(runCatching { container.get(String::class.java) }.exceptionOrNull()?.message)
}
```
