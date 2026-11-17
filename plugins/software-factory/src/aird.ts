// Reads AIRD packages (.agent/aird/<slug>/) from disk and derives the view
// model the Software Factory page shows. Everything here is read-only and
// tolerant: AIRD packages are written by agents and vary between skill
// versions, so a missing or malformed file degrades one field, never the page.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { parse as parseYaml } from "yaml";
import type {
  Artifact,
  Blocker,
  Finding,
  GateStatus,
  Risk,
  StageNode,
} from "./contract";

export const AIRD_DIR = join(".agent", "aird");

// ---------------------------------------------------------------- file cache

const textCache = new Map<string, { mtimeMs: number; size: number; text: string }>();

export function readText(path: string): string | null {
  try {
    const stat = statSync(path);
    if (!stat.isFile()) return null;
    const cached = textCache.get(path);
    if (cached && cached.mtimeMs === stat.mtimeMs && cached.size === stat.size) {
      return cached.text;
    }
    // AIRD documents are budgeted well below this; anything larger is not a
    // package document we need to parse.
    if (stat.size > 2_000_000) return null;
    const text = readFileSync(path, "utf8");
    textCache.set(path, { mtimeMs: stat.mtimeMs, size: stat.size, text });
    return text;
  } catch {
    return null;
  }
}

export function isDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}

function listDir(path: string): string[] {
  try {
    return readdirSync(path);
  } catch {
    return [];
  }
}

export function listPackageSlugs(folder: string): string[] {
  const root = join(folder, AIRD_DIR);
  return listDir(root)
    .filter((name) => !name.startsWith(".") && isDirectory(join(root, name)))
    .sort();
}

// ---------------------------------------------------------- markdown helpers

type Json = unknown;

export function splitFrontmatter(text: string): {
  data: Record<string, Json>;
  body: string;
} {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/u.exec(text);
  if (!match) return { data: {}, body: text };
  let data: Record<string, Json> = {};
  try {
    const parsed = parseYaml(match[1] ?? "");
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      data = parsed as Record<string, Json>;
    }
  } catch {
    data = {};
  }
  return { data, body: text.slice(match[0].length) };
}

function str(value: Json): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value.trim() || null;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return null;
}

function strList(value: Json): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => str(item)).filter((item): item is string => item !== null);
  }
  const single = str(value);
  if (single === null || single === "none" || single === "[]") return [];
  return single
    .split(/[,\s]+/u)
    .map((part) => part.trim())
    .filter(Boolean);
}

function bool(value: Json): boolean | null {
  if (typeof value === "boolean") return value;
  if (value === "true") return true;
  if (value === "false") return false;
  return null;
}

export function firstHeading(body: string): string | null {
  const match = /^#{1,2}\s+(.+?)\s*$/mu.exec(body);
  return match ? match[1]!.trim() : null;
}

/** `- Label: value` bullet lookup, first match wins. */
function bulletValue(body: string, labels: string[]): string | null {
  for (const label of labels) {
    const re = new RegExp(`^\\s*[-*]\\s*${label}\\s*:\\s*(.+)$`, "imu");
    const match = re.exec(body);
    if (match) {
      const value = match[1]!.replace(/`/gu, "").trim();
      if (value) return value;
    }
  }
  return null;
}

interface MdTable {
  heading: string;
  header: string[];
  rows: string[][];
}

function splitRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/u, "").replace(/\|$/u, "");
  // Split on pipes that are not escaped and not inside backticks.
  const cells: string[] = [];
  let current = "";
  let inCode = false;
  for (let i = 0; i < trimmed.length; i += 1) {
    const ch = trimmed[i]!;
    if (ch === "`") inCode = !inCode;
    if (ch === "|" && !inCode && trimmed[i - 1] !== "\\") {
      cells.push(current.trim());
      current = "";
      continue;
    }
    current += ch;
  }
  cells.push(current.trim());
  return cells;
}

export function parseTables(text: string): MdTable[] {
  const lines = text.split(/\r?\n/u);
  const tables: MdTable[] = [];
  let heading = "";
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    const headingMatch = /^#{1,6}\s+(.+)$/u.exec(line);
    if (headingMatch) {
      heading = headingMatch[1]!.trim();
      continue;
    }
    const next = lines[i + 1];
    if (
      line.trim().startsWith("|") &&
      next !== undefined &&
      /^\s*\|?\s*:?-{2,}/u.test(next)
    ) {
      const header = splitRow(line);
      const rows: string[][] = [];
      let j = i + 2;
      while (j < lines.length && lines[j]!.trim().startsWith("|")) {
        rows.push(splitRow(lines[j]!));
        j += 1;
      }
      tables.push({ heading, header, rows });
      i = j - 1;
    }
  }
  return tables;
}

function cleanCell(cell: string | undefined): string | null {
  if (cell === undefined) return null;
  const value = cell.replace(/`/gu, "").replace(/\*\*/gu, "").trim();
  return value || null;
}

function findLastIndex<T>(list: T[], predicate: (item: T, index: number) => boolean): number {
  for (let i = list.length - 1; i >= 0; i -= 1) if (predicate(list[i]!, i)) return i;
  return -1;
}

function idsIn(text: string | null | undefined, prefix: string): string[] {
  if (!text) return [];
  const re = new RegExp(`\\b${prefix}-\\d+[A-Za-z]?\\b`, "gu");
  return [...new Set(text.match(re) ?? [])];
}

// ------------------------------------------------------------ package model

export interface RawWorkorder {
  id: string;
  file: string;
  title: string;
  kind: string;
  status: string;
  statusSource: "file" | "inferred";
  wave: string;
  surface: string | null;
  workClass: string | null;
  dependsOn: string[];
  riskIds: string[];
  gateIds: string[];
  dodIds: string[];
  agent: string | null;
  /** `allowed_write_paths`, relative to the folder delivery works in. */
  writePaths: string[];
}

export interface RawFix {
  id: string;
  file: string;
  kind: "fix-workorder" | "finding-note";
  title: string;
  findingClass: string | null;
  rootCause: string | null;
  severity: string | null;
  sourceGate: string | null;
  originalWorkorder: string | null;
  closed: boolean | null;
}

export interface RawGate {
  id: string;
  title: string;
  criterion: string | null;
  evidence: string | null;
  riskIds: string[];
  dodIds: string[];
  tableStatus: string | null;
}

export interface RawScenario {
  id: string;
  dodIds: string[];
  boundary: string | null;
  given: string | null;
  when: string | null;
  then: string | null;
  approved: "user" | "agent" | null;
}

export interface ParsedState {
  status: string;
  profile: string | null;
  activePhase: string | null;
  activeWave: string | null;
  nextAction: string | null;
  updatedAt: string | null;
  readiness: {
    implementation: string | null;
    runtime: string | null;
    release: string | null;
  };
  blockers: Blocker[];
  findings: Finding[];
  feature: string | null;
}

export interface ParsedPackage {
  dir: string;
  exists: boolean;
  title: string | null;
  state: ParsedState | null;
  artifacts: Artifact[];
  workorders: RawWorkorder[];
  fixes: RawFix[];
  gates: RawGate[];
  risks: Risk[];
  /** `### Acceptance Scenarios` of 09-dod.md: the oracle delivery's blind acceptance suite executes. */
  scenarios: RawScenario[];
  /** DOD ids 09-dod.md and the gate mapping name (to show items without a scenario). */
  dodIds: string[];
  /** Lines from verification reports and STATE that mention a gate id. */
  gateMentions: Map<string, string[]>;
  evidenceNames: string[];
  manifestBaseRef: string | null;
}

const DONE_STATUSES = new Set(["complete", "completed", "delivered", "released", "done"]);

export function isDoneStatus(status: string): boolean {
  return DONE_STATUSES.has(status);
}

function parseState(text: string | null): ParsedState | null {
  if (text === null) return null;
  const { data, body } = splitFrontmatter(text);
  const blockers: Blocker[] = Array.isArray(data.blockers)
    ? (data.blockers as Json[]).flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const item = entry as Record<string, Json>;
        const id = str(item.id);
        if (id === null) return [];
        return [
          {
            id,
            statement: str(item.statement) ?? "",
            owner: str(item.owner),
            needsUserDecision: bool(item.needs_user_decision) ?? false,
            resolved: bool(item.resolved) ?? false,
          },
        ];
      })
    : [];
  const findings: Finding[] = Array.isArray(data.findings)
    ? (data.findings as Json[]).flatMap((entry) => {
        if (!entry || typeof entry !== "object") return [];
        const item = entry as Record<string, Json>;
        const id = str(item.id);
        if (id === null) return [];
        return [
          {
            id,
            statement: str(item.statement) ?? "",
            closed: bool(item.closed) ?? false,
          },
        ];
      })
    : [];
  return {
    status: str(data.status) ?? "discovery",
    profile: str(data.discovery_profile),
    activePhase: str(data.active_phase),
    activeWave: str(data.active_wave),
    nextAction: str(data.next_action),
    updatedAt: str(data.updated_at),
    readiness: {
      implementation: str(data.ready_for_implementation),
      runtime: str(data.ready_for_runtime_verification),
      release: str(data.ready_for_release),
    },
    blockers,
    findings,
    feature: bulletValue(body, ["Feature", "Фича", "Функция"]),
  };
}

