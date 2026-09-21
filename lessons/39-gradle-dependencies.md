# Lesson 39 — 의존성 관리 — 버전 카탈로그, api vs implementation

`dependencies { }` 에 한 줄 추가하는 건 5초면 됩니다. 그 한 줄이 빌드 시간과 모듈 경계에 무슨 짓을 하는지 아는 데는 이 레슨 하나가 필요해요.

## configuration — 앞의 단어가 진짜 의미하는 것

```kotlin
dependencies {
    implementation("org.springframework.boot:spring-boot-starter-web")
    api("com.example:order-contract")
    compileOnly("org.projectlombok:lombok")
    runtimeOnly("org.postgresql:postgresql")
    testImplementation("org.springframework.boot:spring-boot-starter-test")
    ksp("com.google.dagger:dagger-compiler")
}
```

configuration은 "의존성 묶음의 이름"이고, 각각 **어느 클래스패스에 들어가느냐**가 다릅니다.

| configuration | 내 컴파일 | 내 런타임 | **나를 쓰는 모듈의 컴파일** |
|---|---|---|---|
| `implementation` | O | O | **X** |
| `api` | O | O | **O** |
| `compileOnly` | O | X | X |
| `runtimeOnly` | X | O | X |
| `testImplementation` | 테스트만 | 테스트만 | X |

`compileOnly`는 컴파일할 때만 필요하고 런타임엔 다른 데서 제공되는 것(서블릿 API, 애노테이션 전용 라이브러리)에 씁니다. `runtimeOnly`는 반대 — JDBC 드라이버가 대표적이에요. 코드에서 `org.postgresql` 을 직접 import 할 일은 없고, 런타임에 `DriverManager`가 찾기만 하면 되니까요. **드라이버를 `implementation`으로 넣는 순간 아무나 `PGConnection`을 import 할 수 있게 됩니다.**

애노테이션 처리기는 `annotationProcessor`(Java), `kapt`(Kotlin, 구식), `ksp`(Kotlin, 권장)로 따로 선언합니다. 자세한 건 다음 레슨에서요.

## `api` vs `implementation` — 여기가 핵심

`:app` → `:order` → `:domain` 이라고 합시다.

```kotlin
// order/build.gradle.kts
dependencies {
    implementation(project(":domain"))
}
```

이러면 `:app`의 코드에서 `:domain`의 클래스를 **import 할 수 없습니다.** 컴파일 에러가 나요. `:order`가 `:domain`을 쓴다는 건 `:order`의 내부 구현 사정이고, `:app`은 알 바 아니라는 선언입니다.

```kotlin
dependencies {
    api(project(":domain"))
}
```

`api`로 바꾸면 `:app`에서도 `:domain`이 보입니다. **`:order`의 공개 API 시그니처에 `:domain`의 타입이 등장한다면** — 예컨대 `fun find(): Order` 에서 `Order`가 `:domain`의 클래스라면 — `api`가 **맞습니다**. 안 그러면 `:app`이 그 반환값의 타입을 적을 수조차 없으니까요.

빌드 시간 얘기가 여기서 나옵니다. `:domain`을 고쳤을 때:

- `implementation`이면 → `:order`만 다시 컴파일. `:app`은 `:domain`을 볼 수 없었으니 영향받을 리 없습니다.
- `api`면 → `:order`, `:app` **둘 다** 다시 컴파일.

모듈 20개짜리 프로젝트에서 전부 `api`로 선언해 두면, 한 군데 고칠 때마다 전체가 다시 빌드됩니다. **`api`는 기본값이 아니라 예외**여야 해요.

> 리뷰 규칙: **`api` 를 볼 때마다 "이 타입이 공개 시그니처에 나오는가?"를 묻는다.** 아니라면 `implementation`입니다. Gradle이 `implementation`을 기본으로 밀고 `api`를 `java-library` 플러그인에서만 주는 이유가 이겁니다.

## 버전 카탈로그 — `gradle/libs.versions.toml`

