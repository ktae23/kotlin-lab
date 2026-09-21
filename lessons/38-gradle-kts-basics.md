# Lesson 38 — build.gradle.kts 기초

빌드 스크립트는 "설정 파일"이 아닙니다. **실행되는 프로그램**이에요. Groovy DSL로 쓰면 그 프로그램이 동적 타입 언어로 쓰인 것이고, Kotlin DSL로 쓰면 정적 타입 언어로 쓰인 겁니다. 이 차이 하나에서 나머지가 전부 따라 나옵니다.

## Groovy DSL과 무엇이 다른가

같은 내용을 두 언어로 적어 보죠.

```groovy
// build.gradle (Groovy)
plugins {
    id 'org.jetbrains.kotlin.jvm' version '2.0.21'
}
dependencies {
    implementation 'org.springframework.boot:spring-boot-starter-web'
}
```

```kotlin
// build.gradle.kts (Kotlin)
plugins {
    kotlin("jvm") version "2.0.21"
}
dependencies {
    implementation("org.springframework.boot:spring-boot-starter-web")
}
```

문법 차이는 사소해 보입니다. 따옴표가 큰따옴표로 바뀌었고, 괄호가 생겼죠. 진짜 차이는 **오타를 언제 발견하느냐**입니다.

| | Groovy DSL | Kotlin DSL |
|---|---|---|
| `implementaion(...)` 오타 | `./gradlew build` 실행 시점에 발견 | **빌드 스크립트 컴파일 단계에서 즉시** |
| IDE 자동완성 | 제한적(동적 타입) | 전체 Gradle API |
| `Ctrl+클릭`으로 정의 보기 | 거의 안 됨 | 됨 |
| 첫 빌드 / 스크립트 수정 후 | 빠름 | **느림** (스크립트를 컴파일해야 함) |

공짜가 아닙니다. Kotlin DSL은 빌드 스크립트를 JVM 바이트코드로 컴파일한 뒤 실행하므로, 스크립트를 고칠 때마다 재컴파일 비용을 냅니다. 대신 그 대가로 **타입 안전과 자동완성**을 삽니다.

> 면접에서 "왜 kts를 쓰세요?"라는 질문에 "요즘 다 그렇게 하니까"라고 답하면 거기서 끝입니다. **"오타를 런타임이 아니라 컴파일 타임에 잡으려고, 스크립트 컴파일 비용을 내고 산 것"** 이라고 답하세요. 트레이드오프를 아는 사람과 모르는 사람의 차이입니다.

## 파일 네 개

```
project/
├─ settings.gradle.kts      ← 어떤 모듈이 이 빌드에 속하는가
├─ build.gradle.kts         ← 이 모듈을 어떻게 빌드하는가
├─ gradle.properties        ← JVM 옵션, 빌드 동작 플래그
└─ gradle/wrapper/          ← Gradle 버전 고정
```

```kotlin
// settings.gradle.kts
rootProject.name = "order-api"
include(":core", ":api")
```

`settings.gradle.kts`는 **build 스크립트보다 먼저** 실행됩니다. 여기서 모듈 목록이 확정돼야 Gradle이 각 모듈의 `build.gradle.kts`를 찾아갈 수 있어요.

wrapper(`gradlew`)는 협업의 최소 조건입니다. **로컬에 설치된 Gradle을 쓰지 않고**, `gradle/wrapper/gradle-wrapper.properties`에 적힌 버전을 내려받아 씁니다. "내 컴퓨터에선 되는데요"의 절반은 wrapper를 안 쓰거나 커밋하지 않아서 생깁니다.

## `plugins { }` 블록 — 왜 `apply plugin` 이 아닌가

옛날 문서에서 이런 걸 보셨을 겁니다.

```kotlin
buildscript {
    repositories { mavenCentral() }
    dependencies { classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:2.0.21") }
}
apply(plugin = "org.jetbrains.kotlin.jvm")
```

지금은 이렇게 씁니다.

```kotlin
plugins {
    kotlin("jvm") version "2.0.21"
    kotlin("plugin.spring") version "2.0.21"
    id("org.springframework.boot") version "3.3.4"
    id("io.spring.dependency-management") version "1.1.6"
}
```

차이는 **Gradle이 언제 플러그인의 존재를 아느냐**입니다. `plugins { }` 블록은 다른 코드보다 먼저, 별도로 평가됩니다. 덕분에 Gradle은 스크립트 본문을 컴파일하기 **전에** 플러그인이 제공하는 확장(`kotlin { }`, `springBoot { }` 같은 블록)의 타입을 알 수 있어요. 그래서 자동완성과 타입 검사가 동작합니다.

