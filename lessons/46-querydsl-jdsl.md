# Lesson 46 — 타입 세이프 쿼리

Lesson 19에서 엔티티를 제대로 잡았으니 이제 조회입니다. Spring Data JPA의 메서드 이름 쿼리(`findByNameAndStatus`)는 조건 두세 개까지는 편하지만, 실무의 검색 화면은 그렇게 안 생겼죠. **조건 6개 중 사용자가 채운 것만 적용**해야 합니다. 여기서부터가 진짜입니다.

## JPQL 문자열의 문제 — 런타임까지 모른다

```java
// Java — @Query
@Query("select m from Member m where m.nmae = :name")   // 오타
List<Member> findByName(@Param("name") String name);
```

`nmae`. 컴파일은 통과합니다. Spring Boot가 뜰 때 `@Query` 검증에서 잡히면 다행이고, 네이티브 쿼리나 동적 조립 문자열이면 **그 API를 실제로 호출하는 순간** 터져요. 금요일 밤 배포, 월요일 오전에 발견되는 종류의 버그입니다.

죄목은 셋 — 컴파일러가 **컬럼명·엔티티명·타입을 검증하지 않음**, 엔티티 필드명을 리팩터링해도 **쿼리는 안 따라옴**, 그리고 동적 조건을 넣으려면 결국 이렇게 됩니다.

```java
StringBuilder sb = new StringBuilder("select m from Member m where 1=1");
if (name != null) sb.append(" and m.name like :name");
if (status != null) sb.append(" and m.status = :status");
```

`where 1=1`. Java 진영에서 안 써본 사람이 없을 겁니다. "동적 쿼리를 문자열로 만들고 있다"는 냄새의 대표주자예요.

## QueryDSL — Java에서의 정답

```java
// Java + QueryDSL
public List<Member> search(MemberSearchCond cond) {
    return queryFactory
        .selectFrom(member)
        .where(
            nameLike(cond.getName()),
            statusEq(cond.getStatus()),
            ageGoe(cond.getMinAge())
        )
        .orderBy(member.id.desc())
        .fetch();
}

private BooleanExpression nameLike(String name) {
    return name != null ? member.name.contains(name) : null;   // null 이면 무시됨
}
```

QueryDSL의 `.where(...)`는 **가변인자를 받고 `null`인 조건은 조용히 건너뜁니다.** 이게 `BooleanBuilder`보다 나은 이유예요.

```java
// BooleanBuilder — 명령형, if 가 다시 등장
BooleanBuilder builder = new BooleanBuilder();
if (cond.getName() != null) builder.and(member.name.contains(cond.getName()));
if (cond.getStatus() != null) builder.and(member.status.eq(cond.getStatus()));
```

`BooleanBuilder`도 동작은 하지만 조건 로직이 재사용 불가능한 `if` 더미에 갇힙니다. **null 반환 메서드 방식**은 `nameLike`를 다른 쿼리에서 그대로 재사용해요. 실무 표준은 이쪽입니다.

## Kotlin에서 QueryDSL — 되긴 되는데 아프다

QueryDSL은 `@Entity`를 읽어 `QMember` 같은 Q클래스를 **생성**합니다. Java에서는 annotation processor가 돌면 끝이지만, Kotlin에서는 여기서 세금이 붙습니다.

```kotlin
// build.gradle.kts — kapt 방식 (전통적)
plugins { kotlin("kapt") version "1.9.25" }
dependencies {
    implementation("com.querydsl:querydsl-jpa:5.1.0:jakarta")
    kapt("com.querydsl:querydsl-apt:5.1.0:jakarta")
}
```

아픈 지점 셋:

1. **kapt는 느립니다.** Kotlin 코드를 Java 스텁으로 바꾼 뒤 annotation processor를 돌려요. 엔티티 몇십 개만 돼도 빌드 시간이 눈에 띄게 늡니다. KSP로 갈아타고 싶어도 **QueryDSL 공식은 KSP를 지원하지 않습니다**(커뮤니티 포크는 있음).
2. **Q클래스가 Java로 생성되므로 전부 플랫폼 타입**입니다. Lesson 1의 `String!` 문제가 되살아나요. `member.name`이 `StringPath!`라 Kotlin의 null 안정성이 안 먹습니다.
3. **`null` 조건 조합이 어색합니다.** `BooleanExpression?`을 다뤄야 하는데 `and`/`or`가 플랫폼 타입이라 체인이 지저분해져요. 그래서 이런 확장 함수를 직접 만들어 쓰는 팀이 흔합니다.

