# Lesson 38 — 컴파일러가 하는 일 — K2, IR, 그리고 바이트코드

여기까지 오면서 "그렇게 정해져 있다"로 넘긴 것들이 꽤 쌓였습니다. `reified`는 왜 `inline`에서만 되는지, `suspend` 함수는 어떻게 멈췄다 이어지는지, 스마트 캐스트는 왜 `var`에서 갑자기 안 먹는지. 전부 **컴파일러가 하는 일 하나**로 설명됩니다.

컴파일러를 공부하자는 게 아니라 그 근거를 손에 쥐어 주는 자리입니다. 근거가 있으면 리뷰에서 "그건 이래서 안 됩니다"라고 말할 수 있고, 없으면 "저도 그렇게 배웠어요"밖에 못 합니다.

## 먼저 오해부터 깹니다 — Kotlin은 Java로 번역되지 않는다

Java 개발자가 가장 많이 하는 오해입니다. **`kotlinc`는 Java 소스를 거치지 않습니다.** JVM 바이트코드를 직접 만들어요. 중간에 `.java` 파일이 생기는 단계는 없습니다.

이게 중요한 이유는, Java 문법으로 표현할 수 없는 걸 Kotlin이 하는 근거가 여기 있기 때문입니다. Java에는 non-local return도, 상태 머신 변환도, 소거를 우회하는 문법도 없습니다. Kotlin은 그걸 **바이트코드 레벨에서 직접 만들어서** 해결합니다.

## 파이프라인

```
소스(.kt)
  → 프론트엔드 (K2 / FIR)   파싱 · 타입 추론 · 스마트 캐스트 판정 · 진단(에러·경고)
  → IR (중간 표현)          언어 의미를 담은 트리. 플러그인이 끼어드는 곳
  → 백엔드                  타깃별 코드 생성
      ├─ JVM     → .class (바이트코드)
      ├─ JS      → .js
      ├─ Native  → 기계어 (LLVM)
      └─ Wasm    → .wasm
```

핵심은 **프론트엔드와 백엔드가 IR로 분리돼 있다**는 것. 타입 검사와 진단은 한 번만 만들고, 타깃별로는 백엔드만 갈아 끼웁니다. Kotlin이 JVM·JS·Native·Wasm을 동시에 지원하는 이유가 문법이 아니라 **이 구조**예요.

**K2**(Kotlin 2.0)는 이 중 프론트엔드를 통째로 갈아엎은 겁니다. 얻은 건 셋 — **속도**(큰 모듈일수록 체감이 큽니다), **스마트 캐스트 개선**(예전 프론트엔드가 포기하던 흐름을 K2는 추적합니다), **진단 품질**(에러가 "왜 안 되는지"를 말해 줍니다 — 뒤에서 실제 메시지를 봅니다).

## 증거 ① `inline` — 본문이 호출 지점에 펼쳐진다

```kotlin
inline fun runInline(block: () -> Unit) { block() }   // fun runNoInline 은 inline 만 뺀 것
fun callerInline() { runInline { println("hi") } }    // callerNoInline 은 runNoInline 호출
```

똑같아 보이는 두 줄입니다. `javap -c`로 실제 바이트코드를 보면:

```
public static final void callerInline();
   4: ldc           #30    // String hi
   6: getstatic     #36    // Field java/lang/System.out
  10: invokevirtual #42    // Method java/io/PrintStream.println

public static final void callerNoInline();
   0: invokedynamic #61    // InvokeDynamic invoke:()Lkotlin/jvm/functions/Function0;
   5: invokestatic  #63    // Method runNoInline:(Lkotlin/jvm/functions/Function0;)V
```

`callerInline`에는 **호출 자체가 없습니다.** `println`이 그냥 거기 박혀 있어요. 반면 `callerNoInline`은 `Function0` 객체를 만들고(`invokedynamic`), 그걸 넘기고, `runNoInline`을 호출합니다.

두 가지가 따라옵니다.