버전 문자열이 모듈마다 흩어지는 문제의 표준 해법입니다. Gradle 7.4부터 정식입니다.

```toml
# gradle/libs.versions.toml
[versions]
kotlin = "2.0.21"
springBoot = "3.3.4"
jackson = "2.17.2"

[libraries]
kotlin-reflect = { module = "org.jetbrains.kotlin:kotlin-reflect", version.ref = "kotlin" }
spring-boot-starter-web = { module = "org.springframework.boot:spring-boot-starter-web", version.ref = "springBoot" }
spring-boot-starter-data-jpa = { module = "org.springframework.boot:spring-boot-starter-data-jpa", version.ref = "springBoot" }
jackson-module-kotlin = { module = "com.fasterxml.jackson.module:jackson-module-kotlin", version.ref = "jackson" }

[bundles]
web = ["spring-boot-starter-web", "jackson-module-kotlin"]

[plugins]
spring-boot = { id = "org.springframework.boot", version.ref = "springBoot" }
```

쓰는 쪽:

```kotlin
dependencies {
    implementation(libs.spring.boot.starter.web)
    implementation(libs.bundles.web)
}
plugins {
    alias(libs.plugins.spring.boot)
}
```

**별칭의 `-` 가 접근자에서 `.` 이 됩니다.** `spring-boot-starter-web` → `libs.spring.boot.starter.web`. 이 접근자는 Gradle이 **생성한 타입 안전 코드**라서, 오타를 내면 스크립트 컴파일이 실패하고 IDE가 자동완성해 줍니다. 문자열 좌표를 손으로 적는 것과 근본적으로 다릅니다.

`version.ref`로 묶어 두면 Spring Boot를 3.3.4 → 3.4.0으로 올릴 때 **TOML 한 줄**만 고칩니다. 열 개 모듈을 뒤질 필요가 없어요.

## BOM / platform — 버전을 아예 안 적는 방법

```kotlin
dependencies {
    implementation(platform("org.springframework.boot:spring-boot-dependencies:3.3.4"))
    implementation("org.springframework.boot:spring-boot-starter-web")   // 버전 없음
    implementation("com.fasterxml.jackson.module:jackson-module-kotlin") // 버전 없음
}
```

BOM(Bill of Materials)은 **"이 라이브러리들은 이 버전으로 써라"는 목록**입니다. `platform(...)`으로 가져오면 그 안에 있는 좌표는 버전을 생략할 수 있어요. Spring Boot BOM은 Jackson·Netty·Tomcat 등 수백 개의 궁합 맞는 버전 조합을 관리합니다. **직접 Jackson 버전을 올려 적는 순간 그 보증이 깨집니다.**

`io.spring.dependency-management` 플러그인이 하던 일을 Gradle 네이티브 `platform`이 대체했습니다. 새 프로젝트라면 `platform`을 쓰세요.

## 충돌은 이렇게 해결된다

A는 `jackson-databind:2.15.0`을, B는 `2.17.2`를 끌고 옵니다. Gradle의 기본 전략은 **가장 높은 버전 선택(newest wins)** 입니다. Maven의 "가장 가까운 것 우선"과 다릅니다.

여기서 주의할 게 하나 있어요. **버전 비교는 문자열 비교가 아닙니다.** `4.1.9` 와 `4.1.100` 을 문자열로 비교하면 `9 > 1` 이라 `4.1.9`가 이깁니다. 실제로는 세그먼트를 숫자로 끊어서 비교하므로 `4.1.100`이 이깁니다. 오늘 연습에서 이걸 직접 구현합니다.

억지로 맞춰야 할 때:

```kotlin
configurations.all {
    resolutionStrategy {
        force("com.fasterxml.jackson.core:jackson-databind:2.17.2")
        failOnVersionConflict()   // 조용히 넘어가지 말고 터뜨려라
    }
}

dependencies {
    implementation("com.example:legacy") {
        exclude(group = "commons-logging", module = "commons-logging")
    }
}
```