`apply(plugin = "...")`는 런타임에 적용되므로 **컴파일러가 모릅니다.** 그 블록들은 전부 타입 없는 문자열 접근으로 떨어지고, Kotlin DSL을 쓰는 이유 자체가 사라집니다.

`kotlin("jvm")`은 `id("org.jetbrains.kotlin.jvm")`의 축약입니다. `version`은 infix 함수예요 — `kotlin("jvm")`이 객체를 반환하고, 그 객체에 `version "2.0.21"`을 이어 붙이는 **평범한 Kotlin 코드**입니다. 마법이 아닙니다. 오늘 연습에서 이걸 직접 만들어 볼 거예요.

## 본문 — 실제 한 벌

```kotlin
group = "com.example"
version = "0.0.1-SNAPSHOT"

repositories {
    mavenCentral()
}

dependencies {
    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("org.jetbrains.kotlin:kotlin-reflect")
    runtimeOnly("org.postgresql:postgresql")
    testImplementation("org.springframework.boot:spring-boot-starter-test")
}

kotlin {
    jvmToolchain(21)
}

tasks.withType<org.jetbrains.kotlin.gradle.tasks.KotlinCompile> {
    compilerOptions {
        freeCompilerArgs.add("-Xjsr305=strict")
    }
}

tasks.named<Test>("test") {
    useJUnitPlatform()
}
```

`jvmToolchain(21)`은 Kotlin 컴파일러·Java 컴파일러·테스트 실행 JVM을 **한 줄로 통일**합니다. 로컬 JDK가 21이 아니어도 Gradle이 받아옵니다. 이걸 안 쓰고 `jvmTarget`과 `sourceCompatibility`를 따로 맞추다 `Inconsistent JVM-target compatibility` 로 깨지는 게 흔한 사고입니다.

## Groovy를 Kotlin으로 옮길 때 걸리는 곳

| 상황 | Groovy | Kotlin DSL |
|---|---|---|
| 문자열 | `'a'` 도 `"a"` 도 됨 | **큰따옴표만** |
| 프로퍼티 대입 | `version '1.0'` | `version = "1.0"` — **`=` 필수** |
| 기존 task 수정 | `test { ... }` | `tasks.named<Test>("test") { ... }` |
| 새 task 추가 | `task myTask { ... }` | `tasks.register<Copy>("myTask") { ... }` |
| 타입별 일괄 설정 | `tasks.withType(JavaCompile) { }` | `tasks.withType<JavaCompile> { }` |
| 확장 속성 | `ext.springVersion = '3.3'` | `val springVersion by extra("3.3")` |

`named` 와 `register` 를 굳이 쓰는 이유가 있습니다. 둘 다 **task를 실제로 만들지 않고 참조만 돌려주는** API(task configuration avoidance)예요. `tasks.create(...)`는 이번 빌드에서 그 task를 쓰든 말든 즉시 객체를 만들고 설정 블록을 실행합니다. 모듈이 30개쯤 되면 이 차이가 구성 시간에서 눈에 보입니다.

## 리뷰에서 지적할 것

- **버전 하드코딩이 여기저기 흩어져 있다** — `"3.3.4"` 가 세 파일에 적혀 있으면 올릴 때 하나를 빠뜨립니다. 다음 레슨의 버전 카탈로그가 답입니다.
- **`compile` / `runtime` 을 쓰고 있다** — Gradle 7에서 제거된 configuration입니다. 인터넷에서 복사한 오래된 스니펫의 흔적이에요. `implementation` / `runtimeOnly` 로 고칩니다.
- **플러그인 버전이 모듈마다 다르다** — `kotlin("jvm")`은 2.0.21인데 `kotlin("plugin.spring")`은 1.9.x 같은 조합. 컴파일러 플러그인은 컴파일러 버전과 맞아야 합니다. 루트에서 한 번만 선언하세요.
- **`apply(plugin = ...)` 가 섞여 있다** — 타입 안전을 포기한 코드입니다. `plugins { }` 로 올립니다.
- **wrapper가 커밋되지 않았다** — `gradlew`, `gradle/wrapper/` 는 반드시 저장소에 들어갑니다.

## 연습

`kotlin("jvm") version "2.0.21"` 이 왜 평범한 Kotlin 코드인지, **직접 만들어서** 확인합니다.

학습 서버는 Gradle API를 쓸 수 없으니, 같은 모양을 내는 **간이 빌드 DSL**을 만듭니다. 채울 곳은 네 군데입니다.

