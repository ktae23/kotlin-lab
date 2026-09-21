# Lesson 9 — 위임 (by) 과 프로퍼티 위임

"상속보다 합성(composition over inheritance)" — 20년 동안 모든 책이 말했지만 Java에서는 아무도 안 지켰습니다. 이유는 간단합니다. **합성이 너무 귀찮았기 때문**입니다. Kotlin은 그 귀찮음을 키워드 하나로 없앴습니다.

## 문제: Java의 데코레이터 보일러플레이트

로깅만 추가하고 싶은데, 인터페이스에 메서드가 10개라면?

```java
interface OrderRepository {
    String find(String id);
    void save(String id);
    void delete(String id);
    // ... 7개 더
}

class LoggingRepository implements OrderRepository {
    private final OrderRepository inner;
    LoggingRepository(OrderRepository inner) { this.inner = inner; }

    @Override public String find(String id) {
        System.out.println("조회 시작: " + id);
        return inner.find(id);          // 내가 진짜 하고 싶었던 건 이 3줄뿐
    }
    @Override public void save(String id) { inner.save(id); }      // 그런데
    @Override public void delete(String id) { inner.delete(id); }  // 이런
    // ... 나머지 7개도 전부 손으로 위임          <- 쓰레기 코드 9개
}
```

그래서 다들 이렇게 했습니다 — `extends RealRepository`. 상속으로 때우고, 부모가 바뀌면 자식이 터지는 **취약한 기반 클래스 문제(fragile base class)** 를 떠안았습니다. 인터페이스 메서드가 하나 늘 때마다 데코레이터 클래스 전부를 고치는 것보다 나았으니까요.

## 클래스 위임 — `by`

```kotlin
class LoggingRepository(private val inner: OrderRepository) : OrderRepository by inner {
    override fun find(id: String): String {
        println("조회 시작: $id")
        return inner.find(id)
    }
}
```

끝입니다. `: OrderRepository by inner` 는 **"이 인터페이스의 모든 구현을 `inner`에게 넘겨라"** 는 뜻이고, 컴파일러가 위임 메서드를 자동 생성합니다. 직접 `override`한 것만 내 구현이 이깁니다.

인터페이스에 메서드가 100개든, 나중에 10개가 추가되든 **이 클래스는 손댈 필요가 없습니다.** 합성의 비용이 0이 됐으니, 이제 정말로 상속 대신 합성을 쓸 수 있습니다.

> 한 가지 함정: 위임 대상이 **자기 자신을 다시 호출해도 `inner`의 구현이 돌아갑니다.** `inner.save()` 안에서 `find()`를 부르면 그건 `LoggingRepository.find`가 아니라 `inner.find`예요. 상속의 가상 호출과 다릅니다. 데코레이터에서 이걸 착각해 "왜 로그가 안 찍히지?" 하는 사람이 많습니다.

실무 활용:
- `class CachedRepo(inner: Repo) : Repo by inner` — 캐시 레이어
- `class ReadOnlyList<T>(list: List<T>) : List<T> by list` — 읽기 전용 래핑
- `class TracedClient(c: HttpClient) : HttpClient by c` — 분산 추적 삽입

## 프로퍼티 위임 — `by` 의 두 번째 얼굴

같은 키워드가 **프로퍼티의 getter/setter를 다른 객체에 넘기는** 데도 쓰입니다.

```kotlin
val schema: String by lazy { loadSchema() }
```

Java에서 지연 초기화를 안전하게 하려면 DCL(double-checked locking)을 손으로 썼습니다.

```java
private volatile String schema;
public String getSchema() {
    String r = schema;
    if (r == null) {
        synchronized (this) {
            r = schema;
            if (r == null) { r = loadSchema(); schema = r; }
        }
    }
    return r;
}
```

이게 `by lazy { }` 한 줄입니다. 기본이 스레드 안전(`LazyThreadSafetyMode.SYNCHRONIZED`)이고, 필요 없으면 `by lazy(LazyThreadSafetyMode.NONE) { }` 로 락을 끕니다. **`val`에만 쓸 수 있고, 값은 딱 한 번만 계산됩니다.**

### 표준 위임 3종

```kotlin
import kotlin.properties.Delegates

class Settings {
    // 최초 접근 시 1회 계산
    val schema: String by lazy { "v1" }

    // 값이 바뀔 때마다 콜백 (감사 로그, 이벤트 발행에 유용)
    var level: String by Delegates.observable("INFO") { _, old, new ->
        println("level: $old -> $new")
    }

    // 나중에 주입되지만 non-null 로 쓰고 싶을 때. 미설정 접근 시 IllegalStateException
    var context: String by Delegates.notNull()
}
```

