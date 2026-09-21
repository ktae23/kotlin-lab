# Lesson 34 — Flow 기초

`suspend` 함수는 **값 하나**를 비동기로 돌려줍니다. 그런데 실무에서 필요한 건 대부분 **값 여러 개가 시간에 걸쳐 흘러나오는 것**이죠. 페이징된 API 응답, DB 커서, Kafka 컨슈머, 서버 이벤트 스트림. 여기에 쓰는 게 `Flow`입니다.

## 왜 `List`가 아닌가

Java/Spring에서 대량 조회를 이렇게 짜 보셨을 겁니다.

```java
// 100만 건을 전부 메모리에 올린다 → OOM
List<Order> orders = orderRepository.findAllByStatus(PENDING);
for (Order o : orders) { process(o); }
```

`suspend fun fetchAll(): List<Order>` 도 똑같은 문제를 갖습니다. **전부 모일 때까지 아무것도 못 하고, 다 모이면 전부 메모리에 있습니다.**

```kotlin
fun fetchAll(): Flow<Order>   // 한 건씩 흘려보낸다
```

`Flow`가 주는 것은 세 가지입니다.

1. **전체를 메모리에 올리지 않는다** — 한 건 만들고, 한 건 처리하고, 버린다
2. **생산도 소비도 `suspend`할 수 있다** — 스레드를 막지 않고 I/O를 기다린다
3. **취소 가능하다** — 코루틴 취소가 스트림 중단으로 그대로 전파된다

| | `suspend fun`: T | `suspend fun`: List\<T\> | `Flow<T>` |
|---|---|---|---|
| 값의 개수 | 1개 | N개 (한 번에) | N개 (시간에 걸쳐) |
| 첫 값까지 | 즉시 | **전부 끝나야** | 즉시 |
| 메모리 | O(1) | **O(N)** | O(1) |

## 콜드 스트림(cold stream)

이게 Flow 이해의 핵심입니다. **`Flow`는 레시피지 음식이 아닙니다.**

```kotlin
fun orderIds(): Flow<String> = flow {
    println("[flow] 블록 시작")
    emit("ORD-1")
    emit("ORD-2")
}

val f = orderIds()   // 아무것도 출력되지 않는다. 아직 실행 안 됨
```

`flow { }` 블록은 **`collect`를 부르는 순간에야** 실행됩니다. 그리고 `collect`를 두 번 부르면 **블록이 두 번 처음부터 실행됩니다.** 구독자마다 독립된 실행이에요.

Java의 `Stream`도 똑같이 게으르고 일회성이지만, 결정적 차이가 있습니다. `Stream`은 **한 번 소비하면 끝**(재사용 시 `IllegalStateException`)인 반면, `Flow`는 **몇 번이든 다시 collect 할 수 있습니다.** `Flow`는 스트림 객체가 아니라 "어떻게 만들지"의 선언이니까요.

> 실무 함정: `flow { }` 안에 DB 조회나 HTTP 호출을 넣어두고 collect를 두 번 하면 **쿼리가 두 번 나갑니다.** 이게 버그인지 의도인지는 설계자가 정해야 합니다.

## 만드는 법 3가지

```kotlin
// 1. flow { } — 가장 일반적. 안에서 suspend 호출 가능
fun pages(): Flow<Page> = flow {
    var cursor: String? = null
    do {
        val page = api.fetch(cursor)   // suspend 호출 OK
        emit(page)
        cursor = page.next
    } while (cursor != null)
}

// 2. flowOf — 고정된 값들
flowOf(1, 2, 3)

// 3. asFlow — 기존 컬렉션/시퀀스/Range 를 Flow 로
listOf("a", "b").asFlow()
(1..100).asFlow()
```

`emit()`은 `suspend` 함수입니다. 다운스트림이 느리면 `emit`이 **알아서 멈춰 기다립니다.** 별도 장치 없이 배압(backpressure)이 공짜로 따라오는 구조예요 (Lesson 14).

## 종단 연산자(terminal operator)

`map`, `filter` 같은 중간 연산자는 **Flow를 반환할 뿐 아무것도 실행하지 않습니다.** 실행은 종단 연산자가 시킵니다.

```kotlin
val sum = flowOf(1, 2, 3).map { it * 2 }.toList()   // toList 가 종단
flowOf(1, 2, 3).collect { println(it) }             // collect 가 종단
```

`collect`, `toList`, `first`, `single`, `reduce`, `fold`, `count` — 전부 `suspend` 함수입니다. **그래서 Flow를 소비하려면 코루틴 안이어야 합니다.** Java `Stream.collect()`가 그냥 블로킹 호출인 것과 여기서 갈립니다.

## Reactor `Flux`와의 대조 — 여기가 면접 포인트

Spring WebFlux를 하셨다면 "그래서 Flux랑 뭐가 다른데?"가 바로 나올 겁니다.

| | Reactor `Flux` | Kotlin `Flow` |
|---|---|---|
| 스타일 | 연산자 체인 (람다 조합) | **보통의 순차 코드** (for, if, try) |
| 배압 | `request(n)` 프로토콜 | `suspend` 자체가 배압 |
| 스레드 전환 | `subscribeOn` / `publishOn` | `flowOn` (업스트림만) |
| 취소 | `Disposable.dispose()` | 코루틴 구조적 동시성에 흡수 |
| 예외 | `onErrorResume` 등 | `try/catch` + `catch` 연산자 |

체감상 가장 큰 차이는 **`flow { }` 안에서는 그냥 평범한 코드를 쓴다**는 겁니다. 루프, 조건문, `try/finally`가 다 그대로 동작해요. Flux에서 `flatMap` 중첩으로 표현하던 것이 Flow에서는 그냥 `for` 문입니다.

