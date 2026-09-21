// Kotlin Lab — Java 개발자를 위한 간이 학습 서버 (의존성 없음, 로컬 전용)
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const LESSONS_DIR = path.join(__dirname, "lessons");
const PUBLIC_DIR = path.join(__dirname, "public");
const WORKSPACE_DIR = path.join(__dirname, "workspace");
const RUN_DIR = path.join(__dirname, ".run");
const LIB_DIR = path.join(__dirname, "lib");
const PORT = Number(process.env.PORT) || 3838;

// lib/*.jar 을 컴파일·실행 클래스패스에 얹는다.
// kotlinc 는 stdlib 만 번들하므로 코루틴 레슨(Week 4~5)에는 외부 jar 이 필요하다.
// 없으면 `bash scripts/fetch-deps.sh` 로 받는다.
function libClasspath(): string {
  if (!fs.existsSync(LIB_DIR)) return "";
  return fs
    .readdirSync(LIB_DIR)
    .filter((f) => f.endsWith(".jar"))
    .map((f) => path.join(LIB_DIR, f))
    .join(path.delimiter);
}

const COMPILE_TIMEOUT_MS = 90_000; // 첫 실행은 Kotlin 데몬 기동 때문에 오래 걸린다
const RUN_TIMEOUT_MS = 15_000;

type RunResult = {
  ok: boolean;
  phase: "compile" | "run";
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
};

type Exercise = {
  prompt: string;
  starter: string;
  expected: string;
  hints: string[];      // ```text hint``` 을 `---` 로 나눈 단계별 힌트
  solution: string | null; // ```kotlin solution```
};
type Lesson = { id: string; title: string; order: number; theory: string; exercise: Exercise | null };

fs.mkdirSync(WORKSPACE_DIR, { recursive: true });
fs.mkdirSync(RUN_DIR, { recursive: true });

// ---------------------------------------------------------------- 레슨 파싱

