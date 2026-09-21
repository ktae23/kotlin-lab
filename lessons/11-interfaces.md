# Lesson 11 — 인터페이스와 fun interface

Java 8이 `default` 메서드를 넣으면서 인터페이스와 추상 클래스의 경계가 흐려졌죠. Kotlin은 그 경계를 **한 문장으로** 정리합니다: **인터페이스는 상태(state)를 가질 수 없다.** 여기서부터 출발합니다.

## 기본 구현에 키워드가 없다

```java
// Java 8+
public interface Greeter {
    String getName();
    default String greet() { return "안녕, " + getName(); }
}
```

```kotlin
// Kotlin — default 키워드가 없다. 몸통이 있으면 그게 기본 구현
interface Greeter {
    fun name(): String
    fun greet(): String = "안녕, ${name()}"
}
```

Kotlin은 애초에 인터페이스가 구현을 가질 수 있도록 설계됐기 때문에 `default` 같은 사후 호환 키워드가 필요 없습니다. **몸통이 있으면 기본 구현, 없으면 추상.** 끝입니다.

## 추상 프로퍼티 — Java에는 없는 것

Java 인터페이스에서 "이 구현체는 name을 가진다"를 표현하려면 `getName()` 메서드를 선언해야 했습니다. Kotlin은 **프로퍼티를 그대로 선언**합니다.

```kotlin
interface Greeter {
    val name: String                       // 추상 프로퍼티 — 구현체가 채운다
    val initial: Char get() = name.first()  // 기본 구현이 있는 프로퍼티
    fun greet(): String = "안녕, $name"
}
```

구현 쪽은 주 생성자에서 한 방에 끝납니다.

```kotlin
class Host(override val name: String) : Greeter
```

**핵심 제약: 인터페이스의 프로퍼티에는 backing field가 없습니다.** 그래서 `val name: String = "기본값"` 이라고 쓸 수 없어요(컴파일 에러). `get()`으로 **계산해서 주는 것만** 가능합니다. 위의 `initial`이 그래서 합법입니다 — 저장하는 게 아니라 `name`에서 매번 계산하니까요.

이 제약이 곧 "인터페이스는 상태를 가질 수 없다"의 정확한 의미입니다.

## 다중 상속 충돌 — `super<A>.f()`

클래스는 하나만, 인터페이스는 여러 개 구현합니다. 두 인터페이스가 **같은 시그니처의 기본 구현**을 가지면 컴파일러가 **컴파일 에러**를 냅니다. "알아서 하나 고르기"를 하지 않아요.

```kotlin
interface Greeter  { fun greet(): String = "안녕" }
interface Farewell { fun greet(): String = "잘 가" }

class Bilingual : Greeter, Farewell {
    // override 를 안 쓰면 컴파일 에러: 둘 중 뭘 쓸지 모른다
    override fun greet(): String =
        super<Greeter>.greet() + " / " + super<Farewell>.greet()
}
```

`super<타입>.메서드()` 로 **어느 쪽 기본 구현인지 지정**합니다. Java의 `Greeter.super.greet()` 와 같은 역할인데 문법이 더 읽힙니다.

> 면접 질문으로 자주 나옵니다: "Kotlin은 다중 상속을 지원하나요?" — **구현의 다중 상속은 되지만 상태의 다중 상속은 안 됩니다.** 인터페이스가 필드를 못 가지니 다이아몬드 문제에서 "어느 쪽 필드냐"가 애초에 성립하지 않아요. 메서드 충돌만 남고, 그건 `super<T>` 로 개발자가 명시합니다.

## 인터페이스냐 추상 클래스냐

| | 인터페이스 | 추상 클래스 |
|---|---|---|
| 상태(backing field) | **불가** | 가능 |
| 생성자 | 없음 | 있음 (`: Policy(name)`) |
| 다중 | 여러 개 구현 가능 | 하나만 |
| 가시성 | 멤버가 `protected` 불가 | `protected` 가능 |

판단 기준은 하나입니다. **상태를 들고 있어야 하면 추상 클래스, 아니면 인터페이스.**

실무에서는 인터페이스가 기본입니다. 추상 클래스는 상속 체인을 하나 잡아먹고, 그 하나는 나중에 정말 필요할 때 쓰고 싶으니까요. 그리고 "공통 상태를 공유하고 싶다"는 대부분 **상속이 아니라 합성**으로 풀어야 하는 신호입니다.

상속 관계에 괄호가 있는지로 구분되는 것도 기억하세요.

```kotlin
class A : Policy("이름"), Greeter, Farewell   // 괄호 있는 게 클래스, 없는 게 인터페이스
```

## `fun interface` — SAM 변환

추상 메서드가 **딱 하나**인 인터페이스를 SAM(Single Abstract Method) 인터페이스라고 합니다. Java에서는 이런 인터페이스에 람다를 바로 넘길 수 있었죠.

```java
Runnable r = () -> System.out.println("hi");   // Java: 자동 SAM 변환
```

**Kotlin 인터페이스는 이게 기본으로 안 됩니다.**

