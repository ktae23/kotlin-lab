# Lesson 40 — Gradle 동작 원리 — DSL 과 생명주기

앞 레슨에서 `build.gradle.kts` 를 **어떻게 쓰는지** 봤습니다. 이번엔 **왜 그렇게 생겼는지** 입니다.

빌드가 이상하게 굴 때 — `./gradlew help` 가 20초 걸리고, 자동완성이 되다가 안 되고, `named("test")` 에서 `useJUnitPlatform()` 이 안 보이고, 분명 고친 설정이 안 먹을 때 — 답은 전부 여기 있습니다. 문법이 아니라 **스크립트가 무엇으로 컴파일되고, 언제 실행되는가**의 문제예요.

## `build.gradle.kts` 는 설정 파일이 아니라 클래스다

Gradle 은 빌드 스크립트를 파싱해서 해석하지 않습니다. **Kotlin 소스로 보고 JVM 바이트코드로 컴파일한 뒤 실행**합니다. 그 결과물은 `Project` 를 **암묵 수신 객체(implicit receiver)** 로 갖는 클래스예요.

그래서 이 두 줄이 같은 말입니다.

```kotlin
dependencies { implementation("org.postgresql:postgresql") }
project.dependencies { implementation("org.postgresql:postgresql") }
```

최상위에 그냥 적은 `dependencies { }` 는 문법 요소가 아니라 **`Project` 의 메서드 호출**입니다. `group = "com.example"` 은 `project.setGroup(...)` 이고, `repositories { }` 도 마찬가지고요. `this` 가 생략돼 있을 뿐, 여러분이 매일 쓰는 Kotlin 코드와 정확히 같은 규칙을 따릅니다.

여기서 두 가지가 따라 나옵니다.

- **첫 빌드와 스크립트 수정 후가 느리다** — 컴파일을 하니까요. 대신 오타를 컴파일 타임에 잡습니다(Lesson 39의 트레이드오프).
- **스크립트에서 못 하는 게 거의 없다** — `if`, 반복문, 함수 선언, 클래스 선언이 다 됩니다. 되니까 문제입니다. 뒤에서 다룹니다.

## DSL 을 만드는 Kotlin 문법 — 이 레슨의 핵심

Gradle DSL 에 마법은 없습니다. 이미 배운 문법 네 개의 조합입니다.

### 수신 객체 지정 람다 — `implementation` 은 어디서 오나

```kotlin
// Gradle 쪽 시그니처(단순화)
fun dependencies(configure: DependencyHandlerScope.() -> Unit)
```

`DependencyHandlerScope.() -> Unit` 이라 **블록 안에서 `this` 가 `DependencyHandlerScope`** 로 바뀝니다. `implementation(...)` 은 그 수신 객체에 붙은 함수예요. 밖에서는 안 보이고 블록 안에서만 보이는 이유가 이겁니다(Lesson 17).

`tasks.named<Test>("test") { useJUnitPlatform() }` 도 똑같습니다. 블록의 수신 객체가 `Test` 라서 `useJUnitPlatform()` 이 보입니다.

### 확장 함수 — 대부분은 Gradle 것이 아니다

`kotlin("jvm")`, `implementation(...)`, `platform(...)`, `named<T>()` — 이것들은 Gradle 코어(Java API)에 없습니다. **`org.gradle.kotlin.dsl` 패키지가 붙인 확장**이에요.

Gradle 코어 API 는 Java 라서 설정 블록을 `Action<T>` 로 받습니다.

```java
// Gradle 코어 (Java)
void named(String name, Action<? super Task> configure);
```

`Action<T>` 는 `execute(T)` 하나짜리 SAM 인터페이스라 Kotlin 람다가 그대로 들어가지만, **파라미터는 `it` 으로 옵니다.** `this` 로 쓰려면 수신 객체 지정 람다여야 하죠. 그래서 Kotlin DSL 이 그 위에 오버로드를 한 겹 덮습니다.

```kotlin
// org.gradle.kotlin.dsl (Kotlin)
inline fun <reified T : Task> TaskContainer.named(name: String, noinline configure: T.() -> Unit): TaskProvider<T>
```

`named<Test>("test")` 의 제네릭이 필요한 이유도 이 시그니처에 있습니다. `tasks.named("test")` 는 `TaskProvider<Task>` 를 돌려주고, `Task` 에는 `useJUnitPlatform()` 이 없습니다. **타입을 적어야 `Test` 로 좁혀지고 그 타입의 멤버가 보입니다.** `register<Copy>("x")` 도 같은 이유예요.

