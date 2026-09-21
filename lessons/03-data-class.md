# Lesson 3 — data class (Lombok이 사라지는 곳)

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