무엇이 실제로 선택됐는지는 이렇게 봅니다.

```bash
./gradlew :app:dependencies --configuration runtimeClasspath
./gradlew :app:dependencyInsight --dependency jackson-databind
```

`2.15.0 -> 2.17.2` 같은 화살표가 "충돌이 있었고 이쪽으로 정렬됐다"는 표시입니다. `dependencyInsight`는 **왜** 그 버전이 됐는지 경로까지 보여줍니다.

## 리뷰에서 지적할 것

- **전부 `api`** — 공개 시그니처에 안 나오는데 `api`면 `implementation`으로. 캡슐화와 빌드 시간을 동시에 잃고 있습니다.
- **버전 문자열이 모듈마다 반복** — 버전 카탈로그로 올립니다.
- **테스트 전용 라이브러리가 `implementation`** — Kotest·MockK가 프로덕션 클래스패스에 실려 배포 artifact에 들어갑니다.
- **BOM을 쓰면서 개별 버전을 덮어씀** — 궁합 보증을 스스로 깬 겁니다. 올려야 한다면 BOM 버전을 올리세요.
- **`exclude` 가 설명 없이 박혀 있음** — 왜 뺐는지 주석 한 줄이 없으면 아무도 못 지웁니다.

## 연습

버전 카탈로그와 의존성 해석을 **맵과 그래프로 재현**합니다. 채울 곳은 셋입니다.

1. `resolve(accessor)` — `libs.spring.boot.starter.web` 같은 접근자를 받아 `group:name:version` 좌표 문자열로 바꿉니다. `libs.` 를 떼고 `.` 을 `-` 로 되돌려 별칭을 찾은 뒤, `versionRef` 로 실제 버전을 해석하세요.
2. `compileClasspath(module)` — 그 모듈을 컴파일할 때 보이는 모듈 목록입니다. **직접 의존은 전부 보이고, 전이는 `api` 로 선언된 것만** 따라갑니다. 결과는 정렬해서 돌려주세요.
3. `compareVersions(a, b)` — 세그먼트를 숫자로 끊어 비교합니다(`4.1.100` > `4.1.9`). 이걸 쓰는 `pickVersion` 도 채웁니다.

```kotlin starter
data class Library(val group: String, val name: String, val versionRef: String)

// gradle/libs.versions.toml 의 [versions] / [libraries] 를 맵으로 옮긴 것
val versions = mapOf(
    "kotlin" to "2.0.21",
    "springBoot" to "3.3.4",
    "jackson" to "2.17.2",
)

val libraries = mapOf(
    "kotlin-reflect" to Library("org.jetbrains.kotlin", "kotlin-reflect", "kotlin"),
    "spring-boot-starter-web" to Library("org.springframework.boot", "spring-boot-starter-web", "springBoot"),
    "jackson-module-kotlin" to Library("com.fasterxml.jackson.module", "jackson-module-kotlin", "jackson"),
)

data class Dep(val target: String, val configuration: String)

val modules = mapOf(
    ":app" to listOf(Dep(":order", "implementation")),
    ":order" to listOf(Dep(":domain", "api"), Dep(":mapper", "implementation")),
    ":domain" to listOf(Dep(":common", "api")),
    ":mapper" to emptyList(),
    ":common" to emptyList(),
)

// TODO: 접근자를 별칭으로 되돌려 좌표 문자열을 만드세요.
fun resolve(accessor: String): String = TODO("구현하세요")

// TODO: 직접 의존 + api 로 노출된 전이 의존만 모아 정렬해 돌려주세요.
fun compileClasspath(module: String): List<String> = TODO("구현하세요")

// TODO: 세그먼트를 숫자로 끊어 비교하세요. a 가 크면 양수, 작으면 음수, 같으면 0.
fun compareVersions(a: String, b: String): Int = TODO("구현하세요")

// TODO: compareVersions 를 써서 가장 높은 버전을 고르세요.
fun pickVersion(candidates: List<String>): String = TODO("구현하세요")

fun main() {
    println("[버전 카탈로그]")
    for (accessor in listOf("libs.kotlin.reflect", "libs.spring.boot.starter.web", "libs.jackson.module.kotlin")) {
        println("$accessor = ${resolve(accessor)}")
    }

    println()
    println("[컴파일 클래스패스 — api 만 전이된다]")
    for (module in listOf(":app", ":order")) {
        println("$module -> ${compileClasspath(module).joinToString(", ")}")
    }

    println()
    println("[버전 충돌 해결]")
    val conflicts = listOf(
        "com.fasterxml.jackson.core:jackson-databind" to listOf("2.15.0", "2.17.2"),
        "io.netty:netty-common" to listOf("4.1.9", "4.1.100"),
    )
    for ((coordinate, candidates) in conflicts) {
        println("$coordinate: ${candidates.joinToString(", ")} -> ${pickVersion(candidates)}")
    }
}
```

