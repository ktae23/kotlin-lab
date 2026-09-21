# Lesson 6 — 반복문과 레이블

Kotlin에는 `for (int i = 0; i < n; i++)` 형태가 **없습니다.** 초기화·조건·증감을 손으로 쓰는 C 스타일 for를 아예 문법에서 빼 버렸어요. 오프바이원(off-by-one) 버그가 태어나던 자리를 없앤 겁니다.

대신 `for`는 **"무언가를 순회한다"** 한 가지 일만 합니다.

## for — 순회 전용

```kotlin
for (item in items) println(item)        // 컬렉션
for (i in 1..10) println(i)              // 1,2,...,10 — 끝 포함
for (c in "kotlin") println(c)           // 문자열
```

`in` 오른쪽에 오는 건 `iterator()`를 가진 무엇이든 됩니다. 범위(`IntRange`)도 그중 하나일 뿐이에요.

### 범위를 만드는 다섯 가지

```kotlin
for (i in 1..5)        // 1 2 3 4 5     — 끝 포함
for (i in 1..<5)       // 1 2 3 4       — 끝 제외 (구 문법: 1 until 5)
for (i in 5 downTo 1)  // 5 4 3 2 1
for (i in 1..10 step 3)// 1 4 7 10
for (i in 10 downTo 1 step 3) // 10 7 4 1
```

`..<`는 Kotlin 1.9에서 들어온 문법이고, 그 전에는 `until`을 썼습니다. 기존 코드에서 `until`을 보면 같은 뜻이라고 읽으면 됩니다.

> `1..5`는 끝을 **포함**합니다. Java의 `i < n`에 익숙한 눈으로 `for (i in 0..list.size)`라고 쓰면 마지막에 인덱스 초과가 납니다. 인덱스가 필요하면 범위를 직접 계산하지 말고 아래 도구를 쓰세요.

### 인덱스가 필요할 때

```kotlin
for (i in items.indices) { ... }              // 0 .. items.size-1 이 보장된다
for ((i, item) in items.withIndex()) { ... }  // 인덱스와 원소를 한 번에
```

`indices`는 `0..size-1` 범위를 대신 만들어 줍니다. **직접 `0..size - 1`이라고 쓰지 마세요** — 손으로 쓰는 순간 그게 오타 날 자리입니다. 값도 같이 필요하면 `withIndex()`가 `(index, value)` 쌍을 주고, 괄호로 바로 **구조 분해(destructuring)** 해서 받습니다.

## while / do-while

Java와 완전히 같습니다. 바뀐 게 없어요.

```kotlin
while (n != 1) { n = next(n) }
do { c++ } while (x != 0)     // 몸통을 최소 한 번은 실행
```

쓰임새만 정리하면, **횟수나 대상이 정해져 있으면 `for`, 종료 조건이 계산 결과에 달려 있으면 `while`** 입니다. `do-while`은 "일단 한 번은 해야 하는" 경우 — 자릿수 세기처럼 입력이 0이어도 한 번은 돌아야 하는 로직에 딱 맞습니다.

## break / continue — 그리고 레이블

한 겹 루프에서는 Java와 똑같습니다. 문제는 **중첩 루프**예요.

```java
// Java — 이 패턴 많이 보셨을 겁니다
boolean found = false;
for (int i = 0; i < n && !found; i++) {
    for (int j = 0; j < n; j++) {
        if (match(i, j)) { found = true; break; }   // 안쪽만 빠져나온다
    }
}
```

`break`는 **가장 가까운 루프 하나만** 탈출합니다. 그래서 바깥 루프를 멈추려고 `found` 같은 플래그 변수를 만들고, 조건에 `&& !found`를 끼워 넣게 되죠. 상태 변수가 하나 늘고 루프 조건이 지저분해집니다.

Kotlin은 **레이블**로 해결합니다.

```kotlin
outer@ for (i in 0..<n) {
    for (j in 0..<n) {
        if (match(i, j)) break@outer      // 바깥 루프까지 한 번에 탈출
    }
}
```

`이름@`을 루프 앞에 붙이고 `break@이름` / `continue@이름`으로 지목합니다. `continue@outer`면 바깥 루프의 **다음 반복**으로 건너뜁니다.

Java에도 같은 문법이 있지만(`outer: for`), 실무에서 보기 드물어 낯설어하는 분이 많습니다. Kotlin에서는 `@`가 붙어 눈에 잘 띄기도 하고, **플래그 변수보다 의도가 명확해서** 더 적극적으로 씁니다.

> 헷갈리는 지점: 레이블 선언은 `outer@`(뒤에 `@`), 사용은 `break@outer`(앞에 `@`)입니다.

## 람다 안에서의 return — 미리 맛보기

여기부터는 Lesson 17의 예고편입니다. 지금은 **"이런 함정이 있다"** 정도만 알아 두세요.

