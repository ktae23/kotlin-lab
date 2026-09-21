# Lesson 41 — 빌드 최적화 — 증분·캐시

빌드가 8분이면 하루에 열 번만 돌려도 80분입니다. 그런데 대부분의 느린 빌드는 "Gradle이 느려서"가 아니라 **Gradle이 일을 건너뛸 수 없게 만들어 놨기 때문**에 느립니다. 이 레슨은 그 건너뛰기가 어떻게 판정되는지를 다룹니다.

## Gradle이 task를 건너뛰는 원리

빌드 로그의 이 표시들이 전부 다른 뜻입니다.

```
> Task :compileKotlin            실제로 실행됨
> Task :compileKotlin UP-TO-DATE 입력이 그대로라 건너뜀 (증분 빌드)
> Task :compileKotlin FROM-CACHE 다른 곳에서 만든 출력을 내려받아 씀 (빌드 캐시)
> Task :compileKotlin NO-SOURCE  처리할 입력 자체가 없음
```

`UP-TO-DATE`의 판정은 단순합니다. Gradle은 task마다 **선언된 입력(input)과 출력(output)의 지문(fingerprint)** 을 기록해 둡니다. 다음 빌드에서 지문이 지난번과 같으면 실행하지 않아요.

```kotlin
tasks.register("generateVersionFile") {
    val output = layout.buildDirectory.file("version.txt")
    inputs.property("version", project.version.toString())
    outputs.file(output)
    doLast {
        output.get().asFile.writeText(project.version.toString())
    }
}
```

`inputs` / `outputs` 선언이 **없으면** Gradle은 무엇이 바뀌었는지 알 길이 없으므로 **매번 실행합니다.** 이게 "우리 빌드는 왜 항상 풀로 도는가"의 가장 흔한 답이에요. 커스텀 task를 만들면서 `doLast { }` 만 적어 둔 코드를 리뷰에서 자주 봅니다.

> 면접 질문으로 나오면 이렇게 답하세요: **"UP-TO-DATE 는 선언된 입력·출력의 지문 비교 결과다. 선언하지 않은 task는 판정 자체가 불가능해서 항상 실행된다."** 오늘 연습에서 이 판정기를 직접 만듭니다.

## 빌드 캐시 — UP-TO-DATE 와 무엇이 다른가

`UP-TO-DATE`는 **같은 디렉터리에서 직전 실행과 비교**합니다. `./gradlew clean` 을 하면 그 기록이 날아가죠.

빌드 캐시는 **입력 지문 → 출력물** 을 키-값으로 저장합니다. 그래서 브랜치를 갈아타며 되돌아와도, 다른 동료가 이미 빌드한 결과여도 **내려받아 재사용**합니다.

```properties
# gradle.properties
org.gradle.caching=true
```

```kotlin
// settings.gradle.kts — 팀 공용 원격 캐시
buildCache {
    local { isEnabled = true }
    remote<HttpBuildCache> {
        url = uri("https://cache.example.com/cache/")
        isPush = System.getenv("CI") == "true"   // 푸시는 CI 만
    }
}
```

원격 캐시는 CI가 채우고 개발자는 읽기만 하는 구성이 일반적입니다. 아무나 푸시하게 두면 오염된 출력이 팀 전체로 퍼집니다.

**캐시가 동작하려면 task의 출력이 재현 가능해야 합니다.** 타임스탬프나 절대 경로가 출력에 섞이면 지문이 매번 달라져 캐시가 무의미해져요.

## 구성 캐시 — 그리고 그것이 금지하는 것

Gradle 빌드는 **구성(configuration) → 실행(execution)** 두 단계입니다. 구성 단계는 모든 `build.gradle.kts` 를 평가해 task 그래프를 만드는 과정이고, 모듈이 많으면 여기서만 수십 초가 갑니다.

구성 캐시는 **그 결과를 통째로 직렬화해 저장**합니다.

```properties
org.gradle.configuration-cache=true
```

대신 규칙이 생깁니다. **task의 실행 코드(`doLast` 등)에서 `project` 를 참조할 수 없습니다.**

```kotlin
// 실패 — 실행 시점에 project 를 건드린다
tasks.register("bad") {
    doLast { println(project.version) }
}

// 통과 — 구성 시점에 값만 꺼내 두고, 실행 시점엔 그 값을 쓴다
tasks.register("good") {
    val version = project.version.toString()
    doLast { println(version) }
}
```

차이가 보이시나요. 아래 코드는 `version` 이라는 **평범한 값**을 람다가 캡처합니다. 위는 `Project` 객체 전체를 캡처하고요. 직렬화할 수 있는 건 전자뿐입니다. `System.getenv()` 를 실행 시점에 읽는 것도 같은 이유로 막힙니다(`providers.environmentVariable("X")` 를 쓰세요).