- **람다 객체가 안 생긴다** — 이게 `inline`의 성능 이야기의 전부입니다
- **non-local return이 된다** — 람다 본문이 바깥 함수 안에 펼쳐져 있으니, 거기서 `return`하면 바깥 함수가 끝납니다. 문법 특례가 아니라 **위치가 진짜로 거기라서** 되는 겁니다

Java의 `list.forEach(x -> { return; })`가 람다만 끝내는 것과 대비해 보세요. Java 람다는 항상 객체라 바깥을 끝낼 방법이 없습니다.

## 증거 ② `reified` — 소거를 뚫는 게 아니라 호출 지점에 타입을 박는 것

L24에서 "타입 소거는 그대로고 인라인 시점에 타입이 박힐 뿐"이라고 했죠. 그 증거입니다.

```kotlin
inline fun <reified T> isType(x: Any): Boolean = x is T
fun callerReified(x: Any): Boolean = isType<String>(x)
```

```
public static final <T> boolean isType(java.lang.Object);     ← T 는 소거돼 Object
  10: ldc           #70    // String T
  12: invokestatic  #74    // Intrinsics.reifiedOperationMarker
  15: instanceof    #4     // class java/lang/Object      ← 자리만 잡아 둔 것

public static final boolean callerReified(java.lang.Object);
  11: instanceof    #79    // class java/lang/String      ← 호출 지점엔 진짜 타입
```

`isType` 본문의 `instanceof`는 `Object`입니다. 실행되지 않는, **자리 표시자**예요. 진짜 검사는 `callerReified`에 `instanceof String`으로 박혀 있습니다.

그래서 `reified`가 `inline`을 요구하는 겁니다. 인라인이 아니면 "호출 지점"이 없고, 박아 넣을 곳이 없어요. 소거는 그대로 남아 있습니다.

## 증거 ③ `suspend` — 코루틴은 마법이 아니라 컴파일러 변환이다

이 레슨의 백미입니다. L31~37에서 쓴 `suspend`가 실제로 뭐가 되는지 봅니다.

```kotlin
suspend fun fetchUser(id: Long): String {
    delay(10)
    return "user-$id"
}
```

`javap`로 본 시그니처:

```
public static final java.lang.Object fetchUser(long, kotlin.coroutines.Continuation<? super java.lang.String>);
```

**`suspend` 키워드는 바이트코드에 없습니다.** 대신 두 가지가 바뀌었어요.

- 파라미터 끝에 **`Continuation`이 하나 붙었다** — "끝나면 여기로 알려 줘"라는 콜백
- 반환 타입이 `String`이 아니라 **`Object`** — 값을 돌려주거나, "아직 안 끝났다"는 표식(`COROUTINE_SUSPENDED`)을 돌려주거나 둘 중 하나라서

본문은 **상태 머신**이 됩니다. CPS(Continuation Passing Style) 변환이라고 부릅니다.

```
  65: tableswitch { 0: 88,  1: 121,  default: 153 }   ← label 로 재개 지점 분기
 100: putfield   // fetchUser$1.J$0:J                 ← 상태 0: 파라미터 id 를 필드에 보관
 106: putfield   // fetchUser$1.label:I  (= 1)        ← "다음엔 1번부터"
 109: invokestatic  // DelayKt.delay(J, Continuation)
 120: areturn                                         ← 중단: COROUTINE_SUSPENDED 반환
 123: getfield   // fetchUser$1.J$0:J                 ← 상태 1: 보관해 둔 id 를 복원
```

그리고 컴파일러가 클래스를 하나 더 만듭니다:

```
final class ProbeKt$fetchUser$1 extends kotlin.coroutines.jvm.internal.ContinuationImpl {
  long J$0;                 // 중단을 건너 살아남아야 하는 지역변수/파라미터
  java.lang.Object result;  // 재개될 때 넘어오는 값
  int label;                // 어디서부터 다시 시작할지
}
```