const KNOWN_ARTIFACTS = [
  "00-intake.md",
  "00-discussion-log.md",
  "codemap.md",
  "01-prd.md",
  "02-ux-problem-framing.md",
  "02-ui-spec.md",
  "02-ui-prototype.md",
  "03-risk-register.md",
  "04-trd.md",
  "05-api-contracts.md",
  "06-data-models.md",
  "07-implementation-plan.md",
  "08-quality-gates.md",
  "09-dod.md",
  "10-backend-verification.md",
  "10-ui-verification.md",
  "DISCOVERY-SUMMARY.md",
];

function parseArtifacts(dir: string, stateText: string | null): Artifact[] {
  const statuses = new Map<string, string>();
  if (stateText) {
    for (const table of parseTables(stateText)) {
      if (!/artifact/iu.test(table.header[0] ?? "")) continue;
      for (const row of table.rows) {
        const name = cleanCell(row[0]);
        const status = cleanCell(row[1]);
        if (name && status) statuses.set(name, status);
      }
    }
  }
  const names = new Set<string>(KNOWN_ARTIFACTS);
  for (const name of statuses.keys()) names.add(name);
  for (const name of listDir(dir)) {
    if (/^\d\d-.*\.md$/u.test(name)) names.add(name);
  }
  return [...names]
    .map((name) => {
      const exists = readText(join(dir, name)) !== null;
      const status = statuses.get(name) ?? (exists ? "present" : "absent");
      return { name, status, exists };
    })
    .filter((artifact) => artifact.exists || statuses.has(artifact.name))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function stripIdPrefix(title: string, id: string): string {
  return title
    .replace(new RegExp(`^${id}\\b\\s*[—–:\\-.]*\\s*`, "u"), "")
    .replace(/^(Fix Workorder|Finding Note|Workorder)\s*[—–:\-]*\s*/iu, "")
    .trim();
}

function parseWorkorders(dir: string): RawWorkorder[] {
  const woDir = join(dir, "workorders");
  return listDir(woDir)
    .filter((name) => name.endsWith(".md"))
    .flatMap((name) => {
      const text = readText(join(woDir, name));
      if (text === null) return [];
      const { data, body } = splitFrontmatter(text);
      // Pre-V4 packages carry no frontmatter: fall back to the Identity bullets.
      const id =
        str(data.id) ??
        /^(WO-\d+[A-Za-z]?)/u.exec(name)?.[1] ??
        bulletValue(body, ["ID"]) ??
        name.replace(/\.md$/u, "");
      const heading = firstHeading(body);
      const title =
        bulletValue(body, ["Title", "Название"]) ??
        (heading ? stripIdPrefix(heading, id) : null) ??
        id;
      const dependsBullet = bulletValue(body, ["Depends on", "Зависит от"]);
      return [
        {
          id,
          file: `workorders/${name}`,
          title,
          kind: str(data.kind) ?? "implementation",
          status: str(data.status) ?? bulletValue(body, ["Status", "Статус"])?.toLowerCase() ?? "unknown",
          statusSource: "file" as const,
          wave: str(data.wave) ?? bulletValue(body, ["Wave", "Волна"])?.match(/W\d+/u)?.[0] ?? "none",
          surface: str(data.surface) ?? bulletValue(body, ["Surface"]),
          workClass: str(data.work_class),
          dependsOn: data.depends_on !== undefined ? strList(data.depends_on) : idsIn(dependsBullet, "WO"),
          riskIds: strList(data.risk_ids),
          gateIds: strList(data.gate_ids),
          dodIds: strList(data.dod_ids),
          agent: bulletValue(body, ["Recommended agent", "Агент"]),
          writePaths: strList(data.allowed_write_paths),
        },
      ];
    })
    .sort((a, b) => naturalCompare(a.id, b.id));
}

const SETTLED_WO = new Set(["done", "deferred", "blocked", "in_progress"]);

/**
 * Delivery treats accepted workorders as immutable contracts, so many
 * packages never flip `status: ready` to `done`. Infer completion from the
 * package status (implementation_complete and later means every required
 * implementation workorder is done) or from the slice's evidence directory.
 */
function inferWorkorderStatus(workorders: RawWorkorder[], packageStatus: string, evidenceNames: string[]): void {
  const pastImplementation =
    ["implementation_complete", "verifying", "ready_for_release"].includes(packageStatus) || isDoneStatus(packageStatus);
  for (const wo of workorders) {
    if (SETTLED_WO.has(wo.status)) continue;
    if (wo.kind !== "implementation" && wo.kind !== "spike") continue;
    const hasEvidence = evidenceNames.some(
      (name) => name === wo.id || name.startsWith(`${wo.id}-`) || name.startsWith(`${wo.id}_`) || name.startsWith(`${wo.id}.`),
    );
    if (pastImplementation || hasEvidence) {
      wo.status = "done";
      wo.statusSource = "inferred";
    }
  }
}

/**
 * Pre-frontmatter fix workorders record closure in prose: a STATE.md heading
 * or line ("### F-0034 закрыт", "F-0025 closed"), a slice entry for the fix
 * with "Вердикт: pass", a "## Закрытие" section in the fix file, or the fix's
 * evidence directory.
 */
function inferFixClosed(id: string, body: string, stateText: string, evidenceNames: string[]): boolean | null {
  const escaped = id.replace(/[^A-Za-z0-9-]/gu, "");
  if (new RegExp(`${escaped}[^\\n]{0,80}?(закрыт|closed|resolved)`, "iu").test(stateText)) return true;
  const slice = new RegExp(`^#{2,4}[^\\n]*${escaped}[^\\n]*\\n(?:-[^\\n]*\\n){0,8}?-\\s*(Вердикт|Verdict):\\s*pass`, "imu");
  if (slice.test(stateText)) return true;
  if (/^#{1,4}\s*(Закрытие|Closure|Closed|Итог закрытия)/imu.test(body)) return true;
  if (evidenceNames.includes(id)) return true;
  return null;
}

function parseFixes(dir: string, findings: Finding[], stateText: string, evidenceNames: string[]): RawFix[] {
  const closedById = new Map(findings.map((f) => [f.id, f.closed]));
  const out: RawFix[] = [];
  for (const [sub, kind] of [
    ["fix-workorders", "fix-workorder"],
    ["finding-notes", "finding-note"],
  ] as const) {
    const fixDir = join(dir, sub);
    for (const name of listDir(fixDir)) {
      if (!name.endsWith(".md")) continue;
      const text = readText(join(fixDir, name));
      if (text === null) continue;
      const { data, body } = splitFrontmatter(text);
      const id = str(data.id) ?? name.replace(/\.md$/u, "");
      const heading = firstHeading(body);
      out.push({
        id,
        file: `${sub}/${name}`,
        kind,
        title:
          bulletValue(body, ["Finding"]) && kind === "finding-note"
            ? stripIdPrefix(bulletValue(body, ["Finding"])!, id)
            : heading
              ? stripIdPrefix(heading, id) || id
              : id,
        findingClass: str(data.class),
        rootCause: str(data.root_cause),
        severity: bulletValue(body, ["Severity", "Серьёзность", "Критичность"]),
        sourceGate: bulletValue(body, ["Source gate", "Гейт"]),
        originalWorkorder: bulletValue(body, ["Original workorder"]),
        closed: bool(data.closed) ?? closedById.get(id) ?? inferFixClosed(id, body, stateText, evidenceNames),
      });
    }
  }
  // The same finding can have both a fix workorder and a finding note: keep
  // one entry (the fix workorder), closed if either says so.
  const byId = new Map<string, RawFix>();
  for (const fix of out) {
    const existing = byId.get(fix.id);
    if (!existing) {
      byId.set(fix.id, fix);
      continue;
    }
    const primary = existing.kind === "fix-workorder" ? existing : fix;
    const other = primary === existing ? fix : existing;
    byId.set(fix.id, {
      ...primary,
      closed: primary.closed === true || other.closed === true ? true : (primary.closed ?? other.closed),
      findingClass: primary.findingClass ?? other.findingClass,
      rootCause: primary.rootCause ?? other.rootCause,
      severity: primary.severity ?? other.severity,
    });
  }
  return [...byId.values()].sort((a, b) => naturalCompare(a.id, b.id));
}

function parseGates(dir: string): RawGate[] {
  const text = readText(join(dir, "08-quality-gates.md"));
  if (text === null) return [];
  const gates = new Map<string, RawGate>();
  const dodLinks = new Map<string, Set<string>>();
  for (const table of parseTables(text)) {
    const headerText = table.header.join(" ");
    const isMapping =
      /->|→/u.test(table.heading) ||
      (/dod/iu.test(table.header[1] ?? "") && table.header.length <= 3);
    for (const row of table.rows) {
      const first = cleanCell(row[0]);
      if (!first || !/^G-\d+/u.test(first)) continue;
      const id = /^G-\d+/u.exec(first)![0];
      if (isMapping) {
        const set = dodLinks.get(id) ?? new Set<string>();
        for (const dod of idsIn(row.slice(1).join(" "), "DOD")) set.add(dod);
        dodLinks.set(id, set);
        continue;
      }
      if (gates.has(id)) continue;
      const statusCol = table.header.findIndex((h) => /status|статус|result|результат/iu.test(h));
      const riskCol = table.header.findIndex((h) => /risk|риск/iu.test(h));
      const evidenceCol = findLastIndex(table.header, (h) => /evidence|доказ|command|команд|как провер/iu.test(h));
      const criterionCol = table.header.findIndex((h, index) => index > 1 && index !== evidenceCol && /criterion|критер|что провер|провер|check|pass|условие/iu.test(h));
      gates.set(id, {
        id,
        title: cleanCell(row[1]) ?? id,
        criterion: cleanCell(row[criterionCol > 1 ? criterionCol : 2]) ?? null,
        evidence: evidenceCol > 1 && evidenceCol !== (criterionCol > 1 ? criterionCol : 2) ? cleanCell(row[evidenceCol]) : cleanCell(row[3]),
        riskIds: idsIn(
          riskCol >= 0 ? row[riskCol] : row[row.length - 1],
          "R",
        ),
        dodIds: [],
        tableStatus: statusCol >= 0 ? cleanCell(row[statusCol]) : null,
      });
      void headerText;
    }
  }
  // Gates written as their own heading: "## G-28 — title".
  for (const match of text.matchAll(/^#{2,4}\s+(G-\d+)\s*[—–:\-]+\s*(.+)$/gmu)) {
    const id = match[1]!;
    if (!gates.has(id)) {
      gates.set(id, {
        id,
        title: match[2]!.trim(),
        criterion: null,
        evidence: null,
        riskIds: [],
        dodIds: [],
        tableStatus: null,
      });
    }
  }
  for (const [id, dods] of dodLinks) {
    const gate = gates.get(id);
    if (gate) gate.dodIds = [...dods];
  }
  return [...gates.values()].sort((a, b) => naturalCompare(a.id, b.id));
}

function parseRisks(dir: string): Risk[] {
  const text = readText(join(dir, "03-risk-register.md"));
  if (text === null) return [];
  const risks = new Map<string, Risk>();
  for (const table of parseTables(text)) {
    for (const row of table.rows) {
      const first = cleanCell(row[0]);
      if (!first || !/^R-\d+/u.test(first)) continue;
      const id = /^R-\d+/u.exec(first)![0];
      if (!risks.has(id)) risks.set(id, { id, title: cleanCell(row[1]) ?? id });
    }
  }
  for (const match of text.matchAll(/^#{2,4}\s+(R-\d+)\s*[—–:\-.]+\s*(.+)$/gmu)) {
    if (!risks.has(match[1]!)) risks.set(match[1]!, { id: match[1]!, title: match[2]!.trim() });
  }
  return [...risks.values()].sort((a, b) => naturalCompare(a.id, b.id));
}

function parseScenarios(dir: string): RawScenario[] {
  const text = readText(join(dir, "09-dod.md"));
  if (text === null) return [];
  const out = new Map<string, RawScenario>();
  for (const table of parseTables(text)) {
    const col = (re: RegExp) => table.header.findIndex((h) => re.test(h));
    const dod = col(/dod/iu);
    const boundary = col(/boundary|границ|поверхност/iu);
    const given = col(/given|дано/iu);
    const when = col(/when|когда|действи/iu);
    const then = col(/then|expected|ожида|тогда/iu);
    const approved = col(/approved|утвержд|одобр/iu);
    for (const row of table.rows) {
      const first = cleanCell(row[0]);
      const id = first ? /^AS-\d+[A-Za-z]?/u.exec(first)?.[0] : null;
      if (!id || out.has(id)) continue;
      const approvedText = approved >= 0 ? (cleanCell(row[approved]) ?? "").toLowerCase() : "";
      out.set(id, {
        id,
        dodIds: idsIn(dod >= 0 ? row[dod] : row.join(" "), "DOD"),
        boundary: boundary >= 0 ? cleanCell(row[boundary]) : null,
        given: given >= 0 ? cleanCell(row[given]) : null,
        when: when >= 0 ? cleanCell(row[when]) : null,
        then: then >= 0 ? cleanCell(row[then]) : (cleanCell(row[row.length - 2]) ?? null),
        approved: /user|пользоват/u.test(approvedText) ? "user" : /agent|агент|default/u.test(approvedText) ? "agent" : null,
      });
    }
  }
  return [...out.values()].sort((a, b) => naturalCompare(a.id, b.id));
}

function collectDodIds(dir: string): string[] {
  const ids = new Set<string>();
  for (const file of ["09-dod.md", "08-quality-gates.md"]) {
    for (const id of idsIn(readText(join(dir, file)), "DOD")) ids.add(id);
  }
  return [...ids].sort(naturalCompare);
}

function collectGateMentions(dir: string): Map<string, string[]> {
  const mentions = new Map<string, string[]>();
  const sources = ["10-backend-verification.md", "10-ui-verification.md", "STATE.md"];
  for (const source of sources) {
    const text = readText(join(dir, source));
    if (text === null) continue;
    for (const line of text.split(/\r?\n/u)) {
      for (const id of idsIn(line, "G")) {
        const list = mentions.get(id) ?? [];
        if (list.length < 16) list.push(`${source}: ${line.trim().slice(0, 400)}`);
        mentions.set(id, list);
      }
    }
  }
  return mentions;
}

function packageTitle(dir: string, state: ParsedState | null): string | null {
  for (const name of ["00-intake.md", "01-prd.md"]) {
    const text = readText(join(dir, name));
    if (text === null) continue;
    const heading = firstHeading(splitFrontmatter(text).body);
    if (!heading) continue;
    const cleaned = heading
      .replace(/^(\d\d\s*[—–-]?\s*)?(Intake|Интейк|PRD|Приём задачи)\s*[:—–-]*\s*/iu, "")
      .trim();
    if (cleaned && !/^(\d\d\s*[—–-]?\s*)?(intake|интейк|prd)$/iu.test(cleaned)) return cleaned;
  }
  return state?.feature ?? null;
}

export function readPackage(dir: string): ParsedPackage {
  const stateText = readText(join(dir, "STATE.md"));
  const state = parseState(stateText);
  let manifestBaseRef: string | null = null;
  const manifestText = readText(join(dir, "REVIEW-MANIFEST.json"));
  if (manifestText) {
    try {
      const manifest = JSON.parse(manifestText) as { base?: { ref?: unknown } };
      manifestBaseRef = typeof manifest.base?.ref === "string" ? manifest.base.ref : null;
    } catch {
      manifestBaseRef = null;
    }
  }
  const workorders = parseWorkorders(dir);
  const evidenceNames = listDir(join(dir, "evidence"));
  inferWorkorderStatus(workorders, state?.status ?? "discovery", evidenceNames);
  return {
    dir,
    // `inputs/` alone (materials attached before discovery started) is not a package yet.
    exists: isDirectory(dir) && readdirSync(dir).some((name) => name !== "inputs" && !name.startsWith(".")),
    title: packageTitle(dir, state),
    state,
    artifacts: parseArtifacts(dir, stateText),
    workorders,
    fixes: parseFixes(dir, state?.findings ?? [], stateText ?? "", evidenceNames),
    gates: parseGates(dir),
    risks: parseRisks(dir),
    scenarios: parseScenarios(dir),
    dodIds: collectDodIds(dir),
    gateMentions: collectGateMentions(dir),
    evidenceNames,
    manifestBaseRef,
  };
}

// ------------------------------------------------------------ derivations

const STATUS_CELL = /^(pass(ed)?|ok|green|✅|fail(ed)?|❌|red|blocked(-no-evidence)?|заблок\S*|пройден\S*|провален\S*)(?![\w-])/iu;

function statusFromToken(token: string): GateStatus | null {
  const t = token.toLowerCase();
  if (/^(pass|ok|green|✅|пройден)/u.test(t)) return "passed";
  if (/^(fail|❌|red|провален)/u.test(t)) return "failed";
  if (/^(blocked|заблок)/u.test(t)) return "blocked";
  return null;
}

/**
 * A gate's status is not a field of the AIRD contract; delivery records it in
 * the verification reports. Read, in order: a status column in
 * 08-quality-gates.md, a status cell in a 10-*-verification.md table row for
 * the gate, an open STATE.md blocker that names the gate, the package's
 * release status, then evidence/<gate-id>.
 */
export function deriveGateStatus(
  gate: RawGate,
  mentions: string[],
  evidenceNames: string[],
  packageStatus: string,
  openBlockerText = "",
): GateStatus {
  if (gate.tableStatus) {
    const fromTable = statusFromToken(gate.tableStatus.trim());
    if (fromTable) return fromTable;
  }
  let reportStatus: GateStatus | null = null;
  for (const mention of mentions) {
    if (!mention.startsWith("10-")) continue;
    const line = mention.slice(mention.indexOf(":") + 1).trim();
    if (line.startsWith("|")) {
      for (const cell of line.split("|").map((c) => c.replace(/[`*]/gu, "").trim())) {
        const match = STATUS_CELL.exec(cell);
        if (match) {
          reportStatus = statusFromToken(match[1]!) ?? reportStatus;
          break;
        }
      }
    } else {
      const near = new RegExp(`${gate.id}\\b[^\\n]{0,40}?[:—–-]\\s*(pass(?:ed)?|fail(?:ed)?|blocked(?:-no-evidence)?)\\b(?![-_])`, "iu").exec(line);
      if (near) reportStatus = statusFromToken(near[1]!) ?? reportStatus;
    }
    if (reportStatus === "failed") break;
  }
  if (reportStatus) return reportStatus;
  if (openBlockerText && new RegExp(`\\b${gate.id}\\b`, "u").test(openBlockerText)) return "blocked";
  if (packageStatus === "ready_for_release" || isDoneStatus(packageStatus)) return "passed";
  if (evidenceNames.some((name) => name === gate.id || name.startsWith(`${gate.id}-`) || name.startsWith(`${gate.id}.`))) {
    return "evidence";
  }
  return "pending";
}

interface StageDef {
  id: string;
  label: string;
  match: RegExp;
  artifact?: string;
}

const DISCOVERY_STAGES: StageDef[] = [
  { id: "intake", label: "Intake", match: /intake/iu, artifact: "00-intake.md" },
  { id: "discussion", label: "Обсуждение", match: /discuss|interview|decision/iu, artifact: "00-discussion-log.md" },
  { id: "recon", label: "Разведка", match: /recon|codemap|current/iu, artifact: "codemap.md" },
  { id: "probe", label: "Проба рисков", match: /probe|spike|existential/iu },
  { id: "product", label: "PRD / UX", match: /prd|product|ux|ui-spec/iu, artifact: "01-prd.md" },
  { id: "prototype", label: "Прототип", match: /prototype/iu, artifact: "02-ui-prototype.md" },
  { id: "risks", label: "Риски", match: /risk/iu, artifact: "03-risk-register.md" },
  { id: "trd", label: "TRD", match: /trd|technical|contract|data-model|design|architecture/iu, artifact: "04-trd.md" },
  { id: "plan", label: "План и гейты", match: /plan|gate|workorder|dod/iu, artifact: "07-implementation-plan.md" },
  { id: "review", label: "Финальное ревью", match: /review|accept|summary/iu, artifact: "DISCOVERY-SUMMARY.md" },
];

/**
 * The files each discovery stage writes. A stage whose files changed after
 * the last STATE.md checkpoint is being worked on now, even before the
 * orchestrator writes `active_phase` at the end of the phase; parallel stages
 * (prototype and TRD) can be current together.
 */
const STAGE_FILES: Record<string, string[]> = {
  intake: ["00-intake.md"],
  discussion: ["00-discussion-log.md"],
  recon: ["codemap.md"],
  probe: [],
  product: ["01-prd.md", "02-ux-problem-framing.md", "02-ui-spec.md"],
  prototype: ["02-ui-prototype.md", "prototype"],
  risks: ["03-risk-register.md"],
  trd: ["04-trd.md", "05-api-contracts.md", "06-data-models.md"],
  plan: ["07-implementation-plan.md", "08-quality-gates.md", "09-dod.md", "workorders"],
  review: ["DISCOVERY-SUMMARY.md", "REVIEW-MANIFEST.json"],
};

/** Latest change of a package file, or of the files directly inside a folder. */
function changedAt(dir: string, rel: string): { at: number; name: string } | null {
  const path = join(dir, rel);
  try {
    const stat = statSync(path);
    if (!stat.isDirectory()) return { at: stat.mtimeMs, name: rel };
    let latest = { at: stat.mtimeMs, name: `${rel}/` };
    for (const name of readdirSync(path)) {
      try {
        const child = statSync(join(path, name));
        if (child.mtimeMs > latest.at) latest = { at: child.mtimeMs, name: `${rel}/${name}` };
      } catch {
        // vanished
      }
    }
    return latest;
  } catch {
    return null;
  }
}

const STATUS_ORDER = [
  "discovery",
  "ready_for_delivery",
  "in_delivery",
  "implementation_complete",
  "verifying",
  "ready_for_release",
  "complete",
];

function statusRank(status: string): number {
  if (isDoneStatus(status)) return STATUS_ORDER.length - 1;
  const index = STATUS_ORDER.indexOf(status);
  return index;
}

export function naturalCompare(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

export function wavesOf(workorders: RawWorkorder[]): string[] {
  return [...new Set(workorders.map((wo) => wo.wave).filter((wave) => /^W\d+/u.test(wave)))].sort(
    naturalCompare,
  );
}

/**
 * Builds the two-lane stage graph: discovery phases, then delivery
 * (accepted → waves → verification → release → complete).
 */
export function deriveStages(pkg: ParsedPackage): {
  stages: StageNode[];
  current: StageNode;
  progress: number;
} {
  const state = pkg.state;
  const status = state?.status ?? "discovery";
  const paused = status === "paused";
  const phase = `${state?.activePhase ?? ""} ${state?.nextAction ?? ""}`;
  const waves = wavesOf(pkg.workorders);
  const existing = new Set(pkg.artifacts.filter((a) => a.exists).map((a) => a.name));

  // Where are we? Use the explicit status first; fall back to phase text and
  // which artifacts exist (discovery writes them in risk order).
  let rank = statusRank(status);
  if (paused || rank < 0) {
    if (/verif|release|browser|qa\b/iu.test(phase)) rank = STATUS_ORDER.indexOf("verifying");
    else if (/deliver|wave|W\d|slice|implement/iu.test(phase) || pkg.workorders.some((w) => w.status === "done" || w.status === "in_progress")) {
      rank = STATUS_ORDER.indexOf("in_delivery");
    } else rank = 0;
  }

  const stages: StageNode[] = [];
  let discoveryCurrent = DISCOVERY_STAGES.length; // past the end = discovery done
  // Stages ahead of the recorded phase whose files changed after the last checkpoint.
  const fresh = new Map<number, string>();
  let recordedDone = false;
  if (rank === 0) {
    discoveryCurrent = DISCOVERY_STAGES.findIndex((s) => s.match.test(state?.activePhase ?? ""));
    if (discoveryCurrent < 0) {
      let lastPresent = 0;
      DISCOVERY_STAGES.forEach((stage, index) => {
        if (stage.artifact && existing.has(stage.artifact)) lastPresent = index;
      });
      discoveryCurrent = lastPresent;
    }
    const checkpoint = changedAt(pkg.dir, "STATE.md")?.at ?? null;
    if (checkpoint !== null) {
      const newer = (id: string) =>
        (STAGE_FILES[id] ?? [])
          .map((rel) => changedAt(pkg.dir, rel))
          .filter((change): change is { at: number; name: string } => change !== null && change.at > checkpoint + 1000)
          .sort((a, b) => b.at - a.at)[0];
      DISCOVERY_STAGES.forEach((stage, index) => {
        if (index <= discoveryCurrent) return;
        const change = newer(stage.id);
        if (change) fresh.set(index, `${change.name} — новее отметки в STATE.md`);
      });
      // Work has moved past the recorded phase unless that phase's own files changed too.
      recordedDone = fresh.size > 0 && !newer(DISCOVERY_STAGES[discoveryCurrent]?.id ?? "");
    }
  }
  const furthest = Math.max(discoveryCurrent, ...fresh.keys());
  DISCOVERY_STAGES.forEach((stage, index) => {
    const active = (index === discoveryCurrent && !recordedDone) || fresh.has(index);
    const state_: StageNode["state"] =
      active ? (paused ? "blocked" : "current") : index <= furthest ? "done" : "todo";
    stages.push({
      id: stage.id,
      label: stage.label,
      lane: "discovery",
      state: state_,
      detail: fresh.get(index) ?? (stage.artifact && existing.has(stage.artifact) ? stage.artifact : null),
    });
  });

  const deliveryDefs: { id: string; label: string; rank: number; detail: string | null }[] = [
    { id: "accepted", label: "Готов к delivery", rank: 1, detail: null },
    ...(waves.length > 0
      ? waves.map((wave) => {
          const items = pkg.workorders.filter((wo) => wo.wave === wave);
          const done = items.filter((wo) => wo.status === "done").length;
          return { id: `wave-${wave}`, label: `Волна ${wave}`, rank: 2, detail: `${done}/${items.length} WO` };
        })
      : [
          {
            id: "wave-*",
            label: "Реализация",
            rank: 2,
            detail: `${pkg.workorders.filter((wo) => wo.status === "done").length}/${pkg.workorders.length} WO`,
          },
        ]),
    { id: "implemented", label: "Реализация готова", rank: 3, detail: null },
    { id: "verifying", label: "Верификация", rank: 4, detail: null },
    { id: "release", label: "Готов к релизу", rank: 5, detail: null },
    { id: "complete", label: "Завершён", rank: 6, detail: null },
  ];

  // Within delivery, the current wave is the active one or the first wave
  // that still has open work.
  const activeWave =
    (state?.activeWave && waves.includes(state.activeWave) ? state.activeWave : null) ??
    waves.find((wave) => pkg.workorders.some((wo) => wo.wave === wave && wo.status !== "done")) ??
    waves[waves.length - 1] ??
    null;

  for (const def of deliveryDefs) {
    let nodeState: StageNode["state"];
    if (def.rank === 2 && def.id === "wave-*") {
      nodeState = rank > 2 ? "done" : rank === 2 ? (paused ? "blocked" : "current") : "todo";
    } else if (def.rank === 2) {
      const wave = def.id.slice(5);
      const items = pkg.workorders.filter((wo) => wo.wave === wave);
      const allDone = items.length > 0 && items.every((wo) => wo.status === "done");
      if (rank > 2 || (rank === 2 && allDone && wave !== activeWave)) nodeState = "done";
      else if (rank === 2 && wave === activeWave) nodeState = paused ? "blocked" : "current";
      else if (rank === 2 && allDone) nodeState = "done";
      else nodeState = "todo";
    } else if (def.rank < rank) nodeState = "done";
    else if (def.rank === rank) nodeState = def.id === "complete" ? "done" : paused ? "blocked" : "current";
    else nodeState = "todo";
    stages.push({ id: def.id, label: def.label, lane: "delivery", state: nodeState, detail: def.detail });
  }

  // The furthest stage in progress: parallel discovery stages can be current together.
  const current =
    [...stages].reverse().find((s) => s.state === "current" || s.state === "blocked") ??
    [...stages].reverse().find((s) => s.state === "done") ??
    stages[0]!;
  const doneCount = stages.filter((s) => s.state === "done").length;
  const progress = Math.round((doneCount / stages.length) * 100);
  return { stages, current, progress };
}

// ------------------------------------------------------------ details

export const REF_PATTERN = /\b(WO-\d+[A-Za-z]?|F-\d{2,}|G-\d+|R-\d+|DOD-\d+|B-\d+|EC-\d+)\b/gu;

export type RefKind = "workorder" | "fix" | "gate" | "risk" | "dod" | "edge-case" | "blocker" | "finding" | "unknown";

export interface RefDetail {
  ref: string;
  kind: RefKind;
  title: string;
  file: string | null;
  fields: { name: string; value: string }[];
  markdown: string | null;
  related: string[];
  mentions: { file: string; line: string }[];
}

const MAX_MARKDOWN = 150_000;

function capText(text: string): string {
  return text.length > MAX_MARKDOWN ? `${text.slice(0, MAX_MARKDOWN)}\n\n…(обрезано)` : text;
}

function flattenValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (Array.isArray(value)) {
    if (value.every((item) => item === null || typeof item !== "object")) return value.length ? value.join(", ") : "—";
    return JSON.stringify(value, null, 1);
  }
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === "object") return JSON.stringify(value, null, 1);
  return String(value);
}

export function frontmatterFields(data: Record<string, unknown>, skip: string[] = []): { name: string; value: string }[] {
  return Object.entries(data)
    .filter(([key]) => !skip.includes(key))
    .map(([name, value]) => ({ name, value: flattenValue(value) }));
}

function refRegex(ref: string, flags = "u"): RegExp {
  return new RegExp(`(?<![A-Za-z0-9-])${ref.replace(/[^A-Za-z0-9-]/gu, "")}(?![0-9A-Za-z])`, flags);
}

/** The heading section that names the ref, up to the next heading of the same or a higher level. */
function headingSection(text: string, ref: string): string | null {
  const lines = text.split(/\r?\n/u);
  const re = refRegex(ref);
  for (let i = 0; i < lines.length; i += 1) {
    const match = /^(#{1,6})\s+(.*)$/u.exec(lines[i]!);
    if (!match || !re.test(match[2]!)) continue;
    const level = match[1]!.length;
    const out = [lines[i]!];
    for (let j = i + 1; j < lines.length; j += 1) {
      const next = /^(#{1,6})\s/u.exec(lines[j]!);
      if (next && next[1]!.length <= level) break;
      out.push(lines[j]!);
    }
    return out.join("\n").trim();
  }
  return null;
}

/**
 * A table row whose first cell is the ref, as header → cell pairs. Mapping
 * tables ("Gate -> DoD Mapping") only count when no definition table names
 * the ref; among definition tables the widest wins.
 */
function tableRow(text: string, ref: string): { fields: { name: string; value: string }[]; heading: string } | null {
  const re = new RegExp(`^${ref.replace(/[^A-Za-z0-9-]/gu, "")}(?![0-9A-Za-z])`, "u");
  let best: { fields: { name: string; value: string }[]; heading: string; score: number } | null = null;
  for (const table of parseTables(text)) {
    const mapping = /->|→|mapping/iu.test(table.heading);
    for (const row of table.rows) {
      const first = cleanCell(row[0]);
      if (!first || !re.test(first) || row.length < 2) continue;
      const score = (mapping ? 0 : 100) + table.header.length;
      if (best && best.score >= score) continue;
      best = {
        score,
        heading: table.heading,
        fields: table.header.map((name, index) => ({
          name: cleanCell(name) ?? `#${index + 1}`,
          value: (row[index] ?? "").replace(/<br\s*\/?>/giu, "\n").trim() || "—",
        })),
      };
    }
  }
  if (!best) return null;
  // A mapping row alone does not give a title; let the heading section win.
  if (best.score < 100) return { heading: best.heading, fields: [{ name: "ref", value: ref }, ...best.fields.slice(1).map((f) => ({ ...f, name: `${best!.heading}: ${f.name}` }))] };
  return { heading: best.heading, fields: best.fields };
}

function packageFiles(dir: string): string[] {
  const top = listDir(dir).filter((name) => name.endsWith(".md"));
  const nested = ["workorders", "fix-workorders", "finding-notes"].flatMap((sub) =>
    listDir(join(dir, sub))
      .filter((name) => name.endsWith(".md"))
      .map((name) => `${sub}/${name}`),
  );
  return [...top, ...nested];
}

function findMentions(dir: string, ref: string, exclude: string | null): { file: string; line: string }[] {
  const re = refRegex(ref);
  const out: { file: string; line: string }[] = [];
  for (const file of packageFiles(dir)) {
    if (file === exclude) continue;
    const text = readText(join(dir, file));
    if (text === null) continue;
    for (const line of text.split(/\r?\n/u)) {
      if (!re.test(line)) continue;
      out.push({ file, line: line.trim().slice(0, 500) });
      if (out.length >= 60) return out;
    }
  }
  return out;
}

function relatedIds(text: string, self: string): string[] {
  return [...new Set(text.match(REF_PATTERN) ?? [])].filter((id) => id !== self).sort(naturalCompare).slice(0, 60);
}

export function lookupRef(pkg: ParsedPackage, ref: string): RefDetail {
  const dir = pkg.dir;
  const empty = (kind: RefKind, title: string): RefDetail => ({
    ref,
    kind,
    title,
    file: null,
    fields: [],
    markdown: null,
    related: [],
    mentions: findMentions(dir, ref, null),
  });

  const fromFile = (kind: RefKind, file: string, title: string, extra: { name: string; value: string }[] = []): RefDetail => {
    const text = readText(join(dir, file)) ?? "";
    const { data, body } = splitFrontmatter(text);
    const fields = [...extra, ...frontmatterFields(data)];
    return {
      ref,
      kind,
      title,
      file,
      fields,
      markdown: capText(body.trim()),
      related: relatedIds(`${fields.map((f) => f.value).join(" ")}\n${body}`, ref),
      mentions: findMentions(dir, ref, file),
    };
  };

  if (/^WO-/u.test(ref)) {
    const wo = pkg.workorders.find((item) => item.id === ref);
    if (wo) {
      return fromFile("workorder", wo.file, wo.title, [
        { name: "Статус в пакете", value: `${wo.status}${wo.statusSource === "inferred" ? " (выведено из статуса пакета/evidence)" : ""}` },
      ]);
    }
    return empty("workorder", "Воркордер не найден");
  }

  {
    // Blocker ids are free-form (B-03, REL-W1, F-0033…): check STATE.md first.
    const stateText = readText(join(dir, "STATE.md")) ?? "";
    const state = splitFrontmatter(stateText).data;
    const blocker = Array.isArray(state.blockers)
      ? (state.blockers as Record<string, unknown>[]).find((item) => item && item.id === ref)
      : undefined;
    if (blocker && !pkg.fixes.some((fix) => fix.id === ref)) {
      return {
        ...empty("blocker", flattenValue(blocker.statement).slice(0, 160)),
        file: "STATE.md",
        fields: frontmatterFields(blocker, ["id"]),
        markdown: headingSection(splitFrontmatter(stateText).body, ref),
        related: relatedIds(JSON.stringify(blocker), ref),
      };
    }
  }

  if (/^F-/u.test(ref)) {
    const stateText = readText(join(dir, "STATE.md")) ?? "";
    const state = splitFrontmatter(stateText).data;
    const finding = Array.isArray(state.findings)
      ? (state.findings as Record<string, unknown>[]).find((item) => item && item.id === ref)
      : undefined;
    const findingFields = finding ? frontmatterFields(finding, ["id"]).map((f) => ({ name: `review: ${f.name}`, value: f.value })) : [];
    const blocker = Array.isArray(state.blockers)
      ? (state.blockers as Record<string, unknown>[]).find((item) => item && item.id === ref)
      : undefined;
    const blockerFields = blocker ? frontmatterFields(blocker, ["id"]).map((f) => ({ name: `blocker: ${f.name}`, value: f.value })) : [];
    const fix = pkg.fixes.find((item) => item.id === ref);
    if (fix) return fromFile("fix", fix.file, fix.title, [...blockerFields, ...findingFields]);
    if (finding) {
      return {
        ...empty("finding", flattenValue(finding.statement).slice(0, 160)),
        file: "STATE.md",
        fields: frontmatterFields(finding, ["id"]),
        related: relatedIds(JSON.stringify(finding), ref),
      };
    }
    return empty("fix", "Фикс/находка не найдены");
  }

  if (/^B-/u.test(ref)) {
    const stateText = readText(join(dir, "STATE.md")) ?? "";
    const state = splitFrontmatter(stateText).data;
    const blocker = Array.isArray(state.blockers)
      ? (state.blockers as Record<string, unknown>[]).find((item) => item && item.id === ref)
      : undefined;
    if (!blocker) return empty("blocker", "Блокер не найден");
    return {
      ...empty("blocker", flattenValue(blocker.statement).slice(0, 160)),
      file: "STATE.md",
      fields: frontmatterFields(blocker, ["id"]),
      markdown: headingSection(splitFrontmatter(stateText).body, ref),
      related: relatedIds(JSON.stringify(blocker), ref),
    };
  }

  const docFor: Record<string, [RefKind, string]> = {
    G: ["gate", "08-quality-gates.md"],
    R: ["risk", "03-risk-register.md"],
    DOD: ["dod", "09-dod.md"],
    EC: ["edge-case", "01-prd.md"],
  };
  const prefix = ref.split("-")[0]!;
  const mapping = docFor[prefix];
  if (!mapping) return empty("unknown", ref);
  const [kind, file] = mapping;
  const text = readText(join(dir, file));
  if (text === null) return empty(kind, `${file} не найден`);
  const row = tableRow(text, ref);
  const section = headingSection(text, ref);
  let title = row && row.fields[0]?.name !== "ref" ? (row.fields[1]?.value ?? null) : null;
  if (!title && section) title = section.split("\n")[0]!.replace(/^#+\s*/u, "").replace(refRegex(ref), "").replace(/^[\s—–:.-]+/u, "");
  if (!title) {
    const line = text.split(/\r?\n/u).find((candidate) => refRegex(ref).test(candidate));
    title = line ? line.replace(/^[\s*|-]+/u, "").replace(refRegex(ref), "").replace(/^[\s|—–:.-]+/u, "").slice(0, 200) : ref;
  }
  // The parsed model already knows the definition row's title; prefer it.
  if (kind === "gate") title = pkg.gates.find((gate) => gate.id === ref)?.title ?? title;
  if (kind === "risk") title = pkg.risks.find((risk) => risk.id === ref)?.title ?? title;
  const fields = row ? row.fields.filter((f, index) => index > 0 && f.value !== "—") : [];
  if (kind === "gate") {
    const gate = pkg.gates.find((item) => item.id === ref);
    if (gate?.dodIds.length) fields.push({ name: "DoD (mapping)", value: gate.dodIds.join(", ") });
    const wos = pkg.workorders.filter((wo) => wo.gateIds.includes(ref)).map((wo) => wo.id);
    if (wos.length) fields.push({ name: "Воркордеры", value: wos.join(", ") });
  }
  if (kind === "risk") {
    const gates = pkg.gates.filter((gate) => gate.riskIds.includes(ref)).map((gate) => gate.id);
    if (gates.length) fields.push({ name: "Гейты", value: gates.join(", ") });
    const wos = pkg.workorders.filter((wo) => wo.riskIds.includes(ref)).map((wo) => wo.id);
    if (wos.length) fields.push({ name: "Воркордеры", value: wos.join(", ") });
  }
  if (kind === "dod") {
    const gates = pkg.gates.filter((gate) => gate.dodIds.includes(ref)).map((gate) => gate.id);
    if (gates.length) fields.push({ name: "Гейты", value: gates.join(", ") });
    const wos = pkg.workorders.filter((wo) => wo.dodIds.includes(ref)).map((wo) => wo.id);
    if (wos.length) fields.push({ name: "Воркордеры", value: wos.join(", ") });
  }
  return {
    ref,
    kind,
    title: title.replace(/`/gu, "").trim() || ref,
    file,
    fields,
    markdown: section ? capText(section) : null,
    related: relatedIds(`${fields.map((f) => f.value).join(" ")}\n${section ?? ""}`, ref),
    mentions: findMentions(dir, ref, null).filter(
      (mention) => !(mention.file === file && mention.line.replace(/[`*|\s]/gu, "").startsWith(ref)),
    ),
  };
}

/** A package file as markdown (frontmatter split out); paths may not leave the package. */
export function readPackageDoc(dir: string, relPath: string): { path: string; markdown: string; fields: { name: string; value: string }[]; truncated: boolean } | null {
  const normalized = relPath.replace(/\\/gu, "/").replace(/^\/+/u, "");
  if (normalized.split("/").some((part) => part === ".." || part === "")) return null;
  if (!/\.(md|json|log|txt|ya?ml|csv)$/iu.test(normalized)) return null;
  const text = readText(join(dir, normalized));
  if (text === null) return null;
  if (/\.json$/iu.test(normalized)) {
    return { path: normalized, markdown: `\`\`\`json\n${capText(text)}\n\`\`\``, fields: [], truncated: text.length > MAX_MARKDOWN };
  }
  if (!/\.md$/iu.test(normalized)) {
    return { path: normalized, markdown: `\`\`\`\n${capText(text)}\n\`\`\``, fields: [], truncated: text.length > MAX_MARKDOWN };
  }
  const { data, body } = splitFrontmatter(text);
  return { path: normalized, markdown: capText(body.trim()), fields: frontmatterFields(data), truncated: body.length > MAX_MARKDOWN };
}
