# Lesson 10 — 가시성과 상속

Java에서 클래스는 기본이 **상속 가능**이고, 막으려면 `final`을 붙여야 했습니다. Kotlin은 **정반대**입니다. 이 뒤집힌 기본값 하나가 Kotlin 설계 철학의 요약이에요.

## 모든 클래스는 기본이 final

```kotlin
class Repo
class UserRepo : Repo()   // ✗ 컴파일 에러: Repo 는 final
```

`open`을 명시해야만 상속됩니다.

```kotlin
open class Repo
class UserRepo : Repo()   // ✓
```

### 왜 이 기본값인가

Effective Java 항목 19: **"상속을 위해 설계하고 문서화하라. 그렇지 않다면 상속을 금지하라."** Joshua Bloch가 20년 전에 쓴 조언인데, Java는 그걸 기본값으로 못 만들었습니다. Kotlin은 만들었어요.

상속을 열어 두면 생기는 실제 문제:

```java
// Java. HashSet 을 상속해 추가 횟수를 세려고 했다
class CountingSet<E> extends HashSet<E> {
    int added = 0;
    @Override public boolean add(E e) { added++; return super.add(e); }
    @Override public boolean addAll(Collection<? extends E> c) {
        added += c.size(); return super.addAll(c);   // addAll 이 내부에서 add 를 부른다!
    }
}
```

`addAll(3개)` 를 부르면 `added`가 6이 됩니다. **상위 클래스가 자기 메서드를 내부에서 어떻게 호출하는지**(self-use)에 하위 클래스가 의존해 버린 거죠. 이건 문서화되지 않은 구현 세부사항이고, 상위 클래스 버전이 올라가면 조용히 깨집니다. 이게 "깨지기 쉬운 상위 클래스 문제(fragile base class)"입니다.

Kotlin의 답: **열고 싶은 것만 명시적으로 연다.** `open`을 타이핑하는 그 순간이 "이 메서드는 하위 클래스가 바꿔도 되게 설계했다"고 선언하는 지점입니다.

## open / override / final override

```kotlin
open class Base {
    open fun run() = "base"      // 열림
    fun fixed() = "fixed"        // 기본 final — 못 바꾼다
}

class Child : Base() {
    override fun run() = "child" // override 는 필수 키워드
}
```

- **`override`는 생략할 수 없습니다.** Java의 `@Override`는 선택이었지만 Kotlin은 강제예요. 오타로 새 메서드를 만드는 사고가 원천 차단됩니다
- 상위에 없는 걸 `override` 하면 컴파일 에러, 상위에 있는데 `override`를 빼도 컴파일 에러

함정 하나: **`override` 한 멤버는 자동으로 `open`입니다.**

```kotlin
open class A { open fun f() = "A" }
open class B : A() { override fun f() = "B" }        // C 가 또 override 할 수 있다
open class C : B() { final override fun f() = "C" }  // 여기서 잠근다
```

2단계 아래까지 열어 둘 생각이 아니었다면 `final override`로 닫으세요.

프로퍼티도 같습니다. `open val`은 `override val`로 덮을 수 있고, **`val`을 `var`로 덮는 것은 가능**(읽기 전용을 읽기/쓰기로 넓히는 것)하지만 반대는 안 됩니다.

## abstract class

`abstract`는 **자동으로 open**이라 `open`을 또 붙이지 않습니다.

```kotlin
abstract class Policy(val name: String) {
    abstract fun discount(amount: Long): Long   // 구현 없음 — 하위가 반드시 채운다
    open fun label(): String = "[$name]"        // 기본 구현 있고, 바꿔도 된다
    fun priceFor(amount: Long): Long {          // final — 흐름은 못 바꾼다
        val d = discount(amount)
        return if (d > amount) 0L else amount - d
    }
}
```

이 세 줄이 **템플릿 메서드 패턴**입니다. `priceFor` 가 전체 흐름을 쥐고(final), 바뀌는 부분만 `abstract`로 위임하고, 선택적으로 바꿀 부분만 `open`. Kotlin은 기본값이 final이라 **이 설계가 자연스럽게 나옵니다.** Java에서는 세 가지 모두 똑같이 생겨서 의도를 읽을 수 없었죠.

## super 호출

```kotlin
open class RatePolicy(name: String) : Policy(name) {
    override fun label(): String = super.label() + " 할인"
}
```

`super.label()` 로 상위 구현을 부릅니다. 상위 생성자 호출은 **클래스 이름 뒤 괄호**로 합니다 — `: Policy(name)`. 인터페이스는 생성자가 없으니 괄호가 없고, 이게 상속인지 인터페이스 구현인지 구분하는 눈에 띄는 표시가 됩니다(Lesson 11).

## 가시성 4종

| 제어자 | 클래스 멤버 | 최상위 선언 |
|---|---|---|
| `public` (기본) | 어디서나 | 어디서나 |
| `private` | **그 클래스 안에서만** | **그 파일 안에서만** |
| `protected` | 그 클래스 + 하위 클래스 | 사용 불가 |
| `internal` | **같은 모듈 안에서만** | 같은 모듈 안에서만 |

