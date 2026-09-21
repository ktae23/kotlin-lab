# Lesson 40 — 멀티모듈과 convention plugin, kapt vs KSP

모듈을 쪼개는 순간 두 가지 문제가 새로 생깁니다. **빌드 설정이 모듈마다 중복되는 문제**와, **모듈 사이의 의존 방향이 꼬이는 문제**. 이 레슨은 그 둘과 빌드를 느리게 만드는 주범 하나를 다룹니다.

## 모듈 나누기

```kotlin
// settings.gradle.kts
rootProject.name = "order-service"
include(":common", ":domain", ":order-api", ":order-batch")
```

```kotlin
// order-api/build.gradle.kts
dependencies {
    implementation(project(":domain"))
    implementation(project(":common"))
}
```

**루트 프로젝트에는 소스를 두지 않습니다.** 루트는 설정만 담고, 실제 코드는 전부 서브모듈에 넣으세요. 루트에 `src/main/kotlin` 이 있으면 "공통 코드"라는 이름으로 온갖 게 모여들고, 결국 모든 모듈이 루트에 의존하는 진흙 덩어리가 됩니다.

의존 방향의 원칙은 하나입니다. **화살표는 한 방향으로만 흐른다.** `:domain` 이 `:order-api` 를 알면 안 돼요. Gradle은 순환 의존을 발견하면 빌드를 거부합니다 — 오늘 연습에서 그 탐지기를 직접 만듭니다.

## `subprojects { }` 는 왜 권장되지 않게 됐나

중복 제거의 첫 시도는 보통 이겁니다.

```kotlin
// 루트 build.gradle.kts — 이렇게 쓰지 마세요
subprojects {
    apply(plugin = "org.jetbrains.kotlin.jvm")
    dependencies {
        "implementation"("org.jetbrains.kotlin:kotlin-reflect")
    }
}
```

동작은 합니다. 문제는 세 가지예요.

1. **타입 안전을 잃습니다.** 루트 스크립트는 `kotlin-jvm` 플러그인이 적용되지 않은 상태로 컴파일되므로 `kotlin { }` 블록도, `implementation(...)` 함수도 없습니다. 그래서 `"implementation"("...")` 같은 문자열 접근으로 떨어져요. Kotlin DSL을 쓰는 이유가 사라집니다.
2. **구성 캐시(configuration cache)와 충돌합니다.** 루트가 서브프로젝트의 내부를 구성 시점에 건드리는 건 전형적인 **cross-project configuration** 이고, 구성 캐시가 금지하는 패턴입니다.
3. **병렬·부분 빌드를 막습니다.** `:common` 하나만 빌드하려 해도 Gradle은 루트를 평가하느라 전 모듈을 구성해야 합니다.

## convention plugin — 권장되는 방법

"공통 설정"을 **플러그인으로 만들어 각 모듈이 스스로 적용**하게 합니다. 주입이 아니라 선언이에요.

```
build-logic/
├─ settings.gradle.kts
└─ src/main/kotlin/
   ├─ kotlin-conventions.gradle.kts
   └─ spring-conventions.gradle.kts
```

```kotlin
// build-logic/src/main/kotlin/kotlin-conventions.gradle.kts
plugins {
    kotlin("jvm")          // 버전 없음 — 버전은 build-logic 의 dependencies 에서 고정
}

kotlin {
    jvmToolchain(21)
}

tasks.withType<Test> {
    useJUnitPlatform()
}

dependencies {
    implementation("org.jetbrains.kotlin:kotlin-reflect")
    testImplementation(kotlin("test"))
}
```

```kotlin
// order-api/build.gradle.kts
plugins {
    id("kotlin-conventions")
}
```

**파일 이름이 곧 플러그인 ID입니다.** `kotlin-conventions.gradle.kts` → `id("kotlin-conventions")`. 그리고 이 파일은 일반 빌드 스크립트와 똑같이 **타입 안전하게** 컴파일됩니다. 위 1번 문제가 사라지는 거예요.

### `buildSrc` vs `build-logic`

| | `buildSrc` | `build-logic` (composite build) |
|---|---|---|
| 설정 | 디렉터리만 만들면 자동 인식 | `settings.gradle.kts` 에 `includeBuild("build-logic")` 필요 |
| 변경 시 영향 | **모든 task가 무효화**되고 전체 재빌드 | 바뀐 것만 |
| 테스트 | 가능하지만 번거로움 | 일반 프로젝트처럼 |

`buildSrc` 는 간편하지만 파일 하나만 고쳐도 캐시가 통째로 날아갑니다. 규모가 커지면 `build-logic` 으로 옮기세요. 작은 프로젝트에서 `buildSrc` 로 시작하는 건 괜찮습니다.

## kapt vs KSP — 빌드 시간의 가장 큰 단일 원인

JPA나 QueryDSL을 쓰면 애노테이션 처리기가 붙습니다. 여기서 선택이 갈려요.