### `by` 위임 — task 를 선언하는 또 하나의 문법

```kotlin
val myReport by tasks.registering(Copy::class) {
    from("src/docs")
    into(layout.buildDirectory.dir("docs"))
}

val kotlinVersion: String by project   // gradle.properties / -P 로 넘어온 값
val springVersion: String by extra("3.3.5")
```

`registering` 은 `provideDelegate` 를 구현한 위임 객체이고, **프로퍼티 이름을 task 이름으로 씁니다**(Lesson 25). `by project` 는 프로젝트 프로퍼티를, `by extra` 는 확장 프로퍼티를 읽고요.

편해 보이지만 리뷰에서는 조심합니다. **프로퍼티 이름을 바꾸면 task 이름이 조용히 바뀌고**, CI 스크립트의 `./gradlew myReport` 가 깨집니다. 이름이 계약이면 `tasks.register("myReport")` 로 문자열을 명시하는 편이 안전합니다.

### 타입 세이프 접근자 — 자동완성이 되다 안 되는 이유

`kotlin { }`, `springBoot { }`, `sourceSets`, `implementation(...)` 은 Gradle 에 원래 있던 게 아닙니다. **플러그인이 적용될 때 Gradle 이 그 플러그인 전용 접근자를 생성**하고, 스크립트는 그 접근자와 함께 컴파일됩니다.

그래서 이런 규칙이 나옵니다.

- `plugins { }` 블록은 **맨 위에** 있어야 하고, 그 안에서는 변수도 조건문도 못 씁니다. 스크립트 본문보다 **먼저** 따로 평가돼야 접근자를 만들 수 있으니까요.
- `apply(plugin = "...")` 로 적용하면 **접근자가 생성되지 않습니다.** 런타임 적용이라 컴파일러가 모르거든요. `configure<KotlinJvmProjectExtension> { }` 나 `"implementation"("...")` 같은 문자열 접근으로 떨어집니다.
- 같은 이유로 **루트의 `subprojects { }` 안에서는 타입 세이프 접근자가 안 보입니다.** 루트 스크립트에는 그 플러그인이 적용돼 있지 않으니까요(Lesson 42가 convention plugin 으로 푸는 문제가 바로 이것).

> 면접에서 "Kotlin DSL 에서 `kotlin { }` 블록은 어디서 오나요?" 라는 질문이 나오면 **"플러그인 적용 결과로 생성된 타입 세이프 접근자"** 라고 답하세요. "Gradle 문법"이라고 답하면 Groovy 에서 넘어온 지 얼마 안 된 사람으로 읽힙니다.

## 생명주기 — 세 단계

여기를 모르면 빌드 성능 문제를 영원히 못 고칩니다.

| 단계 | 무엇이 실행되나 | 언제 도나 |
|---|---|---|
| **초기화(Initialization)** | `settings.gradle.kts` — 어떤 프로젝트가 이 빌드에 참여하는지 확정, `Project` 객체 생성 | 항상 |
| **구성(Configuration)** | **참여하는 모든 모듈의 `build.gradle.kts` 전부** — task 를 정의해 그래프를 만든다 | 항상 |
| **실행(Execution)** | 요청한 task 와 그 의존 task 의 **동작(`doLast` 등)** | 요청된 것만 |

가장 오해가 많은 곳이 구성 단계입니다. **여기서 도는 건 task 의 본문이 아니라 task 의 정의**예요.

```kotlin
tasks.register("release") {
    println("A")            // 구성 단계 — 이 task 가 그래프에 들어갈 때 실행
    doLast {
        println("B")        // 실행 단계 — 이 task 가 실제로 돌 때 실행
    }
}
```

`./gradlew release` 를 돌리면 `A` 가 먼저, 한참 뒤 `B` 가 찍힙니다. 설정 블록 안에 바로 적은 코드는 **동작이 아니라 설정**입니다.

### 가장 흔한 버그 — 구성 단계에 무거운 일

```kotlin
// 이런 코드를 리뷰에서 봅니다
val gitHash = providers.exec {           // ← 최상위. 구성 단계에 매번 돈다
    commandLine("git", "rev-parse", "HEAD")
}.standardOutput.asText.get()            // ← .get() 이 구성 시점에 값을 강제로 꺼낸다

version = "1.0.0-$gitHash"
```

