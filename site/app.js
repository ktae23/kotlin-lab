// Kotlin Lab — 정적 사이트판
// 코드 실행은 JetBrains 공개 컴파일 API 로 나간다. 이 사이트에는 백엔드가 없다.
"use strict";

const KOTLIN_VERSION = "2.1.20";
const API = `https://api.kotlinlang.org/api/${KOTLIN_VERSION}/compiler/run`;
const STORE = "kotlin-lab:progress:v1";

const $ = (id) => document.getElementById(id);

// 텍스트·속성 양쪽에서 안전하도록 따옴표까지 이스케이프
function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
const normalize = (s) =>
  String(s ?? "").replace(/\r\n/g, "\n").split("\n").map((l) => l.trimEnd()).join("\n").trim();

let index = [];
let current = null;

// ------------------------------------------------------------------ 진도
// localStorage 는 이 브라우저에만 남는다. 서버로 나가는 진도 데이터는 없다.
function readProgress() {
  try {
    const v = JSON.parse(localStorage.getItem(STORE) || "{}");
    return v && typeof v === "object" && !Array.isArray(v) ? v : {};
  } catch { return {}; }
}
function writeProgress(p) {
  try { localStorage.setItem(STORE, JSON.stringify(p)); } catch { /* 사파리 비공개 모드 등 */ }
}
let progress = readProgress();
const isDone = (id) => !!progress[id];
const doneCount = () => index.filter((l) => progress[l.id]).length;

function setDone(id, done) {
  if (done) progress[id] = new Date().toISOString().slice(0, 10);
  else delete progress[id];
  writeProgress(progress);
  renderList();
  renderNav();
}

// ------------------------------------------------------------------ 에디터
const cm = CodeMirror.fromTextArea($("code"), {
  mode: "text/x-kotlin",
  theme: "material-darker",
  lineNumbers: true,
  indentUnit: 4,
  tabSize: 4,
  lineWrapping: true,
  extraKeys: { "Cmd-Enter": run, "Ctrl-Enter": run },
});

// 작업 중인 코드도 브라우저에만 저장한다
const codeKey = (id) => `kotlin-lab:code:${id}`;
const saveCode = () => { if (current) { try { localStorage.setItem(codeKey(current.id), cm.getValue()); } catch {} } };
cm.on("change", () => { clearTimeout(saveCode._t); saveCode._t = setTimeout(saveCode, 400); });

// ------------------------------------------------------------------ 목록 / 레슨
async function boot() {
  const res = await fetch("data/index.json");
  const data = await res.json();
  index = data.index;

  $("lessonList").innerHTML = "";
  let lastPart = null;
  for (const l of index) {
    if (l.part !== lastPart) {
      const h = document.createElement("div");
      h.className = "part-head";
      h.textContent = l.part;
      $("lessonList").appendChild(h);
      lastPart = l.part;
    }
    const b = document.createElement("button");
    b.dataset.id = l.id;
    b.onclick = () => openLesson(l.id);
    $("lessonList").appendChild(b);
  }
  renderList();
  const first = index.find((l) => !progress[l.id]) ?? index[0];
  openLesson(location.hash.slice(1) || first.id);
}

function renderList() {
  for (const l of index) {
    const b = $("lessonList").querySelector(`[data-id="${CSS.escape(l.id)}"]`);
    if (!b) continue;
    b.innerHTML =
      `<span class="num">${esc(String(l.order).padStart(2, "0"))}</span>` +
      (progress[l.id] ? `<span class="check">✓</span>` : "") +
      esc(l.title.replace(/^Lesson\s*\d+\s*—\s*/, ""));
  }
  $("brandSub").textContent = `${doneCount()} / ${index.length} 완료`;
}