```text expected
[버전 카탈로그]
libs.kotlin.reflect = org.jetbrains.kotlin:kotlin-reflect:2.0.21
libs.spring.boot.starter.web = org.springframework.boot:spring-boot-starter-web:3.3.4
libs.jackson.module.kotlin = com.fasterxml.jackson.module:jackson-module-kotlin:2.17.2

[컴파일 클래스패스 — api 만 전이된다]
:app -> :common, :domain, :order
:order -> :common, :domain, :mapper

[버전 충돌 해결]
com.fasterxml.jackson.core:jackson-databind: 2.15.0, 2.17.2 -> 2.17.2
io.netty:netty-common: 4.1.9, 4.1.100 -> 4.1.100
```

```text hint
세 문제가 각각 Gradle의 어느 단계인지부터 잡으세요. 1번은 **접근자 생성**(`-` ↔ `.` 변환), 2번은 **의존성 해석**(어디까지 전이되는가), 3번은 **충돌 정렬**(어느 버전이 이기는가)입니다. 특히 2번에서 `:app` 의 답에 `:mapper` 가 **없어야** 한다는 점을 먼저 확인하세요 — `:order` 가 `:mapper` 를 `implementation` 으로 감췄기 때문입니다.
---
1번은 `removePrefix("libs.")` 와 `replace('.', '-')` 두 번이면 별칭이 나오고, `libraries[alias]` → `versions[library.versionRef]` 순으로 두 번 찾습니다. 둘 다 null 일 수 있으니 `?:` 로 받으세요. 2번은 재귀가 자연스럽습니다 — **직접 의존을 넣는 루프**와 **api 만 따라가는 재귀**를 분리하세요. 중복과 순서를 동시에 해결하려면 `linkedSetOf<String>()` 가 편합니다. 3번은 `split(".")`, `getOrNull(i)?.toIntOrNull() ?: 0`, `maxOf(a.size, b.size)` 를 씁니다.
---
2번의 함정: 첫 단계에서는 configuration 을 **보지 않고** 전부 넣지만, 전이 단계에서는 `api` 만 따라갑니다. 규칙이 서로 다르니 루프와 재귀를 한 덩어리로 합치면 틀립니다. 재귀는 이미 넣은 모듈을 또 파고들지 않게 `result.add(target)` 의 반환값(**새로 들어갔으면 true**)으로 막으세요. 3번에서 길이가 다른 버전(`2.17` vs `2.17.2`)을 만나면 **없는 자리를 0으로** 채워 비교합니다. 마지막에 `sorted()` 를 빠뜨리면 출력이 달라집니다.
---
뼈대는 이렇습니다.

`val alias = accessor.removePrefix("libs.").replace(___, ___)`

`fun exposed(from: String) { for (dep in modules[from].orEmpty()) if (dep.configuration == ___ && result.add(dep.target)) exposed(dep.target) }`

`for (i in 0 until maxOf(left.size, right.size)) { ... if (l != r) return ___ }`

`candidates.reduce { acc, v -> if (compareVersions(v, acc) > 0) ___ else ___ }`
```