```kotlin
infix fun BooleanExpression?.andIfNotNull(other: BooleanExpression?): BooleanExpression? =
    when {
        this == null -> other
        other == null -> this
        else -> this.and(other)
    }
```

## Kotlin JDSL — Q클래스 없는 대안

라인(LINE)에서 만든 **Kotlin JDSL**은 코드 생성 자체를 없앱니다. 프로퍼티 참조(`Member::name`)를 쓰거든요.

```kotlin
// Kotlin JDSL 3.x
val query = jpql {
    select(entity(Member::class))
        .from(entity(Member::class))
        .where(
            and(
                cond.name?.let { path(Member::name).like("%$it%") },
                cond.status?.let { path(Member::status).eq(it) },
                cond.minAge?.let { path(Member::age).ge(it) },
            )
        )
        .orderBy(path(Member::id).desc())
}
```

**kapt/KSP 불필요**(빌드 안 느려짐, Q클래스 커밋 논쟁 없음), 프로퍼티 참조라 **리팩터링이 따라옴**, `and(...)`가 **`null`을 걸러줘서** `?.let`과 궁합이 완벽합니다.

트레이드오프도 정직하게: QueryDSL만큼 자료가 많지 않고 복잡한 서브쿼리·윈도우 함수에서 표현력이 부족할 때가 있어요. 팀에 QueryDSL 경험이 두텁다면 굳이 갈아탈 이유는 없습니다. **새 프로젝트를 Kotlin으로 시작한다면 JDSL을 먼저 검토**하는 게 합리적이에요.

| | QueryDSL | Kotlin JDSL |
|---|---|---|
| 코드 생성 | kapt 필요 (느림, KSP 미지원) | **없음** |
| 타입 참조 | `QMember.member.name` | `Member::name` |
| null 타입 | 플랫폼 타입 (`!`) | Kotlin 네이티브 |
| null 조건 | `where(...)` 가변인자가 무시 | `and(...)` 가 무시 |
| 생태계 | 두터움 | 얇음 |

## 프로젝션 — data class로 받기

목록 API에서 엔티티를 통째로 가져오는 건 낭비입니다. 필요한 컬럼만 DTO로 받으세요. Lesson 19에서 말한 **"엔티티는 안, DTO는 밖"** 경계가 여기서 실현됩니다.

```java
// Java + QueryDSL — @QueryProjection
queryFactory
    .select(new QMemberSummary(member.id, member.name, member.email))
    .from(member)
    .fetch();
```

```kotlin
// Kotlin — data class 에 @QueryProjection
data class MemberSummary @QueryProjection constructor(
    val id: Long,
    val name: String,
    val email: String,
)
```

Kotlin에서 생성자에 애노테이션을 붙이려면 `constructor` 키워드를 **명시**해야 합니다. 빼먹으면 "왜 Q클래스가 안 생기지?" 하면서 한참 헤매요. `@QueryProjection`은 DTO가 QueryDSL에 의존하게 만드니, 싫으면 `Projections.constructor(...)`를 씁니다(타입 안정성은 일부 포기). Kotlin JDSL은 `selectNew<MemberSummary>(path(Member::id), ...)` 로 그냥 됩니다.

> **실무 경고.** 프로젝션을 `data class`로 받는 건 좋은데, **엔티티를 그대로 컨트롤러까지 내보내지 마세요.** LAZY 연관이 직렬화 시점에 초기화되면서 N+1이 터지거나(Lesson 21), OSIV가 꺼져 있으면 `LazyInitializationException`이 500 에러로 나갑니다. 게다가 엔티티에 컬럼 하나 추가하면 **API 응답 스펙이 소리 없이 바뀝니다.** 클라이언트가 깨지고 나서야 압니다.

## 무엇을 쓰든 원칙은 하나

기술 선택보다 중요한 건 **동적 조건을 조립하는 방식**입니다.

- 조건 하나 = **null을 반환할 수 있는 함수 하나**
- 조립기는 **null을 받으면 건너뛴다**
- `if` 로 `AND` 를 붙이지 않는다, `where 1=1` 을 쓰지 않는다