```kotlin
fun find(items: List<Int>): String {
    items.forEach {
        if (it > 10) return "찾음"    // ← 무엇이 return 되는가?
    }
    return "없음"
}
```

이 `return`은 `forEach`를 빠져나오는 게 아니라 **`find` 함수 전체를 빠져나옵니다.** `forEach`가 `inline` 함수라서 가능한 일이고, 이걸 비지역 반환(non-local return)이라고 합니다.

"`forEach` 안에서 `break`를 쓰고 싶은데 안 된다"는 질문을 많이 하는데, `break`는 **루프 문법**이지 함수 호출에 쓰는 게 아니라서 그렇습니다. `forEach`는 루프가 아니라 함수거든요. 그 자리에서 `continue` 격으로 쓰는 건 **레이블 붙은 return**입니다.

```kotlin
items.forEach {
    if (it % 2 == 0) return@forEach     // 이번 원소만 건너뛴다 = continue
    println(it)
}
```

`return@forEach`는 **람다만** 빠져나옵니다. 여기서도 레이블 문법이 그대로 쓰이죠. 자세한 규칙은 Lesson 17에서 다룹니다.

## 반복 대조표

| 하고 싶은 일 | Java | Kotlin |
|---|---|---|
| 0부터 n-1 | `for (int i=0;i<n;i++)` | `for (i in 0..<n)` |
| 1부터 n | `for (int i=1;i<=n;i++)` | `for (i in 1..n)` |
| 거꾸로 | `for (int i=n;i>=1;i--)` | `for (i in n downTo 1)` |
| 2칸씩 | `i += 2` | `1..n step 2` |
| 컬렉션 순회 | `for (T x : list)` | `for (x in list)` |
| 인덱스+값 | 인덱스 직접 관리 | `list.withIndex()` |
| n번 반복 | `for (int i=0;i<n;i++)` | `repeat(n) { ... }` |

마지막 줄의 `repeat(n) { }` 은 루프 문법이 아니라 **표준 라이브러리 함수**입니다. 인덱스를 전혀 안 쓰고 그냥 n번 돌리기만 할 때 쓰세요 — 블록 안에서 인덱스가 필요하면 `it` 으로 받을 수 있습니다(0부터).

```kotlin
repeat(3) { println("재시도 ${it + 1}회") }
```

## 리뷰에서 이렇게 지적한다

**1. 인덱스 루프로 컬렉션을 순회하면 다시 쓰게 한다.**
`for (i in 0..<list.size) { val x = list[i] ... }` 는 인덱스를 실제로 쓰지 않으면서 오프바이원 위험만 떠안은 코드입니다. 값만 필요하면 `for (x in list)`, 인덱스도 필요하면 `withIndex()` 또는 `forEachIndexed`. 그리고 루프의 목적이 **변환이면 `map`, 걸러내기면 `filter`** 입니다 (Lesson 21).

**2. 루프 탈출용 플래그 변수가 보이면 레이블을 제안한다.**
`var found = false` 가 루프 조건에 끼어 있으면 그건 대부분 `break@outer` 한 줄로 끝납니다. 플래그는 "언제 바뀌는지"를 읽는 사람이 추적해야 하지만, 레이블은 탈출 지점이 코드에 그대로 박혀 있습니다.

**3. `while (true)` + `break` 가 여러 개면 종료 조건을 못 잡은 신호다.**
탈출구가 흩어져 있으면 언제 끝나는지 읽을 수가 없습니다. 종료 조건을 `while` 괄호 안으로 끌어올릴 수 있는지 먼저 봅니다.

## 연습

네 함수를 **컬렉션 고차 함수(`map`/`filter`/`forEach`) 없이** 순수 루프로 작성하세요.

```kotlin starter
// 1) 중첩 루프 + 레이블 — 플래그 변수로 바깥 루프를 멈추지 말 것
fun firstPair(nums: List<Int>, target: Int): String {
    var found = ""
    // TODO: 서로 다른 두 원소의 합이 target 인 첫 쌍을 찾아 found 에 "3 + 7" 형태로 담는다.
    //       바깥 루프에 레이블을 붙이고, 찾는 즉시 break@레이블 로 두 겹을 한 번에 탈출한다.
    //       인덱스는 indices 와 (i + 1)..<nums.size 를 쓴다 — 같은 원소를 두 번 쓰지 않도록.
    return if (found == "") "없음" else found
}

// 2) continue 와 break
fun sumUntil(limit: Int): Int {
    var sum = 0
    // TODO: i 를 1 부터 100 까지 올리면서
    //       - 3 의 배수면 continue 로 건너뛰고
    //       - 더했을 때 limit 을 넘게 되면 break (그 수는 더하지 않는다)
    //       아니면 sum 에 더한다.
    return sum
}

// 3) withIndex() — "0:kotlin, 1:java" 형태로 잇는다
fun indexed(words: List<String>): String {
    var out = ""
    // TODO: withIndex() 로 (인덱스, 값) 을 구조 분해해서 받고,
    //       첫 원소가 아니면 앞에 ", " 를 붙인 뒤 "인덱스:값" 을 이어 붙인다.
    return out
}

// 4) do-while — 0 이 들어와도 한 번은 돌아야 한다
fun countDigits(n: Int): Int {
    var x = n
    var count = 0
    // TODO: x 를 10 으로 계속 나누면서 자릿수를 센다. x 가 0 이 되면 멈춘다.
    return count
}

fun main() {
    val nums = listOf(3, 7, 1, 9, 4)
    println(firstPair(nums, 10))
    println(firstPair(nums, 13))
    println(firstPair(nums, 100))

    println(sumUntil(20))
    println(sumUntil(5))

    println(indexed(listOf("kotlin", "java", "scala")))
    println(indexed(listOf("only")))

    println(countDigits(0))
    println(countDigits(4050))
}
```