// 레슨 형식: 마크다운 이론 + "## 연습" 섹션 + ```kotlin starter / ```text expected 펜스
function parseLesson(file: string): Lesson {
  const raw = fs.readFileSync(path.join(LESSONS_DIR, file), "utf-8");
  const id = file.replace(/\.md$/, "");
  const order = Number.parseInt(id.slice(0, 2), 10) || 999;
  const title = raw.match(/^#\s+(.+)$/m)?.[1].trim() ?? id;

  const starter = raw.match(/```kotlin starter\n([\s\S]*?)```/);
  const expected = raw.match(/```text expected\n([\s\S]*?)```/);
  const prompt = raw.match(/##\s*연습\s*\n([\s\S]*?)(?=```kotlin starter)/);
  const hint = raw.match(/```text hint\n([\s\S]*?)```/);
  const solution = raw.match(/```kotlin solution\n([\s\S]*?)```/);

  // 힌트는 `---` 한 줄로 나눠 단계별로 공개한다. 블록이 없으면 빈 배열.
  const hints = hint
    ? hint[1]
        .split(/^---$/m)
        .map((h) => h.trim())
        .filter(Boolean)
    : [];

  return {
    id,
    title,
    order,
    theory: raw.split(/^##\s*연습\s*$/m)[0].trim(),
    exercise:
      starter && expected
        ? {
            prompt: prompt?.[1].trim() ?? "",
            starter: starter[1].replace(/\n$/, ""),
            expected: expected[1].trim(),
            hints,
            solution: solution ? solution[1].replace(/\n$/, "") : null,
          }
        : null,
  };
}

// ------------------------------------------------------------------ 진도
// curriculum/progress.md 의 레슨 체크리스트 행을 읽고 쓴다.
//   | [ ] | 01 | null 안정성 | W1 |  |  |  |
const PROGRESS_FILE = path.join(__dirname, "curriculum", "progress.md");
const progressRow = (num: string) =>
  new RegExp(`^\\|\\s*\\[([ xX])\\]\\s*\\|\\s*${num}\\s*\\|(.*)$`, "m");

function readProgress(): string[] {
  if (!fs.existsSync(PROGRESS_FILE)) return [];
  const done: string[] = [];
  for (const line of fs.readFileSync(PROGRESS_FILE, "utf-8").split("\n")) {
    const m = line.match(/^\|\s*\[([ xX])\]\s*\|\s*(\d{2})\s*\|/);
    if (m && m[1].toLowerCase() === "x") done.push(m[2]);
  }
  return done;
}

function writeProgress(num: string, done: boolean) {
  if (!fs.existsSync(PROGRESS_FILE)) throw new Error("progress.md 가 없습니다");
  const raw = fs.readFileSync(PROGRESS_FILE, "utf-8");
  const re = progressRow(num);
  if (!re.test(raw)) throw new Error(`진도표에 ${num} 행이 없습니다`);

  const today = new Date().toLocaleDateString("sv-SE"); // YYYY-MM-DD (로컬 기준)
  const next = raw.replace(re, (_full, _mark, rest: string) => {
    // rest = "제목 | Part | 주차 | 수강일 | 연습 통과 | 메모 |"
    // 끝의 빈 조각을 뺀 뒤, 뒤에서부터 세어 열 위치를 잡는다 (열이 늘어도 안 깨지게)
    const cells = rest.split("|");
    const last = cells.length - 1; // 마지막은 행 끝 빈 문자열
    const memo = last - 1, passed = last - 2, taken = last - 3;
    if (taken > 0) {
      cells[taken] = done ? ` ${today} ` : "  ";
      cells[passed] = done ? " ✓ " : "  ";
      void memo; // 메모는 사용자가 쓰는 칸이라 건드리지 않는다
    }
    return `| [${done ? "x" : " "}] | ${num} |${cells.join("|")}`;
  });
  fs.writeFileSync(PROGRESS_FILE, next, "utf-8");
}

function loadLessons(): Lesson[] {
  if (!fs.existsSync(LESSONS_DIR)) return [];
  return fs
    .readdirSync(LESSONS_DIR)
    .filter((f) => f.endsWith(".md"))
    .map(parseLesson)
    .sort((a, b) => a.order - b.order);
}

// ------------------------------------------------------------ Kotlin 실행기

function spawnCapture(cmd: string, args: string[], cwd: string, timeoutMs: number) {
  return new Promise<{ stdout: string; stderr: string; code: number | null; timedOut: boolean }>(
    (resolve) => {
      const child = spawn(cmd, args, { cwd });
      let stdout = "";
      let stderr = "";
      let timedOut = false;

      const timer = setTimeout(() => {
        timedOut = true;
        child.kill("SIGKILL");
      }, timeoutMs);

      child.stdout.on("data", (d) => (stdout += d.toString()));
      child.stderr.on("data", (d) => (stderr += d.toString()));
      child.on("error", (err) => {
        clearTimeout(timer);
        resolve({ stdout, stderr: `${stderr}${err}`, code: null, timedOut });
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        resolve({ stdout, stderr, code, timedOut });
      });
    }
  );
}

// 진입점 클래스명 추론: Main.kt -> MainKt, package 선언이 있으면 FQCN
function mainClassName(code: string): string {
  const pkg = code.match(/^\s*package\s+([\w.]+)/m);
  return pkg ? `${pkg[1]}.MainKt` : "MainKt";
}

// kotlinc 데몬이 동시 호출에 약해서 실행을 직렬화한다
let runQueue: Promise<unknown> = Promise.resolve();
function enqueue<T>(fn: () => Promise<T>): Promise<T> {
  const next = runQueue.then(fn, fn);
  runQueue = next.catch(() => {});
  return next;
}

function runKotlin(code: string, slot: string): Promise<RunResult> {
  return enqueue(async () => {
    const started = Date.now();
    const dir = path.join(RUN_DIR, slot.replace(/[^\w-]/g, "_"));
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(path.join(dir, "out"), { recursive: true });
    fs.writeFileSync(path.join(dir, "Main.kt"), code, "utf-8");

    const libs = libClasspath();
    const compiled = await spawnCapture(
      "kotlinc",
      libs
        ? ["Main.kt", "-d", "out", "-nowarn", "-cp", libs]
        : ["Main.kt", "-d", "out", "-nowarn"],
      dir,
      COMPILE_TIMEOUT_MS
    );
    if (compiled.timedOut || compiled.code !== 0) {
      return {
        ok: false,
        phase: "compile",
        stdout: compiled.stdout,
        stderr: compiled.timedOut ? "컴파일 시간 초과" : compiled.stderr || "컴파일 실패",
        exitCode: compiled.code,
        durationMs: Date.now() - started,
      };
    }

    const ran = await spawnCapture(
      "kotlin",
      ["-cp", libs ? `out${path.delimiter}${libs}` : "out", mainClassName(code)],
      dir,
      RUN_TIMEOUT_MS
    );
    return {
      ok: !ran.timedOut && ran.code === 0,
      phase: "run",
      stdout: ran.stdout,
      stderr: ran.timedOut ? "실행 시간 초과 (무한 루프?)" : ran.stderr,
      exitCode: ran.code,
      durationMs: Date.now() - started,
    };
  });
}

const normalize = (s: string) =>
  s.replace(/\r\n/g, "\n").split("\n").map((l) => l.trimEnd()).join("\n").trim();

// ------------------------------------------------------------------ SSE 허브

let clientSeq = 0;
const clients = new Map<number, http.ServerResponse>();

function broadcast(event: string, data: unknown) {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients.values()) res.write(payload);
}

// ------------------------------------------------------------- 파일 감지 모드

let watcher: fs.FSWatcher | null = null;
let watchDir: string | null = null;
const debounce = new Map<string, NodeJS.Timeout>();
const IGNORED = /(^|\/)(build|out|target|\.git|\.gradle|\.idea|node_modules)(\/|$)/;

function stopWatch() {
  watcher?.close();
  watcher = null;
  watchDir = null;
  for (const t of debounce.values()) clearTimeout(t);
  debounce.clear();
}

function startWatch(dir: string) {
  stopWatch();
  watcher = fs.watch(dir, { recursive: true }, (_e, filename) => {
    if (!filename || !filename.endsWith(".kt") || IGNORED.test(filename)) return;
    const full = path.join(dir, filename);

    clearTimeout(debounce.get(full));
    debounce.set(
      full,
      setTimeout(async () => {
        debounce.delete(full);
        if (!fs.existsSync(full)) return;
        const code = fs.readFileSync(full, "utf-8");
        if (!/fun\s+main\s*\(/.test(code)) {
          broadcast("skipped", { file: full, reason: "fun main() 이 없어 실행을 건너뜁니다" });
          return;
        }
        broadcast("running", { file: full });
        broadcast("result", { file: full, code, ...(await runKotlin(code, "watch")) });
      }, 400)
    );
  });
  watchDir = dir;
}

// --------------------------------------------------------------- HTTP 유틸

const MIME: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
};

function json(res: http.ServerResponse, status: number, body: unknown) {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
  });
  res.end(payload);
}

function readBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let raw = "";
    req.on("data", (c) => {
      raw += c;
      if (raw.length > 1_000_000) req.destroy(); // 1MB 상한
    });
    req.on("end", () => {
      try {
        resolve(JSON.parse(raw || "{}"));
      } catch {
        resolve({});
      }
    });
  });
}

function serveStatic(res: http.ServerResponse, urlPath: string) {
  const rel = urlPath === "/" ? "index.html" : decodeURIComponent(urlPath).replace(/^\/+/, "");
  const file = path.resolve(PUBLIC_DIR, rel);
  // 디렉토리 탈출 방지
  if (!file.startsWith(PUBLIC_DIR + path.sep) || !fs.existsSync(file)) {
    res.writeHead(404).end("Not Found");
    return;
  }
  res.writeHead(200, { "Content-Type": MIME[path.extname(file)] ?? "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
}

// --------------------------------------------------------------------- 라우트

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const route = url.pathname;

  if (route === "/api/lessons" && req.method === "GET") {
    return json(res, 200, loadLessons().map(({ id, title, order }) => ({ id, title, order })));
  }

  if (route.startsWith("/api/lessons/") && req.method === "GET") {
    const id = route.slice("/api/lessons/".length);
    const lesson = loadLessons().find((l) => l.id === id);
    if (!lesson) return json(res, 404, { error: "레슨을 찾을 수 없습니다" });
    const saved = path.join(WORKSPACE_DIR, `${lesson.id}.kt`);
    return json(res, 200, {
      ...lesson,
      saved: fs.existsSync(saved) ? fs.readFileSync(saved, "utf-8") : null,
    });
  }

  if (route === "/api/run" && req.method === "POST") {
    const body = await readBody(req);
    const code = String(body.code ?? "");
    const lessonId = String(body.lessonId ?? "scratch");
    if (!code.trim()) return json(res, 400, { error: "코드가 비어 있습니다" });

    // 웹 에디터에서 친 코드도 파일로 남긴다 (Sublime/IntelliJ 로 열 수 있게)
    const safeId = lessonId.replace(/[^\w-]/g, "_");
    fs.writeFileSync(path.join(WORKSPACE_DIR, `${safeId}.kt`), code, "utf-8");

    const result = await runKotlin(code, `web-${safeId}`);
    const expected = loadLessons().find((l) => l.id === lessonId)?.exercise?.expected ?? null;
    return json(res, 200, {
      ...result,
      expected,
      passed: expected !== null && result.ok && normalize(result.stdout) === normalize(expected),
    });
  }

  // 진도: curriculum/progress.md 의 레슨 체크리스트를 읽고 쓴다
  if (route === "/api/progress" && req.method === "GET") {
    return json(res, 200, { completed: readProgress() });
  }

  if (route === "/api/progress" && req.method === "POST") {
    const body = await readBody(req);
    const lessonId = String(body.lessonId ?? "");
    const done = body.done !== false;
    if (!/^\d{2}-/.test(lessonId)) return json(res, 400, { error: "레슨 id 형식이 올바르지 않습니다" });
    try {
      writeProgress(lessonId.slice(0, 2), done);
      return json(res, 200, { completed: readProgress() });
    } catch (err) {
      return json(res, 500, { error: `진도 기록 실패: ${err}` });
    }
  }

  if (route === "/api/watch" && req.method === "POST") {
    const raw = String((await readBody(req)).dir ?? "").trim();
    if (!raw) {
      stopWatch();
      return json(res, 200, { watching: null });
    }
    const dir = raw.startsWith("~") ? path.join(process.env.HOME ?? "", raw.slice(1)) : path.resolve(raw);
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
      return json(res, 400, { error: `디렉토리가 없습니다: ${dir}` });
    }
    try {
      startWatch(dir);
      return json(res, 200, { watching: dir });
    } catch (err) {
      return json(res, 500, { error: `감지 시작 실패: ${err}` });
    }
  }

  if (route === "/api/events") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write(`event: hello\ndata: ${JSON.stringify({ watching: watchDir })}\n\n`);

    const id = ++clientSeq;
    clients.set(id, res);
    const ping = setInterval(() => res.write(": ping\n\n"), 25_000);
    req.on("close", () => {
      clearInterval(ping);
      clients.delete(id);
    });
    return;
  }

  if (req.method === "GET") return serveStatic(res, route);
  res.writeHead(404).end("Not Found");
});

// 임의의 Kotlin 코드를 실행하므로 루프백에만 바인딩한다
server.listen(PORT, "127.0.0.1", () => {
  console.log(`\n  Kotlin Lab  →  http://localhost:${PORT}`);
  console.log(`  워크스페이스: ${WORKSPACE_DIR}\n`);
});
