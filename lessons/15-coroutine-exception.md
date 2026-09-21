# Lesson 15 — 코루틴 예외 처리

여기가 코루틴에서 **가장 많이 틀리는 곳**입니다. Java에서 `try/catch`는 배신한 적이 없었죠. 코루틴에서는 **`try`로 감쌌는데 안 잡히는 자리**가 있습니다. 규칙을 모르면 프로덕션에서 조용히 죽는 코루틴을 만들게 됩니다.

## 출발점: 예외는 Job 트리를 타고 올라간다

Java 스레드는 예외가 터지면 그 스레드만 죽고 끝입니다. 코루틴은 다릅니다. **구조적 동시성** 때문에 자식이 실패하면 예외가 **부모로 전파**되고, 부모는 **나머지 자식들을 전부 취소**한 뒤 자기 부모로 다시 올립니다.

Spring의 `@Transactional` 롤백과 비슷한 정서입니다. **하나가 실패하면 그 범위 전체가 무효.** 기본값이 그렇습니다.

## launch vs async — 전파 시점이 다르다

```kotlin
// launch: 터지는 즉시 부모로 전파된다. 반환값이 없으니 알릴 곳이 그것뿐
launch { throw IllegalStateException("결제 실패") }

// async: 예외를 Deferred 안에 담아둔다. await() 할 때 다시 던진다
val d = async { throw IllegalStateException("재고 부족") }
d.await()   // ← 여기서 던져진다
```

**여기 함정이 있습니다.** `await()`를 `try/catch`로 잡아도, `coroutineScope` 안의 `async`라면 **예외는 이미 부모에게도 전파된 뒤**입니다. 잡아봐야 스코프 전체가 취소돼요. `async`의 실패를 **호출 지점에서만** 처리하고 싶다면 `supervisorScope`가 필요합니다.

```kotlin
supervisorScope {
    val d = async<Int> { throw IllegalStateException("재고 부족") }
    try { d.await() } catch (e: IllegalStateException) { /* 여기서 끝난다 */ }
}
```

## SupervisorJob — 전파를 아래로만 흐르게

`Job`과 `SupervisorJob`의 차이는 **자식 실패가 위로 올라가느냐**입니다.

| | `Job` (기본) | `SupervisorJob` / `supervisorScope` |
|---|---|---|
| 자식 하나 실패 시 | 부모·형제 전부 취소 | **그 자식만** 실패 |
| 부모 취소 시 | 자식 전부 취소 | 자식 전부 취소 (동일) |

```kotlin
supervisorScope {
    launch { throw RuntimeException("A 실패") }   // 얘만 죽고
    launch { delay(100); println("B는 살아남음") } // 얘는 완주한다
}
```

실무 기준: **여러 독립 작업을 병렬로 돌릴 때는 `supervisorScope`**, **전부 성공해야 의미 있을 때는 `coroutineScope`**. 알림 5개를 각 채널로 보내는 건 supervisor, 주문 생성 + 재고 차감은 coroutineScope입니다.

> `CoroutineScope(SupervisorJob())`을 만들어놓고 `scope.launch { ... }` 안에서 또 `launch`를 하면, **안쪽 launch는 supervisor가 아닙니다.** SupervisorJob은 **직계 자식에게만** 적용돼요. 이게 "분명 SupervisorJob 썼는데 다 죽는다"의 원인 1위입니다.

## try/catch 가 먹히는 자리, 안 먹히는 자리

```kotlin
try { scope.launch { risky() } } catch (e: Exception) { }   // ❌ 안 잡힌다
scope.launch { try { risky() } catch (e: Exception) { } }   // ✅ 코루틴 "안"을 감쌌다
try { coroutineScope { launch { risky() } } } catch (e: Exception) { }  // ✅ suspend 함수라 유효
```

**기준은 하나입니다: `try` 블록 안에서 예외가 *발생*하는가, 아니면 *다른 코루틴으로 넘어간 뒤* 발생하는가.** `launch`는 코루틴을 띄우고 즉시 반환하므로 그 안의 예외는 `try`가 끝난 뒤에 터집니다. Java에서 `executor.submit()`을 `try`로 감싸도 태스크 예외가 안 잡히는 것과 똑같습니다.

## CoroutineExceptionHandler — 최후의 그물

어디서도 안 잡힌 예외의 **마지막 목적지**입니다. Java의 `Thread.UncaughtExceptionHandler`와 같은 위치예요.

```kotlin
val handler = CoroutineExceptionHandler { _, e -> log.error("처리 안 된 예외", e) }
val scope = CoroutineScope(SupervisorJob() + handler)
scope.launch { throw RuntimeException("결제 승인 실패") }
```

**동작 조건이 까다롭습니다.**

