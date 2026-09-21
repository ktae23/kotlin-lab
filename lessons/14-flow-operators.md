# Lesson 14 — Flow 연산자와 배압

Flow를 "값이 흐르는 파이프"로 만들었다면, 이제 그 파이프에 **중간 장치**를 답니다. 대부분은 Java Stream / Reactor에서 이름이 같아 익숙하지만, **배압(backpressure)** 과 **컨텍스트**에서 사고방식이 달라집니다.

## 변환: map / filter / transform

```kotlin
flowOf(1, 2, 3, 4, 5)
    .filter { it % 2 == 1 }
    .map { "ORD-$it" }
    .collect { println(it) }
```

Java Stream과 겉보기엔 같지만 결정적 차이가 하나 있습니다. **Flow의 연산자 람다는 `suspend`입니다.**

```kotlin
orderIds()
    .map { id -> orderApi.fetch(id) }   // suspend 호출을 map 안에서 그냥 한다
    .collect { save(it) }               // collect 안에서도 suspend OK
```

Java Stream의 `map`에서는 블로킹 호출밖에 못 합니다. Reactor에서는 `flatMap`으로 감싸야 하고요. Flow는 **그냥 부릅니다.** 이 한 줄 차이가 코드 가독성의 대부분을 만듭니다.

`transform`은 "한 입력에 emit을 몇 번이든" 할 수 있는 만능 연산자입니다. `map`(1:1)도 `filter`(1:0 또는 1:1)도 사실 `transform`으로 만들어져 있어요.

```kotlin
flowOf(1, 2).transform { n -> emit("요청 $n"); emit("응답 $n") }
```

## 평탄화: flatMapConcat vs flatMapMerge

각 원소가 **또 다른 Flow**를 만들 때 씁니다. 주문 ID로 상세 내역 스트림을 여는 경우처럼요.

```kotlin
// 순서 보장 — 앞 Flow가 끝나야 다음 Flow를 연다 (순차)
ids.flatMapConcat { id -> detailsOf(id) }

// 동시 실행 — 여러 Flow를 동시에 열고 도착 순서대로 방출 (concurrency 기본 16)
ids.flatMapMerge { id -> detailsOf(id) }
```

| | `flatMapConcat` | `flatMapMerge` |
|---|---|---|
| 동시성 | 없음 (1개씩) | 여러 개 동시 |
| 순서 | **입력 순서 보장** | **보장 안 됨** |
| 속도 | 느림 | 빠름 |

> 실무 판단 기준: **순서가 의미를 갖는가?** 이벤트 소싱/상태 전이 로그면 `flatMapConcat`. 단순 조회 팬아웃이면 `flatMapMerge`. 면접에서 "왜 merge를 썼냐"에 "빠르니까"만 답하면 감점입니다. "순서 의존이 없어서"가 정답이에요.

`flatMapLatest`도 있습니다. 새 값이 오면 **진행 중이던 안쪽 Flow를 취소**합니다. 검색어 자동완성처럼 "최신 것만 의미 있는" 경우에 씁니다.

## 배압 — Flow의 기본값은 "같이 느려지기"

Flow는 기본적으로 **순차 실행**입니다. 생산자가 `emit`하면 그 자리에서 소비자 코드가 돌고, 끝나야 다음 `emit`으로 돌아옵니다. 즉 **총 시간 = (생산 + 소비) × N**.

```kotlin
// 생산 100ms, 소비 200ms, 3건 → 900ms
flow { repeat(3) { delay(100); emit(it) } }
    .collect { delay(200) }
```

이게 배압입니다. 별도 프로토콜 없이 `emit`이 `suspend`라서 저절로 걸리는 것. Reactor가 `request(n)` 신호를 주고받으며 구현하는 걸 Kotlin은 언어 기능으로 해결했습니다. **기본이 안전한 쪽**인 거죠. 문제는 느리다는 것이고, 조절 장치가 셋 있습니다.

### buffer — 생산과 소비를 분리한다

```kotlin
flow { ... }.buffer().collect { ... }   // 생산자는 별도 코루틴에서 앞서 달린다
```

생산자가 소비자를 기다리지 않고 **버퍼가 찰 때까지** 앞서 갑니다. 총 시간 ≈ max(생산, 소비) × N. **값은 하나도 버리지 않고 순서도 그대로**입니다. 버퍼가 가득 차면 그때 다시 `emit`이 멈춥니다.

### conflate — 중간 값을 버린다

```kotlin
flow { ... }.conflate().collect { ... }   // 소비자가 느리면 중간 값은 버린다
```

소비자가 한 건 처리하는 동안 3건이 들어왔다면 **마지막 1건만** 남기고 버립니다. 시세, 진행률, 센서 값처럼 **최신 값만 의미 있는** 데이터에 씁니다. 주문 이벤트에 쓰면 유실 사고예요.