Java와 다른 점 세 가지를 짚습니다.

**1. 기본이 `public`입니다.** Java의 기본은 package-private이었죠. Kotlin에는 **package-private이 아예 없습니다.**

**2. `protected`에 패키지 접근이 없습니다.** Java의 `protected`는 "하위 클래스 **또는 같은 패키지**"였습니다. Kotlin은 **하위 클래스만**이에요. 더 좁습니다. Java 코드를 옮길 때 같은 패키지에서 `protected` 멤버를 쓰던 곳이 깨집니다.

**3. `internal` — Java에 없는 것.** 모듈(같이 컴파일되는 단위: Gradle 소스셋 하나)을 벗어나면 안 보입니다.

```kotlin
internal class OrderMapper          // 우리 모듈 안에서만 쓰는 변환기
internal fun Order.toDto(): OrderDto = ...
```

이게 **Kotlin에서 공개 API를 관리하는 주된 도구**입니다. 멀티모듈 프로젝트라면 `:domain` 모듈의 헬퍼가 `:api` 모듈로 새어 나가는 걸 컴파일러가 막아 줍니다.

> 주의: `internal` 은 JVM 바이트코드에서는 이름이 뒤틀린 `public`입니다(`toDto$module_name`). **Java 코드에서는 보입니다.** Kotlin 컴파일러만 막아 줘요. 그래서 Kotlin/Java 혼재 모듈에서는 완전한 방어가 아닙니다.

### 최상위 `private` = 파일 스코프

```kotlin
// OrderService.kt
private fun normalize(s: String) = s.trim().lowercase()   // 이 파일 안에서만
```

Java에서 헬퍼 메서드를 숨기려고 private static 메서드를 클래스에 욱여넣던 걸, Kotlin은 **파일 단위 private 최상위 함수**로 해결합니다. 유틸 클래스를 만들 필요가 없어요.

### 생성자 가시성

생성자에도 가시성을 줍니다. 이때는 `constructor` 키워드를 생략할 수 없습니다.

```kotlin
class Token private constructor(val value: String)
```

밖에서 `Token(...)`을 못 부르니 팩토리를 통해서만 만들게 강제할 수 있습니다. 그 팩토리를 어디 두느냐가 `companion object`인데, Lesson 13에서 다룹니다.

## 리뷰할 때 보는 것

| 코드에서 보이면 | 이렇게 지적한다 |
|---|---|
| `open class` 가 여기저기 | 실제로 상속하는 하위 클래스가 있나? 없으면 지워라 |
| `open fun` 인데 문서가 없음 | 열었으면 계약을 써라. 아니면 닫아라 |
| 2단계 이상 상속 체인 | `final override` 로 잠그거나 위임(Lesson 25)을 검토 |
| 모든 게 `public` | 모듈 밖에서 쓰지 않는 건 `internal` 로 내려라 |
| 상속으로 기능 재사용 | "is-a" 가 맞나? 아니면 합성(composition)이다 |
| 클래스 안 `private` 헬퍼가 상태를 안 씀 | 파일 최상위 `private fun` 으로 빼라 |

## 연습

할인 정책 계층을 완성하세요. 템플릿 메서드 구조입니다.

- `Policy` — `abstract class`. `priceFor` 는 **흐름을 고정**(아무것도 붙이지 않는다), `discount` 는 `protected abstract`, `label` 은 `open`
- `RatePolicy` — 비율 할인. **하위가 더 상속할 수 있어야** 한다. `label` 은 `super` 를 불러 뒤에 `" ${percent}%"` 를 붙인다
- `VipRatePolicy` — `RatePolicy` 를 상속. `label` 은 `super` 뒤에 `" (고정)"` 을 붙이고 **더는 못 덮게 잠근다**
- `FlatPolicy` — 정액 할인. `label` 은 덮지 않는다
- `won` 은 모듈 안에서만 쓰는 함수, `banner` 는 이 파일 안에서만 쓰는 함수

```kotlin starter
const val CURRENCY = "원"

// TODO: 모듈 밖으로 나갈 일이 없다. 가시성을 좁혀라
fun won(v: Long): String = "${v}$CURRENCY"

// TODO: 이 파일 안에서만 쓴다. 가시성을 좁혀라
private fun banner(t: String): String = "== $t =="

// TODO: abstract 로 바꿔라
open class Policy(val name: String) {

    // TODO: 구현을 없애고 하위 클래스만 구현/호출하게 만들어라
    open fun discount(amount: Long): Long = 0L

    // TODO: 하위가 덮을 수 있게 열어라
    fun label(): String = "[$name]"

    // TODO: 흐름을 고정한 채로, discount 가 금액보다 크면 0 을 반환하게 하라
    fun priceFor(amount: Long): Long = amount
}

// TODO: VipRatePolicy 가 상속한다. percent 는 하위 클래스가 읽어야 한다
class RatePolicy(name: String, private val percent: Int) : Policy(name) {
    // TODO: discount — amount * percent / 100
    // TODO: label — super 뒤에 " 10%" 형태를 붙인다
}

// TODO: RatePolicy("VIP", percent) 를 상속하고, label 을 더는 못 덮게 잠가라
class VipRatePolicy(percent: Int)

// TODO: Policy 를 상속. 정액 off 만큼 깎는다. off 는 이 클래스 안에서만 보인다
class FlatPolicy(name: String, off: Long)

fun main() {
    println(banner("정책"))
    val policies: List<Policy> = listOf(
        RatePolicy("기본", 10),
        VipRatePolicy(30),
        FlatPolicy("쿠폰", 3_000),
    )
    for (p in policies) {
        println("${p.label()} ${won(p.priceFor(20_000))}")
    }
    println(won(FlatPolicy("과다쿠폰", 50_000).priceFor(20_000)))
}
```