1. **`launch`에만** 유효합니다. `async`의 예외는 `Deferred`가 들고 있으므로 핸들러가 안 불립니다 (`await` 안 하면 그냥 삼켜짐).
2. **루트 코루틴에만** 유효합니다. 자식 `launch`에 핸들러를 달아도 무시되고, 예외는 부모로 올라가 **부모의 핸들러**가 씁니다.
3. 예외를 **잡는 게 아닙니다.** 이미 코루틴은 죽었고, 로깅/알림만 하는 자리입니다.

예외 하나: `supervisorScope`의 **직계 자식은 루트 취급**이라, 거기 붙인 핸들러는 동작합니다.

```kotlin
supervisorScope {
    launch(handler) { throw RuntimeException("결제 승인 실패") }  // handler 동작
}
```

## Flow의 catch 와 예외 투명성

Flow에서는 `try/catch`로 체인을 감싸지 않습니다. **`catch` 연산자**를 씁니다.

```kotlin
flow { emit(1); emit(2); throw IllegalStateException("스트림 중단") }
    .catch { e ->
        println("catch: ${e.message}")
        emit(-1)              // 폴백 값을 흘려보낼 수 있다
    }
    .collect { println("값: $it") }
```

`catch`는 **자기보다 위(upstream)의 예외만** 잡습니다. `flowOn`과 같은 방향성이에요. 아래쪽 `collect` 블록에서 난 예외는 못 잡습니다.

이게 **예외 투명성(exception transparency)** 원칙입니다. "업스트림은 다운스트림의 예외를 삼켜서는 안 된다." 만약 `flow { try { ... emit(x) ... } catch { } }` 처럼 `emit`을 `try`로 감싸면, **소비자가 낸 예외를 생산자가 먹어버리는** 일이 생깁니다. 그래서 Kotlin은 이 패턴을 런타임에 검출해 `IllegalStateException: Flow exception transparency is violated`을 던집니다.

> 규칙: **`flow { }` 안에서 `emit`을 `try/catch`로 감싸지 마라.** 폴백이 필요하면 밖에서 `catch` 연산자로.

`collect` 블록의 예외를 처리하려면, 순서를 뒤집어 `onEach`로 소비를 올리고 그 아래 `catch`를 답니다.

```kotlin
flow.onEach { save(it) }.catch { e -> alert(e) }.collect()
```

## CancellationException — 절대 잡지 마라

취소는 **정상 동작**입니다. 코루틴이 취소되면 `CancellationException`이 던져지고, 이 예외는 **부모로 전파되지 않고 핸들러도 안 탑니다.** 코루틴 시스템의 내부 신호예요.

```kotlin
// ❌ 취소를 삼킨다 — CancellationException 도 Exception 이다
try { doWork() } catch (e: Exception) { log.error("실패", e) }

// ✅ 취소는 다시 던진다
try { doWork() }
catch (e: CancellationException) { throw e }
catch (e: Exception) { log.error("실패", e) }
```

`catch (e: Exception)` 한 줄이 **취소 불가능한 좀비 코루틴**을 만듭니다. 서버 종료가 안 되거나, 타임아웃이 안 먹거나, 요청이 끊겼는데 작업이 계속 도는 장애의 원인이에요.

**면접 단골입니다.** "코루틴에서 `catch (e: Exception)`의 문제가 뭐냐"에 답할 수 있어야 합니다. 정리 코드가 필요하면 `try/finally`나 `onCompletion`을 쓰세요 — 취소 시에도 불립니다.

## 정리

| 상황 | 도구 |
|---|---|
| `async` 결과의 실패 | `await()`를 `try/catch` (+ `supervisorScope`) |
| 독립 작업의 실패 격리 | `supervisorScope` / `SupervisorJob` |
| 안 잡힌 예외 로깅 | `CoroutineExceptionHandler` (루트 launch 한정) |
| Flow 업스트림 실패 | `catch` 연산자 |
| 성공/실패/취소 공통 정리 | `try/finally`, `onCompletion` |
| 취소 | **잡지 말 것** (잡았으면 rethrow) |

## 연습

세 단계를 완성하세요. 예외는 전부 **직접 던진 고정 메시지**를 씁니다.

1. `step1()` — `supervisorScope` 안에서 `async<Int>` 가 `IllegalStateException("재고 부족")` 을 던지게 하고, `await()` 를 `try/catch` 로 잡아 `1) await 에서 잡음: ${e.message}` 출력
2. `step2()` — `CoroutineExceptionHandler` 를 만들어 `2) 핸들러: ${e.message}` 를 출력하게 하고, `supervisorScope` 안에서 핸들러를 단 `launch` 가 `RuntimeException("결제 승인 실패")` 를 던지게 합니다. 두 번째 `launch` 는 `delay(100)` 후 `2) 형제는 살아남음` 을 출력 — 형제가 안 죽는 걸 확인
3. `step3()` — `1`, `2` 를 emit한 뒤 `IllegalStateException("스트림 중단")` 을 던지는 Flow에 `catch` 를 달아 `3) flow catch: ${e.message}` 출력 후 `-1` 을 emit. `collect` 는 `3) 값: $it` 출력