## gradle.properties 한 벌

```properties
org.gradle.jvmargs=-Xmx4g -XX:MaxMetaspaceSize=1g -Dfile.encoding=UTF-8
org.gradle.parallel=true
org.gradle.caching=true
org.gradle.configuration-cache=true
kotlin.incremental=true
```

- `jvmargs` — 데몬의 힙입니다. 기본값(512m)으로 모듈 20개를 돌리면 GC가 빌드 시간을 먹습니다. 다만 무작정 키우지 마세요. 힙이 너무 크면 full GC 한 번이 길어집니다.
- `parallel` — 서로 의존하지 않는 모듈을 동시에 빌드합니다. 멀티모듈에서 효과가 크고, `subprojects { }` 같은 cross-project 구성이 있으면 효과가 줄어듭니다(Lesson 40).
- 데몬은 기본 on입니다. **CI에서 `--no-daemon` 을 습관적으로 붙이는 경우가 많은데**, 컨테이너가 매번 새로 뜬다면 의미가 없고 오히려 JIT 워밍업을 버리는 셈입니다.

## 어디가 느린지 재기

```bash
./gradlew build --profile     # build/reports/profile/ 에 HTML 리포트
./gradlew build --scan        # scans.gradle.com 에 업로드, 훨씬 자세함
```

`--scan` 은 task별 시간, 캐시 히트/미스, **왜 UP-TO-DATE 가 아니었는지**까지 보여줍니다. "빌드가 느려요"라고 말하기 전에 이것부터 돌리세요. 추측으로 튜닝하면 대개 엉뚱한 데를 고칩니다.

사내 코드가 외부로 나가면 안 되는 환경이면 `--profile` 로 시작하거나 Develocity를 온프레미스로 띄웁니다.

## Kotlin 증분 컴파일과 ABI

Kotlin 컴파일러는 바뀐 파일과 **그 영향을 받는 파일만** 다시 컴파일합니다. 여기서 중요한 개념이 **ABI(Application Binary Interface)** 예요.

- 함수 **몸통**만 고쳤다 → ABI 변화 없음 → 그 파일만 재컴파일
- 함수 **시그니처**를 고쳤다(파라미터 추가, 반환 타입 변경, `public` ↔ `internal`) → ABI 변화 → **그 클래스를 참조하는 모든 파일** 재컴파일

그래서 여러 모듈이 참조하는 공통 클래스의 시그니처를 건드리면 빌드가 확 느려집니다. 모듈 경계를 `api` 대신 `implementation` 으로 좁혀 두는 게(Lesson 39) 여기서도 이득이에요 — ABI 변화의 전파 범위가 줄어듭니다.

`internal` 을 적극적으로 쓰세요. 모듈 밖에서 안 보이는 선언은 바뀌어도 다른 모듈을 건드리지 않습니다.

## 리뷰에서 지적할 것

- **커스텀 task에 `inputs` / `outputs` 선언이 없다** — 캐시와 증분 판정을 스스로 포기한 코드입니다.
- **구성 시점에 무거운 연산** — 스크립트 최상위에서 파일을 읽거나 네트워크를 타면 **task를 하나도 안 돌려도** 그 비용을 냅니다. `providers` / `Provider.map` 으로 지연시키세요.
- **`clean build` 가 습관** — `clean` 은 증분·캐시를 전부 무효화합니다. 빌드가 이상할 때만 쓰는 응급 조치지, 기본값이 아닙니다. CI 스크립트에 `clean` 이 박혀 있으면 원격 캐시를 켜도 효과가 없습니다.
- **출력에 타임스탬프가 섞임** — 캐시가 영원히 미스입니다. jar의 경우 `isPreserveFileTimestamps = false` 로 재현 가능하게 만듭니다.
- **`--no-daemon` 이 로컬 스크립트에** — 매 빌드마다 JVM을 새로 띄웁니다.

## 연습

`UP-TO-DATE` 판정을 직접 구현합니다. 채울 곳은 셋입니다.

1. `fingerprint(task, workspace)` — task의 **입력 파일 경로와 내용**으로 지문을 만듭니다. 순서에 흔들리지 않게 경로를 정렬한 뒤 하나의 문자열로 합쳐 `hashCode()` 를 쓰세요.
2. `isUpToDate(task, workspace)` — **입력을 선언하지 않은 task는 판정이 불가능하므로 무조건 false**. 그 외에는 기록된 지문과 지금 지문을 비교합니다.
3. `runBuild` 의 분기 — up-to-date 면 `> Task :이름 UP-TO-DATE` 만 찍고, 아니면 **action 실행 → 지문 기록 → `> Task :이름`** 출력.

