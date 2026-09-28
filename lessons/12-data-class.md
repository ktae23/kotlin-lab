# Lesson 12 — data class (Lombok이 사라지는 곳)

회사 코드에 `@Data`, `@Builder`, `@Getter`가 깔려 있다면 이 레슨이 가장 체감이 큽니다.

## Lombok 한 덩어리가 한 줄로

```java
// Java + Lombok
@Getter @Setter @ToString @EqualsAndHashCode @AllArgsConstructor
public class Member {
    private String name;
    private String email;
}
```
```kotlin
data class Member(val name: String, val email: String)
```

`data`를 붙이면 컴파일러가 **주 생성자 프로퍼티 기준으로** 자동 생성합니다.

| 생성물 | Lombok 대응 |
|---|---|
| `equals()` / `hashCode()` | `@EqualsAndHashCode` |
| `toString()` | `@ToString` |
| `copy()` | `@Builder`의 toBuilder |
| `component1()`, `component2()` … | 없음 (구조 분해용) |
| 게터/세터 | `@Getter` / `@Setter` |

## 게터/세터는 문법에서 사라진다

Kotlin에는 **프로퍼티**가 있어서 `getName()`을 직접 부르지 않습니다.

```kotlin
val m = Member("박경태", "kt@example.com")
println(m.name)   // 내부적으로는 getName() 호출
```

Java에서 이 Kotlin 클래스를 쓰면 `m.getName()`으로 정상 접근됩니다. 상호 운용은 그대로예요.

## copy() — @Builder 대체

불변 객체를 다룰 때 핵심입니다.

```kotlin
val admin = member.copy(role = "ADMIN")   // role만 바꾼 새 객체
```

`@Builder`를 쓰던 이유의 상당수(일부 필드만 바꾼 객체 생성)가 `copy()` 하나로 해결됩니다.

## 기본값 + 이름 붙인 인자 — @Builder의 나머지 절반

```kotlin
data class Member(
    val name: String,
    val email: String,
    val role: String = "USER",
    val active: Boolean = true,
)

Member(name = "박경태", email = "kt@example.com")            // role, active 생략
Member("박경태", "kt@example.com", active = false)           // 필요한 것만 지정
```

파라미터 기본값 + named argument 조합이 빌더 패턴을 대체합니다. **Kotlin 코드에서 빌더를 직접 만들 일은 거의 없습니다.**

> Java에서 이 생성자를 호출하면 기본값이 안 보입니다. 혼재 기간에는 `@JvmOverloads`를 붙여 오버로드를 생성해야 합니다.

## 구조 분해

```kotlin
val (name, email) = member
```

`componentN()`이 자동 생성돼서 가능합니다. `Map` 순회에서 특히 유용해요.

```kotlin
for ((key, value) in map) { ... }
```

## ⚠️ JPA 엔티티에는 data class를 쓰지 마세요

**이건 회사 마이그레이션에서 반드시 걸리는 함정**이라 미리 못 박아 둡니다.

1. **`equals`/`hashCode`** — 모든 프로퍼티 기준으로 생성됩니다. 지연 로딩 프록시가 섞이면 값이 달라지고, 영속성 컨텍스트의 동일성 보장과 충돌합니다. 엔티티는 보통 **id 기준**으로만 비교해야 합니다.
2. **`toString()`** — 양방향 연관관계에서 `Order → Member → Order …` **무한 재귀**로 StackOverflow가 납니다.
3. **`copy()`** — 엔티티를 복사하면 같은 id를 가진 detached 객체가 생겨 영속성 컨텍스트가 꼬입니다.

엔티티는 그냥 일반 `class`로 씁니다.

```kotlin
@Entity
class Product(
    @Column(nullable = false)
    var name: String,
    @Column
    var description: String? = null,
) {
    @Id @GeneratedValue
    var id: Long? = null
        protected set          // private 이 아니다 — 프록시 서브클래스가 접근해야 한다
}
```

`private set` 이 아니라 **`protected set`** 인 이유가 있습니다. Hibernate 는 LAZY 로딩을 위해 엔티티를 **상속한 프록시 클래스**를 런타임에 만듭니다. `private` 으로 잠그면 그 하위 타입에서 접근할 길이 막히고, 실무에서는 테스트가 id 를 심을 수도 없어서 결국 리플렉션이 동원됩니다. **바깥에서는 못 바꾸고 하위 타입에는 열어 두는** `protected set` 이 엔티티 id 의 표준형입니다.

그리고 위 세 함정 중 **동등성은 이 레슨에서 끝나지 않습니다.** `data` 를 떼면 `equals`/`hashCode` 는 기본 동작(**참조 비교**)으로 돌아가는데, 그건 "같은 행(row)인데 다른 객체" 문제를 해결해 주지 않아요. 엔티티의 동등성은 **id 기준으로 직접 구현**해야 하고, `hashCode` 를 상수로 두는 이유까지 **L48 — Kotlin JPA 엔티티의 함정** 에서 손으로 씁니다. 여기서는 "`data` 를 떼는 것까지가 절반이다" 만 챙기세요.