## Flow는 스스로 스레드를 바꾸지 않는다

**이거 하나만 가져가셔도 됩니다.**

```kotlin
withContext(Dispatchers.IO) {
    orderIds().collect { println(it) }   // flow 블록도 IO 에서 실행된다
}
```

`flow { }` 블록은 **collect를 호출한 코루틴의 컨텍스트에서 그대로 실행됩니다.** Flow 자체는 스레드 정책을 갖지 않아요. 이걸 **컨텍스트 보존(context preservation)** 이라고 부릅니다.

그래서 `flow { }` 안에서 `withContext(Dispatchers.IO) { emit(...) }` 를 하면 **런타임 예외**가 납니다. "emit은 네가 만들어진 컨텍스트에서만 해라"라는 규칙이에요. 스레드를 바꾸고 싶으면 `flowOn`을 씁니다 (Lesson 14).

Reactor의 `publishOn`이 체인 위치에 따라 마법처럼 스레드를 옮기던 것과 정반대 철학입니다. Flow는 **명시적으로 시키지 않으면 아무 데도 안 갑니다.** 추적하기 쉬운 대신 직접 지정해야 해요.

## 언제 Flow를 쓰지 말아야 하나

값이 하나면 그냥 `suspend fun`을 쓰세요. `Flow<User>`를 반환해놓고 항상 한 건만 emit하는 API는 호출자에게 불필요한 부담만 줍니다. **"여러 개가, 시간에 걸쳐" 두 조건이 모두 참일 때만** Flow입니다.

## 연습

`orderIds()`를 `flow { }` 로 구현하고, main에서 **같은 Flow를 두 번 collect** 해서 콜드 스트림임을 눈으로 확인하세요.

- `orderIds()`: 블록 진입 시 `[flow] 블록 시작` 출력 → `1..3` 을 돌며 `delay(10)` 후 `ORD-$i` 를 emit
- main: Flow를 만든 직후 `flow 생성 — 아직 아무것도 실행 안 됨` 출력
- 1차는 `1차 수집: ...`, 2차는 `2차 수집: ...` 로 출력
- 마지막에 `listOf("kim", "lee")` 를 `asFlow()` → `map` 으로 대문자화 → `toList()` 해서 통째로 출력

`[flow] 블록 시작`이 **두 번** 찍히면 콜드 스트림을 이해한 겁니다.

```kotlin starter
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.asFlow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.runBlocking

fun orderIds(): Flow<String> = TODO("flow { } 로 구현하세요")

fun main() = runBlocking {
    val orders = orderIds()
    println("flow 생성 — 아직 아무것도 실행 안 됨")

    // TODO: orders 를 collect 해서 "1차 수집: $it" 출력
    // TODO: 같은 orders 를 다시 collect 해서 "2차 수집: $it" 출력

    val names: List<String> = TODO("asFlow + map + toList 로 만드세요")
    println(names)
}
```

```text expected
flow 생성 — 아직 아무것도 실행 안 됨
[flow] 블록 시작
1차 수집: ORD-1
1차 수집: ORD-2
1차 수집: ORD-3
[flow] 블록 시작
2차 수집: ORD-1
2차 수집: ORD-2
2차 수집: ORD-3
[KIM, LEE]
```

```text hint
`flow { }` 는 **레시피지 음식이 아닙니다.** 그러니 `orderIds()` 를 호출하는 것만으로는 블록 안의 `println` 이 절대 찍히지 않아요. 기대 출력에 `[flow] 블록 시작` 이 **두 번** 있다는 걸 보세요. 그 두 번을 만들려고 따로 뭔가 할 필요는 없습니다 — 왜 저절로 두 번이 되는지가 이 연습의 전부입니다.
---
만드는 건 `flow { }` 와 그 안의 `emit()`, 소비하는 건 `collect { }` 입니다. 마지막 줄은 `asFlow()` → `map { }` → `toList()` 세 단계를 이으면 됩니다.
---
`[flow] 블록 시작` 은 `emit` 루프보다 **앞**, 블록 최상단에 둡니다. 콜드 스트림이라 `collect` 를 부를 때마다 블록이 **처음부터 다시 실행**되고, 그래서 1차·2차 수집 앞에 각각 한 번씩 저절로 찍히는 거예요. 같은 `orders` 변수를 두 번 `collect` 하면 됩니다. `flow { }` 안은 평범한 코드라 `for (i in 1..3)` 을 그냥 쓰면 되고, `collect` 와 `toList` 는 둘 다 `suspend` 종단 연산자라서 `runBlocking` 안에서만 호출됩니다.
---
뼈대는 이렇습니다. `fun orderIds(): Flow<String> = flow { println("[flow] 블록 시작"); for (i in 1..3) { delay(10); ___("ORD-$i") } }`, main 에서는 `orders.collect { println("1차 수집: $it") }` 를 문구만 바꿔 두 번, 그리고 `listOf("kim", "lee").asFlow().map { it.___() }.toList()`.
```

```kotlin solution
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.asFlow
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.runBlocking

// 콜드 스트림 — collect 할 때마다 이 블록이 처음부터 다시 실행된다.
fun orderIds(): Flow<String> = flow {
    println("[flow] 블록 시작")
    for (i in 1..3) {
        delay(10)
        emit("ORD-$i")
    }
}

fun main() = runBlocking {
    val orders = orderIds()
    println("flow 생성 — 아직 아무것도 실행 안 됨")

    orders.collect { println("1차 수집: $it") }
    orders.collect { println("2차 수집: $it") }

    val names: List<String> = listOf("kim", "lee").asFlow().map { it.uppercase() }.toList()
    println(names)
}
```