```kotlin starter
import kotlinx.coroutines.CoroutineExceptionHandler
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.supervisorScope

suspend fun step1() {
    // TODO: supervisorScope + async + await 를 try/catch
}

suspend fun step2() {
    // TODO: CoroutineExceptionHandler 를 만들고 supervisorScope 에서 launch 두 개
}

suspend fun step3() {
    // TODO: flow { } + catch 연산자 + collect
}

fun main() = runBlocking {
    step1()
    step2()
    step3()
}
```

```text expected
1) await 에서 잡음: 재고 부족
2) 핸들러: 결제 승인 실패
2) 형제는 살아남음
3) 값: 1
3) 값: 2
3) flow catch: 스트림 중단
3) 값: -1
```

```text hint
세 단계 모두 **"예외가 어디서 다시 던져지는가"** 를 먼저 정해야 `try` 자리가 정해집니다. `launch` 는 터지는 **즉시** 부모로 올라가서 `try` 로 잡을 기회조차 없고, `async` 는 예외를 `Deferred` 에 담아뒀다가 `await()` 하는 **그 줄에서** 다시 던집니다. Flow 는 또 달라서 `try` 가 아니라 전용 연산자를 씁니다.
---
쓸 도구는 import 에 다 있습니다. 1번은 `supervisorScope` + `async` + `await()`, 2번은 `CoroutineExceptionHandler` + `launch(handler)` + `delay`, 3번은 `flow { }` + `catch` + `collect`. `async<Int> { throw ... }` 처럼 **타입 인자를 명시**해야 컴파일러가 반환 타입을 정할 수 있습니다.
---
2번이 핵심입니다. `CoroutineExceptionHandler` 는 **`launch` 에만**, 그것도 **루트 코루틴에만** 동작합니다 (`async` 의 예외는 `Deferred` 가 들고 있어서 핸들러까지 안 갑니다). 예외적으로 `supervisorScope` 의 **직계 자식은 루트 취급**이라 거기 붙인 핸들러는 동작하고, supervisor라서 형제 `launch` 는 죽지 않고 완주합니다. 3번의 `catch` 는 **자기보다 위(업스트림)의 예외만** 잡고, 그 안에서 폴백 값을 `emit` 할 수 있습니다 — 그래서 `-1` 이 `collect` 까지 내려갑니다.
---
뼈대는 이렇습니다. 빈칸만 채우면 돼요.

`step1`: `supervisorScope { val d = async<Int> { throw ___ }; try { d.await() } catch (e: IllegalStateException) { println("1) await 에서 잡음: ${e.message}") } }`

`step2`: `val handler = CoroutineExceptionHandler { _, e -> ___ }` 를 만든 뒤 `supervisorScope { launch(handler) { throw ___ }; launch { delay(100); ___ } }`

`step3`: `flow { emit(1); emit(2); throw ___ }.catch { e -> println("3) flow catch: ${e.message}"); emit(___) }.collect { ___ }`
```

```kotlin solution
import kotlinx.coroutines.CoroutineExceptionHandler
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.catch
import kotlinx.coroutines.flow.flow
import kotlinx.coroutines.launch
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.supervisorScope

// async 는 예외를 Deferred 에 담아두므로 await() 하는 지점에서 다시 던져진다.
// supervisorScope 라서 그 예외가 부모까지 올라가지 않고 여기서 끝난다.
suspend fun step1() {
    supervisorScope {
        val deferred = async<Int> { throw IllegalStateException("재고 부족") }
        try {
            deferred.await()
        } catch (e: IllegalStateException) {
            println("1) await 에서 잡음: ${e.message}")
        }
    }
}

// CoroutineExceptionHandler 는 launch 에만, 그것도 루트 코루틴에만 붙는다.
// supervisorScope 의 직계 자식은 루트 취급이라 여기서는 동작하고, 형제는 죽지 않는다.
suspend fun step2() {
    val handler = CoroutineExceptionHandler { _, e -> println("2) 핸들러: ${e.message}") }
    supervisorScope {
        launch(handler) { throw RuntimeException("결제 승인 실패") }
        launch {
            delay(100)
            println("2) 형제는 살아남음")
        }
    }
}

// catch 는 자기보다 위(업스트림)의 예외만 잡는다. 그 안에서 폴백 값을 emit 할 수 있다.
suspend fun step3() {
    flow {
        emit(1)
        emit(2)
        throw IllegalStateException("스트림 중단")
    }
        .catch { e ->
            println("3) flow catch: ${e.message}")
            emit(-1)
        }
        .collect { println("3) 값: $it") }
}

fun main() = runBlocking {
    step1()
    step2()
    step3()
}
```