읽는 법은 이렇습니다. `suspend` 함수는 **끝까지 달리는 함수가 아니라, `label`을 보고 그 지점부터 실행하는 함수**입니다. `delay`에 도착하면 `label`을 올려 두고 `COROUTINE_SUSPENDED`를 반환하며 **스레드를 놓습니다.** 나중에 같은 `Continuation`으로 다시 불리면 `tableswitch`가 `label=1` 가지로 뛰어서 이어 달립니다.

몇 가지가 여기서 한 번에 설명됩니다.

- **스레드를 블로킹하지 않는 이유** — 기다리는 게 아니라 **반환하고 나가기** 때문. 스레드는 그동안 다른 코루틴을 돌립니다
- **일반 함수에서 `suspend` 를 못 부르는 이유** — 넘겨줄 `Continuation`이 없으니까
- **중단을 건너 지역변수가 살아남는 이유** — 스택이 아니라 `Continuation` 객체의 **필드**(`J$0`)에 보관되니까
- **코루틴이 스레드보다 싼 이유** — 중단 상태의 실체가 OS 스레드가 아니라 **작은 객체 하나**니까

> 면접에서 "코루틴이 어떻게 동작하나요"를 물으면 여기까지가 답입니다. "경량 스레드요"는 비유지 설명이 아닙니다.

## 증거 ④ 스마트 캐스트가 `var` 프로퍼티에서 막히는 이유

L02·L08에서 "`var` 프로퍼티엔 스마트 캐스트가 안 먹는다"고 했죠. `class Session(var token: String?)` 안에서 `if (token != null) println(token.length)` 를 쓰면 K2가 이렇게 말합니다.

```
error: smart cast to 'String' is impossible, because 'token' is a mutable property
       that could be mutated concurrently.
```

컴파일러는 **자기가 증명할 수 있는 것만** 좁힙니다. `var` 프로퍼티는 검사 직후 다른 스레드가, 혹은 다른 코드가 바꿀 수 있어요. 그 가능성을 배제할 수 없으니 거부합니다. 못 해서가 아니라 **거짓말을 안 하려고** 그러는 겁니다. 그래서 해법도 정해져 있습니다 — `val t = token ?: return` 으로 지역 변수에 먼저 받으면 그건 아무도 못 바꾸니 컴파일러가 증명할 수 있습니다.

## 증거 ⑤ `data class` / `value class` — 누가 언제 만드나

L12·L15에서 뭘 만들어 주는지는 이미 봤으니, 여기선 **누가 만드나**만 짚습니다. 답은 **프론트엔드가 아니라 백엔드**, 소스가 아니라 **IR 단계에서 합성**됩니다. 소스에는 끝까지 없어요.

```
public final class Money {
  public final long component1();
  public final Money copy(long, java.lang.String);
  public static Money copy$default(Money, long, java.lang.String, int, java.lang.Object);
  public boolean equals(java.lang.Object);   // toString · hashCode 도 함께
}
```

`copy$default`가 눈에 띄죠. **기본값 있는 파라미터는 JVM에 없는 개념**이라, 컴파일러가 "어떤 인자가 생략됐는지"를 비트마스크(`int`)로 받는 별도 메서드를 합성합니다. Kotlin의 기본값 인자가 전부 이런 식이에요. Java에서 Kotlin 함수를 호출할 때 기본값이 안 먹는 이유이기도 합니다.

## 컴파일러 플러그인 — 소스가 아니라 IR을 고친다

Lesson 45(Spring 셋업)에서 쓰는 `allOpen`/`noArg`가 바로 이 IR 단계에 끼어드는 물건입니다. `@MyEntity class Account(...)` 하나를 두고, **소스는 한 글자도 안 고친 채** 플러그인만 켜고 껐을 때:

```
// 플러그인 없이                    // allOpen 적용
public final class Account {        public class Account {
  public final long getBalance();     public long getBalance();
  public final long withdraw(long);   public long withdraw(long);
}                                   }
```

**`final`이 전부 사라졌습니다.** 소스에는 `open`이 없는데도요. 플러그인이 IR 트리를 돌며 수정자를 바꾼 겁니다.