출력을 보면 3차 빌드에서 테스트 코드만 고쳤을 때 `:jar` 가 건너뛰어지고, 4차에서 메인 소스를 고치니 **출력이 바뀌면서 뒤따르는 task까지 연쇄로 다시 도는** 게 보일 겁니다. 그게 input/output 선언이 만들어내는 전부입니다.

```kotlin starter
class Workspace {
    val files = mutableMapOf(
        "src/main/OrderService.kt" to "v1",
        "src/main/Money.kt" to "v1",
        "src/test/OrderServiceTest.kt" to "v1",
    )
}

class Task(
    val name: String,
    val inputs: List<String>,
    val outputs: List<String>,
    val action: (Workspace) -> Unit,
)

class UpToDateChecker {
    private val fingerprints = mutableMapOf<String, Int>()

    // TODO: 입력 경로를 정렬해 "경로=내용" 으로 이어 붙이고 hashCode() 를 돌려주세요.
    fun fingerprint(task: Task, workspace: Workspace): Int = TODO("구현하세요")

    // TODO: 입력을 선언하지 않았으면 false. 아니면 기록된 지문과 비교하세요.
    fun isUpToDate(task: Task, workspace: Workspace): Boolean = TODO("구현하세요")

    fun record(task: Task, workspace: Workspace) {
        fingerprints[task.name] = fingerprint(task, workspace)
    }
}

fun runBuild(label: String, tasks: List<Task>, workspace: Workspace, checker: UpToDateChecker) {
    println("[$label]")
    for (task in tasks) {
        // TODO: up-to-date 면 UP-TO-DATE 만 출력, 아니면 실행하고 지문을 기록한 뒤 출력하세요.
    }
}

fun main() {
    val workspace = Workspace()
    val checker = UpToDateChecker()

    val tasks = listOf(
        Task(":compileKotlin", listOf("src/main/OrderService.kt", "src/main/Money.kt"), listOf("build/classes")) { ws ->
            ws.files["build/classes"] = "classes(" + ws.files["src/main/OrderService.kt"] + "," + ws.files["src/main/Money.kt"] + ")"
        },
        Task(":test", listOf("build/classes", "src/test/OrderServiceTest.kt"), listOf("build/test-results")) { ws ->
            ws.files["build/test-results"] = "passed"
        },
        Task(":jar", listOf("build/classes"), listOf("build/app.jar")) { ws ->
            ws.files["build/app.jar"] = "jar(" + ws.files["build/classes"] + ")"
        },
        // 입력·출력을 선언하지 않은 task — 캐시가 영원히 무효다
        Task(":printBuildInfo", emptyList(), emptyList()) { },
    )

    runBuild("1차 — 캐시가 비어 있다", tasks, workspace, checker)

    println()
    runBuild("2차 — 바뀐 것이 없다", tasks, workspace, checker)

    println()
    workspace.files["src/test/OrderServiceTest.kt"] = "v2"
    runBuild("3차 — 테스트 코드만 수정", tasks, workspace, checker)

    println()
    workspace.files["src/main/OrderService.kt"] = "v2"
    runBuild("4차 — 메인 소스 수정", tasks, workspace, checker)
}
```

```text expected
[1차 — 캐시가 비어 있다]
> Task :compileKotlin
> Task :test
> Task :jar
> Task :printBuildInfo

[2차 — 바뀐 것이 없다]
> Task :compileKotlin UP-TO-DATE
> Task :test UP-TO-DATE
> Task :jar UP-TO-DATE
> Task :printBuildInfo

[3차 — 테스트 코드만 수정]
> Task :compileKotlin UP-TO-DATE
> Task :test
> Task :jar UP-TO-DATE
> Task :printBuildInfo

[4차 — 메인 소스 수정]
> Task :compileKotlin
> Task :test
> Task :jar
> Task :printBuildInfo
```