```kotlin solution
data class Library(val group: String, val name: String, val versionRef: String)

// gradle/libs.versions.toml 의 [versions] / [libraries] 를 맵으로 옮긴 것
val versions = mapOf(
    "kotlin" to "2.0.21",
    "springBoot" to "3.3.4",
    "jackson" to "2.17.2",
)

val libraries = mapOf(
    "kotlin-reflect" to Library("org.jetbrains.kotlin", "kotlin-reflect", "kotlin"),
    "spring-boot-starter-web" to Library("org.springframework.boot", "spring-boot-starter-web", "springBoot"),
    "jackson-module-kotlin" to Library("com.fasterxml.jackson.module", "jackson-module-kotlin", "jackson"),
)

data class Dep(val target: String, val configuration: String)

val modules = mapOf(
    ":app" to listOf(Dep(":order", "implementation")),
    ":order" to listOf(Dep(":domain", "api"), Dep(":mapper", "implementation")),
    ":domain" to listOf(Dep(":common", "api")),
    ":mapper" to emptyList(),
    ":common" to emptyList(),
)

// libs.spring.boot.starter.web -> spring-boot-starter-web 별칭으로 되돌린 뒤 좌표를 만든다
fun resolve(accessor: String): String {
    val alias = accessor.removePrefix("libs.").replace('.', '-')
    val library = libraries[alias] ?: return "알 수 없는 별칭: $alias"
    val version = versions[library.versionRef] ?: return "정의되지 않은 versionRef: ${library.versionRef}"
    return "${library.group}:${library.name}:$version"
}

// 컴파일 클래스패스 = 직접 의존 + 그 의존이 api 로 "다시 내보낸" 것만 전이
fun compileClasspath(module: String): List<String> {
    val result = linkedSetOf<String>()
    fun exposed(from: String) {
        for (dep in modules[from].orEmpty()) {
            if (dep.configuration == "api" && result.add(dep.target)) exposed(dep.target)
        }
    }
    for (dep in modules[module].orEmpty()) {
        result += dep.target
        exposed(dep.target)
    }
    return result.sorted()
}

// 문자열 비교면 "4.1.9" 가 "4.1.100" 을 이긴다. 세그먼트를 숫자로 끊어야 한다.
fun compareVersions(a: String, b: String): Int {
    val left = a.split(".")
    val right = b.split(".")
    for (i in 0 until maxOf(left.size, right.size)) {
        val l = left.getOrNull(i)?.toIntOrNull() ?: 0
        val r = right.getOrNull(i)?.toIntOrNull() ?: 0
        if (l != r) return l - r
    }
    return 0
}

// Gradle 기본 전략: 충돌하면 가장 높은 버전으로 정렬(align)한다
fun pickVersion(candidates: List<String>): String =
    candidates.reduce { acc, v -> if (compareVersions(v, acc) > 0) v else acc }

fun main() {
    println("[버전 카탈로그]")
    for (accessor in listOf("libs.kotlin.reflect", "libs.spring.boot.starter.web", "libs.jackson.module.kotlin")) {
        println("$accessor = ${resolve(accessor)}")
    }

    println()
    println("[컴파일 클래스패스 — api 만 전이된다]")
    for (module in listOf(":app", ":order")) {
        println("$module -> ${compileClasspath(module).joinToString(", ")}")
    }

    println()
    println("[버전 충돌 해결]")
    val conflicts = listOf(
        "com.fasterxml.jackson.core:jackson-databind" to listOf("2.15.0", "2.17.2"),
        "io.netty:netty-common" to listOf("4.1.9", "4.1.100"),
    )
    for ((coordinate, candidates) in conflicts) {
        println("$coordinate: ${candidates.joinToString(", ")} -> ${pickVersion(candidates)}")
    }
}
```
