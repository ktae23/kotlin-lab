# Lesson 13 — object · companion object · enum

Kotlin 코드를 열었을 때 Java 개발자가 가장 먼저 "어? 이게 없네" 하는 키워드가 **`static`** 입니다. 없는 게 아니라 **객체로 바뀐** 거예요. 그 자리를 채우는 세 가지를 한 번에 정리합니다.

## object 선언 — 싱글턴이 키워드 하나

Java 에서 싱글턴을 제대로 만들려면 `private static volatile` 필드에 이중 검사 락을 걸거나, 그게 싫어서 `enum Singleton { INSTANCE }` 관용구를 썼습니다. `volatile` 하나 빠뜨리면 미묘하게 깨지는 코드였죠. Kotlin 은 그냥:

```kotlin
object ConnectionPool {
    private val conns = mutableListOf<String>()
    fun borrow(): String = conns.removeLast()
}

ConnectionPool.borrow()   // 타입 이름이 곧 인스턴스
```

`object` 선언은 **클래스 정의와 유일한 인스턴스 생성을 동시에** 합니다. 초기화가 JVM 클래스 로딩 규칙을 타기 때문에 **스레드 안전이 언어 차원에서 보장**돼요. 이중 검사 락을 손으로 쓸 일이 없습니다.

일반 클래스가 하는 건 거의 다 합니다 — 인터페이스 구현, 상속, 프로퍼티. 단 **생성자를 가질 수 없습니다.** 아무도 호출할 수 없으니까요.

## companion object — static 이 있던 자리

```java
public class Member {
    public static final int MAX_NAME = 20;
    public static Member of(String raw) { ... }
}
```
```kotlin
class Member private constructor(val name: String) {
    companion object {
        const val MAX_NAME = 20
        fun of(raw: String): Member = Member(raw.trim())
    }
}

Member.of("  박경태  ")   // 바깥에서는 static 처럼 보인다
```

### 왜 Kotlin 엔 static 이 없나

면접에서 한 번쯤 나오는 질문입니다. 답은 **"모든 것이 객체여야 언어 기능이 일관되게 적용되기 때문"**. `companion object` 는 진짜 객체라서

- **인터페이스를 구현할 수 있습니다** — Java static 메서드는 인터페이스 계약에 참여 못 합니다
- **확장 함수를 붙일 수 있습니다** — `fun Member.Companion.fromCsv(...)`
- **값으로 넘길 수 있습니다** — `Member.Companion` 자체가 인자가 됩니다

```kotlin
interface Factory<T> { fun create(raw: String): T }

class Member private constructor(val name: String) {
    companion object : Factory<Member> {          // 동반 객체가 인터페이스를 구현
        override fun create(raw: String) = Member(raw.trim())
    }
}
```

"팩토리를 인터페이스로 추상화"하려면 Java 는 별도 팩토리 클래스가 필요했지만, Kotlin 은 동반 객체가 직접 합니다.

### 이름과 @JvmStatic

이름을 생략하면 기본 이름이 `Companion` 입니다(`companion object Parser { }` 처럼 줄 수도 있음). **Java 에서 부를 때** 이게 드러나요.

```java
Member.Companion.of("x");   // 기본 — 지저분하다
Member.of("x");             // @JvmStatic 을 붙여야 이렇게 된다
```

동반 객체는 컴파일되면 **바깥 클래스의 정적 필드 `Companion` + 그 객체의 인스턴스 메서드**가 됩니다. 진짜 `static` 이 아니에요. 그래서 Java 상호운용, 그리고 **리플렉션으로 정적 메서드를 찾는 프레임워크**(JUnit 5 의 `@BeforeAll`, Jackson 팩토리 등)에서는 `@JvmStatic` 이 필요합니다.

> 정리: **Kotlin 끼리만 쓰면 필요 없고, Java 나 리플렉션이 끼면 붙인다.**

## object 식 — 익명 클래스

```kotlin
val r = object : Runnable {
    override fun run() { }
}
```