```text expected
== 정책 ==
[기본] 10% 18000원
[VIP] 30% (고정) 14000원
[쿠폰] 17000원
0원
```

```text hint
상속 가능해야 하는 클래스는 `open` 또는 `abstract` 여야 합니다. `abstract` 는 이미 open 이라 `open` 을 또 붙이지 않아요. 반대로 **아무것도 안 붙인 게 final** 이라는 점이 `priceFor` 의 답입니다 — 흐름을 고정하라는 건 아무 키워드도 붙이지 말라는 뜻입니다.
---
쓰는 키워드: `abstract` / `open` / `override` / `final override`, 가시성 `protected` · `private` · `internal`. 상위 생성자 호출은 `: Policy(name)` 처럼 **클래스 이름 뒤 괄호**로 하고, 상위 구현 호출은 `super.label()` 입니다.
---
구조에서 세 군데가 걸립니다. ① `RatePolicy` 는 `VipRatePolicy` 가 상속하므로 `open class` 여야 하고, `percent` 는 하위 클래스가 `label` 에서 읽으니 `private` 이면 안 됩니다(`protected val`). ② `VipRatePolicy.label` 의 `super.label()` 은 `RatePolicy` 의 것이라 이미 `"[VIP] 30%"` 까지 만들어져 있습니다 — 여기에 `" (고정)"` 만 더합니다. ③ `override` 는 자동으로 open 이므로 잠그려면 `final override` 라고 써야 합니다. 그리고 `won`/`banner` 는 각각 `internal` · `private` 를 앞에 붙이기만 하면 됩니다.
---
뼈대입니다. 빈칸만 채우세요.

`___ fun won(v: Long)` / `___ fun banner(t: String)` / `abstract class Policy(val name: String) { ___ abstract fun discount(amount: Long): Long; open fun label() = "[$name]"; fun priceFor(amount: Long): Long { val d = discount(amount); return if (d > amount) 0L else amount - d } }`(priceFor 앞에는 아무것도 붙이지 않는다) / `___ class RatePolicy(name: String, ___ val percent: Int) : Policy(___) { override fun discount(amount: Long) = amount * percent / 100; override fun label() = ___.label() + " $percent%" }` / `class VipRatePolicy(percent: Int) : RatePolicy("VIP", percent) { ___ override fun label() = super.label() + " (고정)" }` / `class FlatPolicy(name: String, ___ val off: Long) : Policy(name) { override fun discount(amount: Long) = off }`
```

```kotlin solution
const val CURRENCY = "원"

// 모듈 밖으로 새어 나갈 필요가 없는 헬퍼
internal fun won(v: Long): String = "${v}$CURRENCY"

// 이 파일 밖에서는 존재조차 모른다
private fun banner(t: String): String = "== $t =="

abstract class Policy(val name: String) {
    // 하위 클래스만 구현/호출한다. 밖에서는 부를 수 없다
    protected abstract fun discount(amount: Long): Long

    open fun label(): String = "[$name]"

    // 키워드 없음 = final. 템플릿의 흐름은 하위가 바꾸지 못한다
    fun priceFor(amount: Long): Long {
        val d = discount(amount)
        return if (d > amount) 0L else amount - d
    }
}

// VipRatePolicy 가 상속하므로 open, percent 는 하위가 읽으므로 protected
open class RatePolicy(name: String, protected val percent: Int) : Policy(name) {
    override fun discount(amount: Long): Long = amount * percent / 100
    override fun label(): String = super.label() + " $percent%"
}

class VipRatePolicy(percent: Int) : RatePolicy("VIP", percent) {
    // override 는 자동으로 open 이므로, 더 내려가지 못하게 final 로 잠근다
    final override fun label(): String = super.label() + " (고정)"
}

class FlatPolicy(name: String, private val off: Long) : Policy(name) {
    override fun discount(amount: Long): Long = off
}

fun main() {
    println(banner("정책"))
    val policies: List<Policy> = listOf(
        RatePolicy("기본", 10),
        VipRatePolicy(30),
        FlatPolicy("쿠폰", 3_000),
    )
    for (p in policies) {
        println("${p.label()} ${won(p.priceFor(20_000))}")
    }
    println(won(FlatPolicy("과다쿠폰", 50_000).priceFor(20_000)))
}
```