`kotlin("plugin.spring")`은 여기에 **프리셋**을 얹은 것뿐입니다 — `@Component`, `@Service`, `@Transactional` 같은 애노테이션 목록을 미리 채워 둔 `allOpen`이에요. 그래서 커스텀 스테레오타입(`@MyTxService`)을 만들면 프리셋에 없으니 직접 등록해야 합니다.

**왜 애노테이션만으로는 안 되나?** 애노테이션은 `.class`에 붙는 **메타데이터**일 뿐, 클래스를 열지 못합니다. `final`은 바이트코드의 접근 플래그이고, 그걸 바꾸려면 **바이트코드를 만드는 시점에** 끼어들어야 해요. 런타임에 애노테이션을 읽어 봐야 이미 늦었습니다. 그래서 컴파일러 플러그인인 겁니다.

## 디컴파일은 읽기용 도구다

IntelliJ의 **Show Kotlin Bytecode → Decompile**을 쓰면 "Java 코드"가 나옵니다. 이건 **바이트코드를 Java 문법으로 되읽어 준 것**이지 컴파일 경로가 아닙니다. 순서는 `Kotlin → 바이트코드 → (보기 좋으라고) Java 표현`이에요. 그래서 디컴파일 결과는 컴파일 안 되는 경우도 많고(`copy$default`는 Java 식별자가 아닙니다), `Continuation` 상태 머신은 사람이 읽기 힘든 형태로 나옵니다.

용도는 하나입니다. **의심될 때 확인하기.** "이 `inline`이 진짜 인라인됐나", "이 `data class`에 `copy`가 있나". 그 이상을 기대하지 마세요.

## 리뷰할 때 보는 것

| 코드에서 보이면 | 이렇게 지적한다 |
|---|---|
| 람다를 안 받는 함수에 `inline` | 인라인의 이득은 람다 객체 제거다. 람다가 없으면 바이트코드만 복제된다. 떼라 |
| 수십 줄짜리 함수에 `inline` | 호출 지점마다 본문이 통째로 복사된다. 타입이 필요한 부분만 작은 `inline` 함수로 떼라 |
| `Class<T>` 를 타입 검사용으로만 넘김 | `inline fun <reified T>` 로 바꾸면 그 인자가 사라진다 |
| `suspend` 함수를 `runBlocking` 으로 감싸 일반 함수에서 호출 | 중단 지점마다 스레드를 놓는 게 코루틴의 전부인데, 그 이득을 여기서 버린다. 호출자까지 `suspend` 로 올릴 수 없는 이유를 먼저 설명하라 |
| `var` 프로퍼티를 null 검사 후 사용 → `!!` | 컴파일러가 동시 변경을 배제 못 해 거부한 것이다. `val` 지역 변수에 먼저 받아라 |
| `@Suppress` 로 진단을 끔 | 끄기 전에 왜 났는지 본문에 적어라. K2 진단은 대부분 "컴파일러가 증명 못 한 것"을 말한다 — 증명 못 할 이유가 진짜 있는지부터 확인 |
| `@Service` 인데 `plugin.spring` 이 없는 모듈 | Kotlin 클래스는 기본 `final` 이고 애노테이션만으로는 안 열린다. allOpen 플러그인이 IR 에서 열어 줘야 프록시가 만들어진다 |
| 리뷰 근거가 "디컴파일해 보니 Java 가 이렇더라" | 디컴파일은 바이트코드를 Java 문법으로 되읽은 것이지 컴파일 경로가 아니다. 근거는 바이트코드로 대라 |

## 연습

컴파일러가 만든 결과를 **런타임에 직접 관찰**합니다. `javap` 없이, 동작과 리플렉션만으로요.

1. `eachInline`(inline)과 `eachNoInline`(일반)을 각각 쓰는 탐색 함수를 만들어, **방문 횟수 차이**로 non-local return을 확인하세요. inline 쪽은 람다 안에서 `return`해 함수를 즉시 끝내고, 일반 쪽은 그게 불가능하니 끝까지 돕니다
2. `reified`로 `is T`가 되는 것과, 제네릭 없이 `Class`를 넘겨야 하는 것(Java 방식)을 대비하세요
3. `Repo`의 두 함수 시그니처를 `declaredMethods`로 출력해 **`suspend`에 `Continuation`이 붙는 것**을 확인하세요
4. `Money`가 합성한 멤버 중 `component`·`copy`로 시작하는 것만 골라 출력하세요