async function openLesson(id) {
  if (!index.some((l) => l.id === id)) return;
  const res = await fetch(`data/${encodeURIComponent(id)}.json`);
  if (!res.ok) return;
  current = await res.json();
  if (location.hash.slice(1) !== id) location.hash = id;

  document.querySelectorAll(".lesson-list button").forEach((b) =>
    b.classList.toggle("active", b.dataset.id === id));

  // 레슨 본문은 이 레포의 콘텐츠다 (사용자 입력이 아님)
  $("theory").innerHTML = marked.parse(current.theory);
  $("theory").scrollTop = 0;
  $("prompt").innerHTML = current.exercise?.prompt ? marked.parse(current.exercise.prompt) : "";

  let saved = null;
  try { saved = localStorage.getItem(codeKey(id)); } catch {}
  cm.setValue(saved ?? current.exercise?.starter ?? "fun main() {\n    \n}\n");
  $("output").innerHTML = '<span class="empty">실행 결과가 여기 표시됩니다.</span>';

  resetAssist();
  resetArmed = false;
  renderResetBtn();
  renderNav();
}

window.addEventListener("hashchange", () => {
  const id = location.hash.slice(1);
  if (id && id !== current?.id) openLesson(id);
});

// ------------------------------------------------------------------ 실행
async function run() {
  if (!current) return;
  $("runBtn").disabled = true;
  $("output").innerHTML = '<span class="empty">JetBrains 컴파일 서버로 보내는 중…</span>';
  const started = Date.now();
  try {
    const res = await fetch(API, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ args: "", files: [{ name: "File.kt", text: cm.getValue() }], confType: "java" }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    render(await res.json(), Date.now() - started);
  } catch (e) {
    $("output").innerHTML =
      `<div class="out-head"><span class="badge err">실행 실패</span></div>` +
      `<span class="out-err">${esc(e && e.message ? e.message : e)}</span>` +
      `<div class="out-label">확인</div>네트워크 연결, 또는 JetBrains 컴파일 서버 상태를 확인하세요.`;
  } finally {
    $("runBtn").disabled = false;
  }
}
$("runBtn").onclick = run;

// API 응답: { errors: {"File.kt":[{severity,message,interval}]}, exception, text:"<errStream>..</errStream><outStream>..</outStream>" }
function splitStreams(text) {
  const t = String(text ?? "");
  const grab = (tag) =>
    [...t.matchAll(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "g"))].map((m) => m[1]).join("");
  return { out: grab("outStream"), err: grab("errStream") };
}

function render(d, ms) {
  const diags = (d.errors && d.errors["File.kt"]) || [];
  const errors = diags.filter((x) => x.severity === "ERROR");
  const { out, err } = splitStreams(d.text);
  const expected = current.exercise?.expected ?? null;

  let passed = false;
  let badge, label;
  if (errors.length) { badge = "err"; label = "컴파일 실패"; }
  else if (d.exception) { badge = "err"; label = "런타임 오류"; }
  else if (expected && normalize(out) === normalize(expected)) { badge = "ok"; label = "통과"; passed = true; }
  else if (expected) { badge = "warn"; label = "출력 불일치"; }
  else { badge = "muted"; label = "실행 완료"; }

  let html = `<div class="out-head"><span class="badge ${badge}">${esc(label)}</span>` +
             `<span class="time">${esc(ms)}ms</span></div>`;

  if (errors.length) {
    html += `<div class="out-label">컴파일러</div>`;
    for (const e of errors) {
      const line = (e.interval?.start?.line ?? 0) + 1;
      const ch = (e.interval?.start?.ch ?? 0) + 1;
      html += `<div class="out-err">${esc(line)}:${esc(ch)} ${esc(e.message)}</div>`;
    }
  }
  if (d.exception) {
    const ex = d.exception;
    html += `<div class="out-label">예외</div><span class="out-err">${esc(ex.fullName || "")}: ${esc(ex.message || "")}</span>`;
  }
  if (out.trim()) html += `<div class="out-label">stdout</div>${esc(out.trimEnd())}`;
  if (err.trim()) html += `<div class="out-label">stderr</div><span class="out-err">${esc(err.trimEnd())}</span>`;

  if (expected && !passed && !errors.length && !d.exception) {
    html += `<div class="out-label">기대 출력과 비교</div><div class="diff">
      <div><div class="out-label" style="margin-top:0">내 출력</div>${esc(out.trim()) || "(없음)"}</div>
      <div><div class="out-label" style="margin-top:0">기대</div>${esc(expected)}</div></div>`;
  }
  $("output").innerHTML = html;

  if (passed && !isDone(current.id)) setDone(current.id, true);
}