`.get()` 때문에 **`./gradlew help` 조차** git 프로세스를 띄웁니다. 아무 task 도 안 돌리는 명령인데도요. 모듈 30개에서 각각 하면 빌드가 시작도 전에 30초를 먹습니다.

같은 일이 파일 읽기, 네트워크 호출, `File("…").readText()`, `System.getenv()` 에서 벌어집니다. 해결은 하나입니다 — **값을 꺼내지 말고 `Provider` 인 채로 넘기세요.**

```kotlin
val gitHash = providers.exec { commandLine("git", "rev-parse", "HEAD") }
    .standardOutput.asText.map { it.trim() }   // Provider<String> 인 채로 둔다

tasks.register("stamp") {
    inputs.property("hash", gitHash)           // 실제로 필요할 때 평가된다
}
```

구성 캐시를 켜면 이 규칙이 아예 강제됩니다(Lesson 43).

### configuration avoidance — `register` 가 `create` 를 대체한 이유

구성 단계가 **모든 모듈에 대해 항상 돈다**는 걸 알면, 왜 API 가 바뀌었는지가 자명해집니다.

| 즉시(eager) | 지연(lazy) | 차이 |
|---|---|---|
| `tasks.create("x") { }` | `tasks.register("x") { }` | `create` 는 그 자리에서 객체를 만들고 설정 블록을 실행 |
| `tasks.getByName("x") { }` | `tasks.named("x") { }` | `getByName` 은 아직 안 만들어진 task 를 만들어 냄 |
| `tasks.withType(Jar::class).all { }` | `tasks.withType<Jar>().configureEach { }` | `all` 은 모든 `Jar` task 를 즉시 실현 |

`register` 는 **설정 블록을 보관만 하고 `TaskProvider` 를 돌려줍니다.** 그 task 가 실제 그래프에 들어갈 때 비로소 블록이 돕니다. 이번 빌드가 `./gradlew test` 라면 `bootBuildImage` 설정 블록은 **한 번도 안 돕니다.**

`create` 를 하나 섞으면 지연 효과가 그 자리에서 깨집니다. 오늘 연습에서 이걸 출력으로 확인합니다.

## task 의존성 — 그래프는 구성 단계에 확정된다

task 그래프는 **DAG(방향 비순환 그래프)** 이고, 구성 단계가 끝나는 시점에 모양이 정해집니다. 실행 단계는 그 그래프를 따라 걷기만 해요. 순환이 있으면 실행 전에 `Circular dependency between tasks` 로 죽습니다(순환 탐지와 위상 정렬은 Lesson 42에서 모듈 단위로 다뤘습니다).

연결하는 방법은 둘입니다.

```kotlin
// ① 명시적 — 이름으로 건다
tasks.register("deploy") {
    dependsOn("bootJar")
}

// ② 암묵적 — 다른 task 의 출력을 입력으로 받으면 Gradle 이 알아서 연결한다
val generate = tasks.register("generateVersionFile") {
    outputs.file(layout.buildDirectory.file("version.txt"))
    doLast { /* ... */ }
}

tasks.register<Copy>("packageDocs") {
    from(generate)          // dependsOn 없이도 generate 가 먼저 돈다
    into(layout.buildDirectory.dir("docs"))
}
```

**②를 쓰세요.** `dependsOn` 은 "순서"만 말하지만, 출력을 입력으로 물리면 Gradle 이 순서와 **증분 판정 근거(input/output 지문)** 를 동시에 얻습니다(Lesson 43). `dependsOn` 만 걸어 둔 task 는 순서는 맞아도 매번 다시 돕니다.

## 리뷰할 때 보는 것