1. `PluginsScope.version` — `kotlin("jvm") version "2.0.21"` 이 되게 하는 **infix 확장 함수**. 받은 버전을 `PluginSpec`에 넣고 자기 자신을 돌려줍니다.
2. `BuildScriptScope.plugins` / `dependencies` — **수신 객체 지정 람다**(`Scope.() -> Unit`)를 받아, 해당 스코프에서 실행합니다. 이게 `plugins { }` 안에서 `id(...)` 가 그냥 보이는 이유입니다.
3. `buildScript` — `BuildScriptScope`를 만들어 블록을 적용하고 돌려줍니다.
4. `kotlinPluginVersionsAligned` — `org.jetbrains.kotlin.` 으로 시작하는 플러그인들의 버전이 **전부 같은지** 검사합니다(리뷰 항목 그대로).

`render()`는 이미 되어 있습니다.

```kotlin starter
class PluginSpec(val id: String) {
    var version: String? = null
}

class PluginsScope {
    val specs = mutableListOf<PluginSpec>()

    fun id(pluginId: String): PluginSpec {
        val spec = PluginSpec(pluginId)
        specs += spec
        return spec
    }

    fun kotlin(module: String): PluginSpec = id("org.jetbrains.kotlin.$module")

    // TODO: plugins { } 안에서만 보이는 infix 확장 함수 version 을 만드세요.
}

class DependenciesScope {
    val entries = mutableListOf<Pair<String, String>>()

    fun implementation(notation: String) { entries += "implementation" to notation }
    fun runtimeOnly(notation: String) { entries += "runtimeOnly" to notation }
    fun testImplementation(notation: String) { entries += "testImplementation" to notation }
}

class BuildScriptScope {
    private val pluginsScope = PluginsScope()
    private val dependenciesScope = DependenciesScope()
    var jvmToolchain: Int = 17

    // TODO: plugins(block) / dependencies(block) 을 수신 객체 지정 람다로 받으세요.

    fun render(): String = buildString {
        appendLine("plugins {")
        for (spec in pluginsScope.specs) {
            val version = spec.version?.let { " version \"$it\"" } ?: ""
            appendLine("    id(\"${spec.id}\")$version")
        }
        appendLine("}")
        appendLine()
        appendLine("kotlin { jvmToolchain($jvmToolchain) }")
        appendLine()
        appendLine("dependencies {")
        for ((configuration, notation) in dependenciesScope.entries) {
            appendLine("    $configuration(\"$notation\")")
        }
        append("}")
    }

    // TODO: kotlin 컴파일러 플러그인들의 버전이 전부 같은지 검사하세요.
    fun kotlinPluginVersionsAligned(): Boolean = TODO("구현하세요")
}

// TODO: BuildScriptScope 를 만들어 블록을 적용하고 돌려주세요.
fun buildScript(block: BuildScriptScope.() -> Unit): BuildScriptScope = TODO("구현하세요")

fun main() {
    val script = buildScript {
        jvmToolchain = 21
        plugins {
            kotlin("jvm") version "2.0.21"
            kotlin("plugin.spring") version "2.0.21"
            id("org.springframework.boot") version "3.3.4"
            id("io.spring.dependency-management") version "1.1.6"
        }
        dependencies {
            implementation("org.springframework.boot:spring-boot-starter-web")
            implementation("org.jetbrains.kotlin:kotlin-reflect")
            runtimeOnly("org.postgresql:postgresql")
            testImplementation("org.springframework.boot:spring-boot-starter-test")
        }
    }
    println(script.render())
    println()
    println("kotlin 플러그인 버전 일치: ${script.kotlinPluginVersionsAligned()}")
}
```

```text expected
plugins {
    id("org.jetbrains.kotlin.jvm") version "2.0.21"
    id("org.jetbrains.kotlin.plugin.spring") version "2.0.21"
    id("org.springframework.boot") version "3.3.4"
    id("io.spring.dependency-management") version "1.1.6"
}

kotlin { jvmToolchain(21) }

dependencies {
    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("org.jetbrains.kotlin:kotlin-reflect")
    runtimeOnly("org.postgresql:postgresql")
    testImplementation("org.springframework.boot:spring-boot-starter-test")
}

kotlin 플러그인 버전 일치: true
```