**kapt(Kotlin Annotation Processing Tool)** 는 Java용으로 만들어진 애노테이션 처리기를 Kotlin에서 돌리기 위한 장치입니다. 방식이 이렇습니다.

1. Kotlin 코드를 분석해 **Java stub 소스를 생성**한다 (몸통 없는 껍데기 클래스)
2. 그 stub에 javac 애노테이션 처리기를 돌린다
3. 생성된 코드를 다시 Kotlin 컴파일에 합친다

1번이 문제입니다. **모든 Kotlin 파일에 대해 Java stub을 만들어야** 하고, 이건 사실상 한 번 더 컴파일하는 비용이에요. 프로젝트가 커질수록 kapt 단계가 전체 빌드의 상당 부분을 차지합니다.

**KSP(Kotlin Symbol Processing)** 는 stub을 만들지 않고 **Kotlin 심볼을 직접 읽습니다.** Java를 거치지 않으니 그 비용이 통째로 사라집니다. JetBrains 측정으로 보통 2배 안팎 빠릅니다.

```kotlin
// kapt
plugins { kotlin("kapt") }
dependencies {
    kapt("com.querydsl:querydsl-apt:5.1.0:jakarta")
}

// KSP
plugins { id("com.google.devtools.ksp") version "2.0.21-1.0.25" }
dependencies {
    ksp("com.example:some-processor:1.0.0")
}
```

옮길 때 주의할 점이 둘 있습니다.

- **처리기가 KSP를 지원해야 합니다.** 지원 여부는 라이브러리마다 다릅니다. QueryDSL 본체(`querydsl-apt`)는 javac 기반이라 kapt가 필요하고, KSP로 가려면 `kotlin-jdsl` 같은 대안이나 커뮤니티 KSP 포크를 씁니다. Lombok은 Kotlin에서 애초에 쓰지 않습니다.
- **KSP 버전은 Kotlin 버전과 짝입니다.** `2.0.21-1.0.25` 에서 앞이 Kotlin 버전이에요. Kotlin을 올리면 KSP도 같이 올려야 합니다.
- 생성 코드 경로가 달라집니다(`build/generated/ksp/...`). IDE 소스셋 인식이 안 되면 여기를 확인하세요.

kapt를 당장 못 버린다면 `kapt.incremental.apt=true`(기본값)가 켜져 있는지, 처리기가 증분 처리를 지원하는지라도 확인하세요.

## 리뷰에서 지적할 것

- **`subprojects { }` / `allprojects { }` 로 빌드 로직 공유** — convention plugin으로 옮깁니다. 구성 캐시를 켤 수 없는 상태로 방치하는 것과 같습니다.
- **모듈 간 순환 의존** — 보통 "공통 유틸"이 양쪽을 다 참조하면서 시작됩니다. 공통 부분을 아래 모듈로 내려 끊으세요.
- **루트 프로젝트에 소스가 있다** — 모듈로 내립니다.
- **kapt를 쓰는데 이유가 없다** — 처리기가 KSP를 지원하면 옮기세요. 빌드 시간에서 가장 큰 한 방입니다.
- **모듈이 너무 잘게 쪼개져 있다** — 모듈마다 구성 비용이 듭니다. 배포 단위나 팀 경계와 무관한 분할은 빌드만 느리게 합니다.

## 연습

Gradle이 멀티모듈 빌드를 시작하기 전에 하는 두 가지 판단을 직접 구현합니다.

1. `buildOrder(graph)` — **위상 정렬**. 의존하는 모듈이 먼저 나와야 합니다. 동시에 준비된 모듈이 여럿이면 **이름순**으로 골라 출력을 고정하세요.
2. `findCycle(graph)` — **순환 탐지**. 순환이 있으면 `[":order", ":payment", ":order"]` 처럼 **시작 모듈로 돌아오는 경로**를 돌려주고, 없으면 `null` 을 돌려줍니다.

`report` 는 이미 되어 있습니다. 순환이 있으면 빌드 순서를 아예 묻지 않는다는 점에 주목하세요 — Gradle도 같은 순서로 판단합니다.

```kotlin starter
// settings.gradle.kts 의 include + 각 모듈의 project(":x") 의존을 맵으로 옮긴 것
val healthy = mapOf(
    ":api" to listOf(":domain", ":common"),
    ":batch" to listOf(":domain"),
    ":domain" to listOf(":common"),
    ":common" to emptyList(),
)

val broken = mapOf(
    ":api" to listOf(":order"),
    ":order" to listOf(":payment"),
    ":payment" to listOf(":order"),
)

// TODO: 의존하는 모듈이 먼저 오도록 정렬하세요. 동시에 준비된 모듈은 이름순.
fun buildOrder(graph: Map<String, List<String>>): List<String> = TODO("구현하세요")

// TODO: 순환이 있으면 그 경로를, 없으면 null 을 돌려주세요.
fun findCycle(graph: Map<String, List<String>>): List<String>? = TODO("구현하세요")

fun report(label: String, graph: Map<String, List<String>>) {
    println("[$label]")
    val cycle = findCycle(graph)
    if (cycle == null) {
        println("순환 없음")
        println("빌드 순서: ${buildOrder(graph).joinToString(" -> ")}")
    } else {
        println("순환 감지: ${cycle.joinToString(" -> ")}")
    }
}

fun main() {
    report("정상 그래프", healthy)
    println()
    report("문제 그래프", broken)
}
```

