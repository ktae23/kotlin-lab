# Lesson 2 — val / var 와 불변성

Kotlin은 Java와 **기본값이 정반대**입니다. Java에서 `final`은 붙이면 좋은 것이었지만, Kotlin에서 `val`은 **기본으로 쓰고 어쩔 수 없을 때만 `var`로 내려가는** 것입니다.

## val vs var

```kotlin
val name = "박경태"   // Java의 final String name — 재할당 불가
var count = 0         // 재할당 가능
```

`val`은 **재할당 불가**일 뿐 객체 내부가 불변이라는 뜻은 아닙니다. Java의 `final`과 정확히 같은 의미예요.

```kotlin
val list = mutableListOf(1, 2)
list.add(3)          // OK — 참조는 그대로, 내용만 바뀜
list = mutableListOf() // 컴파일 에러 — 재할당 불가
```

## 왜 val이 기본인가

단순한 스타일 문제가 아닙니다. **`var`는 컴파일러의 능력을 깎아먹습니다.**

```kotlin
class Service(var cached: String?) {
    fun run() {
        if (cached != null) {
            println(cached.length)   // ❌ 컴파일 에러
        }
    }
}
```

검사 직후 다른 스레드가 `cached`를 바꿀 수 있으니 컴파일러가 스마트 캐스트를 거부합니다. `val`이었다면 그냥 통과해요. **`val`을 쓰면 Lesson 1에서 배운 null 도구들이 훨씬 잘 동작합니다.**

## 컬렉션: 읽기 전용 vs 불변

여기서 Java 개발자가 자주 오해합니다.

```kotlin
val a: List<Int> = listOf(1, 2, 3)          // 읽기 전용 인터페이스
val b: MutableList<Int> = mutableListOf(1)  // 변경 가능
```

`List<T>`에는 `add`가 **아예 없습니다.** Java의 `Collections.unmodifiableList()`처럼 런타임에 예외를 던지는 게 아니라, **메서드가 존재하지 않아 컴파일이 안 됩니다.**

주의: `List<T>`는 "읽기 전용 뷰"지 "불변 보장"이 아닙니다. 같은 객체를 `MutableList`로도 참조 중이면 내용이 바뀔 수 있어요. 그래서 **경계에서는 방어적 복사 대신 `toList()`로 스냅샷**을 넘깁니다.

```kotlin
fun items(): List<Item> = internalList.toList()
```

## if / when 이 값을 반환한다

Java에서 변수를 먼저 선언하고 `if`로 채우던 패턴이 사라집니다.

```java
// Java
String grade;
if (score >= 90) grade = "A";
else if (score >= 80) grade = "B";
else grade = "F";
```
```kotlin
// Kotlin — 표현식이라 val 로 받을 수 있다
val grade = when {
    score >= 90 -> "A"
    score >= 80 -> "B"
    else -> "F"
}
```

`when`이 값을 반환하므로 `var`가 필요 없어집니다. **`var`가 보이면 대부분 `if`/`when` 표현식으로 없앨 수 있습니다.**

## 초기화 시점 3종

| 문법 | 쓰는 상황 |
|---|---|
| `val x = ...` | 선언 시점에 값을 아는 경우 (기본) |
| `val x by lazy { ... }` | 첫 접근 때 한 번만 계산. 스레드 세이프 |
| `lateinit var x: T` | DI 주입, 테스트 `@BeforeEach` 등 나중에 채워지는 non-null 참조 |

`lateinit`은 초기화 전에 접근하면 `UninitializedPropertyAccessException`이 납니다. **원시 타입에는 못 씁니다.** 남용하면 `!!`와 다를 바 없으니, **생성자 주입으로 `val`을 쓸 수 있으면 그게 항상 낫습니다.**

```kotlin
// Spring — 이 형태가 최선. lateinit 필요 없음
@Service
class OrderService(private val repo: OrderRepository)
```

## const val

컴파일 타임 상수. Java의 `static final`에 대응하며 **호출부에 값이 인라인**됩니다.

```kotlin
const val MAX_RETRY = 3   // top-level 또는 object 안에서만
```

## 연습

아래 두 함수를 **`var`와 `mutableListOf`를 쓰지 않고** 다시 작성하세요. 출력은 동일해야 합니다.

```kotlin starter
fun grade(score: Int): String {
    var result = ""
    if (score >= 90) result = "A"
    else if (score >= 80) result = "B"
    else if (score >= 70) result = "C"
    else result = "F"
    return result
}

fun passed(scores: List<Int>): List<Int> {
    val out = mutableListOf<Int>()
    for (s in scores) {
        if (s >= 70) out.add(s)
    }
    return out
}

fun main() {
    val scores = listOf(95, 83, 71, 40)
    println(scores.map { grade(it) })
    println(passed(scores))
}
```

```text expected
[A, B, C, F]
[95, 83, 71]
```

```text hint
`var result`가 필요했던 이유는 **"선언 따로, 값 채우기 따로"** 였기 때문입니다. Kotlin에서 `if`/`when`은 문(statement)이 아니라 **표현식**이라 그 자체가 값을 내놓습니다. 두 번째 함수도 같은 눈으로 보세요 — "빈 리스트를 만들어 하나씩 채운다"는 절차가 아니라 **"원본에서 걸러낸 결과"라는 하나의 값**입니다.
---
쓸 도구는 두 개뿐입니다. 인자 없는 `when { }` 은 조건을 위에서부터 훑어 **처음 참이 된 가지의 값**을 돌려줍니다. 컬렉션의 `filter { }` 는 조건을 만족하는 원소만 담은 **새 `List`를 반환**합니다.
---
`when`이 값을 내놓으니 함수 본문을 블록(`{ ... return ... }`) 대신 **표현식 본문(`= when { ... }`)** 으로 쓸 수 있습니다. 가지는 위에서 아래로 검사되므로 `>= 90`, `>= 80`, `>= 70` 의 **순서 자체가 의미**를 갖고, 남는 경우는 `else`가 받습니다. `filter`는 이미 `List<Int>`를 반환하니 반환 타입을 바꿀 일도, `return`을 쓸 일도 없습니다.
---
뼈대는 이렇습니다.

`grade` 는 `fun grade(score: Int): String = when { ___ }` 꼴이고, 중괄호 안은 `score >= 90 -> "A"` 같은 줄 네 개(마지막은 `else -> "F"`)입니다.

`passed` 는 한 줄입니다 — `fun passed(scores: List<Int>): List<Int> = scores.___ { it >= 70 }`
```

```kotlin solution
// if 로 채우던 var 를 when 표현식 하나로 대체한다 — 선언과 값이 한 자리에서 만난다.
fun grade(score: Int): String = when {
    score >= 90 -> "A"
    score >= 80 -> "B"
    score >= 70 -> "C"
    else -> "F"
}

// mutableListOf + for + add 는 "걸러낸 결과"라는 하나의 값으로 바꿀 수 있다.
fun passed(scores: List<Int>): List<Int> = scores.filter { it >= 70 }

fun main() {
    val scores = listOf(95, 83, 71, 40)
    println(scores.map { grade(it) })
    println(passed(scores))
}
```