> **L48 와의 관계.** L48 도입부가 "Lesson 3에서 Lombok은 잊으세요" 라고 부르는 레슨이 실은 **이 레슨(L12)** 입니다. 거기서 이 결론을 **엔티티 한정으로 뒤집고**, 세 함정의 목록도 조금 다릅니다 — L48 는 `equals`/`hashCode` · **LAZY 프록시** · `copy()` 를 셋으로 꼽습니다. 위의 `toString()` 무한 재귀까지 합치면 실제로 조심할 건 넷입니다.

**data class는 DTO / VO / 요청·응답 모델에 쓰세요.** 거기서는 완벽합니다.

## Kotlin 2.x 의 구멍 — private 생성자 + `copy()`

다음 레슨(L13)에서 `class Member private constructor(...)` + 동반 객체 팩토리를 배웁니다. "생성은 팩토리만, 검증은 그 안에서" 라는 좋은 패턴이죠. 그런데 **`data` 와 합치면 구멍이 생깁니다.**

```kotlin
data class Member private constructor(val name: String) {
    companion object {
        fun of(raw: String): Member {
            require(raw.isNotBlank()) { "빈 이름" }
            return Member(raw.trim())
        }
    }
}

val m = Member.of("kim")
val bad = m.copy(name = "   ")   // 검증을 통째로 우회한 객체가 만들어진다
```

생성자는 `private` 인데 **컴파일러가 만든 `copy()` 는 `public`** 입니다. `of` 를 통과해야만 존재할 수 있어야 할 객체가 `copy()` 로 새어 나와요. 컴파일러도 이걸 경고합니다.

```
warning: non-public primary constructor is exposed via the generated 'copy()' method of the 'data' class.
```

막는 방법은 둘입니다.

- 클래스에 **`@ConsistentCopyVisibility`** 를 붙인다 — `copy()` 가 생성자의 가시성을 따라간다
- 모듈 전체에 **`-Xconsistent-data-class-copy-visibility`** 컴파일러 플래그를 준다

Kotlin 2.4 기준으로는 경고지만 **언어 버전 2.5부터 에러**입니다(KT-11914). 새로 쓰는 코드라면 지금부터 저 애노테이션을 붙이거나, 애초에 **검증이 필요한 타입에 `data` 를 붙이지 않는 쪽**을 고르세요.

## 리뷰할 때 보는 것

| 코드에서 보이면 | 이렇게 지적한다 |
|---|---|
| `data class` 인데 프로퍼티가 `var` 이고, 그 객체가 `HashSet`/`HashMap` 키로 들어간다 | 넣은 뒤 필드를 바꾸면 `hashCode` 가 달라져 `contains` 가 `false` 가 된다. 키로 쓸 타입은 `val` 로 고정하라 |
| `data class` 의 프로퍼티가 `Array` | 생성된 `equals`/`hashCode` 는 배열을 **참조 비교**한다. `List` 로 바꾸거나 `equals`/`hashCode` 를 직접 구현하라 |
| 중요한 상태를 클래스 **본문**에 선언 | `equals`·`hashCode`·`toString`·`copy`·구조 분해는 **주 생성자 프로퍼티만** 본다. 비교 대상이면 주 생성자로 올려라 |
| `@Entity` 에 `data class` | `equals`/`toString`/`copy` 셋이 동시에 문제다. 일반 `class` + id 기반 `equals` 로 (L48) |
| `data class` + `private constructor` | 생성된 `copy()` 가 생성자를 우회한다. `@ConsistentCopyVisibility` 를 붙이거나 `data` 를 떼라 |
| 필드 5개 이상인데 호출부가 위치 인자 | named argument 를 쓰게 하라. `copy()` 도 마찬가지 — `copy(true)` 는 6개월 뒤 아무도 못 읽는다 |
| DTO 인데 `data` 가 없음 | `equals`/`toString` 이 없으면 테스트 단정과 로그가 전부 불편해진다. `data` 를 붙여라 |

## 연습

`data class` 가 **무엇을 만들어 주고 무엇은 안 만들어 주는지**를 출력으로 확인합니다.

1. **`data class Member`** — 주 생성자에 `name: String`, `email: String`, `role: String = "USER"`, `active: Boolean = true`. 그리고 **클래스 본문에** `var lastLoginAt: String = "never"` 를 둡니다
2. **`data class Tag`** — 프로퍼티가 `var label: String` 하나

`main` 은 그대로 두세요. 출력 다섯째 줄부터가 이 연습의 본론입니다 — **본문에 선언한 프로퍼티는 `equals`·`toString`·`copy` 에서 빠지고**, **`var` 를 가진 data class 를 `HashSet` 에 넣은 뒤 값을 바꾸면 자기 자신을 못 찾습니다.** 왜 그렇게 나오는지 말로 설명할 수 있어야 통과입니다.

