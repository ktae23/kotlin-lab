# Lesson 19 — Kotlin JPA 엔티티의 함정

Lesson 3에서 "Lombok은 잊으세요, data class가 다 해준다"고 했습니다. 이번 레슨은 그걸 **뒤집습니다.**

> data class는 **DTO·VO·요청/응답 모델**에서 완벽합니다.
> JPA **엔티티**에서는 재앙입니다.

엔티티에 `@Data` 붙이지 말라는 얘기는 들어보셨을 겁니다. Kotlin에서는 이게 훨씬 더 유혹적이에요. `@Data`는 붙이는 순간 찜찜하지만 `data class`는 "Kotlin스러운 코드"처럼 보이거든요. 그래서 더 많이 당합니다.

## 왜 안 되는가 — 세 가지가 동시에 터진다

### 1. equals / hashCode가 "모든 프로퍼티" 기준

```kotlin
@Entity
data class Member(                                    // 절대 이렇게 쓰지 마세요
    @Id @GeneratedValue val id: Long? = null,
    var name: String, var email: String,
)
```

컴파일러가 `id`, `name`, `email` **전부**로 `equals`/`hashCode`를 만듭니다. 문제는 JPA 엔티티가 **가변(mutable)이면서 컬렉션에 들어간다**는 점이에요.

```kotlin
val member = memberRepository.findById(1L).orElseThrow()
val cache = hashSetOf(member)

member.name = "변경된 이름"     // 더티 체킹으로 UPDATE 될 값
cache.contains(member)          // false ← 자기가 넣은 자기 자신을 못 찾음
```

`HashSet`은 넣을 때의 버킷에 객체를 보관합니다. `name`이 바뀌면 `hashCode()`가 달라지고 조회는 **다른 버킷**을 뒤져요. `@OneToMany(mappedBy=...)`를 `Set`으로 잡는 경우가 흔해서, 이게 남의 코드 안에서 터집니다.

### 2. 지연 로딩 프록시와 어긋난다

`LAZY` 연관을 꺼내면 Hibernate가 진짜 엔티티가 아니라 **프록시(`Member$HibernateProxy$xxx`)**를 줍니다.

```kotlin
val proxy = order.member   // Member 를 상속한 프록시
proxy == realMember        // data class equals → false
```

data class의 `equals`는 프록시의 **초기화되지 않은 필드를 직접 읽습니다.** 전부 비어 있으니 값 비교가 무너지고, **같은 행(row)인데 다른 객체**라고 판정해요. 엔티티 동등성의 기준은 딱 하나여야 합니다 — **식별자(id)**.

### 3. copy()가 식별자까지 복제한다

```kotlin
val detached = member.copy(name = "새 이름")   // id 도 같이 복사된다
```

`id`가 **그대로 복사된** 객체가 생깁니다. 영속성 컨텍스트 안에 id=1 관리 객체가 있는데 밖에 id=1 detached 객체가 하나 더 떠다니는 상태죠. 이걸 `save()`하면 merge가 돌며 의도치 않은 UPDATE가 나가거나, 1차 캐시 동일성 보장(`em.find(1L) === em.find(1L)`)이 깨진 채로 굴러갑니다.

> **운영에서 이렇게 터집니다.** 개발/스테이징은 데이터가 적어 프록시가 거의 안 생기고 한 트랜잭션에 엔티티 몇 개 안 담깁니다. 그래서 멀쩡히 통과해요. 운영에서 컬렉션이 커지고 LAZY 프록시가 섞이는 순간 "가끔 중복 저장됨", "목록에서 하나가 사라짐" 같은 **재현 안 되는 버그**가 됩니다. 원인 찾는 데 하루씩 날아갑니다.

## 올바른 엔티티 — Java와 대조

```java
// Java
@Entity
public class Member {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY) private Long id;
    @Column(nullable = false) private String name;
    @OneToMany(mappedBy = "member") private List<Order> orders = new ArrayList<>();

    protected Member() {}                 // JPA 용 기본 생성자
    public Member(String name) { this.name = name; }

    @Override public boolean equals(Object o) {
        if (this == o) return true;
        if (!(o instanceof Member other)) return false;
        return id != null && id.equals(other.id);   // id 기반
    }
    @Override public int hashCode() { return getClass().hashCode(); }  // 상수
}
```

```kotlin
// Kotlin
@Entity
class Member(
    @Column(nullable = false) var name: String,
) {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    var id: Long? = null
        protected set

    @OneToMany(mappedBy = "member")
    val orders: MutableList<Order> = mutableListOf()

    override fun equals(other: Any?): Boolean {
        if (this === other) return true
        if (other !is Member) return false
        val myId = id ?: return false
        return myId == other.id
    }

    override fun hashCode(): Int = javaClass.hashCode()
}
```

