# Lesson 8 — 제네릭과 변성(variance)

Java 제네릭에서 가장 많이 물어보고 가장 적게 이해하는 게 `? extends` / `? super` 입니다. Kotlin은 이 문제를 **다른 위치에서** 풉니다. 위치가 바뀌었다는 것만 이해하면, 평생 헷갈리던 PECS가 한 번에 정리됩니다.

## 문제부터 — 왜 `List<Dog>` 는 `List<Animal>` 이 아닌가

```java
List<Dog> dogs = new ArrayList<>();
List<Animal> animals = dogs;   // 컴파일 에러
animals.add(new Cat());        // 만약 위가 통과했다면? dogs 안에 Cat 이 들어간다
```

제네릭이 **무공변(invariant)** 인 이유입니다. `Dog`가 `Animal`의 하위 타입이어도 `List<Dog>`는 `List<Animal>`의 하위 타입이 아닙니다. 안전을 위해 일부러 막아둔 겁니다.

그런데 읽기만 할 거라면? 그때는 안전합니다. 그래서 Java는 **호출하는 쪽에서** 예외를 적어줘야 했습니다.

```java
void printAll(List<? extends Animal> animals) {   // 읽기 전용 — 공변
    for (Animal a : animals) System.out.println(a.getName());
    // animals.add(...) 는 컴파일 에러 — Java 가 막아준다
}

void fillDogs(List<? super Dog> sink) {           // 쓰기 전용 — 반공변
    sink.add(new Dog("초코"));
}
```

이게 **PECS** — Producer extends, Consumer super. 문제는 이 선언을 **`List`를 쓰는 모든 곳에 매번** 적어야 한다는 것. `List` 자체는 읽기도 쓰기도 하는 타입이라, 안전 여부가 사용 지점마다 달라지기 때문입니다. Java의 변성이 **사용 지점 변성(use-site variance)** 인 이유입니다.

## Kotlin: 선언 지점 변성(declaration-site variance)

Kotlin은 **타입을 만들 때 한 번** 선언합니다.

```kotlin
interface Source<out T> {   // T 는 나가기만 한다 → 공변
    fun next(): T
}

interface Sink<in T> {      // T 는 들어오기만 한다 → 반공변
    fun accept(item: T)
}
```

선언이 끝났으면 사용하는 쪽은 아무것도 안 합니다.

```kotlin
val dogSource: Source<Dog> = ...
val source: Source<Animal> = dogSource   // 그냥 대입된다

val animalSink: Sink<Animal> = ...
val sink: Sink<Dog> = animalSink         // 그냥 대입된다
```

외우는 법은 **화살표 방향** 하나입니다.

| 키워드 | 위치 | 방향 | Java 대응 |
|---|---|---|---|
| `out T` | 반환 타입에만 등장 | 밖으로 나감 (생산자) | `? extends T` |
| `in T` | 파라미터 타입에만 등장 | 안으로 들어옴 (소비자) | `? super T` |
| (없음) | 둘 다 | 무공변 | `T` |

컴파일러가 강제합니다. `out T`로 선언해놓고 `fun accept(item: T)`를 넣으면 **"T occurs in 'in' position"** 컴파일 에러가 납니다. Java가 런타임까지 미루던 판단을 선언 시점에 끝내는 거예요.

## PECS가 사라지는 지점

```kotlin
// kotlin.collections 원본
public interface List<out E> : Collection<E>      // 읽기 전용 → out
public interface MutableList<E> : List<E>          // 쓰기도 함 → 무공변
```

**읽기 전용 `List`와 변경 가능한 `MutableList`를 타입으로 분리**했기 때문에 `out`을 미리 붙일 수 있었던 겁니다.

```kotlin
fun printAll(animals: List<Animal>) { ... }   // ? extends 가 필요 없다
printAll(listOf(Dog("초코")))                 // List<Dog> 가 그대로 들어간다
```

Java 개발자가 놓치는 핵심: **Kotlin이 마법을 부린 게 아니라, 컬렉션 인터페이스를 읽기/쓰기로 쪼갠 설계 덕분**입니다. Java는 `List`가 하나라 쪼갤 수 없었고, 그래서 사용 지점으로 갈 수밖에 없었습니다.

## 그래도 사용 지점 변성이 필요할 때 — 타입 프로젝션

무공변 타입을 한 함수에서만 공변으로 쓰고 싶다면 Kotlin도 Java처럼 쓸 수 있습니다.

```kotlin
fun copy(from: Array<out Any>, to: Array<Any>) {   // Java 의 ? extends 와 동일
    for (i in from.indices) to[i] = from[i]
}
```

`Array<T>`는 무공변(JVM 배열이라 어쩔 수 없음)이라 `out`을 선언에 못 박습니다. 이럴 때만 사용 지점에서 `out`을 씁니다. **먼저 선언 지점으로 풀고, 안 되면 프로젝션.** 순서가 중요합니다.