Java 익명 클래스와 결정적으로 다른 점이 하나 있습니다. **인터페이스를 여러 개 동시에 구현할 수 있습니다.**

```kotlin
val worker = object : Runnable, AutoCloseable {
    override fun run() { }
    override fun close() { }
}
```

Java 는 `new X() { }` 형태라 **부모가 딱 하나**입니다. 테스트 더블을 즉석에서 만들 때 이 차이가 체감돼요.

그리고 `object : X { }`(식)는 **평가될 때마다 새 인스턴스**, `object X { }`(선언)는 하나뿐입니다. 한 글자 차이로 의미가 정반대니 리뷰에서 눈여겨보세요.

## enum class — 값에 데이터와 행동을 붙인다

```kotlin
enum class OrderStatus(val code: Int, val label: String) {
    PENDING(1, "결제대기"),
    PAID(2, "결제완료"),
    CANCELED(9, "취소");          // 뒤에 멤버가 오면 세미콜론이 필요하다

    val isFinal: Boolean get() = this == CANCELED
}
```

**상수마다 다르게 구현하는 추상 메서드**도 Java 와 똑같이 됩니다. 각 상수가 익명 하위 클래스가 되는 것까지 동일해요.

```kotlin
enum class Level(val code: Int) {
    INFO(1)  { override fun tag() = "[INFO]" },
    WARN(2)  { override fun tag() = "[WARN]" },
    ERROR(3) { override fun tag() = "[ERROR]" };

    abstract fun tag(): String
}
```

### values() 대신 entries

```kotlin
Level.entries         // 1.9+ — List<Level>, 복사 없음
Level.values()        // 호출할 때마다 배열을 새로 복사 (레거시)
Level.valueOf("WARN") // 없으면 IllegalArgumentException 을 던진다
```

`values()` 는 **방어적 복사 때문에 호출마다 배열을 만듭니다.** 루프 안에서 부르면 쓰레기가 쌓여요. `entries` 를 쓰세요.

`valueOf` 는 **예외를 던집니다.** 외부 입력(쿼리 파라미터, 큐 메시지)을 그대로 넣으면 400 이어야 할 상황이 500 이 됩니다. 동반 객체에 `fun fromOrNull(name: String): Level? = try { valueOf(name) } catch (e: IllegalArgumentException) { null }` 같은 안전한 변환을 만들어 두는 게 정석이에요.

### when 과의 결합

enum 을 `when` 에 넣으면 **`else` 없이도 완전성 검사**를 받습니다. 나중에 `REFUNDED` 를 추가하면 그 상수를 처리하지 않은 `when` 이 전부 컴파일 에러가 나요. **`else` 를 붙이는 순간 그 안전망이 사라집니다.**

```kotlin
fun message(s: OrderStatus): String = when (s) {
    OrderStatus.PENDING  -> "입금을 기다립니다"
    OrderStatus.PAID     -> "배송 준비 중"
    OrderStatus.CANCELED -> "취소되었습니다"
}
```

## enum 과 sealed, 뭘 고르나

| | `enum class` | `sealed` (다음 레슨) |
|---|---|---|
| 인스턴스 | 상수마다 **하나씩 고정** | 하위 타입마다 **여러 개 생성 가능** |
| 데이터 | 모든 상수가 **같은 필드 구조** | 하위 타입마다 **다른 필드** |
| 대표 용도 | 코드값·상태값 (DB 컬럼에 저장) | 결과·이벤트 (`Success(data)` / `Failure(code)`) |

**"각 케이스가 서로 다른 데이터를 들고 다녀야 하면 sealed, 아니면 enum"** 이 실무 기준입니다.

## 리뷰에서 지적할 것

**1. 유틸리티 클래스를 `object` 로 만드는 습관**

Java 는 함수를 클래스 밖에 둘 수 없어서 `final class + private 생성자 + static 메서드`를 만들었습니다. 그 습관으로 `object StringUtils { ... }` 를 쓰는 코드가 많은데, Kotlin 은 **최상위 함수**나 **확장 함수**가 답입니다.