`data`가 빠졌고 `equals`/`hashCode`를 손으로 씁니다. 하나씩 뜯어보죠.

### `var` vs `val` — 어디에 뭘 쓰나

Lesson 2에서 "`val`을 기본으로"라고 했지만 엔티티는 예외가 많습니다.

| 자리 | 선택 | 이유 |
|---|---|---|
| 변경되는 컬럼 (`name`, `status`) | `var` | 더티 체킹으로 UPDATE 하려면 값이 바뀌어야 함 |
| 불변 컬럼 (`createdAt`, `orderNo`) | `var` (setter는 private) | Hibernate가 리플렉션으로 채움 |
| `@Id` | `var ... = null` | `IDENTITY` 전략은 INSERT 후에 채워짐 |
| `@OneToMany` 컬렉션 | `val` + `mutableListOf()` | **참조는 고정, 내용만 변경** |

마지막 줄이 중요합니다. Hibernate는 자기가 만든 `PersistentBag`/`PersistentSet`으로 변경을 추적하는데, `member.orders = newList`처럼 **참조를 갈아끼우면 추적이 끊깁니다.** `orphanRemoval` 설정에 따라 엉뚱한 DELETE가 나가기도 해요. **`val` + `mutableListOf()`가 정답**입니다. 참조는 못 바꾸고 `add`/`remove`만 되니 실수가 원천 차단됩니다.

### id는 `Long? = null` — lateinit은 안 된다

```kotlin
@Id @GeneratedValue var id: Long? = null   // O
@Id @GeneratedValue lateinit var id: Long  // X — lateinit 은 primitive 타입 불가
```

애초에 id는 **"아직 저장 안 됨"을 표현해야** 하므로 nullable이 의미상 맞습니다. `id == null` = 미영속(transient), `id != null` = 영속 이후. 위 `equals`가 이걸 그대로 씁니다. 반대로 `lateinit`이 맞는 자리는 생성자에서 못 받는 **연관관계 필드**(`lateinit var member: Member`)인데, 초기화 전 접근하면 `UninitializedPropertyAccessException`이 나니 가능하면 **주 생성자에서 받아 non-null로 고정**하세요.

### noArg 플러그인 — 왜 필요한가

JPA 스펙은 엔티티에 **파라미터 없는 기본 생성자**를 요구합니다. 리플렉션으로 빈 객체를 만든 뒤 필드를 채우니까요. 그런데 `class Member(var name: String)`처럼 주 생성자에 파라미터가 있으면 Kotlin은 기본 생성자를 안 만듭니다 → Hibernate 인스턴스화 실패. Java에서는 `protected Member() {}`를 직접 써줬죠. Kotlin에서는 플러그인이 대신합니다.

```kotlin
// build.gradle.kts
plugins {
    kotlin("plugin.jpa") version "1.9.25"      // = noArg, @Entity/@Embeddable 대상
    kotlin("plugin.spring") version "1.9.25"   // = allOpen (Lesson 21에서 다룹니다)
}
```

`plugin.jpa`는 **바이트코드 레벨로만** 기본 생성자를 넣습니다. 우리 코드에선 안 보이니 `Member()`로 잘못 만들 걱정이 없어요. `plugin.allopen`(=`plugin.spring`)도 같이 필요합니다. Kotlin 클래스는 기본이 `final`인데 Hibernate는 LAZY 프록시를 만들려고 엔티티를 **상속**하거든요. `final`이면 프록시를 못 만들고 조용히 EAGER처럼 동작합니다.

> **면접 빈출** — "Kotlin에서 JPA 엔티티 쓸 때 주의점은?" 답의 뼈대: ① data class 금지(equals/copy) ② `plugin.jpa`로 기본 생성자 ③ `plugin.allopen`으로 final 해제(프록시) ④ 컬렉션은 `val` + `mutableListOf()` ⑤ id는 `Long? = null`.

## toString도 직접, 연관관계는 빼고

data class를 안 쓰면 `toString()`도 안 생깁니다. `override fun toString() = "Member(id=$id, name=$name)"` 처럼 만들되 **연관관계는 절대 넣지 마세요.** `Order.toString()`이 `member`를, `Member.toString()`이 `orders`를 출력하면 → **무한 재귀 StackOverflowError**. 양방향 연관관계에서 100% 터집니다. LAZY 컬렉션을 찍으면 로그 한 줄 때문에 쿼리도 나가고요.