이 구조를 손에 익히면 QueryDSL이든 JDSL이든 Exposed든 갈아타는 게 문법 문제일 뿐입니다. 연습에서 이 조립기를 **직접** 만들어 보겠습니다.

## 연습

QueryDSL의 `where(...)` 가변인자가 하는 일 — **null 조건은 건너뛰기** — 를 순수 Kotlin으로 구현합니다. (외부 라이브러리 없이, 최종 SQL 문자열을 만들어 확인합니다.)

구현할 것:

1. `QueryBuilder.where(condition: String?)` — `condition`이 `null`이면 **무시**하고, 아니면 조건 목록에 추가. 자기 자신(`this`)을 반환해 체이닝 가능하게.
2. `QueryBuilder.build()` — `SELECT * FROM {table}` 로 시작. 조건이 **하나라도 있으면** ` WHERE cond1 AND cond2 ...`, **하나도 없으면 WHERE 절 자체를 생략**. `orderBy`가 설정돼 있으면 ` ORDER BY {clause}`를 붙임.
3. 조건 팩토리 4개 — 값이 없으면 `null` 반환:
   - `likeOrNull("name", "박")` → `name LIKE '%박%'` (`null`이거나 **공백뿐이면** `null`)
   - `eqOrNull("status", "ACTIVE")` → `status = 'ACTIVE'` (`null`이거나 공백뿐이면 `null`)
   - `inOrNull("role", listOf("USER","ADMIN"))` → `role IN ('USER', 'ADMIN')` (`null`이거나 **빈 리스트면** `null`)
   - `goeOrNull("age", 20)` → `age >= 20` (`null`이면 `null`)

```kotlin starter
data class MemberSearch(
    val name: String? = null,
    val status: String? = null,
    val roles: List<String>? = null,
    val minAge: Int? = null,
)

class QueryBuilder(private val table: String) {
    private val conditions = mutableListOf<String>()
    private var orderBy: String? = null

    // TODO: condition 이 null 이면 건너뛰고, 아니면 conditions 에 추가한 뒤 this 반환
    fun where(condition: String?): QueryBuilder {
        TODO("구현하세요")
    }

    fun orderBy(clause: String): QueryBuilder {
        orderBy = clause
        return this
    }

    // TODO: SELECT * FROM {table} [ WHERE a AND b ...] [ ORDER BY {clause}]
    fun build(): String {
        TODO("구현하세요")
    }
}

// TODO: 값이 없으면 null 을 반환하는 조건 팩토리 4개
fun likeOrNull(column: String, value: String?): String? = TODO("구현하세요")

fun eqOrNull(column: String, value: String?): String? = TODO("구현하세요")

fun inOrNull(column: String, values: List<String>?): String? = TODO("구현하세요")

fun goeOrNull(column: String, value: Int?): String? = TODO("구현하세요")

fun search(cond: MemberSearch): String =
    QueryBuilder("member")
        .where(likeOrNull("name", cond.name))
        .where(eqOrNull("status", cond.status))
        .where(inOrNull("role", cond.roles))
        .where(goeOrNull("age", cond.minAge))
        .orderBy("id DESC")
        .build()

fun main() {
    println(search(MemberSearch(name = "박")))
    println(search(MemberSearch(status = "ACTIVE", roles = listOf("USER", "ADMIN"), minAge = 20)))
    println(search(MemberSearch(name = "  ", roles = emptyList())))
    println(search(MemberSearch()))
}
```

```text expected
SELECT * FROM member WHERE name LIKE '%박%' ORDER BY id DESC
SELECT * FROM member WHERE status = 'ACTIVE' AND role IN ('USER', 'ADMIN') AND age >= 20 ORDER BY id DESC
SELECT * FROM member ORDER BY id DESC
SELECT * FROM member ORDER BY id DESC
```