```kotlin
fun String?.isBlankOrNull() = this.isNullOrBlank()   // object 유틸보다 이쪽
```

`object` 유틸은 인스턴스가 하나 생기고, import 가 한 단계 길어지고, 호출부가 확장 함수만큼 자연스럽지 않습니다. **상태를 들고 있어야 할 때만** `object` 를 쓰세요.

**2. `companion object` 가 상수 창고가 된 경우**

`const val` 이 스무 줄씩 쌓여 있으면 "설정이 코드에 박혀 있다"는 신호입니다. 진짜 클래스 불변식이면 남기고, 운영 중 바뀔 값이면 설정(`@ConfigurationProperties`)으로 빼라고 지적하세요. 여러 클래스가 공유하는 상수라면 동반 객체가 아니라 **최상위 `const val`** 이 맞습니다.

## 연습
로그 레벨을 다루는 코드를 완성하세요. `main` 은 그대로 두고 위쪽만 채우면 됩니다.

1. **`enum class Level`** — 생성자 프로퍼티 `code: Int` (`INFO`=1, `WARN`=2, `ERROR`=3), 추상 메서드 `tag(): String` 을 상수마다 오버라이드해 `"[INFO]"` / `"[WARN]"` / `"[ERROR]"` 를 반환
2. **`object Recorder`** — 싱글턴. `var count: Int` 를 0으로 시작하고, `record(level, message)` 가 `count` 를 1 늘린 뒤 `"[TAG] message"` 형태 문자열을 반환
3. **`class Log` 의 `companion object`** — `of(raw: String): Log?` 가 `"ERROR:db down"` 형태를 파싱. 콜론이 없거나 레벨 이름이 없는 값이면 `null`
4. **`object` 식** — `Formatter` 와 `Named` 를 **동시에** 구현하는 익명 객체

```kotlin starter
interface Formatter {
    fun format(line: String): String
}

interface Named {
    val name: String
}

// TODO 1: enum class Level — code 프로퍼티 + 상수별 tag() 오버라이드

// TODO 2: object Recorder — var count, fun record(level: Level, message: String): String

class Log(val level: Level, val message: String) {
    // TODO 3: companion object — fun of(raw: String): Log?
}

fun main() {
    println("${Level.ERROR.name} ${Level.ERROR.code} ${Level.ERROR.tag()}")
    println(Level.entries.size)
    println(Level.valueOf("WARN").code)

    println(Recorder.record(Level.INFO, "server started"))
    println(Recorder.record(Level.WARN, "disk 80%"))

    val parsed = Log.of("ERROR:db down")
    if (parsed != null) println(Recorder.record(parsed.level, parsed.message))
    println(Log.of("TRACE:nope"))
    println(Recorder.count)

    // TODO 4: 아래 두 줄의 주석을 풀고 object 식으로 shouty 를 만드세요.
    //   name 은 "shouty", format 은 대문자로 바꾼 뒤 "!" 를 붙입니다.
    // val shouty = object : ... { }
    // println("${shouty.name} -> ${shouty.format("all green")}")
}
```

```text expected
ERROR 3 [ERROR]
3
2
[INFO] server started
[WARN] disk 80%
[ERROR] db down
null
3
shouty -> ALL GREEN!
```

