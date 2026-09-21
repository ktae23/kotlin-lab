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
        private set
}
```

**data class는 DTO / VO / 요청·응답 모델에 쓰세요.** 거기서는 완벽합니다.

## 연습

요구사항에 맞는 `data class Member`를 정의하세요.

- `name: String` (필수)
- `email: String` (필수)
- `role: String` — 기본값 `"USER"`
- `active: Boolean` — 기본값 `true`

`main`은 그대로 두고, 위 클래스만 추가하면 통과합니다.

```kotlin starter
// TODO: 여기에 data class Member 를 정의하세요.

fun main() {
    val a = Member(name = "박경태", email = "kt@example.com")
    println(a)

    val admin = a.copy(role = "ADMIN")
    println(admin)

    val (name, email) = admin
    println("$name / $email")

    println(a == Member("박경태", "kt@example.com"))
}
```

```text expected
Member(name=박경태, email=kt@example.com, role=USER, active=true)
Member(name=박경태, email=kt@example.com, role=ADMIN, active=true)
박경태 / kt@example.com
true
```

```text hint
Lombok 애노테이션 다섯 개가 하던 일을 **키워드 하나**가 대신합니다. 다만 그 키워드가 만들어 주는 것들은 전부 **주 생성자에 선언된 프로퍼티만** 기준으로 합니다 — 네 필드가 모두 주 생성자 안에 들어가야 `toString`도, `equals`도, 구조 분해도 기대한 대로 나옵니다. `@Builder`의 나머지 절반(일부만 지정하기)은 Kotlin에서 애노테이션이 아니라 **파라미터 문법**으로 해결된다는 것도 같이 떠올려 보세요.
---
필요한 건 셋입니다. `data class` 선언, 주 생성자 프로퍼티 `val`, 그리고 **파라미터 기본값**(`val role: String = "USER"` 같은 꼴). `copy()`, `component1()`, `equals()`는 손으로 쓰지 않습니다 — `data`가 만들어 줍니다.
---
expected 출력을 거꾸로 읽으면 그게 곧 스펙입니다. `Member(name=..., email=..., role=..., active=...)` 의 **나열 순서가 주 생성자 선언 순서**이고, `val (name, email) = admin` 이 그 순서대로 풀리는 것도 `component1`/`component2`가 1·2번 프로퍼티이기 때문입니다. 마지막 줄이 `true`인 이유는 `data`가 **모든 주 생성자 프로퍼티를 비교하는** `equals`를 만들기 때문 — 뒤 두 개를 생략한 쪽도 기본값으로 채워져 같은 값이 됩니다. 그래서 기본값은 **뒤쪽 두 개에만** 붙습니다.
---
뼈대는 이렇습니다. 빈칸 두 개만 채우면 돼요.

`data class Member(val name: String, val email: String, val role: String = ___, val active: Boolean = ___)`
```

```kotlin solution
// data 가 equals/hashCode/toString/copy/componentN 를 주 생성자 프로퍼티 기준으로 만들어 준다.
// 기본값은 생략 가능한 뒤쪽 두 개에만 — 빌더 없이 named argument 로 필요한 것만 지정한다.
data class Member(
    val name: String,
    val email: String,
    val role: String = "USER",
    val active: Boolean = true,
)

fun main() {
    val a = Member(name = "박경태", email = "kt@example.com")
    println(a)

    val admin = a.copy(role = "ADMIN")
    println(admin)

    val (name, email) = admin
    println("$name / $email")

    println(a == Member("박경태", "kt@example.com"))
}
```