> 리플렉션의 `declaredMethods`는 **순서가 보장되지 않습니다.** 반드시 정렬하세요.

```kotlin starter
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking

inline fun eachInline(items: List<Int>, action: (Int) -> Unit) {
    for (i in items) action(i)
}

fun eachNoInline(items: List<Int>, action: (Int) -> Unit) {
    for (i in items) action(i)
}

fun findInline(items: List<Int>): String {
    var visited = 0
    // TODO: eachInline 으로 순회하며 visited 를 세고, 음수를 만나면 그 자리에서
    //       "inline   hit=$it visited=$visited" 를 반환하세요 (non-local return)
    return "inline   hit=none visited=$visited"
}

fun findNoInline(items: List<Int>): String {
    var visited = 0
    var hit: Int? = null
    // TODO: eachNoInline 으로 순회하며 visited 를 세고, 첫 음수만 hit 에 담으세요.
    //       여기서는 람다로 바깥 함수를 끝낼 수 없습니다.
    return "noinline hit=${hit ?: "none"} visited=$visited"
}

// TODO: reified 로 T 인 원소를 세는 함수
inline fun <reified T> countOf(items: List<Any>): Int = TODO()

// TODO: 제네릭 없이 Class 를 받아 같은 일을 하는 함수 (Java 방식)
fun countOfErased(items: List<Any>, type: Class<*>): Int = TODO()

object Repo {
    suspend fun findUser(id: Long): String {
        delay(1)
        return "user-$id"
    }
    fun findUserBlocking(id: Long): String = "user-$id"
}

data class Money(val amount: Long, val currency: String)

// TODO: "이름(파라미터타입, ...): 반환타입" 형태의 문자열을 만드세요. 타입은 simpleName 으로
fun signature(m: java.lang.reflect.Method): String = TODO()

fun main() {
    val nums = listOf(3, -7, -9, 4)
    println(findInline(nums))
    println(findNoInline(nums))

    val mixed = listOf<Any>("a", 1, "b", 2, 3)
    println("reified  String=${countOf<String>(mixed)} Int=${countOf<Int>(mixed)}")
    println("erased   String=${countOfErased(mixed, String::class.java)}")

    // TODO: Repo 의 declaredMethods 를 "Repo." + signature 형태로, 정렬해서 출력
    // TODO: Money 의 declaredMethods 중 component/copy 로 시작하는 이름만, 정렬해서 "Money.이름" 으로 출력

    println(runBlocking { Repo.findUser(7) })
}
```

```text expected
inline   hit=-7 visited=2
noinline hit=-7 visited=4
reified  String=2 Int=3
erased   String=2
Repo.findUser(long, Continuation): Object
Repo.findUserBlocking(long): String
Money.component1
Money.component2
Money.copy
Money.copy$default
user-7
```