```kotlin
interface Rule { fun test(s: String): Boolean }
val r = Rule { it.isNotEmpty() }    // ✗ 컴파일 에러
```

`fun` 을 붙여야 열립니다.

```kotlin
fun interface Rule { fun test(s: String): Boolean }
val r = Rule { it.isNotEmpty() }    // ✓ SAM 변환
```

왜 기본이 아닐까요? Kotlin에는 **함수 타입(`(String) -> Boolean`)이 일급으로 있기 때문**입니다. 함수를 넘기고 싶으면 인터페이스를 만들 필요 없이 함수 타입을 쓰면 됩니다. `fun interface`는 "그래도 이름이 붙은 타입이 필요하다"고 **명시적으로 선언**할 때만 쓰는 겁니다.

> Java와의 차이 하나 더: **Java에서 선언된 SAM 인터페이스는 Kotlin에서 `fun` 없이도 람다가 먹힙니다.** `Runnable { }`, `Comparator { a, b -> ... }` 가 그래서 됩니다. 규칙이 다른 게 아니라, Java 인터페이스에는 `fun`을 붙일 방법이 없어서 컴파일러가 예외를 둔 겁니다.

### 함수 타입 vs fun interface — 어느 쪽?

```kotlin
// (a) 함수 타입
fun validate(s: String, rule: (String) -> Boolean) = rule(s)

// (b) fun interface
fun interface Rule { fun test(s: String): Boolean }
fun validate(s: String, rule: Rule) = rule.test(s)
```

**콜백 하나를 넘기는 것뿐이면 (a) 함수 타입이 정답입니다.** 타입 선언이 필요 없고, 호출부도 `validate(s) { it.isNotEmpty() }` 로 똑같이 깔끔합니다.

`fun interface`를 고르는 이유는 셋 중 하나일 때입니다.
1. **이름이 의미를 담을 때** — `(String) -> Boolean` 보다 `Rule` 이 읽힌다
2. **기본 구현이나 추가 메서드를 붙이고 싶을 때** — `fun interface` 에도 다른 비추상 멤버는 넣을 수 있다
3. **Java에서 호출될 때** — 함수 타입은 Java에서 `Function1<String, Boolean>` 이라는 흉한 모습이 된다

## 인터페이스 위임 — `by` 맛보기

상속 대신 **합성 + 전달(forwarding)** 을 쓰고 싶은데, 전달 메서드를 10개 손으로 쓰기는 싫죠. Kotlin은 `by` 한 단어로 해결합니다.

```kotlin
class Loud(private val inner: Greeter) : Greeter by inner {
    override fun greet(): String = inner.greet() + "!!"   // 이것만 바꾸고
    // name, initial 은 inner 로 자동 전달된다
}
```

`: Greeter by inner` = "Greeter의 모든 멤버는 `inner`에게 넘겨라". 앞서 본 `CountingSet extends HashSet` 문제(Lesson 10)가 여기서는 생기지 않습니다. `inner`가 내부에서 자기 메서드를 어떻게 부르든 우리와 상관없으니까요. **상속의 취약함 없이 재사용**하는 방법이고, Lesson 25에서 제대로 다룹니다.

## 리뷰할 때 보는 것

| 코드에서 보이면 | 이렇게 지적한다 |
|---|---|
| 구현체가 하나뿐인 인터페이스 | 뭘 위한 추상화인가? 테스트용이면 그냥 클래스를 써도 된다 |
| 콜백 하나 받자고 만든 인터페이스 | 함수 타입 `(T) -> R` 로 충분하다 |
| `fun interface` 인데 람다로 안 씀 | `fun` 을 뗄 수 있다 |
| 인터페이스에 상태를 넣으려 함 | 컴파일이 안 된다. 추상 클래스인지 다시 판단해라 |
| 전달 메서드가 줄줄이 | `by` 위임으로 줄여라 |
| 추상 클래스인데 상태가 없음 | 인터페이스로 바꿔라. 상속 한 칸을 아껴라 |

## 연습

인사 인터페이스 계층과 검증 `fun interface` 를 완성하세요.

- `Greeter` — 추상 프로퍼티 `name`, **backing field 없이** 계산되는 `initial`(첫 글자), 기본 구현 `greet()` = `"안녕, {name}"`
- `Farewell` — 기본 구현 `greet()` = `"잘 가"`
- `Host` — `Greeter` 만 구현. 주 생성자에서 `name` 을 채운다
- `Bilingual` — 둘 다 구현. 충돌을 **양쪽 다 불러서** `"안녕, lee / 잘 가"` 로 해결한다
- `Loud` — `Greeter` 를 `inner` 에게 **위임**하고 `greet()` 만 `"!!"` 를 붙인다
- `Rule` — 람다로 넘길 수 있는 인터페이스