## star projection `*` — "타입은 모르지만 뭔가는 있다"

```kotlin
fun describe(box: Box<*>): String = "Box(size=${box.size})"
```

Java의 `Box<?>` 에 해당합니다. `*`는 **읽을 때는 `Any?`, 쓸 때는 아무것도 못 넣는** 타입입니다.

```kotlin
val list: List<*> = listOf(1, 2, 3)
val first: Any? = list[0]      // 읽기는 된다. 단 Any? 로만
// list 가 MutableList<*> 여도 add 는 불가능 — 무슨 타입인지 모르니까
```

`Box<Any?>`와 다릅니다. `Box<Any?>`는 "무엇이든 담을 수 있다", `Box<*>`는 "**무엇인가**가 담겨 있는데 내가 모른다"입니다. 로깅, 디버깅, 타입 무관 유틸에서만 쓰세요.

## `reified` — 타입 소거를 뚫는 유일한 방법

Java 제네릭은 런타임에 타입이 지워집니다(type erasure). 그래서 이게 안 됩니다.

```java
<T> boolean isType(Object o) {
    return o instanceof T;      // 컴파일 에러 — T 가 런타임에 없다
}
// 그래서 Class<T> 를 인자로 끌고 다녀야 했다
<T> List<T> pick(List<Object> src, Class<T> type) {
    ... type.isInstance(o) ...
}
```

Spring 코드 여기저기에 `Class<T> clazz` 파라미터가 붙어 있는 이유가 이것입니다.

Kotlin은 `inline` + `reified`로 **함수 본문을 호출 지점에 복사하면서 실제 타입을 박아 넣습니다.**

```kotlin
inline fun <reified T> List<Any>.pick(): List<T> {
    val result = mutableListOf<T>()
    for (element in this) {
        if (element is T) result.add(element)   // is T 가 된다
    }
    return result
}

val ints: List<Int> = mixed.pick()      // 호출 지점에서 T = Int 로 확정
```

`reified`는 **`inline` 함수에서만** 가능합니다. 인라인이 아니면 복사할 곳이 없으니 타입을 박을 수도 없어요. 실무에서는 `objectMapper.readValue<OrderDto>(json)`, `retrofit.create<ApiService>()` 같은 API가 전부 이 기법입니다.

> 면접 단골: **"`reified`가 타입 소거를 없애나요?"** → 아니오. JVM의 소거는 그대로입니다. 인라인 전개 시점에 구체 타입이 **코드로 박히는 것**뿐입니다. 그래서 `inline` 없이는 못 쓰고, 재귀 제네릭 호출에는 쓸 수 없습니다.

## 연습

변성과 `reified`를 직접 써봅니다.

1. `Source<T>` 에는 `out`, `Sink<T>` 에는 `in` 을 붙여 `main`의 대입 두 줄이 컴파일되게 하세요
2. `Box<*>` 를 받아 `"Box(size=N)"` 를 반환하는 `describe` 를 구현하세요 (star projection)
3. `inline fun <reified T> List<Any>.pick(): List<T>` 를 구현하세요 — `filterIsInstance` 사용 금지, `is T` 로 직접 거르세요

```kotlin starter
open class Animal(val name: String) {
    override fun toString(): String = "${this::class.simpleName}($name)"
}

class Dog(name: String) : Animal(name)

// TODO 1: Source 는 공변(out), Sink 는 반공변(in) 이 되도록 변성 키워드를 붙이세요.
interface Source<T> {
    fun next(): T
}

interface Sink<T> {
    fun accept(item: T)
}

class Box<T>(private val items: List<T>) {
    val size: Int get() = items.size
}

// TODO 2: star projection 을 받아 "Box(size=N)" 을 반환하는 describe 를 구현하세요.

// TODO 3: reified 를 써서 T 타입 원소만 골라내는 pick 을 구현하세요. (filterIsInstance 금지)

fun main() {
    val dogSource: Source<Dog> = object : Source<Dog> {
        override fun next(): Dog = Dog("초코")
    }
    val animalSink: Sink<Animal> = object : Sink<Animal> {
        override fun accept(item: Animal) {
            println("받음: $item")
        }
    }

    val source: Source<Animal> = dogSource   // out 이라야 컴파일된다
    val sink: Sink<Dog> = animalSink         // in 이라야 컴파일된다

    sink.accept(Dog("바둑"))
    println(source.next().name)

    val mixed: List<Any> = listOf(1, "hello", Dog("두부"), 2, Animal("나비"))
    println(mixed.pick<Int>())
    println(mixed.pick<Dog>())
    println(describe(Box(listOf("a", "b", "c"))))
}
```

```text expected
받음: Dog(바둑)
초코
[1, 2]
[Dog(두부)]
Box(size=3)
```