| 코드에서 보이면 | 이렇게 지적한다 |
|---|---|
| 스크립트 최상위에서 `.get()` / `readText()` / `exec` | 구성 단계라 **모든 빌드**가 이 비용을 낸다. `Provider` 로 두고 task 입력에 넘겨라 |
| `tasks.create(...)` / `getByName(...)` | `register` / `named` 로. 요청되지 않은 task 의 설정 블록까지 매번 돌고 있다 |
| `withType(...).all { }` | `withType<T>().configureEach { }`. `all` 은 그 타입 task 를 전부 즉시 실현한다 |
| `tasks.named("test") { ... }` 안에서 타입 멤버를 못 씀 | `named<Test>("test")`. 타입을 적어야 `TaskProvider<Test>` 로 좁혀져 `useJUnitPlatform()` 이 보인다 |
| `apply(plugin = "...")` | 타입 세이프 접근자가 생성되지 않는다. `plugins { }` 로 올려라 |
| `plugins { }` 안의 조건문·변수 | 그 블록은 본문보다 먼저 따로 평가된다. 조건부 적용이 필요하면 `id("…") apply false` 후 `pluginManager.apply` 로 |
| `doLast { }` 안에서 `project.…` 참조 | 실행 시점에 `Project` 를 잡으면 구성 캐시가 깨진다. 구성 시점에 값만 꺼내 캡처해라 |
| `val x by tasks.registering` 로 만든 task 를 CI 가 이름으로 호출 | 프로퍼티 이름이 곧 task 이름이라 리네임 시 조용히 깨진다. `register("x")` 로 이름을 고정해라 |
| `dependsOn` 만으로 산출물 연결 | 출력을 입력으로 물려라(`from(otherTask)`). 순서와 증분 판정을 한 번에 얻는다 |

## 연습

생명주기 3단계를 순수 Kotlin 으로 재현합니다. **출력 순서로** 이 세 가지를 확인하는 게 목적이에요.

- 구성 단계는 **요청한 태스크와 무관하게 매번 전부** 돈다
- `create` 로 만든 태스크는 **아무도 요청하지 않아도** 설정 블록이 돈다
- `register` 로 등록한 태스크는 **그래프에 닿을 때만** 생성된다

채울 곳은 셋입니다.

1. `TaskContainer.create` — **즉시** 생성. `materialize` 를 그 자리에서 호출합니다.
2. `TaskContainer.register` — **지연** 등록. 설정 블록을 `pending` 에 보관만 합니다.
3. `ProjectScope.execute` / `visit` — 요청한 태스크에서 시작해 **의존을 먼저** 방문합니다. 방문할 때 `tasks.realize(name)` 로 태스크를 얻고(지연 등록분은 이때 처음 생성됩니다), 의존을 모두 처리한 뒤 자기 본문을 실행합니다. 이미 처리한 태스크는 건너뜁니다.

`materialize` / `realize` / `buildProject` 는 이미 되어 있습니다.

```kotlin starter
class TaskSpec(val name: String) {
    val dependsOn = mutableListOf<String>()
    private val actions = mutableListOf<() -> Unit>()

    fun doLast(action: () -> Unit) { actions += action }
    fun runActions() { for (action in actions) action() }
}

class TaskContainer {
    private val realized = LinkedHashMap<String, TaskSpec>()
    private val pending = LinkedHashMap<String, TaskSpec.() -> Unit>()

    // 객체를 만들고 설정 블록을 돌리는 지점 — 여기가 "구성 비용"이다
    private fun materialize(name: String, block: TaskSpec.() -> Unit): TaskSpec {
        println("  [구성] 태스크 객체 생성 + 설정 블록 실행: $name")
        val task = TaskSpec(name).apply(block)
        realized[name] = task
        return task
    }

    // TODO: 즉시 생성 — 이번 빌드에서 쓰이든 말든 비용을 낸다
    fun create(name: String, block: TaskSpec.() -> Unit): TaskSpec = TODO("구현하세요")

    // TODO: 지연 등록 — 설정 블록을 보관만 한다
    fun register(name: String, block: TaskSpec.() -> Unit) { TODO("구현하세요") }

    fun realize(name: String): TaskSpec {
        realized[name]?.let { return it }
        val block = pending.remove(name) ?: error("그런 태스크가 없다: $name")
        return materialize(name, block)
    }

    fun realizedNames(): List<String> = realized.keys.sorted()
    fun neverRealized(): List<String> = pending.keys.sorted()
}

class ProjectScope(val name: String) {
    val tasks = TaskContainer()

    // TODO: 요청한 태스크들을 차례로 방문하세요.
    fun execute(vararg requested: String) {
        println("[실행] 요청한 태스크: ${requested.joinToString(", ")}")
        TODO("구현하세요")
    }

    // TODO: 의존을 먼저 처리한 뒤 자기 본문을 실행하세요.
    private fun visit(name: String, done: MutableSet<String>) {
        TODO("구현하세요")
    }
}

fun buildProject(): ProjectScope {
    println("[초기화] settings.gradle.kts 평가 — 참여 프로젝트: :order-api")
    println("[구성] build.gradle.kts 평가 시작")
    val project = ProjectScope("order-api")
    with(project) {
        println("  [구성] git 해시 조회 — 구성 단계의 무거운 일")
        tasks.create("legacyReport") {
            doLast { println("      legacyReport 본문") }
        }
        tasks.register("compileKotlin") {
            doLast { println("      .kt -> .class 컴파일") }
        }
        tasks.register("jar") {
            dependsOn += "compileKotlin"
            doLast { println("      app.jar 생성") }
        }
        tasks.register("bootJar") {
            dependsOn += "jar"
            doLast { println("      app-boot.jar 생성") }
        }
        tasks.register("help") {
            doLast { println("      사용 가능한 태스크 출력") }
        }
        tasks.register("slowReport") {
            doLast { println("      커버리지 리포트 생성") }
        }
    }
    println("[구성] build.gradle.kts 평가 끝")
    return project
}

fun report(project: ProjectScope) {
    println("  생성된 태스크: ${project.tasks.realizedNames()}")
    println("  끝내 생성되지 않은 태스크: ${project.tasks.neverRealized()}")
}

fun main() {
    println("=== ./gradlew bootJar ===")
    val build = buildProject()
    build.execute("bootJar")
    report(build)
    println()
    println("=== ./gradlew help ===")
    val helpBuild = buildProject()
    helpBuild.execute("help")
    report(helpBuild)
}
```