```text hint
네 덩어리 모두 "컴파일러가 만든 결과"를 보는 겁니다. 1번은 **동작**으로, 2번은 **되나 안 되나**로, 3·4번은 **리플렉션**으로 봅니다. `visited` 값이 2 와 4 로 갈리는 게 1번의 전부예요 — 왜 inline 쪽만 중간에 멈출 수 있는지 생각해 보세요.
---
쓰는 도구는 이렇습니다. 1번 inline 쪽은 람다 안에서 그냥 `return "..."`. 2번은 `items.count { ... }` 와 `type.isInstance(it)`. 3·4번은 `Repo::class.java.declaredMethods`, `Money::class.java.declaredMethods` 로 `Array<Method>` 를 얻은 뒤 `map`·`filter`·`sorted`·`forEach` 로 잇습니다. `Method` 에서 필요한 건 `name`, `parameterTypes`, `returnType` 세 개고, `Class` 이름은 `simpleName` 입니다.
---
`findNoInline` 에서는 람다 안에 `return "..."` 을 쓸 수 없습니다 — 컴파일 에러가 나요. 람다가 진짜 객체라 바깥 함수를 끝낼 방법이 없기 때문입니다. 그래서 `hit` 에 **첫 음수만** 담아야 하고(`hit == null` 일 때만 대입), 순회는 끝까지 돕니다. `countOf` 는 `it is T` 가 되는데 `countOfErased` 는 `it is 어쩌고` 를 쓸 수 없어 `Class` 를 받는다는 게 2번의 대조점입니다. 마지막으로 **`sorted()` 를 빠뜨리면 실행할 때마다 순서가 바뀝니다.**
---
빈칸만 채우면 됩니다. `findInline` 안: `eachInline(items) { visited++; if (it < 0) return "inline   hit=$it visited=$visited" }`. `countOf`: `items.count { it ___ T }`. `signature`: `"${m.name}(${m.parameterTypes.joinToString(", ") { it.___ }}): ${m.returnType.___}"`. `main` 안: `Repo::class.java.declaredMethods.map { "Repo." + signature(it) }.___().forEach(::println)` 과 `Money::class.java.declaredMethods.map { it.name }.filter { it.startsWith("component") || it.startsWith("copy") }.___().forEach { println("Money.$it") }`.
```

```kotlin solution
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking

inline fun eachInline(items: List<Int>, action: (Int) -> Unit) {
    for (i in items) action(i)
}

fun eachNoInline(items: List<Int>, action: (Int) -> Unit) {
    for (i in items) action(i)
}

// inline 이라 람다 본문이 여기 펼쳐진다 → 람다 안의 return 이 findInline 자체를 끝낸다
fun findInline(items: List<Int>): String {
    var visited = 0
    eachInline(items) {
        visited++
        if (it < 0) return "inline   hit=$it visited=$visited"
    }
    return "inline   hit=none visited=$visited"
}

// 람다가 진짜 객체라 바깥을 끝낼 수 없다 → 음수를 찾고도 끝까지 돈다
fun findNoInline(items: List<Int>): String {
    var visited = 0
    var hit: Int? = null
    eachNoInline(items) {
        visited++
        if (it < 0 && hit == null) hit = it
    }
    return "noinline hit=${hit ?: "none"} visited=$visited"
}

// 호출 지점에 T 가 박히므로 is T 가 가능하다
inline fun <reified T> countOf(items: List<Any>): Int = items.count { it is T }

// 소거된 제네릭으로는 is 를 못 쓰니 Class 를 인자로 받는다 — Java 가 늘 하던 방식
fun countOfErased(items: List<Any>, type: Class<*>): Int = items.count { type.isInstance(it) }

object Repo {
    suspend fun findUser(id: Long): String {
        delay(1)
        return "user-$id"
    }
    fun findUserBlocking(id: Long): String = "user-$id"
}

data class Money(val amount: Long, val currency: String)

fun signature(m: java.lang.reflect.Method): String =
    "${m.name}(${m.parameterTypes.joinToString(", ") { it.simpleName }}): ${m.returnType.simpleName}"

fun main() {
    val nums = listOf(3, -7, -9, 4)
    println(findInline(nums))
    println(findNoInline(nums))

    val mixed = listOf<Any>("a", 1, "b", 2, 3)
    println("reified  String=${countOf<String>(mixed)} Int=${countOf<Int>(mixed)}")
    println("erased   String=${countOfErased(mixed, String::class.java)}")

    // declaredMethods 는 순서가 보장되지 않는다 — 반드시 정렬한다
    Repo::class.java.declaredMethods
        .map { "Repo." + signature(it) }
        .sorted()
        .forEach(::println)

    Money::class.java.declaredMethods
        .map { it.name }
        .filter { it.startsWith("component") || it.startsWith("copy") }
        .sorted()
        .forEach { println("Money.$it") }

    println(runBlocking { Repo.findUser(7) })
}
```