// ------------------------------------------------------------------ 힌트 / 정답
let shownHints = 0, solArmed = false, solShown = false;
let hintsCollapsed = false, solCollapsed = false, resetArmed = false;

function resetAssist() {
  shownHints = 0; solArmed = false; solShown = false;
  hintsCollapsed = false; solCollapsed = false;
  $("assist").hidden = true;
  $("assist").innerHTML = "";
  renderAssistButtons();
}

function renderAssistButtons() {
  const ex = current?.exercise;
  const total = ex?.hints?.length ?? 0;
  const h = $("hintBtn"), s = $("solBtn");

  h.disabled = !total;
  h.textContent = !total ? "힌트 없음"
    : shownHints === 0 ? `힌트 (${total})`
    : shownHints < total ? `힌트 더 보기 (${shownHints + 1}/${total})`
    : hintsCollapsed ? `힌트 펴기 (${total})` : "힌트 접기";

  s.disabled = !ex?.solution;
  s.classList.toggle("armed", solArmed && !solShown);
  s.textContent = !ex?.solution ? "정답 없음"
    : !solShown ? (solArmed ? "한 번 더 누르면 공개" : "정답")
    : solCollapsed ? "정답 펴기" : "정답 접기";
}

function renderAssist() {
  const ex = current?.exercise;
  if (!ex) return;
  let html = "";
  if (shownHints > 0 && !hintsCollapsed) {
    for (let i = 0; i < shownHints; i++) {
      html += `<div class="hint"><span class="n">${i + 1}</span><div>${marked.parseInline(ex.hints[i])}</div></div>`;
    }
  }
  if (solShown && !solCollapsed && ex.solution) {
    html += `<div class="sol-head">정답<button id="applySol">에디터에 넣기</button></div>`;
    html += `<pre><code>${esc(ex.solution)}</code></pre>`;
  }
  const box = $("assist");
  box.innerHTML = html;
  box.hidden = !html;
  const apply = $("applySol");
  if (apply) apply.onclick = () => { cm.setValue(ex.solution); cm.focus(); };
}

$("hintBtn").onclick = () => {
  const total = current?.exercise?.hints?.length ?? 0;
  if (!total) return;
  if (shownHints < total) { shownHints++; hintsCollapsed = false; }
  else hintsCollapsed = !hintsCollapsed;
  renderAssist(); renderAssistButtons();
};

$("solBtn").onclick = () => {
  if (!current?.exercise?.solution) return;
  if (!solShown) {
    if (!solArmed) { solArmed = true; renderAssistButtons(); return; }
    solShown = true; solCollapsed = false;
  } else solCollapsed = !solCollapsed;
  renderAssist(); renderAssistButtons();
};

// ------------------------------------------------------------------ 내비
const idx = () => index.findIndex((l) => l.id === current?.id);

function renderNav() {
  const i = idx();
  $("prevBtn").disabled = i <= 0;
  $("nextBtn").disabled = i < 0 || i >= index.length - 1 || !isDone(current?.id);
  const st = $("navStatus");
  const done = isDone(current?.id);
  st.classList.toggle("done", done);
  st.textContent = !current ? ""
    : done ? `완료 · ${doneCount()}/${index.length}`
    : `미완료 · ${doneCount()}/${index.length} — 통과하면 자동 저장됩니다`;
}

function renderResetBtn() {
  const b = $("resetBtn");
  b.disabled = !current?.exercise?.starter;
  b.classList.toggle("armed", resetArmed);
  b.textContent = resetArmed ? "정말 되돌릴까요?" : "스타터로 되돌리기";
}

$("prevBtn").onclick = () => { const i = idx(); if (i > 0) openLesson(index[i - 1].id); };
$("nextBtn").onclick = () => { const i = idx(); if (i < index.length - 1) openLesson(index[i + 1].id); };
$("resetBtn").onclick = () => {
  const st = current?.exercise?.starter;
  if (!st) return;
  if (!resetArmed) { resetArmed = true; renderResetBtn(); return; }
  cm.setValue(st); cm.focus();
  resetArmed = false; renderResetBtn();
};

boot();