```text hint
Gradle이 하는 일은 딱 두 줄로 줄어듭니다. **"지금 입력의 지문을 계산한다"**, **"지난번에 기록해 둔 지문과 같으면 건너뛴다"**. 여기에 예외가 하나 있는데, **입력을 선언하지 않은 task** 입니다 — 비교할 것이 없으니 "같다"고 말할 근거가 없고, 그래서 매번 실행됩니다. `:printBuildInfo` 가 4번 다 실행되는 이유가 그겁니다.
---
지문은 `task.inputs.sorted().joinToString("|") { "$it=${workspace.files[it]}" }.hashCode()` 한 줄이면 됩니다. `sorted()` 가 들어가야 입력 선언 순서가 바뀌어도 같은 지문이 나와요. `isUpToDate` 는 `task.inputs.isNotEmpty() && fingerprints[task.name] == fingerprint(task, workspace)` 처럼 **두 조건의 `&&`** 입니다.
---
`runBuild` 의 순서에 함정이 있습니다. **action 을 먼저 실행하고 나서 `record` 를 호출**해야 합니다 — `:compileKotlin` 이 `build/classes` 를 새로 쓰기 때문에, 그 뒤에 오는 `:test` 와 `:jar` 는 **바뀐 입력**을 보게 되고 연쇄로 다시 돕니다. 그게 4차 빌드의 출력이에요. 반대로 3차에서는 `build/classes` 가 그대로라 `:jar` 만 건너뜁니다. 출력 문자열도 정확히 맞추세요 — 실행이면 `"> Task ${task.name}"`, 건너뛰면 뒤에 `" UP-TO-DATE"` 가 붙습니다.
---
뼈대는 이렇습니다.

`fun isUpToDate(...) = task.inputs.___() && fingerprints[task.name] == fingerprint(task, workspace)`

`if (checker.isUpToDate(task, workspace)) { println("> Task ${task.name} UP-TO-DATE") } else { task.___(workspace); checker.___(task, workspace); println("> Task ${task.name}") }`
```

```kotlin solution
class Workspace {
    val files = mutableMapOf(
        "src/main/OrderService.kt" to "v1",
        "src/main/Money.kt" to "v1",
        "src/test/OrderServiceTest.kt" to "v1",
    )
}

class Task(
    val name: String,
    val inputs: List<String>,
    val outputs: List<String>,
    val action: (Workspace) -> Unit,
)

class UpToDateChecker {
    private val fingerprints = mutableMapOf<String, Int>()

    // 선언 순서에 흔들리지 않도록 경로를 정렬한 뒤 "경로=내용" 으로 지문을 만든다
    fun fingerprint(task: Task, workspace: Workspace): Int =
        task.inputs.sorted().joinToString("|") { "$it=${workspace.files[it]}" }.hashCode()

    // 입력을 선언하지 않은 task 는 무엇이 바뀌었는지 알 수 없으므로 매번 실행된다
    fun isUpToDate(task: Task, workspace: Workspace): Boolean =
        task.inputs.isNotEmpty() && fingerprints[task.name] == fingerprint(task, workspace)

    fun record(task: Task, workspace: Workspace) {
        fingerprints[task.name] = fingerprint(task, workspace)
    }
}

fun runBuild(label: String, tasks: List<Task>, workspace: Workspace, checker: UpToDateChecker) {
    println("[$label]")
    for (task in tasks) {
        if (checker.isUpToDate(task, workspace)) {
            println("> Task ${task.name} UP-TO-DATE")
        } else {
            // 실행이 출력을 바꾸고, 그 출력이 뒤 task 의 입력이라 연쇄로 다시 돈다
            task.action(workspace)
            checker.record(task, workspace)
            println("> Task ${task.name}")
        }
    }
}

fun main() {
    val workspace = Workspace()
    val checker = UpToDateChecker()

    val tasks = listOf(
        Task(":compileKotlin", listOf("src/main/OrderService.kt", "src/main/Money.kt"), listOf("build/classes")) { ws ->
            ws.files["build/classes"] = "classes(" + ws.files["src/main/OrderService.kt"] + "," + ws.files["src/main/Money.kt"] + ")"
        },
        Task(":test", listOf("build/classes", "src/test/OrderServiceTest.kt"), listOf("build/test-results")) { ws ->
            ws.files["build/test-results"] = "passed"
        },
        Task(":jar", listOf("build/classes"), listOf("build/app.jar")) { ws ->
            ws.files["build/app.jar"] = "jar(" + ws.files["build/classes"] + ")"
        },
        // 입력·출력을 선언하지 않은 task — 캐시가 영원히 무효다
        Task(":printBuildInfo", emptyList(), emptyList()) { },
    )

    runBuild("1차 — 캐시가 비어 있다", tasks, workspace, checker)

    println()
    runBuild("2차 — 바뀐 것이 없다", tasks, workspace, checker)

    println()
    workspace.files["src/test/OrderServiceTest.kt"] = "v2"
    runBuild("3차 — 테스트 코드만 수정", tasks, workspace, checker)

    println()
    workspace.files["src/main/OrderService.kt"] = "v2"
    runBuild("4차 — 메인 소스 수정", tasks, workspace, checker)
}
```
