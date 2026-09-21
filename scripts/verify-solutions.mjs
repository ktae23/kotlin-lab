// 모든 레슨의 정답 블록을 실제로 컴파일·실행해서 expected 와 대조한다.
// 사용: node scripts/verify-solutions.mjs
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "lessons");
const LIB = fs.existsSync(path.join(ROOT, "lib"))
  ? fs.readdirSync(path.join(ROOT, "lib")).filter((f) => f.endsWith(".jar"))
      .map((f) => path.join(ROOT, "lib", f)).join(path.delimiter)
  : "";
const work = fs.mkdtempSync(path.join(os.tmpdir(), "verify-sol-"));
const norm = (s) => s.replace(/\r\n/g, "\n").split("\n").map((l) => l.trimEnd()).join("\n").trim();

let fail = 0, skip = 0, pass = 0;
for (const f of fs.readdirSync(DIR).filter((x) => x.endsWith(".md")).sort()) {
  const raw = fs.readFileSync(path.join(DIR, f), "utf-8");
  const sol = raw.match(/```kotlin solution\n([\s\S]*?)```/);
  const exp = raw.match(/```text expected\n([\s\S]*?)```/);
  if (!sol || !exp) { console.log(`- ${f}  (정답 또는 expected 없음)`); skip++; continue; }

  const dir = path.join(work, f.replace(/\.md$/, ""));
  fs.mkdirSync(path.join(dir, "out"), { recursive: true });
  fs.writeFileSync(path.join(dir, "Main.kt"), sol[1]);
  try {
    execFileSync("kotlinc", LIB ? ["Main.kt", "-d", "out", "-nowarn", "-cp", LIB]
                                : ["Main.kt", "-d", "out", "-nowarn"],
      { cwd: dir, stdio: "pipe", timeout: 180000 });
    const got = execFileSync("kotlin",
      ["-cp", LIB ? `out${path.delimiter}${LIB}` : "out", "MainKt"],
      { cwd: dir, stdio: "pipe", timeout: 30000 }).toString();
    if (norm(got) === norm(exp[1])) { console.log(`✓ ${f}`); pass++; }
    else {
      console.log(`✗ ${f}  출력 불일치`);
      console.log(`    기대: ${JSON.stringify(norm(exp[1]).slice(0, 90))}`);
      console.log(`    실제: ${JSON.stringify(norm(got).slice(0, 90))}`);
      fail++;
    }
  } catch (e) {
    console.log(`✗ ${f}  ${e.stderr ? String(e.stderr).split("\n").filter(Boolean).slice(0, 2).join(" / ") : e.message}`);
    fail++;
  }
}
fs.rmSync(work, { recursive: true, force: true });
console.log(`\n정답 검증: 통과 ${pass} · 실패 ${fail} · 건너뜀 ${skip}`);
process.exit(fail ? 1 : 0);