```text hint
이 문제의 핵심은 **`if` 를 조립기 쪽에 두지 않는 것**입니다. "값이 있나?" 를 판단하는 책임은 조건 팩토리 4개가 각자 지고, 없으면 `null` 을 내놓습니다. 조립기(`where`)는 받은 게 null 인지만 보고 조용히 버려요. 그리고 `build()` — 조건이 하나도 없으면 `WHERE` 라는 글자가 **아예 안 나와야** 합니다. `where 1=1` 을 쓰지 않겠다는 게 바로 이 뜻입니다.
---
팩토리 4개는 `?.takeIf { }?.let { }` 한 줄이면 끝납니다. `takeIf` 는 조건이 거짓이면 null 을 내놓으니(Lesson 1), 문자열엔 `isNotBlank()`, 리스트엔 `isNotEmpty()` 를 조건으로 주세요. `goeOrNull` 은 값이 있기만 하면 되니 `?.let { }` 만으로 충분합니다. `build()` 는 `buildString { }` 안에서 `append` 하면 되고, 조각을 잇는 데엔 `joinToString` 의 `separator` · `prefix` · `postfix` 세 인자가 전부 쓰입니다.
---
`where(condition)` 는 `condition?.let { conditions += it }` 뒤에 `return this` — `?.let` 이 곧 "null 이면 건너뛴다" 입니다. `build()` 의 WHERE 절은 `if (conditions.isNotEmpty())` 로 한 번 감싸고, 그 안에서 `joinToString(" AND ", prefix = " WHERE ")` 를 쓰세요. `prefix` 를 쓰는 게 요령입니다 — 조건이 없으면 `if` 가 통째로 안 돌아 WHERE 가 사라지고, 있으면 접두사가 딱 한 번만 붙습니다. `inOrNull` 도 같은 함수로 해결돼요. `prefix = "$column IN ("`, `postfix = ")"`, 그리고 각 원소를 작은따옴표로 감싸는 변환 람다까지 **한 번의 호출**에 담깁니다.
---
뼈대는 이렇습니다.

`fun where(condition: String?): QueryBuilder { condition?.let { ___ }; return this }`

`build()` 안은 `append("SELECT * FROM ").append(table)` → `if (conditions.___()) append(conditions.joinToString(" AND ", prefix = ___))` → `orderBy?.let { append(" ORDER BY ").append(it) }`.

팩토리는 `value?.takeIf { ___ }?.let { "$column LIKE '%$it%'" }` 꼴입니다.
```

```kotlin solution
data class MemberSearch(
    val name: String? = null,
    val status: String? = null,
    val roles: List<String>? = null,
    val minAge: Int? = null,
)

class QueryBuilder(private val table: String) {
    private val conditions = mutableListOf<String>()
    private var orderBy: String? = null

    // QueryDSL 의 where(...) 가변인자와 같은 계약: null 조건은 조용히 건너뛴다.
    fun where(condition: String?): QueryBuilder {
        condition?.let { conditions += it }
        return this
    }

    fun orderBy(clause: String): QueryBuilder {
        orderBy = clause
        return this
    }

    fun build(): String = buildString {
        append("SELECT * FROM ").append(table)
        // 조건이 하나도 없으면 WHERE 절 자체가 사라진다 — where 1=1 을 쓰지 않는 이유.
        if (conditions.isNotEmpty()) {
            append(conditions.joinToString(separator = " AND ", prefix = " WHERE "))
        }
        orderBy?.let { append(" ORDER BY ").append(it) }
    }
}

// 조건 하나 = null 을 반환할 수 있는 함수 하나. 판정은 전부 takeIf 가 맡는다.
fun likeOrNull(column: String, value: String?): String? =
    value?.takeIf { it.isNotBlank() }?.let { "$column LIKE '%$it%'" }

fun eqOrNull(column: String, value: String?): String? =
    value?.takeIf { it.isNotBlank() }?.let { "$column = '$it'" }

fun inOrNull(column: String, values: List<String>?): String? =
    values?.takeIf { it.isNotEmpty() }
        ?.joinToString(separator = ", ", prefix = "$column IN (", postfix = ")") { "'$it'" }

fun goeOrNull(column: String, value: Int?): String? =
    value?.let { "$column >= $it" }

fun search(cond: MemberSearch): String =
    QueryBuilder("member")
        .where(likeOrNull("name", cond.name))
        .where(eqOrNull("status", cond.status))
        .where(inOrNull("role", cond.roles))
        .where(goeOrNull("age", cond.minAge))
        .orderBy("id DESC")
        .build()

fun main() {
    println(search(MemberSearch(name = "박")))
    println(search(MemberSearch(status = "ACTIVE", roles = listOf("USER", "ADMIN"), minAge = 20)))
    println(search(MemberSearch(name = "  ", roles = emptyList())))
    println(search(MemberSearch()))
}
```