### collectLatest — 처리 중이던 걸 취소한다

```kotlin
flow { ... }.collectLatest { value -> slowRender(value) }
```

새 값이 오면 **진행 중이던 collect 블록을 취소**하고 새로 시작합니다. `conflate`는 "처리 중인 건 끝까지 하고 중간 건 버림", `collectLatest`는 "처리 중인 것도 죽임". UI 렌더링이 대표적 용례입니다.

| 상황 | 선택 |
|---|---|
| 전부 처리해야 함, 빠르게 | `buffer` |
| 최신 값만 의미 있음, 처리는 완주 | `conflate` |
| 최신 값만 의미 있음, 낡은 작업은 취소 | `collectLatest` |

## flowOn — 업스트림 컨텍스트만 바꾼다

Lesson 13에서 "Flow는 스스로 스레드를 바꾸지 않는다"고 했습니다. 바꾸는 유일한 방법이 `flowOn`입니다.

```kotlin
flow { emit(jdbcQuery()) }   // ← 이 블록이 Dispatchers.IO 에서
    .map { it.toDto() }      // ← 이것도 IO 에서
    .flowOn(Dispatchers.IO)  // 경계선
    .collect { render(it) }  // ← collect 는 호출자 컨텍스트 그대로
```

`flowOn`은 **자기보다 위(upstream)에만** 적용됩니다. 아래는 절대 못 건드려요. 왜일까요?

**`collect`의 컨텍스트는 호출자가 정하는 것이기 때문**입니다. `withContext(Dispatchers.Main) { f.collect { ... } }` 라고 써놓은 호출자의 결정을, 라이브러리가 반환한 Flow 내부의 연산자가 뒤집어버리면 안 됩니다. 이 규칙 덕분에 **collect 블록이 어느 스레드에서 도는지는 호출 지점만 보면 압니다.** Reactor의 `publishOn`이 체인 어디에 있느냐에 따라 뒤쪽 스레드가 통째로 바뀌는 것과 정반대죠.

> 실무 경고: `flowOn(Dispatchers.IO)`를 체인 **맨 아래**에 붙여놓고 "왜 IO로 안 가지?"라고 묻는 일이 잦습니다. 맨 아래에 붙이면 체인 전체가 IO로 가는 게 맞고, 진짜 문제는 **collect 블록의 무거운 작업**이 여전히 호출자 스레드라는 점입니다.

## 결합: zip / combine

```kotlin
// zip — 짝을 맞춘다. 둘 다 새 값이 와야 방출. 짧은 쪽에서 끝남
namesFlow.zip(agesFlow) { n, a -> "$n($a)" }

// combine — 둘 중 하나만 새로 와도 방출 (나머지는 마지막 값 사용)
priceFlow.combine(qtyFlow) { p, q -> p * q }
```

`zip`은 **쌍**, `combine`은 **최신 상태 조합**입니다. 설정값 × 사용자 상태처럼 "각자 따로 변하는 두 상태의 현재 조합"이 필요하면 `combine`이에요.

## 관찰: onEach / onCompletion

```kotlin
flow
    .onEach { log.debug("처리 {}", it) }     // 값마다 부수효과, 값은 그대로 통과
    .onCompletion { cause ->                 // 정상 종료/예외/취소 전부에서 호출
        if (cause == null) log.info("완료") else log.error("실패", cause)
    }
    .collect { save(it) }
```

`onCompletion`은 `finally`의 Flow 버전입니다. **취소될 때도 호출된다**는 게 핵심이고, `cause`로 원인을 구분합니다.

## StateFlow / SharedFlow — 개념만

지금까지는 전부 **콜드**였습니다. 구독자마다 처음부터 다시 실행. 반대편에 **핫(hot) 스트림**이 있습니다.

- **`SharedFlow`** — 구독자가 없어도 흐릅니다. 여러 구독자가 **같은** 방출을 나눠 봅니다. 이벤트 브로드캐스트용.
- **`StateFlow`** — `SharedFlow`의 특수형. **항상 현재 값 하나를 들고 있고**, 구독하면 그 값부터 받습니다. 같은 값 연속 방출은 무시(conflate). 상태 보관용.

Spring 쪽 비유로는 `SharedFlow`가 애플리케이션 이벤트 버스, `StateFlow`가 관찰 가능한 싱글턴 상태에 가깝습니다. 자세한 건 별도 주제고, 지금은 **"콜드 = 레시피, 핫 = 이미 흐르는 물"** 구분만 확실히 하세요.

## 연습

세 개의 파이프라인을 완성하세요. (`flatMapConcat`은 `@OptIn(FlowPreview::class)` 가 이미 붙어 있습니다.)