```kotlin starter
interface Greeter {
    // TODO: name — 구현체가 채우는 추상 프로퍼티
    // TODO: initial — name 의 첫 글자. 저장하지 말 것
    // TODO: greet() — 기본 구현 "안녕, {name}"
}

interface Farewell {
    // TODO: greet() — 기본 구현 "잘 가"
}

// TODO: Greeter 만 구현. 생성자에서 name 을 채운다
class Host(name: String)

// TODO: Greeter, Farewell 둘 다 구현. greet() 충돌을 양쪽 다 불러 해결
class Bilingual(name: String)

// TODO: Greeter 를 inner 에게 위임. greet() 만 뒤에 "!!" 를 붙인다
class Loud(inner: Greeter)

// TODO: 람다로 구현을 넘길 수 있는 인터페이스로 만들어라
interface Rule {
    fun test(s: String): Boolean
}

fun report(name: String, rule: Rule, input: String): String =
    "$name(\"$input\") = ${rule.test(input)}"

fun main() {
    println(Host("kim").greet())
    println(Host("kim").initial)
    println(Bilingual("lee").greet())

    val loud = Loud(Host("park"))
    println(loud.name)
    println(loud.greet())

    println(report("notEmpty", Rule { it.isNotEmpty() }, ""))
    println(report("notEmpty", Rule { it.isNotEmpty() }, "ok"))
    println(report("max3", Rule { it.length <= 3 }, "abcd"))
}
```

```text expected
안녕, kim
k
안녕, lee / 잘 가
park
안녕, park!!
notEmpty("") = false
notEmpty("ok") = true
max3("abcd") = false
```

```text hint
인터페이스의 프로퍼티는 **저장할 수 없습니다**(backing field 없음). 그래서 `initial` 은 `= name.first()` 가 아니라 **`get()` 으로** 줘야 합니다. 반대로 `name` 은 구현체가 채울 자리라 타입만 선언하고 비워 둡니다. 그리고 두 인터페이스에 같은 이름의 기본 구현이 있으면 컴파일러가 고르지 않고 **에러를 냅니다** — 고르는 건 당신 몫입니다.
---
쓰는 문법 네 가지입니다. ① 주 생성자에서 인터페이스 프로퍼티 채우기 `class Host(override val name: String) : Greeter` ② 충돌 해결 `super<타입>.메서드()` ③ 위임 `: Greeter by inner` ④ 람다로 넘길 수 있게 만드는 `fun interface`.
---
세 군데가 걸립니다. ① `Host` 는 몸통이 필요 없습니다 — `class Host(override val name: String) : Greeter` 한 줄로 끝입니다(뒤에 `{}` 도 필요 없음). ② `Loud` 는 `by inner` 로 위임하면 `name` 과 `initial` 은 자동으로 전달되니 **`greet()` 만 override** 하면 됩니다. 이때 `inner` 를 생성자에서 `private val` 로 받아야 override 한 `greet()` 안에서 쓸 수 있어요. ③ `Rule` 에 `fun` 을 안 붙이면 `Rule { ... }` 이 컴파일되지 않습니다 — 추상 메서드가 하나여도 Kotlin 인터페이스는 기본적으로 SAM 변환이 안 됩니다.
---
뼈대입니다. 빈칸만 채우세요.

`interface Greeter { val name: String; val initial: Char ___() = name.first(); fun greet(): String = "안녕, $name" }` / `interface Farewell { fun greet(): String = "잘 가" }` / `class Host(___ val name: String) : Greeter` / `class Bilingual(override val name: String) : Greeter, Farewell { override fun greet() = ___<Greeter>.greet() + " / " + ___<Farewell>.greet() }` / `class Loud(private val inner: Greeter) : Greeter ___ inner { override fun greet() = inner.greet() + "!!" }` / `___ interface Rule { fun test(s: String): Boolean }`
```

```kotlin solution
interface Greeter {
    val name: String                        // 구현체가 채운다

    // 인터페이스 프로퍼티에는 backing field 가 없다 — get() 으로 계산해서 준다
    val initial: Char
        get() = name.first()

    fun greet(): String = "안녕, $name"     // 몸통이 있으면 기본 구현
}

interface Farewell {
    fun greet(): String = "잘 가"
}

class Host(override val name: String) : Greeter

class Bilingual(override val name: String) : Greeter, Farewell {
    // 기본 구현이 충돌하면 컴파일러가 고르지 않는다. super<T> 로 직접 지정한다
    override fun greet(): String =
        super<Greeter>.greet() + " / " + super<Farewell>.greet()
}

// by 위임 — name, initial 은 inner 로 자동 전달되고 greet 만 바꾼다
class Loud(private val inner: Greeter) : Greeter by inner {
    override fun greet(): String = inner.greet() + "!!"
}

// fun 을 붙여야 람다로 구현을 넘길 수 있다 (SAM 변환)
fun interface Rule {
    fun test(s: String): Boolean
}

fun report(name: String, rule: Rule, input: String): String =
    "$name(\"$input\") = ${rule.test(input)}"

fun main() {
    println(Host("kim").greet())
    println(Host("kim").initial)
    println(Bilingual("lee").greet())

    val loud = Loud(Host("park"))
    println(loud.name)
    println(loud.greet())

    println(report("notEmpty", Rule { it.isNotEmpty() }, ""))
    println(report("notEmpty", Rule { it.isNotEmpty() }, "ok"))
    println(report("max3", Rule { it.length <= 3 }, "abcd"))
}
```