`Delegates.vetoable`도 있습니다 — 콜백이 `false`를 반환하면 변경을 **거부**합니다.

`notNull()`은 `lateinit var`와 비슷하지만 **원시 타입(`Int`, `Boolean`)에도 쓸 수 있습니다.** `lateinit`은 원시 타입에 못 씁니다. 이게 둘을 가르는 기준입니다.

### map 위임 — 동적 데이터를 타입으로 읽기

```kotlin
class User(private val source: Map<String, Any?>) {
    val name: String by source
    val age: Int by source
}

val user = User(mapOf("name" to "buzz", "age" to 41))
println(user.name)   // buzz
```

JSON, 설정 파일처럼 키-값으로 들어온 걸 프로퍼티처럼 읽습니다. 키가 없으면 런타임 예외라 **외부 입력에 바로 쓰면 위험합니다.** 내부 설정 정도에만.

## 커스텀 위임 — 규칙은 두 개뿐

`getValue` / `setValue` 연산자만 있으면 무엇이든 위임 대상이 됩니다.

```kotlin
import kotlin.reflect.KProperty

class TrimDelegate(private var value: String = "") {
    operator fun getValue(thisRef: Any?, property: KProperty<*>): String = value
    operator fun setValue(thisRef: Any?, property: KProperty<*>, newValue: String) {
        value = newValue.trim()
    }
}

class Form {
    var owner: String by TrimDelegate()
}
```

- `val`이면 `getValue`만, `var`면 둘 다 필요
- `thisRef` — 프로퍼티를 가진 객체. `property` — 프로퍼티 메타데이터(`property.name`으로 이름을 얻습니다)
- 인터페이스를 구현할 필요는 없습니다. **연산자 이름만 맞으면 됩니다** (`ReadWriteProperty<T, V>` 를 구현해도 되고요)

실무에서 만드는 것들: 값 검증, 자동 trim/정규화, 접근 시 감사 로그, 설정 서버에서 읽어오는 프로퍼티, 스레드 로컬 저장.

> 남용 경고: 프로퍼티 위임은 **평범한 대입문 뒤에 로직을 숨깁니다.** `user.name = x` 한 줄이 네트워크 호출일 수도 있게 되는 거예요. 팀 코드에 넣을 때는 "읽는 사람이 위임을 의심할 이유가 있는가"를 먼저 물으세요. `lazy`처럼 관용구로 굳은 것 외에는 아껴 쓰는 게 맞습니다.

## 연습

클래스 위임과 프로퍼티 위임을 한 번에 씁니다.

1. `LoggingRepository` — `OrderRepository by inner` 로 위임하고, **`find` 만** 오버라이드해서 `"조회 시작: $id"` 를 출력한 뒤 `inner.find(id)` 결과를 반환. `save` 는 손대지 마세요
2. `Settings` 의 세 프로퍼티
   - `schema` — `by lazy`, 계산 시 `"스키마 로딩(한 번만)"` 출력하고 `"v1"` 반환
   - `level` — `Delegates.observable("INFO")`, 변경 시 `"level: $old -> $new"` 출력
   - `owner` — **커스텀 위임** `TrimDelegate`, 저장 시 앞뒤 공백 제거
3. `TrimDelegate` 의 `getValue` / `setValue` 구현

```kotlin starter
import kotlin.properties.Delegates
import kotlin.reflect.KProperty

interface OrderRepository {
    fun find(id: String): String
    fun save(id: String)
}

class InMemoryRepository : OrderRepository {
    override fun find(id: String): String = "Order($id)"
    override fun save(id: String) {
        println("저장: $id")
    }
}

// TODO 1: by 로 inner 에 위임하고, find 만 오버라이드해서 "조회 시작: $id" 를 출력하세요.
//         save 는 직접 구현하지 마세요.
class LoggingRepository(private val inner: OrderRepository)

// TODO 3: setValue 에서 trim 해 저장하는 커스텀 위임을 완성하세요.
class TrimDelegate(private var value: String = "")

class Settings {
    // TODO 2: lazy / Delegates.observable / TrimDelegate 로 세 프로퍼티를 선언하세요.
    //         schema: String, level: String, owner: String
}

fun main() {
    val repo = LoggingRepository(InMemoryRepository())
    println(repo.find("A-1"))
    repo.save("A-1")

    val settings = Settings()
    println(settings.schema)
    println(settings.schema)
    settings.level = "DEBUG"
    println(settings.level)
    settings.owner = "   buzz   "
    println("[${settings.owner}]")
}
```

```text expected
조회 시작: A-1
Order(A-1)
저장: A-1
스키마 로딩(한 번만)
v1
v1
level: INFO -> DEBUG
DEBUG
[buzz]
```