## 그래서 data class는 어디에?

```kotlin
@Entity class Member(var name: String, var email: String) { /* id 기반 equals */ }

data class MemberResponse(val id: Long, val name: String, val email: String) {   // 응답 DTO
    companion object { fun from(m: Member) = MemberResponse(m.id!!, m.name, m.email) }
}
```

경계를 이렇게 그으세요. **엔티티는 영속성 계층 안에서만 살고, 밖으로는 data class DTO가 나간다.** 그러면 Lesson 3에서 배운 `copy()`, 구조 분해, 기본값이 전부 제 역할을 합니다.

## 연습

`equals`/`hashCode`가 엔티티에서 어떻게 어긋나는지 직접 출력해서 확인하고, id 기반으로 고치는 문제입니다. (JPA를 쓰지 않고 순수 Kotlin으로 같은 상황을 재현합니다.)

1. `BadMember`는 `data class`로 이미 주어져 있습니다. 건드리지 마세요.
2. `GoodMember`의 `equals`/`hashCode`를 **id 기반**으로 구현하세요.
   - 같은 인스턴스면 `true`
   - `GoodMember`가 아니면 `false`
   - **둘 중 하나라도 id가 `null`이면 `false`** (아직 저장 안 된 엔티티는 서로 같을 수 없음)
   - 둘 다 id가 있으면 id끼리 비교
   - `hashCode()`는 **id를 쓰면 안 됩니다.** id는 저장 시점에 `null` → 값으로 바뀌므로, 해시가 변하면 `HashSet`이 깨집니다. **상수**를 반환하세요.

```kotlin starter
// 잘못된 방식 — 엔티티를 data class 로 만든 경우 (수정하지 마세요)
data class BadMember(
    var id: Long? = null,
    var name: String,
)

// 올바른 방식 — id 기반 동등성
class GoodMember(
    var id: Long? = null,
    var name: String,
) {
    // TODO: equals 를 id 기반으로 구현하세요
    // TODO: hashCode 를 상수로 구현하세요
}

fun main() {
    // 1) data class 엔티티: 영속 상태에서 필드를 바꾸면 해시가 달라진다
    val bad = BadMember(id = 1L, name = "박경태")
    val badSet = hashSetOf(bad)
    bad.name = "박경태(수정)"
    println("[bad] 필드 변경 후 contains: ${badSet.contains(bad)}")

    // 2) data class 엔티티: copy() 가 식별자까지 복제한다
    val badCopy = bad.copy()
    println("[bad] copy 된 id: ${badCopy.id}")
    println("[bad] 원본 == 복사본: ${bad == badCopy}")

    // 3) id 기반 엔티티: 필드를 바꿔도 컬렉션에서 찾을 수 있다
    val good = GoodMember(id = 1L, name = "박경태")
    val goodSet = hashSetOf(good)
    good.name = "박경태(수정)"
    println("[good] 필드 변경 후 contains: ${goodSet.contains(good)}")

    // 4) 같은 id 면 다른 인스턴스여도 같은 엔티티 (프록시가 이렇게 들어온다)
    val proxyLike = GoodMember(id = 1L, name = "아직 로딩 안 된 값")
    println("[good] 같은 id 다른 인스턴스 ==: ${good == proxyLike}")
    println("[good] 같은 id 다른 인스턴스 contains: ${goodSet.contains(proxyLike)}")

    // 5) 아직 저장 안 된(id == null) 엔티티끼리는 절대 같지 않다
    val new1 = GoodMember(name = "신규A")
    val new2 = GoodMember(name = "신규B")
    println("[good] 미영속 둘 ==: ${new1 == new2}")
    println("[good] 미영속 자기 자신 ==: ${new1 == new1}")
}
```

```text expected
[bad] 필드 변경 후 contains: false
[bad] copy 된 id: 1
[bad] 원본 == 복사본: true
[good] 필드 변경 후 contains: true
[good] 같은 id 다른 인스턴스 ==: true
[good] 같은 id 다른 인스턴스 contains: true
[good] 미영속 둘 ==: false
[good] 미영속 자기 자신 ==: true
```