```kotlin starter
// TODO 1: data class Member — 주 생성자 프로퍼티 4개 + 본문에 var lastLoginAt = "never"

// TODO 2: data class Tag — var label: String 하나

fun main() {
    val a = Member(name = "박경태", email = "kt@example.com")
    println(a)

    val admin = a.copy(role = "ADMIN")
    println(admin)

    val (name, email) = admin
    println("$name / $email")

    println(a == Member("박경태", "kt@example.com"))

    // 자동 생성물의 경계 — 본문에 선언한 프로퍼티는 어디에도 끼지 않는다
    a.lastLoginAt = "2026-09-27"
    println(a == Member("박경태", "kt@example.com"))
    println(a.toString().contains("lastLoginAt"))
    println(a.copy().lastLoginAt)

    // var 프로퍼티 + 해시 컬렉션
    val tag = Tag("kotlin")
    val tags = hashSetOf(tag)
    println(tags.contains(tag))
    tag.label = "java"
    println(tags.contains(tag))
    println(tags.first())
}
```

```text expected
Member(name=박경태, email=kt@example.com, role=USER, active=true)
Member(name=박경태, email=kt@example.com, role=ADMIN, active=true)
박경태 / kt@example.com
true
true
false
never
true
false
Tag(label=java)
```

```text hint
Lombok 애노테이션 다섯 개가 하던 일을 **키워드 하나**가 대신합니다. 다만 그 키워드가 만들어 주는 것들은 전부 **주 생성자에 선언된 프로퍼티만** 기준으로 합니다 — 그래서 `role`·`active` 는 주 생성자에, `lastLoginAt` 은 **본문**에 두라는 요구가 그대로 출력의 차이로 드러납니다. 뒷부분은 질문이 하나 더 있어요: `HashSet` 은 객체를 **넣는 순간의 해시값**으로 버킷을 정합니다. 그 값이 `label` 로 계산되는데 나중에 `label` 이 바뀌면, 찾으러 갈 버킷은 어디일까요?
---
필요한 건 셋입니다. `data class` 선언, 주 생성자 프로퍼티 `val` + **파라미터 기본값**(`val role: String = "USER"` 꼴), 그리고 클래스 본문에 선언하는 `var lastLoginAt: String = "never"`. `copy()`, `component1()`, `equals()`, `hashCode()` 는 손으로 쓰지 않습니다 — `data` 가 만들어 줍니다. `Tag` 는 `var` 프로퍼티 하나짜리 `data class` 면 됩니다.
---
출력을 거꾸로 읽으면 그게 곧 스펙입니다. 앞 네 줄: 나열 순서가 **주 생성자 선언 순서**이고, `val (name, email)` 이 그 순서대로 풀리는 것도 `component1`/`component2` 가 1·2번 프로퍼티이기 때문이며, 넷째 줄이 `true` 인 건 생략한 뒤 두 개가 **기본값으로 채워져** 같은 값이 되기 때문입니다. 본론은 그다음입니다 — `lastLoginAt` 을 바꿨는데도 다섯째 줄이 `true` 이고 `toString` 에 그 이름이 아예 없는 것(`false`), `copy()` 가 그 값을 옮기지 않아 `never` 가 나오는 것이 **전부 같은 이유**입니다. 마지막 셋은 `Tag` 이야기예요 — 넣은 직후에는 찾히지만 `label` 을 바꾸면 `hashCode()` 가 달라져 **다른 버킷**을 뒤지므로 `contains` 가 `false` 가 됩니다. 그런데 `first()` 는 원소를 내놓죠 — **사라진 게 아니라 못 찾는 것**입니다. 실무에서 `@Entity` 를 `Set` 연관관계에 담을 때 터지는 사고가 정확히 이 모양입니다.
---
뼈대는 이렇습니다. 빈칸만 채우세요.

`data class Member(val name: String, val email: String, val role: String = ___, val active: Boolean = ___) { ___ lastLoginAt: String = "never" }`

`data class Tag(___ label: String)`
```

```kotlin solution
// data 가 만들어 주는 건 전부 주 생성자 프로퍼티 기준이다.
// lastLoginAt 은 본문 선언이라 equals·hashCode·toString·copy·구조 분해에서 모두 빠진다.
data class Member(
    val name: String,
    val email: String,
    val role: String = "USER",
    val active: Boolean = true,
) {
    var lastLoginAt: String = "never"
}

// var 프로퍼티 → hashCode 가 변한다. 해시 컬렉션의 키로 쓰면 안 되는 모양.
data class Tag(var label: String)

fun main() {
    val a = Member(name = "박경태", email = "kt@example.com")
    println(a)

    val admin = a.copy(role = "ADMIN")
    println(admin)

    val (name, email) = admin
    println("$name / $email")

    println(a == Member("박경태", "kt@example.com"))

    // 본문 프로퍼티를 바꿔도 equals 는 모른다. toString 에도 안 나오고 copy 도 옮기지 않는다.
    a.lastLoginAt = "2026-09-27"
    println(a == Member("박경태", "kt@example.com"))
    println(a.toString().contains("lastLoginAt"))
    println(a.copy().lastLoginAt)

    // 넣을 때의 해시로 버킷이 정해진다 → label 을 바꾸면 자기 자신을 못 찾는다.
    val tag = Tag("kotlin")
    val tags = hashSetOf(tag)
    println(tags.contains(tag))
    tag.label = "java"
    println(tags.contains(tag))
    println(tags.first())
}
```
