// Blind acceptance executes outside the implementer's checkout and returns
// only scenario verdicts. Full process logs remain available to the user.
import { spawn } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

export interface ScenarioResult {
  id: string;
  status: "passed" | "failed" | "skipped";
  expected: string | null;
  actual: string | null;
  note?: string | null;
}

export interface SuiteRun {
  exitCode: number | null;
  results: ScenarioResult[];
  log: string;
  error: string | null;
}

interface Scenario { id: string; dodIds: string[]; then: string | null }

/** A shared DoD belongs to the earliest wave that owns it. Future rows are not gates yet. */
export function selectScenarioScope<T extends Scenario>(
  scenarios: T[], workorders: { wave: string; dodIds: string[] }[], wave: string | null,
): { current: T[]; previous: T[]; required: T[] } {
  const rank = (value: string) => /^W\d+$/u.test(value) ? Number(value.slice(1)) : NaN;
  const active = rank(wave ?? "");
  if (!Number.isFinite(active) || !workorders.some((wo) => rank(wo.wave) === active)) {
    throw new Error("Для приёмки нужна active_wave с воркордерами в STATE.md");
  }
  const firstWave = new Map<string, number>();
  for (const wo of workorders) {
    const n = rank(wo.wave);
    if (!Number.isFinite(n)) continue;
    for (const id of wo.dodIds) firstWave.set(id, Math.min(firstWave.get(id) ?? Infinity, n));
  }
  const current: T[] = [], previous: T[] = [];
  for (const scenario of scenarios) {
    const n = Math.min(...scenario.dodIds.map((id) => firstWave.get(id) ?? Infinity));
    if (!Number.isFinite(n)) throw new Error(`${scenario.id}: сценарий не связан с DoD ни одной волны`);
    if (n === active) current.push(scenario);
    else if (n < active) previous.push(scenario);
  }
  return { current, previous, required: [...previous, ...current] };
}

export function suiteDir(acceptanceFolder: string, slug: string): string {
  return join(acceptanceFolder, "acceptance", slug);
}

export function hasSuite(acceptanceFolder: string, slug: string): boolean {
  return existsSync(join(suiteDir(acceptanceFolder, slug), "run.sh"));
}