```text hint
변성은 외우는 게 아니라 **T 가 어디에 등장하는지 세어보는 것**입니다. 두 인터페이스를 다시 보세요. `Source` 의 `next(): T` 에서 T 는 **반환 위치**에만, `Sink` 의 `accept(item: T)` 에서 T 는 **파라미터 위치**에만 있습니다. 한쪽은 값을 내보내기만 하고, 다른 쪽은 받아먹기만 해요. 그다음 `main` 의 두 대입을 보세요 — `Source<Dog>` 를 `Source<Animal>` 자리에, `Sink<Animal>` 을 `Sink<Dog>` 자리에 넣습니다. **방향이 반대**죠. 이 두 사실이 짝을 이룹니다.
---
키워드는 `out` 과 `in` 둘뿐이고, 붙이는 자리는 **타입 파라미터 선언부** — `interface Source<___ T>` 의 빈칸입니다. 함수 시그니처나 사용하는 쪽이 아니라 **선언 한 곳**에만 붙인다는 게 Java 와 갈리는 지점이에요. 규칙은 하나: 타입이 **밖으로 나가기만** 하면 `out`, **안으로 들어오기만** 하면 `in`. `out` 은 Java 의 `? extends`, `in` 은 `? super` 에 대응합니다. 2번은 `Box<*>` 를 파라미터 타입으로 받으면 되고, 3번은 `is T` 를 쓰려면 함수 앞에 `inline`, 타입 파라미터 앞에 `reified` 가 필요합니다.
---
왜 그렇게 되는지 확인하고 가세요. `Source<Dog>` 에서 꺼내면 항상 `Dog` 고, `Dog` 는 `Animal` 이니 **`Source<Animal>` 로 읽어도 절대 안전**합니다 → 그래서 `out`, 하위 타입 방향이 그대로 따라갑니다(공변). 반대로 `Sink<Animal>` 은 `Animal` 이면 뭐든 받으니 `Dog` 만 넣는 `Sink<Dog>` 자리에 놓아도 안전하죠 → `in`, 방향이 뒤집힙니다(반공변). 붙여놓고 반대쪽 위치에 T 를 쓰면 컴파일러가 **"T occurs in 'in' position"** 으로 막아줍니다. `reified` 쪽도 이유가 같습니다 — JVM 은 런타임에 T 를 지우니까, `inline` 으로 **호출 지점에 본문을 복사하면서 T 를 실제 타입으로 박아 넣어야** `is T` 가 성립합니다. `inline` 없는 `reified` 는 문법 오류예요. 마지막으로 `Box<*>` 는 "원소 타입을 모른다" 는 뜻이라 원소는 `Any?` 로만 읽히지만, `size` 는 T 와 무관한 멤버라 **그대로 쓸 수 있습니다.**
---
뼈대입니다. 빈칸 네 개만 채우면 됩니다.

`interface Source<___ T> { fun next(): T }` / `interface Sink<___ T> { fun accept(item: T) }`

`fun describe(box: Box<___>): String = "Box(size=${box.size})"`

`inline fun <___ T> List<Any>.pick(): List<T> { val result = mutableListOf<T>(); for (element in this) { if (element ___ T) result.add(element) }; return result }`
```

```kotlin solution
open class Animal(val name: String) {
    override fun toString(): String = "${this::class.simpleName}($name)"
}

class Dog(name: String) : Animal(name)

// T 가 반환 위치에만 나오면 out(공변), 파라미터 위치에만 나오면 in(반공변). 선언 한 번으로 끝난다.
interface Source<out T> {
    fun next(): T
}

interface Sink<in T> {
    fun accept(item: T)
}

class Box<T>(private val items: List<T>) {
    val size: Int get() = items.size
}

// Box<*> — 원소 타입은 모르지만 size 는 T 와 무관한 멤버라 그대로 읽을 수 있다.
fun describe(box: Box<*>): String = "Box(size=${box.size})"

// reified 는 inline 함수에서만 가능하다. 호출 지점에 T 가 코드로 박혀야 is T 가 성립한다.
inline fun <reified T> List<Any>.pick(): List<T> {
    val result = mutableListOf<T>()
    for (element in this) {
        if (element is T) result.add(element)
    }
    return result
}

fun main() {
    val dogSource: Source<Dog> = object : Source<Dog> {
        override fun next(): Dog = Dog("초코")
    }
    val animalSink: Sink<Animal> = object : Sink<Animal> {
        override fun accept(item: Animal) {
            println("받음: $item")
        }
    }

    val source: Source<Animal> = dogSource   // out 이라야 컴파일된다
    val sink: Sink<Dog> = animalSink         // in 이라야 컴파일된다

    sink.accept(Dog("바둑"))
    println(source.next().name)

    val mixed: List<Any> = listOf(1, "hello", Dog("두부"), 2, Animal("나비"))
    println(mixed.pick<Int>())
    println(mixed.pick<Dog>())
    println(describe(Box(listOf("a", "b", "c"))))
}
```