```text hint
빌드 스크립트의 `plugins { }` 안에서 `id(...)` 가 왜 그냥 보일까요. 저 람다의 **수신 객체(receiver)가 `PluginsScope`** 이기 때문입니다. `Scope.() -> Unit` 타입의 람다는 몸통 안에서 `this` 가 `Scope` 로 바뀌어요. 그래서 `scope.block()` 처럼 **스코프를 수신 객체로 두고 호출**하기만 하면 됩니다. Lesson 17·18에서 본 그 문법 그대로입니다.
---
쓸 도구는 셋입니다. `infix fun PluginSpec.version(value: String): PluginSpec` — `infix` 는 파라미터가 정확히 하나일 때만 붙일 수 있고, 그래야 `a version "b"` 로 적을 수 있습니다. `buildScript` 에는 `apply` 가 딱 맞아요(`BuildScriptScope().apply(block)` — `apply` 는 수신 객체 지정 람다를 받아 **자기 자신**을 돌려줍니다). 마지막 검사는 `filter` → `map` → `distinct` 세 단계면 끝납니다.
---
`version` 확장 함수를 **`PluginsScope` 의 멤버로** 두세요. 그러면 `plugins { }` 블록 안에서만 보입니다 — Gradle이 `version` 을 아무 데서나 못 쓰게 막는 것과 같은 구조예요. 함수 안에서는 `this.version = value` 처럼 **`this.` 를 붙이는 편이 안전**합니다. 확장 함수 이름과 프로퍼티 이름이 같아서 헷갈리기 쉽거든요. 버전 일치 검사는 "서로 다른 버전이 **몇 종류**인가"를 세면 됩니다 — 한 종류면 일치입니다.
---
뼈대는 이렇습니다. 빈칸만 채우세요.

`infix fun PluginSpec.version(value: String): PluginSpec { this.version = ___; return ___ }`

`fun plugins(block: PluginsScope.() -> Unit) { pluginsScope.___() }`

`fun buildScript(block: BuildScriptScope.() -> Unit) = BuildScriptScope().___(block)`

`specs.filter { it.id.startsWith("org.jetbrains.kotlin.") }.map { it.version }.___().size == ___`
```

```kotlin solution
class PluginSpec(val id: String) {
    var version: String? = null
}

class PluginsScope {
    val specs = mutableListOf<PluginSpec>()

    fun id(pluginId: String): PluginSpec {
        val spec = PluginSpec(pluginId)
        specs += spec
        return spec
    }

    fun kotlin(module: String): PluginSpec = id("org.jetbrains.kotlin.$module")

    // plugins { } 안에서만 보이는 멤버 확장 — Gradle 의 `kotlin("jvm") version "..."` 과 같은 구조
    infix fun PluginSpec.version(value: String): PluginSpec {
        this.version = value
        return this
    }
}

class DependenciesScope {
    val entries = mutableListOf<Pair<String, String>>()

    fun implementation(notation: String) { entries += "implementation" to notation }
    fun runtimeOnly(notation: String) { entries += "runtimeOnly" to notation }
    fun testImplementation(notation: String) { entries += "testImplementation" to notation }
}

class BuildScriptScope {
    private val pluginsScope = PluginsScope()
    private val dependenciesScope = DependenciesScope()
    var jvmToolchain: Int = 17

    // 수신 객체 지정 람다 — 블록 안에서 this 가 스코프로 바뀐다
    fun plugins(block: PluginsScope.() -> Unit) { pluginsScope.block() }
    fun dependencies(block: DependenciesScope.() -> Unit) { dependenciesScope.block() }

    fun render(): String = buildString {
        appendLine("plugins {")
        for (spec in pluginsScope.specs) {
            val version = spec.version?.let { " version \"$it\"" } ?: ""
            appendLine("    id(\"${spec.id}\")$version")
        }
        appendLine("}")
        appendLine()
        appendLine("kotlin { jvmToolchain($jvmToolchain) }")
        appendLine()
        appendLine("dependencies {")
        for ((configuration, notation) in dependenciesScope.entries) {
            appendLine("    $configuration(\"$notation\")")
        }
        append("}")
    }

    // 컴파일러 플러그인은 컴파일러 버전과 맞아야 한다 — 버전이 한 종류인지만 본다
    fun kotlinPluginVersionsAligned(): Boolean =
        pluginsScope.specs
            .filter { it.id.startsWith("org.jetbrains.kotlin.") }
            .map { it.version }
            .distinct()
            .size == 1
}

fun buildScript(block: BuildScriptScope.() -> Unit): BuildScriptScope =
    BuildScriptScope().apply(block)

fun main() {
    val script = buildScript {
        jvmToolchain = 21
        plugins {
            kotlin("jvm") version "2.0.21"
            kotlin("plugin.spring") version "2.0.21"
            id("org.springframework.boot") version "3.3.4"
            id("io.spring.dependency-management") version "1.1.6"
        }
        dependencies {
            implementation("org.springframework.boot:spring-boot-starter-web")
            implementation("org.jetbrains.kotlin:kotlin-reflect")
            runtimeOnly("org.postgresql:postgresql")
            testImplementation("org.springframework.boot:spring-boot-starter-test")
        }
    }
    println(script.render())
    println()
    println("kotlin 플러그인 버전 일치: ${script.kotlinPluginVersionsAligned()}")
}
```