const MAX_LOG = 300_000;
function clip(value: unknown, max = 600): string | null {
  if (value === null || value === undefined) return null;
  const text = typeof value === "string" ? value : JSON.stringify(value);
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function readResults(dir: string): ScenarioResult[] {
  const parsed: unknown = JSON.parse(readFileSync(join(dir, "results.json"), "utf8"));
  if (!Array.isArray(parsed) || parsed.some((r) => !r || typeof r.id !== "string" || !/^AS-\d+$/u.test(r.id))) {
    throw new Error("results.json должен быть массивом результатов с ID AS-NN");
  }
  return parsed.map((item) => ({
    id: item.id,
    status: item.status === "passed" ? "passed" : item.status === "failed" ? "failed" : "skipped",
    expected: clip(item.expected), actual: clip(item.actual ?? item.message), note: clip(item.note),
  }));
}

/**
 * Runs the suite whose folder the test author registered (`dir` holds run.sh)
 * against `targetDir`. Nothing here derives a path: the caller passes the
 * registered suite and the checkout to judge.
 */
export function runSuite(dir: string, targetDir: string, timeoutMs: number, signal?: AbortSignal): Promise<SuiteRun> {
  return new Promise((resolve) => {
    if (!existsSync(join(dir, "run.sh"))) {
      resolve({ exitCode: null, results: [], log: "", error: `Набор не найден: нет ${join(dir, "run.sh")}` });
      return;
    }
    if (!existsSync(targetDir)) {
      resolve({ exitCode: null, results: [], log: "", error: `Проверяемая рабочая копия не найдена: ${targetDir}` });
      return;
    }
    if (signal?.aborted) {
      resolve({ exitCode: null, results: [], log: "", error: "Прогон отменён" });
      return;
    }
    rmSync(join(dir, "results.json"), { force: true });
    let log = "", error: string | null = null;
    const child = spawn("bash", ["run.sh", targetDir], {
      cwd: dir, detached: process.platform !== "win32",
      env: { ...process.env, AIRD_ACCEPTANCE_TARGET: targetDir, AIRD_ACCEPTANCE_RESULTS: join(dir, "results.json"), CI: "1" },
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stop = (reason: string) => {
      error = reason;
      try {
        if (process.platform !== "win32" && child.pid) process.kill(-child.pid, "SIGKILL");
        else child.kill("SIGKILL");
      } catch { /* The process may have exited just before cancellation. */ }
    };
    const abort = () => stop("Прогон отменён");
    const timer = setTimeout(() => stop("Превышен таймаут прогона"), timeoutMs);
    signal?.addEventListener("abort", abort, { once: true });
    const append = (chunk: Buffer) => { log = (log + chunk.toString("utf8")).slice(0, MAX_LOG); };
    child.stdout.on("data", append);
    child.stderr.on("data", append);
    child.on("error", () => { error = "Не удалось запустить run.sh"; });
    child.on("close", (code, killedBy) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      if (killedBy) error ??= "Процесс прогона завершён сигналом";
      let results: ScenarioResult[] = [];
      try { results = readResults(dir); }
      catch { error ??= "run.sh не записал корректный results.json — нет доказательств"; }
      resolve({ exitCode: code, results, log, error });
    });
  });
}

/** The only verdict policy, shared by persistence, tool output and the UI. */
export function assessRun(
  run: SuiteRun, scenarios: { id: string; then: string | null }[],
  kind: "baseline" | "wave", currentIds: Set<string>, acceptanceFolder = "",
): { status: "passed" | "failed" | "error"; text: string } {
  const scrub = (value: string | null) => {
    let text = value ?? "—";
    if (acceptanceFolder) text = text.split(acceptanceFolder).join("<acceptance>");
    return text.replace(/file:\/\/\S+/gu, "<file>").replace(/\s+at\s+\S+:\d+:\d+/gu, "").slice(0, 600);
  };
  // No result for any scenario: the suite did not run. Say so once, as an
  // environment or suite failure, instead of "no test" per scenario — which
  // reads as "the plugin cannot find the suite" and invites running it by hand.
  const noResults = run.results.length === 0 && scenarios.length > 0;
  const blocked: string[] = [], failures: string[] = [];
  if (!scenarios.length) blocked.push("Нет сценариев текущей или предыдущих волн");
  if (run.error) blocked.push(scrub(run.error));
  if (noResults) {
    const cause = run.log.split("\n").map((line) => line.trim()).find((line) => /(Error|error:|ENOENT|not found|не создал|command not found|Cannot find)/u.test(line));
    blocked.push(`Набор не выполнился ни по одному сценарию — это ошибка набора или окружения, не кода${cause ? `: ${scrub(cause).slice(0, 240)}` : ""}. Верни test-author с этим текстом; сам набор не запускай и не открывай.`);
  }
  if (run.exitCode === null) blocked.push("Нет кода завершения прогона");
  const byId = new Map<string, ScenarioResult>();
  for (const result of run.results) {
    if (byId.has(result.id)) blocked.push(`${result.id}: повторный результат`);
    byId.set(result.id, result);
  }
  let matched = 0;
  for (const scenario of scenarios) {
    const r = byId.get(scenario.id);
    if (!r && noResults) continue;
    if (!r || r.status === "skipped") { blocked.push(`${scenario.id}: ${r ? "пропущен" : "теста нет в наборе"}`); continue; }
    const newOnBase = kind === "baseline" && currentIds.has(scenario.id);
    if (newOnBase) {
      if (r.status === "failed" || (r.status === "passed" && /^pre-existing:\s*\S/iu.test(r.note ?? ""))) matched++;
      else failures.push(`${scenario.id}: проходит до изменений; test-author должен исправить тест или указать note: pre-existing: <причина>`);
    } else if (r.status === "passed") matched++;
    else failures.push(`${scenario.id}: НЕ ПРОШЁЛ. Ожидалось: ${scrub(scenario.then ?? r.expected)}. Получено: ${scrub(r.actual)}.`);
  }
  if (kind === "wave" && run.exitCode !== null && run.exitCode !== 0) failures.push("run.sh завершился с ненулевым кодом");
  if (kind === "baseline" && run.exitCode === 0 && scenarios.some((s) => byId.get(s.id)?.status === "failed")) {
    blocked.push("run.sh вернул 0 при упавших сценариях — нарушен контракт набора");
  }
  const status = blocked.length ? "error" : failures.length ? "failed" : "passed";
  const verdict = status === "error" ? "blocked-no-evidence" : status === "failed" ? "fail" : "pass";
  const heading = kind === "baseline" ? "Проверка на базе" : "Приёмка";
  const gate = kind === "baseline" ? "Red-first" : "Blind acceptance";
  // A run that produced no result is a launch problem, never "0 of N".
  if (noResults) {
    return { status: "error", text: `${heading}: не выполнена — проблема запуска. Гейт ${gate}: blocked-no-evidence.${blocked.map((line) => `\n- ${line}`).join("")}` };
  }
  const breakdown = kind === "baseline"
    ? (() => {
        const failing = scenarios.filter((sc) => byId.get(sc.id)?.status === "failed").length;
        const previous = scenarios.filter((sc) => byId.get(sc.id)?.status === "passed").length;
        return ` (${failing} падают — новое поведение, ${previous} проходят — прежнее поведение)`;
      })()
    : "";
  return { status, text: `${heading}: ${matched}/${scenarios.length}${breakdown}. Гейт ${gate}: ${verdict}.${[...blocked, ...failures].map((line) => `\n- ${line}`).join("")}` };
}

export function verdictText(results: ScenarioResult[], scenarios: { id: string; then: string | null }[], acceptanceFolder: string): string {
  return assessRun({ results, exitCode: 0, error: null, log: "" }, scenarios, "wave", new Set(), acceptanceFolder).text;
}