```text expected
=== ./gradlew bootJar ===
[초기화] settings.gradle.kts 평가 — 참여 프로젝트: :order-api
[구성] build.gradle.kts 평가 시작
  [구성] git 해시 조회 — 구성 단계의 무거운 일
  [구성] 태스크 객체 생성 + 설정 블록 실행: legacyReport
[구성] build.gradle.kts 평가 끝
[실행] 요청한 태스크: bootJar
  [구성] 태스크 객체 생성 + 설정 블록 실행: bootJar
  [구성] 태스크 객체 생성 + 설정 블록 실행: jar
  [구성] 태스크 객체 생성 + 설정 블록 실행: compileKotlin
  [실행] compileKotlin
      .kt -> .class 컴파일
  [실행] jar
      app.jar 생성
  [실행] bootJar
      app-boot.jar 생성
  생성된 태스크: [bootJar, compileKotlin, jar, legacyReport]
  끝내 생성되지 않은 태스크: [help, slowReport]

=== ./gradlew help ===
[초기화] settings.gradle.kts 평가 — 참여 프로젝트: :order-api
[구성] build.gradle.kts 평가 시작
  [구성] git 해시 조회 — 구성 단계의 무거운 일
  [구성] 태스크 객체 생성 + 설정 블록 실행: legacyReport
[구성] build.gradle.kts 평가 끝
[실행] 요청한 태스크: help
  [구성] 태스크 객체 생성 + 설정 블록 실행: help
  [실행] help
      사용 가능한 태스크 출력
  생성된 태스크: [help, legacyReport]
  끝내 생성되지 않은 태스크: [bootJar, compileKotlin, jar, slowReport]
```

```text hint
세 함수의 차이가 곧 이 레슨의 전부입니다. `create` 는 **지금** 만들고, `register` 는 **나중을 위해 블록만 맡겨 두고**, `realize` 는 맡겨 둔 블록을 **꺼내 실행**합니다. `materialize` 와 `realize` 가 이미 있으니 `create` 와 `register` 는 각각 한 줄입니다 — `create` 는 `materialize` 를 그대로 부르고, `register` 는 `pending` 에 `name` 키로 `block` 을 넣기만 하면 됩니다.
---
`execute` 는 `requested` 를 순서대로 돌며 `visit` 을 부르는 게 전부입니다. 공유할 `done` 집합을 **바깥에서 한 번** 만들어 넘기세요 — 여러 태스크를 요청해도 같은 의존을 두 번 돌리지 않으려는 겁니다. `LinkedHashSet<String>()` 을 쓰면 됩니다.
---
`visit` 의 순서가 핵심입니다. ① 이미 `done` 에 있으면 즉시 `return` ② `tasks.realize(name)` 으로 태스크를 얻는다 — **여기서 지연 등록분이 처음 생성**되고, 그래서 `dependsOn` 도 이때 비로소 채워집니다. 그러니 realize 전에 `dependsOn` 을 읽으면 안 됩니다 ③ `task.dependsOn` 을 돌며 재귀 호출 ④ `done` 에 추가 ⑤ `println("  [실행] $name")` ⑥ `task.runActions()`. 의존을 먼저 방문하고 자기 본문을 마지막에 도는 **후위(post-order)** 순회입니다.
---
뼈대는 이렇습니다. 빈칸만 채우세요.

`fun create(name: String, block: TaskSpec.() -> Unit): TaskSpec = ___(name, block)`

`fun register(name: String, block: TaskSpec.() -> Unit) { pending[___] = ___ }`

`fun execute(vararg requested: String) { ...; val done = LinkedHashSet<String>(); for (t in requested) ___(t, done) }`

`private fun visit(name: String, done: MutableSet<String>) { if (name in done) return; val task = tasks.___(name); for (dep in task.dependsOn) ___(dep, done); done += name; println("  [실행] $name"); task.___() }`
```