```text hint
이 연습에는 같은 키워드 `by` 가 **두 가지 다른 의미**로 나옵니다. 1번은 클래스 위임 — "이 인터페이스 구현을 통째로 다른 객체에게 넘겨라". 2번과 3번은 프로퍼티 위임 — "이 프로퍼티의 읽기/쓰기를 다른 객체에게 넘겨라". 먼저 `expected` 출력을 보세요. `save` 에는 로그가 안 찍히고, `schema` 를 두 번 읽었는데 로딩 메시지는 **한 번만** 나옵니다. 이 두 가지가 각각 무엇을 증명하는지 생각해 보면 방향이 잡힙니다.
---
쓸 도구를 나열합니다. 클래스 위임은 상속하듯 콜론 뒤에 `: OrderRepository by inner`. 프로퍼티는 각각 `by lazy { }`, `by Delegates.observable(초기값) { _, old, new -> }`, `by TrimDelegate()`. 커스텀 위임은 **인터페이스를 구현할 필요가 없습니다** — `operator fun getValue(...)` 와 `operator fun setValue(...)` 라는 **이름만 맞으면** 컴파일러가 알아서 연결합니다. `import` 두 줄은 starter 에 이미 있으니 그대로 두세요.
---
구조를 짚습니다. `LoggingRepository` 에서 `save` 를 **일부러 안 쓰는 게 답**입니다 — `by inner` 가 위임 메서드를 자동 생성하고, 직접 `override` 한 `find` 만 내 구현이 이깁니다. 생성자 파라미터 `private val inner` 를 `by` 절에 그대로 쓸 수 있어요. `by lazy { }` 의 블록은 **최초 접근 때 딱 한 번** 실행되므로 `println` 을 블록 안에 넣어야 "한 번만" 이 증명됩니다 (블록의 마지막 식이 프로퍼티 값이 되니 `"v1"` 을 끝에 두세요). `observable` 은 setter 가 호출될 때마다 `(프로퍼티, 이전값, 새값)` 세 개를 넘겨주는데, 첫 번째는 안 쓰니 `_` 로 버립니다. `TrimDelegate` 는 `val` 이면 `getValue` 만, `var` 면 둘 다 필요하고 — `owner` 는 대입을 받으니 `var` 입니다. `setValue` 의 세 번째 파라미터가 대입된 새 값이므로, **저장 직전에** `.trim()` 을 걸면 됩니다.
---
뼈대입니다. 빈칸을 채우세요.

`class LoggingRepository(private val inner: OrderRepository) : OrderRepository ___ inner { override fun find(id: String): String { println("조회 시작: $id"); return ___ } }`

`class TrimDelegate(private var value: String = "") { operator fun getValue(thisRef: Any?, property: KProperty<*>): String = ___; operator fun setValue(thisRef: Any?, property: KProperty<*>, newValue: String) { value = ___ } }`

`class Settings { val schema: String by ___ { println("스키마 로딩(한 번만)"); "v1" }; var level: String by Delegates.___("INFO") { _, old, new -> println("level: $old -> $new") }; var owner: String by ___ }`
```

```kotlin solution
import kotlin.properties.Delegates
import kotlin.reflect.KProperty

interface OrderRepository {
    fun find(id: String): String
    fun save(id: String)
}

class InMemoryRepository : OrderRepository {
    override fun find(id: String): String = "Order($id)"
    override fun save(id: String) {
        println("저장: $id")
    }
}

// by inner 가 save 위임 메서드를 자동 생성한다. 직접 override 한 find 만 내 구현이 이긴다.
class LoggingRepository(private val inner: OrderRepository) : OrderRepository by inner {
    override fun find(id: String): String {
        println("조회 시작: $id")
        return inner.find(id)
    }
}

class TrimDelegate(private var value: String = "") {
    operator fun getValue(thisRef: Any?, property: KProperty<*>): String = value
    operator fun setValue(thisRef: Any?, property: KProperty<*>, newValue: String) {
        value = newValue.trim()
    }
}

class Settings {
    // lazy 블록은 최초 접근 때 딱 한 번 실행된다 — 두 번째 읽기에서는 로딩 로그가 안 찍힌다.
    val schema: String by lazy {
        println("스키마 로딩(한 번만)")
        "v1"
    }

    var level: String by Delegates.observable("INFO") { _, old, new ->
        println("level: $old -> $new")
    }

    var owner: String by TrimDelegate()
}

fun main() {
    val repo = LoggingRepository(InMemoryRepository())
    println(repo.find("A-1"))
    repo.save("A-1")

    val settings = Settings()
    println(settings.schema)
    println(settings.schema)
    settings.level = "DEBUG"
    println(settings.level)
    settings.owner = "   buzz   "
    println("[${settings.owner}]")
}
```