```text hint
JPA 엔티티의 동등성 기준은 **식별자 하나**입니다. 이름이 바뀌어도 id 가 1 이면 같은 행이고, LAZY 프록시처럼 필드가 텅 비어 있어도 id 가 1 이면 같은 행이에요. 그런데 `hashCode` 에는 제약이 하나 더 붙습니다 — `id` 는 저장 전 `null` 이었다가 INSERT 후 값으로 **바뀌죠.** `HashSet` 이 객체를 넣을 때의 해시로 버킷을 정한다는 걸 떠올려 보세요. id 로 해시를 만들면 저장 직후 무슨 일이 벌어질까요?
---
`equals` 는 관문 네 개입니다 — 동일 인스턴스(`this === other`), 타입 검사(`other !is GoodMember`), 미영속 차단, 그리고 id 비교. 세 번째 관문은 엘비스로 한 줄에 끝납니다: `val myId = id ?: return false`. `hashCode` 는 인스턴스 상태와 무관한 상수여야 하니 `javaClass.hashCode()` 를 쓰세요 (레슨 본문 Java 예제의 `getClass().hashCode()` 와 같은 것입니다).
---
순서가 중요합니다. `this === other` 가 **맨 앞**에 와야 `new1 == new1` — id 가 null 인 자기 자신 — 이 `true` 가 돼요. 그다음 타입 검사, 그다음 미영속 차단입니다. `val myId = id ?: return false` 는 **내** id 만 보지만, 상대 id 가 null 인 경우도 `myId == other.id` 에서 자연히 false 가 되니 검사는 한 번으로 충분합니다. `hashCode` 가 상수라는 건 **모든 엔티티가 한 버킷에 들어간다**는 뜻이고, 그래서 저장 후 id 가 채워져도 버킷이 움직이지 않습니다 — 버킷 안에서의 구분은 `equals` 가 맡아요. 해시 분산을 포기하고 **정확성**을 사는, 의도된 거래입니다.
---
뼈대는 이렇습니다. 빈칸 네 개만 채우면 돼요.

`override fun equals(other: Any?): Boolean { if (this === ___) return true; if (other !is ___) return false; val myId = id ?: return ___; return myId == other.___ }`

`override fun hashCode(): Int = ___`
```

```kotlin solution
// 잘못된 방식 — 엔티티를 data class 로 만든 경우 (수정하지 마세요)
data class BadMember(
    var id: Long? = null,
    var name: String,
)

// 올바른 방식 — id 기반 동등성
class GoodMember(
    var id: Long? = null,
    var name: String,
) {
    override fun equals(other: Any?): Boolean {
        if (this === other) return true          // 같은 인스턴스면 id 가 없어도 같다
        if (other !is GoodMember) return false
        val myId = id ?: return false            // 미영속(transient) 끼리는 절대 같지 않다
        return myId == other.id                  // 비교 기준은 오직 식별자
    }

    // id 는 저장 시점에 null -> 값으로 바뀐다. 해시가 따라 변하면 HashSet 의 버킷이 어긋나므로
    // 클래스 단위 상수를 쓴다. (동일 해시 + equals 로 구분 — 컬렉션 규약상 안전)
    override fun hashCode(): Int = javaClass.hashCode()
}

fun main() {
    // 1) data class 엔티티: 영속 상태에서 필드를 바꾸면 해시가 달라진다
    val bad = BadMember(id = 1L, name = "박경태")
    val badSet = hashSetOf(bad)
    bad.name = "박경태(수정)"
    println("[bad] 필드 변경 후 contains: ${badSet.contains(bad)}")

    // 2) data class 엔티티: copy() 가 식별자까지 복제한다
    val badCopy = bad.copy()
    println("[bad] copy 된 id: ${badCopy.id}")
    println("[bad] 원본 == 복사본: ${bad == badCopy}")

    // 3) id 기반 엔티티: 필드를 바꿔도 컬렉션에서 찾을 수 있다
    val good = GoodMember(id = 1L, name = "박경태")
    val goodSet = hashSetOf(good)
    good.name = "박경태(수정)"
    println("[good] 필드 변경 후 contains: ${goodSet.contains(good)}")

    // 4) 같은 id 면 다른 인스턴스여도 같은 엔티티 (프록시가 이렇게 들어온다)
    val proxyLike = GoodMember(id = 1L, name = "아직 로딩 안 된 값")
    println("[good] 같은 id 다른 인스턴스 ==: ${good == proxyLike}")
    println("[good] 같은 id 다른 인스턴스 contains: ${goodSet.contains(proxyLike)}")

    // 5) 아직 저장 안 된(id == null) 엔티티끼리는 절대 같지 않다
    val new1 = GoodMember(name = "신규A")
    val new2 = GoodMember(name = "신규B")
    println("[good] 미영속 둘 ==: ${new1 == new2}")
    println("[good] 미영속 자기 자신 ==: ${new1 == new1}")
}
```