```text expected
[정상 그래프]
순환 없음
빌드 순서: :common -> :domain -> :api -> :batch

[문제 그래프]
순환 감지: :order -> :payment -> :order
```

```text hint
두 문제 모두 "지금 이 모듈을 처리해도 되는가"를 묻는 겁니다. 위상 정렬은 **아직 안 끝난 의존이 하나도 없는 모듈**을 골라 빼는 일을 반복하면 되고(Kahn 알고리즘), 순환 탐지는 DFS로 내려가다 **지금 내려온 경로에 이미 있는 모듈**을 또 만나면 그게 순환입니다. 경로(path)와 방문 완료(done)를 **서로 다른 자료구조로** 구분하는 게 핵심이에요.
---
`buildOrder`: 남은 모듈 집합 `remaining` 을 두고, `remaining.filter { graph[it].orEmpty().none { dep -> dep in remaining } }` 으로 준비된 것을 찾습니다. 그중 `minOrNull()` 하나만 빼고 반복하면 이름순 고정까지 공짜로 됩니다. `findCycle`: 지역 함수 `fun visit(module: String): List<String>?` 를 만들고 `path.indexOf(module)` 가 0 이상이면 `path.subList(at, path.size).toList() + module` 을 돌려주세요.
---
출력이 흔들리는 함정이 두 군데 있습니다. `buildOrder` 에서 준비된 모듈을 **여러 개 한꺼번에 빼면** 순서가 맵 순회 순서에 끌려갑니다 — 한 번에 하나씩, 이름순으로 빼세요. `findCycle` 에서는 **바깥 루프를 `graph.keys.sorted()` 로, 안쪽 이웃도 `.sorted()` 로** 돌아야 같은 답이 나옵니다. 그리고 재귀에서 빠져나올 때 `path` 에서 자신을 **반드시 제거**하세요. 안 그러면 형제 가지가 가짜 순환으로 보입니다.
---
뼈대는 이렇습니다.

`val ready = remaining.filter { m -> graph[m].orEmpty().none { it in remaining } }.___() ?: return order`

`fun visit(module: String): List<String>? { val at = path.indexOf(module); if (at >= 0) return path.subList(at, path.size).toList() + ___; if (!done.add(module)) return ___; path += module; for (next in graph[module].orEmpty().sorted()) { ... }; path.removeAt(path.size - 1); return null }`
```

```kotlin solution
// settings.gradle.kts 의 include + 각 모듈의 project(":x") 의존을 맵으로 옮긴 것
val healthy = mapOf(
    ":api" to listOf(":domain", ":common"),
    ":batch" to listOf(":domain"),
    ":domain" to listOf(":common"),
    ":common" to emptyList(),
)

val broken = mapOf(
    ":api" to listOf(":order"),
    ":order" to listOf(":payment"),
    ":payment" to listOf(":order"),
)

// 의존하는 모듈이 먼저 빌드된다. 동시에 준비된 모듈이 여럿이면 이름순으로 고정한다.
fun buildOrder(graph: Map<String, List<String>>): List<String> {
    val remaining = graph.keys.toMutableSet()
    val order = mutableListOf<String>()
    while (remaining.isNotEmpty()) {
        val ready = remaining.filter { module ->
            graph[module].orEmpty().none { it in remaining }
        }.minOrNull() ?: return order
        order += ready
        remaining -= ready
    }
    return order
}

// DFS 중 "지금 내려온 경로(path)"에 다시 등장하면 순환이다.
fun findCycle(graph: Map<String, List<String>>): List<String>? {
    val done = mutableSetOf<String>()
    val path = mutableListOf<String>()

    fun visit(module: String): List<String>? {
        val at = path.indexOf(module)
        if (at >= 0) return path.subList(at, path.size).toList() + module
        if (!done.add(module)) return null
        path += module
        for (next in graph[module].orEmpty().sorted()) {
            val cycle = visit(next)
            if (cycle != null) return cycle
        }
        path.removeAt(path.size - 1)
        return null
    }

    for (module in graph.keys.sorted()) {
        val cycle = visit(module)
        if (cycle != null) return cycle
    }
    return null
}

fun report(label: String, graph: Map<String, List<String>>) {
    println("[$label]")
    val cycle = findCycle(graph)
    if (cycle == null) {
        println("순환 없음")
        println("빌드 순서: ${buildOrder(graph).joinToString(" -> ")}")
    } else {
        println("순환 감지: ${cycle.joinToString(" -> ")}")
    }
}

fun main() {
    report("정상 그래프", healthy)
    println()
    report("문제 그래프", broken)
}
```