1. `flowOf(1..5)` → 홀수만 → `"ORD-$it"` 로 변환 → `onEach` 로 `로그: $it` → `onCompletion` 으로 `파이프라인 완료` → `collect` 에서 `수집: $it`
2. `flowOf("A", "B")` 를 `flatMapConcat` 으로 각각 `"$id-1"`, `"$id-2"` 두 값으로 펼쳐 `펼침: $it` 출력 (순서 보장 확인)
3. `flowOf("김", "이", "박")` 과 `flowOf(30, 40, 50)` 을 `zip` 으로 `"이름(나이)"` 형태로 묶어 `zip: $it` 출력

1번에서 `로그:` 와 `수집:` 이 **번갈아** 찍히는 걸 확인하세요. `onEach`가 원소 단위로 업스트림에서 도는 증거입니다.

```kotlin starter
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.flatMapConcat
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.onCompletion
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.zip
import kotlinx.coroutines.runBlocking

@OptIn(FlowPreview::class)
fun main() = runBlocking {
    // TODO: 1) filter → map → onEach → onCompletion → collect

    // TODO: 2) flatMapConcat 으로 펼치기

    // TODO: 3) zip 으로 두 Flow 묶기
}
```

```text expected
로그: ORD-1
수집: ORD-1
로그: ORD-3
수집: ORD-3
로그: ORD-5
수집: ORD-5
파이프라인 완료
펼침: A-1
펼침: A-2
펼침: B-1
펼침: B-2
zip: 김(30)
zip: 이(40)
zip: 박(50)
```

```text hint
Flow 연산자는 **붙인 순서가 곧 파이프의 위아래**입니다. `collect` 위에 달린 건 전부 업스트림이고, 값 **하나**가 파이프 끝까지 내려간 뒤에야 다음 값이 출발합니다. 1번에서 `로그:` 와 `수집:` 이 번갈아 찍히는 이유가 바로 이것 — `onEach` 를 `collect` **위**에 달았기 때문입니다.
---
쓸 연산자는 이미 import 에 다 들어 있습니다. 1번은 `filter` → `map` → `onEach` → `onCompletion` → `collect`, 2번은 `flatMapConcat`, 3번은 `zip`. `onCompletion` 의 람다 파라미터는 종료 원인(`cause`)이라 이번 연습에서는 안 써도 됩니다.
---
`flatMapConcat` 의 람다는 값이 아니라 **Flow 를 반환**해야 합니다. `"A"` 하나로 두 값을 만들려면 그 자리에서 `flowOf(...)` 를 새로 열면 돼요. `concat` 이라 앞 Flow 를 끝까지 소진한 뒤 다음 Flow 를 열기 때문에 `A-1, A-2, B-1, B-2` 순서가 보장됩니다. 참고로 `flatMapConcat` 은 `@FlowPreview` 라 `@OptIn(FlowPreview::class)` 이 필요한데, starter 의 `main` 에 이미 붙어 있습니다. `zip` 은 수신 Flow에 상대 Flow와 결합 람다를 함께 넘겨 **양쪽에서 한 개씩 짝**을 맞춥니다.
---
뼈대는 이렇습니다. 세 파이프라인 모두 마지막이 `collect` 로 끝나요.

1번: `flowOf(1, 2, 3, 4, 5).filter { ___ }.map { ___ }.onEach { println("로그: $it") }.onCompletion { ___ }.collect { ___ }`

2번: `flowOf("A", "B").flatMapConcat { id -> ___ }.collect { println("펼침: $it") }`

3번: `flowOf("김", "이", "박").zip(___) { name, age -> ___ }.collect { println("zip: $it") }`
```

```kotlin solution
import kotlinx.coroutines.FlowPreview
import kotlinx.coroutines.flow.filter
import kotlinx.coroutines.flow.flatMapConcat
import kotlinx.coroutines.flow.flowOf
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.onCompletion
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.flow.zip
import kotlinx.coroutines.runBlocking

@OptIn(FlowPreview::class)
fun main() = runBlocking {
    // 1) onEach 는 업스트림이라 collect 보다 먼저 돈다 → 로그/수집이 번갈아 찍힌다.
    flowOf(1, 2, 3, 4, 5)
        .filter { it % 2 == 1 }
        .map { "ORD-$it" }
        .onEach { println("로그: $it") }
        .onCompletion { println("파이프라인 완료") }
        .collect { println("수집: $it") }

    // 2) flatMapConcat 은 앞 Flow 를 끝까지 소진한 뒤 다음 Flow 를 연다 → 입력 순서 보장.
    flowOf("A", "B")
        .flatMapConcat { id -> flowOf("$id-1", "$id-2") }
        .collect { println("펼침: $it") }

    // 3) zip 은 양쪽에서 한 개씩 짝을 맞춰 방출한다. 짧은 쪽에서 끝난다.
    flowOf("김", "이", "박")
        .zip(flowOf(30, 40, 50)) { name, age -> "$name($age)" }
        .collect { println("zip: $it") }
}
```