```text hint
네 개가 전부 **"인스턴스가 몇 개여야 하는가"** 라는 하나의 질문에 대한 서로 다른 답입니다. `Recorder` 는 `count` 를 공유해야 하니 **딱 하나**, `Level` 의 각 상수도 **딱 하나씩**, `Log.of` 는 클래스에 **소속된** 함수지만 인스턴스 없이 불려야 하고, `shouty` 는 그 자리에서 **한 번 쓰고 마는** 객체입니다. 이 네 가지가 Kotlin 에서 각각 어떤 키워드였는지 떠올려 보세요.
---
쓸 키워드는 `enum class`, `object`(선언), `companion object`, `object : ... { }`(식) 넷입니다. enum 상수마다 다른 동작이 필요하면 클래스 본문에 `abstract fun` 을 두고 **각 상수 뒤에 중괄호를 열어** 오버라이드합니다. 그리고 마지막 상수 뒤에는 **세미콜론**이 필요합니다 — 뒤에 멤버 선언이 이어지니까요.
---
`of` 는 실패할 수 있으니 반환 타입이 `Log?` 입니다. 실패 경로가 둘이에요 — 콜론이 없는 경우(`indexOf(':')` 가 `-1`)와, 앞부분이 Level 이름이 아닌 경우입니다. 후자는 `Level.valueOf(...)` 가 **`IllegalArgumentException` 을 던진다**는 걸 이용해 `try { } catch (e: IllegalArgumentException) { return null }` 로 받으세요. 문자열은 `raw.substring(0, idx)` 와 `raw.substring(idx + 1)` 로 자릅니다. `object` 식은 `object : Formatter, Named { }` 처럼 **인터페이스를 쉼표로 나열**하면 둘 다 구현됩니다 (Java 익명 클래스로는 못 하는 일).
---
뼈대는 이렇습니다.

`enum class Level(val code: Int) { INFO(1) { override fun tag() = "[INFO]" }, ..., ERROR(3) { ___ }; abstract fun tag(): String }`

`object Recorder { var count = 0; fun record(level: Level, message: String): String { count++; return "${level.___()} $message" } }`

`companion object { fun of(raw: String): Log? { val idx = raw.indexOf(':'); if (idx < 0) return null; val level = try { Level.valueOf(raw.substring(0, ___)) } catch (e: IllegalArgumentException) { return null }; return Log(level, raw.substring(___)) } }`

`val shouty = object : Formatter, Named { override val name = "shouty"; override fun format(line: String) = line.uppercase() + "!" }`
```

```kotlin solution
interface Formatter {
    fun format(line: String): String
}

interface Named {
    val name: String
}

// 상수마다 다른 동작 → 본문에 abstract fun 을 두고 각 상수가 익명 하위 클래스로 오버라이드한다.
enum class Level(val code: Int) {
    INFO(1) { override fun tag() = "[INFO]" },
    WARN(2) { override fun tag() = "[WARN]" },
    ERROR(3) { override fun tag() = "[ERROR]" };

    abstract fun tag(): String
}

// object 선언 = 싱글턴. count 가 호출 간에 공유된다.
object Recorder {
    var count = 0

    fun record(level: Level, message: String): String {
        count++
        return "${level.tag()} $message"
    }
}

class Log(val level: Level, val message: String) {
    // static 팩토리 자리. valueOf 가 던지는 예외를 여기서 삼켜 null 로 바꾼다.
    companion object {
        fun of(raw: String): Log? {
            val idx = raw.indexOf(':')
            if (idx < 0) return null
            val level = try {
                Level.valueOf(raw.substring(0, idx))
            } catch (e: IllegalArgumentException) {
                return null
            }
            return Log(level, raw.substring(idx + 1))
        }
    }
}

fun main() {
    println("${Level.ERROR.name} ${Level.ERROR.code} ${Level.ERROR.tag()}")
    println(Level.entries.size)
    println(Level.valueOf("WARN").code)

    println(Recorder.record(Level.INFO, "server started"))
    println(Recorder.record(Level.WARN, "disk 80%"))

    val parsed = Log.of("ERROR:db down")
    if (parsed != null) println(Recorder.record(parsed.level, parsed.message))
    println(Log.of("TRACE:nope"))
    println(Recorder.count)

    // object 식 — 인터페이스를 쉼표로 나열해 둘 다 구현한다. Java 익명 클래스는 못 하는 일.
    val shouty = object : Formatter, Named {
        override val name = "shouty"
        override fun format(line: String): String = line.uppercase() + "!"
    }
    println("${shouty.name} -> ${shouty.format("all green")}")
}
```