```text expected
3 + 7
9 + 4
없음
19
3
0:kotlin, 1:java, 2:scala
0:only
1
4
```

```text hint
네 문제 모두 "어떤 루프를 고르는가"가 절반입니다. 1번은 두 겹 `for` 에 **바깥을 지목할 이름**이 필요하고, 2번은 범위 순회 중간에 **건너뛰기와 멈추기**가 필요하고, 3번은 **인덱스와 값이 동시에** 필요하고, 4번은 입력이 `0` 이어도 **몸통이 한 번은 돌아야** 합니다. 4번에서 `while` 을 먼저 쓰면 `countDigits(0)` 이 `0` 을 내놓아 틀립니다.
---
도구는 이렇습니다. 1번: 루프 앞에 `outer@` 를 붙이고 안쪽에서 `break@outer`. 2번: `continue` 와 `break`. 3번: `for ((i, w) in words.withIndex())`. 4번: `do { ... } while (조건)`. 인덱스 범위는 `nums.indices` 와 `(i + 1)..<nums.size` 를 쓰세요 — `0..nums.size` 라고 쓰면 인덱스 초과입니다.
---
함정 세 가지. 1번에서 `break` 만 쓰면 **안쪽 루프만** 빠져나와 바깥이 계속 돕니다 — 레이블이 필요한 이유가 정확히 이것. 2번에서 두 조건의 **순서**가 중요합니다. `continue` 검사를 먼저 해야 3의 배수가 한도 검사에 끼어들지 않아요. 그리고 "넘게 되면 break" 는 `sum + i > limit` 로 **더하기 전에** 판단합니다. 3번에서 구분자는 원소 앞에 붙이되 `i > 0` 일 때만 — 뒤에 붙이면 마지막에 `", "` 가 남습니다.
---
뼈대입니다.

1번: `outer@ for (i in nums.indices) { for (j in (i + 1)..<nums.size) { if (___ == target) { found = "${nums[i]} + ${nums[j]}"; break@outer } } }`

2번: `for (i in 1..100) { if (i % 3 == 0) continue; if (___ > limit) break; sum += i }`

3번: `for ((i, w) in words.withIndex()) { if (i > 0) out += ", "; out += "___" }`

4번: `do { count++; x /= 10 } while (___)`
```

```kotlin solution
// 레이블 덕분에 "찾았다" 플래그 변수와 루프 조건의 && !found 가 통째로 사라진다.
fun firstPair(nums: List<Int>, target: Int): String {
    var found = ""
    outer@ for (i in nums.indices) {
        for (j in (i + 1)..<nums.size) {
            if (nums[i] + nums[j] == target) {
                found = "${nums[i]} + ${nums[j]}"
                break@outer
            }
        }
    }
    return if (found == "") "없음" else found
}

fun sumUntil(limit: Int): Int {
    var sum = 0
    for (i in 1..100) {
        if (i % 3 == 0) continue        // 건너뛰기 검사가 먼저
        if (sum + i > limit) break      // 더하기 전에 한도를 판단한다
        sum += i
    }
    return sum
}

fun indexed(words: List<String>): String {
    var out = ""
    for ((i, w) in words.withIndex()) {  // 쌍을 바로 구조 분해해서 받는다
        if (i > 0) out += ", "           // 구분자는 앞에 — 뒤에 붙이면 끝에 남는다
        out += "$i:$w"
    }
    return out
}

// 0 이 들어와도 자릿수는 1 이므로 몸통이 먼저 실행되는 do-while 이어야 한다.
fun countDigits(n: Int): Int {
    var x = n
    var count = 0
    do {
        count++
        x /= 10
    } while (x != 0)
    return count
}

fun main() {
    val nums = listOf(3, 7, 1, 9, 4)
    println(firstPair(nums, 10))
    println(firstPair(nums, 13))
    println(firstPair(nums, 100))

    println(sumUntil(20))
    println(sumUntil(5))

    println(indexed(listOf("kotlin", "java", "scala")))
    println(indexed(listOf("only")))

    println(countDigits(0))
    println(countDigits(4050))
}
```