```kotlin solution
class TaskSpec(val name: String) {
    val dependsOn = mutableListOf<String>()
    private val actions = mutableListOf<() -> Unit>()

    fun doLast(action: () -> Unit) { actions += action }
    fun runActions() { for (action in actions) action() }
}

class TaskContainer {
    private val realized = LinkedHashMap<String, TaskSpec>()
    private val pending = LinkedHashMap<String, TaskSpec.() -> Unit>()

    // 객체를 만들고 설정 블록을 돌리는 지점 — 여기가 "구성 비용"이다
    private fun materialize(name: String, block: TaskSpec.() -> Unit): TaskSpec {
        println("  [구성] 태스크 객체 생성 + 설정 블록 실행: $name")
        val task = TaskSpec(name).apply(block)
        realized[name] = task
        return task
    }

    // 즉시 생성 — 이번 빌드에서 쓰이든 말든 비용을 낸다
    fun create(name: String, block: TaskSpec.() -> Unit): TaskSpec = materialize(name, block)

    // 지연 등록 — 설정 블록을 보관만 한다
    fun register(name: String, block: TaskSpec.() -> Unit) { pending[name] = block }

    fun realize(name: String): TaskSpec {
        realized[name]?.let { return it }
        val block = pending.remove(name) ?: error("그런 태스크가 없다: $name")
        return materialize(name, block)
    }

    fun realizedNames(): List<String> = realized.keys.sorted()
    fun neverRealized(): List<String> = pending.keys.sorted()
}

class ProjectScope(val name: String) {
    val tasks = TaskContainer()

    fun execute(vararg requested: String) {
        println("[실행] 요청한 태스크: ${requested.joinToString(", ")}")
        val done = LinkedHashSet<String>()
        for (task in requested) visit(task, done)
    }

    // 요청한 태스크에서 의존을 따라 내려간다 — 그래서 닿지 않는 태스크는 생성조차 안 된다
    private fun visit(name: String, done: MutableSet<String>) {
        if (name in done) return
        val task = tasks.realize(name)
        for (dep in task.dependsOn) visit(dep, done)
        done += name
        println("  [실행] $name")
        task.runActions()
    }
}

fun buildProject(): ProjectScope {
    println("[초기화] settings.gradle.kts 평가 — 참여 프로젝트: :order-api")
    println("[구성] build.gradle.kts 평가 시작")
    val project = ProjectScope("order-api")
    with(project) {
        println("  [구성] git 해시 조회 — 구성 단계의 무거운 일")
        tasks.create("legacyReport") {
            doLast { println("      legacyReport 본문") }
        }
        tasks.register("compileKotlin") {
            doLast { println("      .kt -> .class 컴파일") }
        }
        tasks.register("jar") {
            dependsOn += "compileKotlin"
            doLast { println("      app.jar 생성") }
        }
        tasks.register("bootJar") {
            dependsOn += "jar"
            doLast { println("      app-boot.jar 생성") }
        }
        tasks.register("help") {
            doLast { println("      사용 가능한 태스크 출력") }
        }
        tasks.register("slowReport") {
            doLast { println("      커버리지 리포트 생성") }
        }
    }
    println("[구성] build.gradle.kts 평가 끝")
    return project
}

fun report(project: ProjectScope) {
    println("  생성된 태스크: ${project.tasks.realizedNames()}")
    println("  끝내 생성되지 않은 태스크: ${project.tasks.neverRealized()}")
}

fun main() {
    println("=== ./gradlew bootJar ===")
    val build = buildProject()
    build.execute("bootJar")
    report(build)
    println()
    println("=== ./gradlew help ===")
    val helpBuild = buildProject()
    helpBuild.execute("help")
    report(helpBuild)
}
```
