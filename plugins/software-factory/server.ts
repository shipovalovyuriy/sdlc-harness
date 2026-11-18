// Software Factory — AIRD discovery/delivery as a bb plugin.
//
// Projects are bb projects. Each project folder can hold AIRD packages under
// .agent/aird/<slug>/; the plugin reads them from disk (STATE.md, workorders,
// fix workorders, quality gates) and shows status, stages, workorders, gates,
// agent threads and commits. "Create" registers an AIRD and starts the
// aird-discovery-loop skill in a thread that runs in the chosen folder;
// every subagent the skill names (product-analyst, architect, qa, ...) is
// launched as its own child thread through the sf_spawn_agent tool.
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { accessSync, constants as fsConstants, existsSync, mkdirSync, readFileSync, realpathSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import {
  AIRD_DIR,
  deriveGateStatus,
  deriveStages,
  isDirectory,
  isDoneStatus,
  listPackageSlugs,
  lookupRef,
  readPackage,
  readPackageDoc,
  readText,
  splitFrontmatter,
  wavesOf,
  naturalCompare,
  type ParsedPackage,
} from "./src/aird";
import {
  AIRD_SKILL_AGENTS,
  agentPrompt,
  getAgentDefinition,
  listAgentDefinitions,
  runtimeDefaults,
  runtimeFamily,
} from "./src/agents";
import { airdCommits, commitDetail, commitsByHash, isGitFolder, packageCommitRefs, workspaceCommits } from "./src/git";
import { readEval, readMetrics } from "./src/metrics";
import { acceptanceBase, acceptanceSuiteRevision, deliveryRevision, ensureAcceptanceWorktree, ensureWorkspaceCheckout, ensureWorktree, gitDirs, gitText, isLinkedWorktree, migrateWorktreeToClone, nestedRepos, pushBranch, refreshAcceptanceWorktree, repoOfPath, withBaselineCheckout, ensureSuiteRepository, expandHome, isWorkspaceBase, parseWorkspaceBase, withWorkspaceBaseline, workspaceBase, workspaceRevision, type WorkspaceRepo } from "./src/worktree";
import { repeatedPreparationFailure, assessRun, hasSuite, runSuite, selectScenarioScope, type ScenarioResult, type SuiteRun } from "./src/acceptance";
import { LETTERS, answerSummary, parseTextQuestion, providerQuestion, textAnswer } from "./src/questions";
import { SECRET_NAME, secretLines, type SecretInfo } from "./src/project-secrets";
import { briefSections, sectionsMarkdown } from "./src/sections";
import { SLICE_LIMIT, allowedTargets, appendTransition, historyProblem, readTransitions, setField, sliceDecision, type Transition } from "./src/lifecycle";
import { inputLines, inputParts, inputsNamedIn, listInputs, removeInput, saveInput, type InputFile, type InputPart } from "./src/inputs";
import { modelFallback } from "./src/model-fallback";
import { verificationIdentity, evidenceState } from "./src/evidence-validity";
import { profileProblem } from "./src/process-policy";
import { EXECUTION_POLICY, decideExecutionBudget, scopesOverlap, checkpointProblem } from "./src/execution-budget";
import { usageCollector } from "./src/usage";
import {
  rpcContract,
  type AgentThread,
  type AirdDetail,
  type Commit,
  type CommitsResult,
  type Answers,
  type Question,
  type QuestionPart,
  type AirdSummary,
  type GateStatus,
  type ItemLabel,
  type ProjectSummary,
  type ReserveModel,
} from "./src/contract";

export { rpcContract };
export type * from "./src/contract";

const CHANGED = "sf-changed";
const RUNNING = new Set(["active", "starting", "pending", "stopping"]);

interface AirdRow {
  id: string;
  project_id: string;
  folder: string;
  slug: string;
  title: string;
  request: string | null;
  created_at: number;
  archived: number;
  worktree: string | null;
  work_folder: string | null;
  branch: string | null;
  base_ref: string | null;
  environment_id: string | null;
  worktree_note: string | null;
  acceptance_folder: string | null;
  acceptance_branch: string | null;
  /** JSON WorkspaceRepo[] when the AIRD works in a polyrepo workspace. */
  repos: string | null;
  /** Folder the stored bb environment was opened at; a different layout root needs a new one. */
  environment_root: string | null;
}

/**
 * One wave of blind acceptance. Factory records everything a run needs here
 * once, so no participant derives a path again: the base (captured before the
 * wave's first slice), the suite the test author registered (folder + commit)
 * and the working copy that holds the implementation.
 */
interface AcceptanceWaveRow {
  aird_id: string;
  wave: string;
  base_ref: string;
  suite_dir: string | null;
  suite_commit: string | null;
  target_dir: string | null;
  registered_at: number | null;
  registered_by: string | null;
}

interface AcceptanceRunRow {
  id: string;
  aird_id: string;
  kind: "baseline" | "wave";
  wave: string | null;
  scope_hash: string | null;
  target_revision: string | null;
  verdict: string | null;
  status: "running" | "passed" | "failed" | "error";
  started_at: number;
  finished_at: number | null;
  exit_code: number | null;
  results: string | null;
  log: string | null;
  error: string | null;
}

interface ThreadRow {
  thread_id: string;
  aird_id: string;
  role: string;
  kind: "orchestrator" | "agent";
  stage: "discovery" | "delivery" | null;
  parent_thread_id: string | null;
  title: string;
  created_at: number;
  model: string | null;
  effort: string | null;
  provider: string | null;
  /** JSON array of WO-/F- ids the agent works on. */
  refs: string | null;
  /** Stage node id (deriveStages) the agent was launched for. */
  stage_node: string | null;
  task: string | null;
  /** How many follow-ups the orchestrator sent to this agent with sf_continue_agent. */
  continuations?: number | null;
  /** When Factory told this implementation worker its action budget was spent. */
  budget_signal_at?: number | null;
}

interface QuestionRow {
  id: string;
  aird_id: string | null;
  thread_id: string;
  source: "tool" | "provider" | "approval" | "text";
  kind: "decision" | "approval" | "clarification" | "permission";
  number: number | null;
  context: string | null;
  parts: string;
  status: "open" | "answered" | "cancelled";
  answer_summary: string | null;
  answered_via: string | null;
  created_at: number;
  answered_at: number | null;
}

interface ProjectInfo {
  id: string;
  name: string;
  rootPath: string | null;
  hostId: string | null;
  local: boolean;
  sourcePaths: string[];
}

function parseRefs(value: string | null): string[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
  } catch {
    return [];
  }
}

export function airdIdFor(folder: string, slug: string): string {
  return `a_${createHash("sha1").update(`${resolve(folder)}\0${slug}`).digest("hex").slice(0, 12)}`;
}

export default async function plugin(bb: BbPluginApi) {
  const settings = bb.settings.define({
    worktreeRoot: {
      type: "string",
      label: "Папка для worktree AIRD",
      description: "Каждый AIRD работает в своей git worktree: <папка>/<репозиторий>/<slug>, ветка aird/<slug>.",
      default: "~/.aird-worktrees",
    },
  });
  const config = await settings.get();

  // ------------------------------------------------------------- storage
  const db = bb.storage.database();
  bb.storage.migrate(db, [
    `CREATE TABLE IF NOT EXISTS airds (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      folder TEXT NOT NULL,
      slug TEXT NOT NULL,
      title TEXT NOT NULL,
      request TEXT,
      created_at INTEGER NOT NULL,
      archived INTEGER NOT NULL DEFAULT 0
    )`,
    `CREATE TABLE IF NOT EXISTS threads (
      thread_id TEXT PRIMARY KEY,
      aird_id TEXT NOT NULL,
      role TEXT NOT NULL,
      kind TEXT NOT NULL,
      stage TEXT,
      parent_thread_id TEXT,
      title TEXT NOT NULL,
      created_at INTEGER NOT NULL
    )`,
    `CREATE INDEX IF NOT EXISTS threads_aird ON threads(aird_id)`,
    `CREATE TABLE IF NOT EXISTS labels (
      aird_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      label TEXT NOT NULL,
      PRIMARY KEY (aird_id, item_id)
    )`,
    `CREATE TABLE IF NOT EXISTS gate_overrides (
      aird_id TEXT NOT NULL,
      gate_id TEXT NOT NULL,
      status TEXT NOT NULL,
      note TEXT,
      PRIMARY KEY (aird_id, gate_id)
    )`,
    `CREATE TABLE IF NOT EXISTS project_folders (
      project_id TEXT NOT NULL,
      folder TEXT NOT NULL,
      PRIMARY KEY (project_id, folder)
    )`,
    `ALTER TABLE threads ADD COLUMN model TEXT`,
    `ALTER TABLE threads ADD COLUMN effort TEXT`,
    `CREATE TABLE IF NOT EXISTS agent_overrides (
      role TEXT PRIMARY KEY,
      model TEXT,
      effort TEXT
    )`,
    `ALTER TABLE agent_overrides ADD COLUMN provider TEXT`,
    `ALTER TABLE threads ADD COLUMN provider TEXT`,
    `CREATE TABLE IF NOT EXISTS orchestrator_config (
      stage TEXT PRIMARY KEY,
      provider TEXT,
      model TEXT,
      effort TEXT
    )`,
    `ALTER TABLE airds ADD COLUMN worktree TEXT`,
    `ALTER TABLE airds ADD COLUMN work_folder TEXT`,
    `ALTER TABLE airds ADD COLUMN branch TEXT`,
    `ALTER TABLE airds ADD COLUMN base_ref TEXT`,
    `ALTER TABLE airds ADD COLUMN environment_id TEXT`,
    `ALTER TABLE airds ADD COLUMN worktree_note TEXT`,
    `ALTER TABLE threads ADD COLUMN refs TEXT`,
    `ALTER TABLE threads ADD COLUMN stage_node TEXT`,
    `ALTER TABLE threads ADD COLUMN task TEXT`,
    `CREATE TABLE IF NOT EXISTS questions (
      id TEXT PRIMARY KEY,
      aird_id TEXT,
      thread_id TEXT NOT NULL,
      source TEXT NOT NULL,
      kind TEXT NOT NULL,
      number INTEGER,
      context TEXT,
      parts TEXT NOT NULL,
      status TEXT NOT NULL,
      answer_summary TEXT,
      answered_via TEXT,
      created_at INTEGER NOT NULL,
      answered_at INTEGER
    )`,
    `CREATE INDEX IF NOT EXISTS questions_status ON questions(status, created_at)`,
    `ALTER TABLE airds ADD COLUMN acceptance_folder TEXT`,
    `ALTER TABLE airds ADD COLUMN acceptance_branch TEXT`,
    `CREATE TABLE IF NOT EXISTS acceptance_runs (
      id TEXT PRIMARY KEY,
      aird_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at INTEGER NOT NULL,
      finished_at INTEGER,
      exit_code INTEGER,
      results TEXT,
      log TEXT,
      error TEXT
    )`,
    `CREATE INDEX IF NOT EXISTS acceptance_runs_aird ON acceptance_runs(aird_id, started_at)`,
    `CREATE TABLE acceptance_waves (aird_id TEXT NOT NULL, wave TEXT NOT NULL, base_ref TEXT NOT NULL, PRIMARY KEY (aird_id, wave))`,
    `ALTER TABLE acceptance_runs ADD COLUMN wave TEXT`,
    `ALTER TABLE acceptance_runs ADD COLUMN scope_hash TEXT`,
    `ALTER TABLE acceptance_runs ADD COLUMN verdict TEXT`,
    `ALTER TABLE acceptance_runs ADD COLUMN target_revision TEXT`,
    `ALTER TABLE airds ADD COLUMN repos TEXT`,
    `ALTER TABLE acceptance_waves ADD COLUMN suite_dir TEXT`,
    `ALTER TABLE acceptance_waves ADD COLUMN suite_commit TEXT`,
    `ALTER TABLE acceptance_waves ADD COLUMN target_dir TEXT`,
    `ALTER TABLE acceptance_waves ADD COLUMN registered_at INTEGER`,
    `ALTER TABLE acceptance_waves ADD COLUMN registered_by TEXT`,
    `ALTER TABLE airds ADD COLUMN environment_root TEXT`,
    `CREATE TABLE IF NOT EXISTS stage_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      aird_id TEXT NOT NULL,
      from_status TEXT,
      to_status TEXT NOT NULL,
      at INTEGER NOT NULL,
      thread_id TEXT,
      checks TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS slices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      aird_id TEXT NOT NULL,
      thread_id TEXT NOT NULL,
      provider_session TEXT,
      ref TEXT,
      context_pct INTEGER,
      started_at INTEGER NOT NULL
    )`,
    `CREATE TABLE IF NOT EXISTS handoffs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      aird_id TEXT NOT NULL,
      from_thread TEXT NOT NULL,
      to_thread TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      confirmed_at INTEGER
    )`,
    `ALTER TABLE handoffs ADD COLUMN slice_watermark INTEGER`,
    `ALTER TABLE threads ADD COLUMN continuations INTEGER NOT NULL DEFAULT 0`,
    `CREATE TABLE fallback_reserves (kind TEXT NOT NULL, name TEXT NOT NULL, provider TEXT NOT NULL, model TEXT NOT NULL, effort TEXT, PRIMARY KEY(kind,name))`,
    `CREATE TABLE fallback_tasks (thread_id TEXT PRIMARY KEY, root_id TEXT NOT NULL, cycle TEXT NOT NULL, input TEXT NOT NULL, reserve TEXT, using_reserve INTEGER NOT NULL DEFAULT 0)`,
    `CREATE INDEX fallback_tasks_root ON fallback_tasks(root_id)`,
    `CREATE TABLE fallback_jobs (request_id TEXT PRIMARY KEY, thread_id TEXT NOT NULL, root_id TEXT NOT NULL, cycle TEXT NOT NULL, event TEXT NOT NULL, action TEXT NOT NULL, status TEXT NOT NULL, due_at INTEGER NOT NULL, reason TEXT NOT NULL, target_thread TEXT, from_provider TEXT, from_model TEXT, to_provider TEXT, to_model TEXT, created_at INTEGER NOT NULL)`,
    `CREATE INDEX fallback_jobs_pending ON fallback_jobs(status,due_at)`,
    `ALTER TABLE threads ADD COLUMN budget_signal_at INTEGER`,
    `CREATE TABLE worker_execution (thread_id TEXT PRIMARY KEY, policy INTEGER NOT NULL DEFAULT 2, warned_at INTEGER, state TEXT NOT NULL DEFAULT 'running', checkpoint TEXT, successor TEXT)`,
  ]);

  const execution = {
    get: db.prepare<[string], { thread_id: string; policy: number; warned_at: number | null; state: string; checkpoint: string | null; successor: string | null }>(`SELECT * FROM worker_execution WHERE thread_id = ?`),
    insert: db.prepare(`INSERT OR IGNORE INTO worker_execution(thread_id) VALUES (?)`),
    warn: db.prepare(`UPDATE worker_execution SET warned_at = ? WHERE thread_id = ?`),
    checkpoint: db.prepare(`UPDATE worker_execution SET state = 'checkpoint_requested' WHERE thread_id = ?`),
  };
  const withThreadDefaults = (row: Record<string, unknown>) => ({ refs: null, stage_node: null, task: null, provider: null, model: null, effort: null, ...row });
  const q = {
    airdById: db.prepare<[string], AirdRow>(`SELECT * FROM airds WHERE id = ?`),
    airds: db.prepare<[], AirdRow>(`SELECT * FROM airds`),
    upsertAird: db.prepare(
      `INSERT INTO airds (id, project_id, folder, slug, title, request, created_at, archived)
       VALUES (@id, @project_id, @folder, @slug, @title, @request, @created_at, 0)
       ON CONFLICT(id) DO UPDATE SET title = excluded.title, request = COALESCE(excluded.request, airds.request)`,
    ),
    archiveAird: db.prepare(`UPDATE airds SET archived = ? WHERE id = ?`),
    setWorktree: db.prepare(
      `UPDATE airds SET worktree = ?, work_folder = ?, branch = ?, base_ref = COALESCE(?, base_ref), worktree_note = ? WHERE id = ?`,
    ),
    setEnvironment: db.prepare(`UPDATE airds SET environment_id = ? WHERE id = ?`),
    setEnvironmentRoot: db.prepare(`UPDATE airds SET environment_id = ?, environment_root = ? WHERE id = ?`),
    insertStageEvent: db.prepare(`INSERT INTO stage_events (aird_id, from_status, to_status, at, thread_id, checks) VALUES (?, ?, ?, ?, ?, ?)`),
    stageEvents: db.prepare<[string], { from_status: string | null; to_status: string; at: number; thread_id: string | null; checks: string | null }>(
      `SELECT from_status, to_status, at, thread_id, checks FROM stage_events WHERE aird_id = ? ORDER BY id`,
    ),
    insertSlice: db.prepare(`INSERT INTO slices (aird_id, thread_id, provider_session, ref, context_pct, started_at) VALUES (?, ?, ?, ?, ?, ?)`),
    slicesSince: db.prepare<[string, number], { thread_id: string; ref: string | null; started_at: number; context_pct: number | null }>(
      `SELECT thread_id, ref, started_at, context_pct FROM slices WHERE aird_id = ? AND started_at > ? ORDER BY id`,
    ),
    insertHandoff: db.prepare(`INSERT INTO handoffs (aird_id, from_thread, to_thread, created_at) VALUES (?, ?, ?, ?)`),
    handoffs: db.prepare<[string], { id: number; from_thread: string; to_thread: string; created_at: number; confirmed_at: number | null; slice_watermark: number | null }>(
      `SELECT id, from_thread, to_thread, created_at, confirmed_at, slice_watermark FROM handoffs WHERE aird_id = ? ORDER BY id`,
    ),
    markBudgetSignal: db.prepare(`UPDATE threads SET budget_signal_at = ? WHERE thread_id = ?`),
    budgetCandidates: db.prepare<[number], ThreadRow>(
      `SELECT * FROM threads WHERE kind = 'agent' AND stage = 'delivery' AND budget_signal_at IS NULL AND role IN ('backend-worker', 'frontend-worker', 'worker') AND (created_at > ? OR thread_id IN (SELECT thread_id FROM worker_execution WHERE state = 'running'))`,
    ),
    continueThread: db.prepare(`UPDATE threads SET task = ?, refs = ?, continuations = coalesce(continuations, 0) + 1 WHERE thread_id = ?`),
    confirmHandoff: db.prepare(`UPDATE handoffs SET confirmed_at = ?, slice_watermark = ? WHERE id = ?`),
    sliceCount: db.prepare<[string, string], { n: number }>(`SELECT COUNT(*) AS n FROM slices WHERE aird_id = ? AND thread_id = ?`),
    maxSliceId: db.prepare<[string], { m: number | null }>(`SELECT MAX(id) AS m FROM slices WHERE aird_id = ?`),
    lastSliceOf: db.prepare<[string], { started_at: number } | undefined>(`SELECT started_at FROM slices WHERE thread_id = ? ORDER BY id DESC LIMIT 1`),
    setWorkspace: db.prepare(
      `UPDATE airds SET worktree = ?, work_folder = ?, branch = ?, base_ref = ?, worktree_note = ?, repos = ?, environment_id = NULL WHERE id = ?`,
    ),
    setAcceptance: db.prepare(`UPDATE airds SET acceptance_folder = ?, acceptance_branch = ? WHERE id = ?`),
    acceptanceWave: db.prepare<[string, string], AcceptanceWaveRow>(`SELECT * FROM acceptance_waves WHERE aird_id = ? AND wave = ?`),
    insertAcceptanceWave: db.prepare(`INSERT INTO acceptance_waves (aird_id, wave, base_ref) VALUES (?, ?, ?)`),
    registerSuite: db.prepare(
      `UPDATE acceptance_waves SET suite_dir = ?, suite_commit = ?, target_dir = ?, registered_at = ?, registered_by = ? WHERE aird_id = ? AND wave = ?`,
    ),
    insertRun: db.prepare(`INSERT INTO acceptance_runs (id, aird_id, kind, status, started_at, wave, scope_hash, target_revision) VALUES (?, ?, ?, 'running', ?, ?, ?, ?)`),
    finishRun: db.prepare(
      `UPDATE acceptance_runs SET status = ?, finished_at = ?, exit_code = ?, results = ?, log = ?, error = ?, verdict = ? WHERE id = ?`,
    ),
    runsByAird: db.prepare<[string], AcceptanceRunRow>(
      `SELECT id, aird_id, kind, wave, scope_hash, target_revision, verdict, status, started_at, finished_at, exit_code, results, NULL AS log, error FROM acceptance_runs WHERE aird_id = ? ORDER BY started_at DESC LIMIT 30`,
    ),
    runById: db.prepare<[string], AcceptanceRunRow>(`SELECT * FROM acceptance_runs WHERE id = ?`),
    staleRuns: db.prepare(`UPDATE acceptance_runs SET status = 'error', error = 'плагин перезагружен во время прогона', finished_at = ? WHERE status = 'running'`),
    threadsByAird: db.prepare<[string], ThreadRow>(`SELECT * FROM threads WHERE aird_id = ? ORDER BY created_at`),
    allThreads: db.prepare<[], ThreadRow>(`SELECT * FROM threads`),
    threadById: db.prepare<[string], ThreadRow>(`SELECT * FROM threads WHERE thread_id = ?`),
    insertThread: db.prepare(
      `INSERT OR IGNORE INTO threads (thread_id, aird_id, role, kind, stage, parent_thread_id, title, created_at, model, effort, provider, refs, stage_node, task)
       VALUES (@thread_id, @aird_id, @role, @kind, @stage, @parent_thread_id, @title, @created_at, @model, @effort, @provider, @refs, @stage_node, @task)`,
    ),
    deleteThread: db.prepare(`DELETE FROM threads WHERE thread_id = ?`),
    labels: db.prepare<[string], { item_id: string; label: string }>(`SELECT item_id, label FROM labels WHERE aird_id = ?`),
    setLabel: db.prepare(
      `INSERT INTO labels (aird_id, item_id, label) VALUES (?, ?, ?)
       ON CONFLICT(aird_id, item_id) DO UPDATE SET label = excluded.label`,
    ),
    clearLabel: db.prepare(`DELETE FROM labels WHERE aird_id = ? AND item_id = ?`),
    gateOverrides: db.prepare<[string], { gate_id: string; status: string; note: string | null }>(
      `SELECT gate_id, status, note FROM gate_overrides WHERE aird_id = ?`,
    ),
    setGate: db.prepare(
      `INSERT INTO gate_overrides (aird_id, gate_id, status, note) VALUES (?, ?, ?, ?)
       ON CONFLICT(aird_id, gate_id) DO UPDATE SET status = excluded.status, note = excluded.note`,
    ),
    clearGate: db.prepare(`DELETE FROM gate_overrides WHERE aird_id = ? AND gate_id = ?`),
    projectFolders: db.prepare<[string], { folder: string }>(`SELECT folder FROM project_folders WHERE project_id = ?`),
    clearProjectFolders: db.prepare(`DELETE FROM project_folders WHERE project_id = ?`),
    addProjectFolder: db.prepare(`INSERT OR IGNORE INTO project_folders (project_id, folder) VALUES (?, ?)`),
    overrides: db.prepare<[], { role: string; provider: string | null; model: string | null; effort: string | null }>(`SELECT * FROM agent_overrides`),
    setOverride: db.prepare(
      `INSERT INTO agent_overrides (role, provider, model, effort) VALUES (?, ?, ?, ?)
       ON CONFLICT(role) DO UPDATE SET provider = excluded.provider, model = excluded.model, effort = excluded.effort`,
    ),
    orchestratorRows: db.prepare<[], { stage: string; provider: string | null; model: string | null; effort: string | null }>(
      `SELECT * FROM orchestrator_config`,
    ),
    setOrchestrator: db.prepare(
      `INSERT INTO orchestrator_config (stage, provider, model, effort) VALUES (?, ?, ?, ?)
       ON CONFLICT(stage) DO UPDATE SET provider = excluded.provider, model = excluded.model, effort = excluded.effort`,
    ),
    clearOrchestrator: db.prepare(`DELETE FROM orchestrator_config WHERE stage = ?`),
    insertQuestion: db.prepare(
      `INSERT OR IGNORE INTO questions (id, aird_id, thread_id, source, kind, number, context, parts, status, created_at)
       VALUES (@id, @aird_id, @thread_id, @source, @kind, @number, @context, @parts, 'open', @created_at)`,
    ),
    questionById: db.prepare<[string], QuestionRow>(`SELECT * FROM questions WHERE id = ?`),
    questionsAll: db.prepare<[number], QuestionRow>(
      `SELECT * FROM questions WHERE status = 'open' OR created_at > ? ORDER BY created_at DESC LIMIT 400`,
    ),
    openQuestionCount: db.prepare<[], { n: number }>(`SELECT count(*) AS n FROM questions WHERE status = 'open'`),
    openTextQuestions: db.prepare<[string], QuestionRow>(
      `SELECT * FROM questions WHERE thread_id = ? AND status = 'open' AND source = 'text'`,
    ),
    openToolQuestions: db.prepare<[string], QuestionRow>(
      `SELECT * FROM questions WHERE thread_id = ? AND status = 'open' AND source = 'tool'`,
    ),
    closeQuestion: db.prepare(
      `UPDATE questions SET status = ?, answer_summary = ?, answered_via = ?, answered_at = ? WHERE id = ? AND status = 'open'`,
    ),
    clearOverride: db.prepare(`DELETE FROM agent_overrides WHERE role = ?`),
  };

  // ----------------------------------------------------------- realtime
  let publishTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;
  function publishChanged() {
    if (disposed || publishTimer !== null) return;
    publishTimer = setTimeout(() => {
      publishTimer = null;
      bb.realtime.publish(CHANGED, { at: Date.now() });
    }, 400);
  }
  bb.onDispose(() => {
    disposed = true;
    if (publishTimer !== null) clearTimeout(publishTimer);
  });

  // ------------------------------------------------------------ projects
  let primaryHostId: string | null | undefined;
  async function getPrimaryHostId(): Promise<string | null> {
    if (primaryHostId !== undefined) return primaryHostId;
    try {
      primaryHostId = (await bb.sdk.system.config()).primaryHostId ?? null;
    } catch {
      primaryHostId = null;
    }
    return primaryHostId;
  }

  async function listProjects(): Promise<ProjectInfo[]> {
    const primary = await getPrimaryHostId();
    const projects = (await bb.sdk.projects.list()) as Array<{
      id: string;
      name: string;
      kind?: string;
      sources?: Array<{ path: string; hostId: string; isDefault: boolean }>;
    }>;
    return projects
      .filter((project) => project.kind !== "personal")
      .map((project) => {
        const sources = project.sources ?? [];
        const main = sources.find((source) => source.isDefault) ?? sources[0] ?? null;
        return {
          id: project.id,
          name: project.name,
          rootPath: main?.path ?? null,
          hostId: main?.hostId ?? null,
          local: main !== null && (primary === null || main.hostId === primary),
          sourcePaths: sources
            .filter((source) => primary === null || source.hostId === primary)
            .map((source) => source.path),
        };
      });
  }

  function projectFolders(project: ProjectInfo, records: AirdRow[]): string[] {
    const folders = new Set<string>(project.sourcePaths);
    for (const row of q.projectFolders.all(project.id)) folders.add(row.folder);
    for (const record of records) if (record.project_id === project.id) folders.add(record.folder);
    return [...folders].sort();
  }

  // --------------------------------------------------------- thread state
  type LiveThread = { status: string; title: string | null; archived: boolean };
  async function liveThreads(ids: string[]): Promise<Map<string, LiveThread>> {
    const result = new Map<string, LiveThread>();
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      for (const archived of [false, true]) {
        try {
          const page = (await bb.sdk.threads.list({ threadIds: chunk, archived, includeHidden: true, limit: 200 })) as unknown;
          const threads = Array.isArray(page)
            ? page
            : ((page as { threads?: unknown[] }).threads ?? []);
          for (const thread of threads as Array<{ id: string; status: string; title: string | null; archivedAt: number | null }>) {
            result.set(thread.id, {
              status: thread.status,
              title: thread.title,
              archived: archived || thread.archivedAt !== null,
            });
          }
        } catch (error) {
          bb.log.warn(`threads.list failed: ${String(error)}`);
        }
      }
    }
    return result;
  }

  // --------------------------------------------------------- AIRD model
  interface AirdEntry {
    id: string;
    projectId: string;
    folder: string;
    slug: string;
    record: AirdRow | null;
  }

  async function collectAirds(): Promise<{ projects: ProjectInfo[]; entries: AirdEntry[] }> {
    const projects = await listProjects();
    const records = q.airds.all();
    const entries = new Map<string, AirdEntry>();
    for (const project of projects) {
      if (!project.local) continue;
      for (const folder of projectFolders(project, records)) {
        for (const slug of listPackageSlugs(folder)) {
          const id = airdIdFor(folder, slug);
          entries.set(id, { id, projectId: project.id, folder, slug, record: null });
        }
      }
    }
    for (const record of records) {
      const existing = entries.get(record.id);
      if (existing) existing.record = record;
      else if (projects.some((project) => project.id === record.project_id)) {
        entries.set(record.id, {
          id: record.id,
          projectId: record.project_id,
          folder: record.folder,
          slug: record.slug,
          record,
        });
      }
    }
    return { projects, entries: [...entries.values()] };
  }

  /** Where the AIRD's live files are: its worktree folder once it has one. */
  function workFolderOf(entry: { folder: string; record?: AirdRow | null }): string {
    const work = entry.record?.work_folder;
    return work && isDirectory(work) ? work : entry.folder;
  }

  function packageDir(entry: { folder: string; slug: string; record?: AirdRow | null }): string {
    return join(workFolderOf(entry), AIRD_DIR, entry.slug);
  }

  /** Creates (once) the AIRD's own worktree on aird/<slug> and returns the fresh row. */
  async function ensureAirdWorktree(id: string): Promise<AirdRow> {
    const row = q.airdById.get(id);
    if (!row) throw new Error(`AIRD ${id} не найден`);
    if (row.work_folder && isDirectory(row.work_folder)) return row;
    const info = await ensureWorktree(row.folder, row.slug, config.worktreeRoot || "~/.aird-worktrees");
    if (!isDirectory(info.workFolder)) mkdirSync(info.workFolder, { recursive: true });
    q.setWorktree.run(info.worktree, info.workFolder, info.branch, info.base, info.note, id);
    if (row.work_folder !== info.workFolder) q.setEnvironment.run(null, id);
    bb.log.info(`AIRD ${row.slug}: worktree ${info.worktree ?? "—"} (${info.created ? "создана" : "существующая"})`);
    publishChanged();
    return q.airdById.get(id)!;
  }

  const nestedCache = new Map<string, { at: number; repos: string[] }>();
  function workspaceRepos(folder: string): string[] {
    const cached = nestedCache.get(folder);
    if (cached && Date.now() - cached.at < 60_000) return cached.repos;
    const repos = nestedRepos(folder).filter((rel) => rel !== ".agent");
    nestedCache.set(folder, { at: Date.now(), repos });
    return repos;
  }

  function reposOf(row: AirdRow | null | undefined): WorkspaceRepo[] {
    if (!row?.repos) return [];
    try {
      return JSON.parse(row.repos) as WorkspaceRepo[];
    } catch {
      return [];
    }
  }

  /** Repositories of a polyrepo workspace the package's workorders write to (planned or already checked out). */
  function deliveryTargets(row: AirdRow, pkg: ParsedPackage): string[] {
    const existing = reposOf(row).filter((repo) => !repo.package).map((repo) => repo.rel);
    if (row.worktree && existing.length === 0) return [];
    const repos = workspaceRepos(row.folder);
    if (repos.length === 0) return existing;
    const wanted = pkg.workorders.flatMap((wo) => wo.writePaths.map((path) => repoOfPath(path, repos))).filter((rel): rel is string => rel !== null);
    return [...new Set([...existing, ...wanted])].sort();
  }

  /**
   * Delivery never edits the user's checkouts. In a polyrepo workspace (the
   * folder itself is not in git) the repositories the workorders write to get
   * worktrees on aird/<slug> inside an AIRD copy of the workspace; see
   * ensureWorkspaceCheckout.
   */
  async function ensureDeliveryCheckout(id: string): Promise<AirdRow> {
    const row = await ensureAirdWorktree(id);
    if (row.worktree && !row.repos) return row;
    const pkg = readPackage(packageDir({ folder: row.folder, slug: row.slug, record: row }));
    const targets = deliveryTargets(row, pkg);
    if (targets.length === 0) return row;
    // Legacy worktrees keep git data in the user's repository; turn them into own clones first.
    for (const repo of reposOf(row)) await migrateWorktreeToClone(repo.path, repo.branch);
    // Idempotent: also moves the package inside the AIRD folder and adds repositories of new waves.
    const result = await ensureWorkspaceCheckout(row.folder, row.slug, config.worktreeRoot || "~/.aird-worktrees", targets, pkg.manifestBaseRef, `${AIRD_DIR}/${row.slug}`);
    q.setWorkspace.run(result.folder, result.folder, `aird/${row.slug}`, result.repos[0]?.base ?? pkg.manifestBaseRef, result.note, JSON.stringify(result.repos), id);
    bb.log.info(`AIRD ${row.slug}: workspace ${result.folder} (${result.repos.map((repo) => repo.rel).join(", ")})`);
    publishChanged();
    return q.airdById.get(id)!;
  }

  /** Repositories the AIRD changes (the package repository excluded). */
  function codeRepos(row: AirdRow): WorkspaceRepo[] {
    return reposOf(row).filter((repo) => !repo.package);
  }

  /**
   * What blind acceptance judges: the AIRD worktree, its single target
   * repository, or — when the AIRD changes several repositories — the delivery
   * workspace root with every repository at its own path.
   */
  function codeRoot(row: AirdRow): string {
    const repos = codeRepos(row);
    if (repos.length > 1) return workspaceRootOf(row);
    return repos[0]?.path ?? row.work_folder ?? row.folder;
  }

  /** Implementation identity: one repository, or all changed repositories of a workspace. */
  async function revisionOf(target: string, base: string | null): Promise<string> {
    return isWorkspaceBase(base) ? workspaceRevision(target, parseWorkspaceBase(base!)) : deliveryRevision(target);
  }

  /** The folder a thread of this AIRD runs in: everything it may write is inside it. */
  function workspaceRootOf(row: AirdRow): string {
    if (row.repos) return row.worktree ?? row.work_folder ?? row.folder;
    return row.worktree ?? row.work_folder ?? row.folder;
  }

  interface LayoutCheck { label: string; path: string; ok: boolean; detail: string }

  /**
   * The three places a delivery writes — the code working copy, the AIRD
   * package, the git data of that copy — must exist, be writable and lie inside
   * the thread's folder, where a sandboxed agent is allowed to write.
   */
  async function checkLayout(row: AirdRow): Promise<{ root: string; checks: LayoutCheck[]; ok: boolean }> {
    const real = (path: string) => { try { return realpathSync(path); } catch { return resolve(path); } };
    const root = real(workspaceRootOf(row));
    const inside = (path: string) => { const r = real(path); return r === root || r.startsWith(`${root}/`); };
    const writable = (path: string) => { try { accessSync(path, fsConstants.W_OK); return true; } catch { return false; } };
    const verdict = (label: string, path: string, problems: string[]): LayoutCheck =>
      ({ label, path, ok: problems.length === 0, detail: problems.length ? problems.join("; ") : "запись разрешена" });
    const checks: LayoutCheck[] = [];
    const branch = `aird/${row.slug}`;
    const code = row.repos
      ? reposOf(row).filter((repo) => !repo.package).map((repo) => ({ label: `Код ${repo.rel}`, path: repo.path }))
      : row.worktree ? [{ label: "Код", path: row.worktree }] : [];
    for (const item of code) {
      const problems: string[] = [];
      if (!isDirectory(item.path)) problems.push("папки нет");
      else {
        if (!inside(item.path)) problems.push(`вне рабочей папки ${root}`);
        if (!writable(item.path)) problems.push("нет права на запись");
        const head = (await gitText(item.path, ["rev-parse", "--abbrev-ref", "HEAD"]).catch(() => "")).trim();
        if (head !== branch) problems.push(`открыта ветка ${head || "—"} вместо ${branch}`);
      }
      checks.push(verdict(item.label, item.path, problems));
      const dirs = isDirectory(item.path) ? await gitDirs(item.path) : null;
      const gitProblems: string[] = [];
      if (!dirs) gitProblems.push("git-данные не найдены");
      else {
        for (const dir of new Set([dirs.gitDir, dirs.commonDir])) {
          if (!inside(dir)) gitProblems.push(`${dir} — вне рабочей папки${isLinkedWorktree(item.path) ? " (это worktree: Factory переведёт её в клон при запуске delivery)" : ""}`);
          else if (!writable(dir)) gitProblems.push(`${dir}: нет права на запись`);
        }
      }
      checks.push(verdict(`Git-данные ${item.label.replace(/^Код ?/u, "") || "кода"}`.trim(), dirs?.commonDir ?? item.path, gitProblems));
    }
    const pkg = packageDir({ folder: row.folder, slug: row.slug, record: row });
    const pkgPath = isDirectory(pkg) ? pkg : dirname(pkg);
    const pkgProblems: string[] = [];
    if (!isDirectory(pkgPath)) pkgProblems.push("папки нет");
    else {
      if (!inside(pkgPath)) pkgProblems.push(`${real(pkgPath)} — вне рабочей папки`);
      if (!writable(pkgPath)) pkgProblems.push("нет права на запись");
    }
    checks.push(verdict("Пакет AIRD", pkg, pkgProblems));
    return { root, checks, ok: checks.every((check) => check.ok) };
  }

  /** Factory, not the agents, writes the AIRD branches into the user's repositories. */
  async function syncBranches(row: AirdRow): Promise<string[]> {
    const notes: string[] = [];
    const copies = row.repos ? reposOf(row).map((repo) => repo.path) : row.worktree ? [row.worktree] : [];
    for (const path of copies) {
      const note = await pushBranch(path, `aird/${row.slug}`);
      if (note) notes.push(note);
    }
    if (row.acceptance_folder && row.acceptance_branch) {
      const note = await pushBranch(row.acceptance_folder, row.acceptance_branch);
      if (note) notes.push(note);
    }
    return notes;
  }

  function labelsFor(airdId: string): Map<string, ItemLabel> {
    return new Map(q.labels.all(airdId).map((row) => [row.item_id, row.label as ItemLabel]));
  }

  function gatesFor(pkg: ParsedPackage, airdId: string) {
    const overrides = new Map(q.gateOverrides.all(airdId).map((row) => [row.gate_id, row]));
    const status = pkg.state?.status ?? "discovery";
    const openBlockers = (pkg.state?.blockers ?? [])
      .filter((blocker) => !blocker.resolved)
      .map((blocker) => blocker.statement)
      .join("\n");
    return pkg.gates.map((gate) => {
      const mentions = pkg.gateMentions.get(gate.id) ?? [];
      const override = overrides.get(gate.id);
      return {
        id: gate.id,
        title: gate.title,
        criterion: gate.criterion,
        evidence: gate.evidence,
        riskIds: gate.riskIds,
        dodIds: gate.dodIds,
        workorders: pkg.workorders.filter((wo) => wo.gateIds.includes(gate.id)).map((wo) => wo.id),
        status:
          (override?.status as GateStatus | undefined) ??
          deriveGateStatus(gate, mentions, pkg.evidenceNames, status, openBlockers),
        statusSource: override ? ("user" as const) : ("derived" as const),
        note: override?.note ?? null,
        mentions,
      };
    });
  }

  function summarize(
    entry: AirdEntry,
    pkg: ParsedPackage,
    threads: ThreadRow[],
    live: Map<string, LiveThread>,
  ): AirdSummary {
    threads = threads.filter((thread) => fallback.current(thread.thread_id) === thread.thread_id);
    const state = pkg.state;
    const status = state?.status ?? (pkg.exists ? "discovery" : "draft");
    const { current, progress } = deriveStages(pkg);
    const gates = gatesFor(pkg, entry.id);
    const wos = pkg.workorders.filter((wo) => wo.kind === "implementation" || wo.kind === "spike");
    const counted = wos.length > 0 ? wos : pkg.workorders;
    return {
      id: entry.id,
      projectId: entry.projectId,
      folder: entry.folder,
      slug: entry.slug,
      title: entry.record?.title && entry.record.title !== entry.slug ? entry.record.title : (pkg.title ?? entry.record?.title ?? entry.slug),
      packagePath: packageDir(entry),
      workFolder: workFolderOf(entry),
      worktree: entry.record?.worktree ?? null,
      branch: entry.record?.branch ?? null,
      worktreeNote: entry.record?.worktree_note ?? null,
      exists: pkg.exists,
      archived: entry.record?.archived === 1,
      status,
      done: isDoneStatus(status),
      paused: status === "paused",
      profile: state?.profile ?? null,
      activePhase: state?.activePhase ?? null,
      activeWave: state?.activeWave && state.activeWave !== "none" ? state.activeWave : null,
      nextAction: state?.nextAction ?? null,
      updatedAt: state?.updatedAt ?? null,
      stageLabel: pkg.exists ? current.label : "Ожидает запуска",
      stageLane: current.lane,
      progress: pkg.exists ? progress : 0,
      readiness: state?.readiness ?? { implementation: null, runtime: null, release: null },
      workorders: {
        total: counted.length,
        done: counted.filter((wo) => wo.status === "done").length,
        inProgress: counted.filter((wo) => wo.status === "in_progress").length,
        blocked: counted.filter((wo) => wo.status === "blocked").length,
      },
      fixes: {
        total: pkg.fixes.length,
        open: pkg.fixes.filter((fix) => fix.closed !== true).length,
      },
      gates: {
        total: gates.length,
        passed: gates.filter((gate) => gate.status === "passed").length,
        failed: gates.filter((gate) => gate.status === "failed").length,
        blocked: gates.filter((gate) => gate.status === "blocked").length,
      },
      blockersOpen: (state?.blockers ?? []).filter((blocker) => !blocker.resolved).length,
      threads: {
        total: threads.length,
        running: threads.filter((thread) => RUNNING.has(live.get(thread.thread_id)?.status ?? "") || hasBackground(thread.thread_id)).length,
      },
      createdAt: entry.record?.created_at ?? null,
    };
  }

  async function overview() {
    const { projects, entries } = await collectAirds();
    const allThreads = q.allThreads.all();
    const live = await liveThreads(allThreads.map((thread) => thread.thread_id));
    const threadsByAird = new Map<string, ThreadRow[]>();
    for (const thread of allThreads) {
      const list = threadsByAird.get(thread.aird_id) ?? [];
      list.push(thread);
      threadsByAird.set(thread.aird_id, list);
    }
    const airds = entries.map((entry) =>
      summarize(entry, readPackage(packageDir(entry)), threadsByAird.get(entry.id) ?? [], live),
    );
    airds.sort((a, b) => {
      const at = Math.max(a.createdAt ?? 0, Date.parse(a.updatedAt ?? "") || 0);
      const bt = Math.max(b.createdAt ?? 0, Date.parse(b.updatedAt ?? "") || 0);
      return bt - at || a.slug.localeCompare(b.slug);
    });
    const records = q.airds.all();
    const projectSummaries: ProjectSummary[] = projects.map((project) => ({
      id: project.id,
      name: project.name,
      rootPath: project.rootPath,
      hostId: project.hostId,
      local: project.local,
      folders: projectFolders(project, records),
      activeCount: airds.filter((a) => a.projectId === project.id && !a.done && !a.archived).length,
      doneCount: airds.filter((a) => a.projectId === project.id && (a.done || a.archived)).length,
    }));
    return { projects: projectSummaries, airds };
  }

  async function findEntry(id: string): Promise<AirdEntry> {
    const record = q.airdById.get(id);
    if (record) {
      return { id, projectId: record.project_id, folder: record.folder, slug: record.slug, record };
    }
    const { entries } = await collectAirds();
    const entry = entries.find((candidate) => candidate.id === id);
    if (!entry) throw new Error(`AIRD ${id} не найден`);
    return entry;
  }

  /** Make sure an AIRD discovered on disk has a registry row (needed before spawning). */
  function ensureRecord(entry: AirdEntry, pkg: ParsedPackage | null): AirdRow {
    if (entry.record) return entry.record;
    q.upsertAird.run({
      id: entry.id,
      project_id: entry.projectId,
      folder: entry.folder,
      slug: entry.slug,
      title: pkg?.title ?? entry.slug,
      request: null,
      created_at: Date.now(),
    });
    const row = q.airdById.get(entry.id)!;
    entry.record = row;
    return row;
  }

  async function detail(id: string): Promise<AirdDetail> {
    const entry = await findEntry(id);
    const pkg = readPackage(packageDir(entry));
    const allThreads = q.threadsByAird.all(entry.id);
    const threads = allThreads.filter((thread) => fallback.current(thread.thread_id) === thread.thread_id);
    const live = await liveThreads(threads.map((thread) => thread.thread_id));
    const { tokens, summary: usage } = await collectUsage(allThreads, entry.record?.work_folder ?? entry.folder);
    const activity = new Map(
      await Promise.all(threads.map(async (thread) => {
        const status = live.get(thread.thread_id)?.status ?? "";
        return [thread.thread_id, watchActivity(thread, status) ? await activityOf(thread.thread_id, RUNNING.has(status)) : null] as const;
      })),
    );
    const summary = summarize(entry, pkg, threads, live);
    const labels = labelsFor(entry.id);
    const { stages } = deriveStages(pkg);
    let commitRefs = new Map<string, number>();
    const cached = commitCache.get(entry.id);
    if (cached) commitRefs = cached.refCounts;
    const agentThreads: AgentThread[] = threads.map((thread) => {
      const info = live.get(thread.thread_id);
      return {
        threadId: thread.thread_id,
        role: thread.role,
        kind: thread.kind,
        stage: thread.stage,
        title: info?.title ?? thread.title,
        status: fallback.isPending(thread.thread_id)
          ? "pending"
          : info?.status === "idle" && (activity.get(thread.thread_id)?.background.size ?? 0) > 0
            ? "background"
            : info?.status === "idle" && thread.kind === "orchestrator"
              ? "waiting"
              : info?.status ?? "deleted",
        parentThreadId: thread.parent_thread_id ? fallback.current(thread.parent_thread_id) : null,
        createdAt: thread.created_at,
        archived: info ? info.archived : true,
        model: thread.model,
        effort: thread.effort,
        skills: thread.kind === "agent" ? (getAgentDefinition(thread.role, thread.provider ?? "claude-code")?.skills ?? []) : [],
        provider: thread.provider,
        refs: parseRefs(thread.refs),
        stageNode: thread.stage_node,
        task: thread.task,
        logicalThreadId: fallback.root(thread.thread_id),
        recovery: fallback.state(thread.thread_id),
        sessions: fallback.sessions(thread.thread_id),
        tokens: tokens.get(thread.thread_id) ?? null,
        budgetSignalAt: thread.budget_signal_at ?? null,
        executionState: execution.get.get(thread.thread_id)?.state ?? null,
        activity: activityView(activity.get(thread.thread_id) ?? null, RUNNING.has(info?.status ?? "")),
      };
    });
    const hostId = (await listProjects()).find((project) => project.id === entry.projectId)?.hostId ?? null;
    return {
      summary,
      hostId,
      request: entry.record?.request ?? null,
      stages: pkg.exists ? stages : stages.map((stage, index) => ({ ...stage, state: index === 0 ? "current" : "todo" })),
      workorders: pkg.workorders.map((wo) => {
        const user = labels.get(wo.id);
        return {
          ...wo,
          label: user ?? "task",
          labelSource: user ? ("user" as const) : ("auto" as const),
          commitCount: commitRefs.get(wo.id) ?? 0,
        };
      }),
      fixes: pkg.fixes.map((fix) => {
        const user = labels.get(fix.id);
        const autoLabel: ItemLabel =
          fix.findingClass && ["docs", "process", "scope", "evidence"].includes(fix.findingClass) ? "task" : "bug";
        return {
          ...fix,
          label: user ?? autoLabel,
          labelSource: user ? ("user" as const) : ("auto" as const),
          commitCount: commitRefs.get(fix.id) ?? 0,
        };
      }),
      gates: gatesFor(pkg, entry.id),
      risks: pkg.risks,
      blockers: pkg.state?.blockers ?? [],
      findings: pkg.state?.findings ?? [],
      artifacts: pkg.artifacts,
      threads: agentThreads,
      waves: wavesOf(pkg.workorders),
      inputs: listInputs(packageDir(entry)),
      deliveryRepos: entry.record ? deliveryTargets(entry.record, pkg) : [],
      deliveryReposReady: reposOf(entry.record).length > 0,
      layout: entry.record && (entry.record.worktree || entry.record.repos) ? await checkLayout(entry.record) : null,
      lifecycle: lifecycleOf(entry.record, pkg.state?.status ?? "", splitFrontmatter(readText(join(packageDir(entry), "STATE.md")) ?? "").data as Record<string, unknown>),
      efficiency: (() => {
        const completed = pkg.state?.status === "complete" ? q.stageEvents.all(entry.id).filter(e => e.to_status === "complete").at(-1)?.at ?? null : null;
        const began = allThreads.length ? Math.min(...allThreads.map(t => t.created_at)) : null;
        return { outcome: pkg.state?.status === "complete" && completed !== null ? "accepted" as const : pkg.state?.status === "paused" ? "blocked" as const : "in_progress" as const, acceptedAt: completed, calendarMs: began === null ? null : Math.max(0, (completed ?? Date.now()) - began) };
      })(),
      session: { ...(await sessionView(entry.id, threads)), tokens: usage, limits: await providerLimits(threads) },
      now: nowView(agentThreads),
    };
  }

  const commitCache = new Map<string, { at: number; refCounts: Map<string, number> }>();
  /** Folders the last commits list was read from, per AIRD, so a commit opens from the right repository. */
  const commitSources = new Map<string, string[]>();

  // -------------------------------------------------------------- spawning
  async function projectInfo(projectId: string): Promise<ProjectInfo> {
    const project = (await listProjects()).find((candidate) => candidate.id === projectId);
    if (!project) throw new Error(`Проект ${projectId} не найден`);
    return project;
  }

  /** First message of a thread: text alone, or text plus native attachments. */
  function messageInput(text: string, parts: InputPart[]) {
    return parts.length === 0
      ? { prompt: text }
      : { input: [{ type: "text" as const, text, mentions: [] }, ...parts] };
  }

  const secretCache = new Map<string, { at: number; secrets: SecretInfo[] }>();
  /** Names and notes of the project's secrets (bb machine environment); values never leave bb. */
  async function projectSecrets(projectId: string): Promise<SecretInfo[]> {
    const cached = secretCache.get(projectId);
    if (cached && Date.now() - cached.at < 30_000) return cached.secrets;
    let secrets: SecretInfo[] = [];
    try {
      const env = await bb.sdk.projects.machineEnvironment({ projectId });
      secrets = [
        ...env.variables.map((v) => ({ name: v.name, note: v.note, inherited: false })),
        ...env.inheritedVariables.map((v) => ({ name: v.name, note: v.note, inherited: true })),
      ];
    } catch (error) {
      bb.log.warn(`machine environment of ${projectId}: ${String(error)}`);
    }
    secretCache.set(projectId, { at: Date.now(), secrets });
    return secrets;
  }

  function materialsSection(inputs: InputFile[], pkgRel: string, stage: "discovery" | "delivery"): string[] {
    if (inputs.length === 0) return [];
    return [
      "",
      "## Материалы пользователя",
      "",
      "Материалы пользователя — часть постановки. Ниже пути; изображения получает роль, которой нужен визуальный анализ:",
      ...inputLines(inputs, pkgRel),
      "",
      stage === "discovery"
        ? "Изучи каждый на Intake и запиши в 00-intake.md, что он показывает или требует. Агенту, которому файл нужен, называй его путь в брифе sf_spawn_agent — Software Factory приложит файл к его первому сообщению."
        : "Макеты и скриншоты — часть ожидаемого результата: называй пути к нужным файлам в брифах исполнителей, QA и test-author — Software Factory приложит их агенту.",
    ];
  }

  function orchestratorPrompt(
    record: AirdRow,
    stage: "discovery" | "delivery",
    note: string | undefined,
    inputs: InputFile[] = [],
    layout: { root: string; checks: LayoutCheck[] } | null = null,
  ): string {
    const pkgRel = `${AIRD_DIR}/${record.slug}/`;
    const work = record.work_folder ?? record.folder;
    const repos = reposOf(record).filter((repo) => !repo.package);
    const place = layout && (repos.length > 0 || record.worktree)
      ? [
          `- Рабочая папка треда: \`${layout.root}\`. Запись разрешена внутри неё; Factory проверила это перед запуском.`,
          ...(repos.length > 0
            ? repos.map((repo) => `- Код \`${repo.rel}\`: \`${repo.path}\` — свой клон на ветке \`${repo.branch}\`${repo.base ? ` (от \`${repo.base}\`)` : ""}. Пиши и коммить здесь; git-данные клона внутри рабочей папки.`)
            : [`- Код: \`${record.worktree}\` — свой клон на ветке \`${record.branch ?? `aird/${record.slug}`}\`${record.base_ref ? ` (от \`${record.base_ref}\`)` : ""}. Пиши и коммить здесь; git-данные клона внутри рабочей папки.`]),
          `- Пакет AIRD: \`${packageDir({ folder: record.folder, slug: record.slug, record })}\` — STATE.md, .continue-here.md, evidence/ и отчёты пиши сюда.`,
          ...(repos.length > 0 ? ["- Остальные папки рабочей копии — ссылки на основной checkout пользователя: только чтение."] : []),
          `- Ветку не переключай и в основной репозиторий \`${record.folder}\` не пиши и не пушь: Factory сама отправляет ветку при переходах этапов и передаче сессии.`,
          ...(record.worktree_note && repos.length > 0 ? [`- ${record.worktree_note}`] : []),
        ]
      : repos.length > 0
      ? [
          `- Рабочая папка: \`${work}\` — копия рабочего пространства \`${record.folder}\` для этого AIRD. Пути из пакета (\`${repos[0]!.rel}/...\`) работают в ней без изменений.`,
          ...repos.map((repo) => `- \`${repo.rel}\` — git worktree на ветке \`${repo.branch}\`${repo.base ? ` (создана от \`${repo.base}\`)` : ""}. Ветка уже создана и открыта: не переключай ветки, коммить здесь.`),
          "- Остальные папки — ссылки на основной checkout пользователя: читать можно, менять нельзя. Нужен ещё репозиторий — останови срез и сообщи: Software Factory добавит его worktree при следующем запуске delivery (по allowed_write_paths воркордеров).",
          ...(record.worktree_note ? [`- ${record.worktree_note}`] : []),
        ]
      : record.worktree
      ? [
          `- Отдельная git worktree этого AIRD: \`${record.worktree}\`, ветка \`${record.branch ?? `aird/${record.slug}`}\`${record.base_ref ? ` (создана от \`${record.base_ref}\`)` : ""}.`,
          `- Рабочая папка: \`${work}\`. Работай только в ней: не переключай ветку и не трогай основной checkout \`${record.folder}\`.`,
          "- Неотслеживаемые файлы основного checkout (.env и т.п.) в worktree не копируются; если они нужны для проверок — скажи об этом.",
        ]
      : [`- Рабочая папка: \`${work}\`${record.worktree_note ? ` (${record.worktree_note})` : ""}.`];
    if (stage === "discovery") {
      return [
        `/aird-discovery-loop ${record.title}`,
        "",
        "Запусти AIRD discovery (скилл aird-discovery-loop) для этой задачи.",
        "",
        `- slug пакета: \`${record.slug}\` → пакет пиши в \`${pkgRel}\` относительно рабочей папки.`,
        ...place,
        "Для нового пакета: efficiency_policy: 2, risk_flags и profile_reason; lite — локальная обратимая правка без существенного риска, standard — известные границы, deep — security/migration/schema/multi_service/external_unknown. Старый принятый пакет не переклассифицируй. Не создавай роль без конкретного вопроса.",
        "Если STATE.md уже существует, начни с него и .continue-here.md; продолжай с контрольной точки, не повторяй Intake и завершённые фазы.",
        "",
        "## Запрос пользователя",
        "",
        record.request ?? record.title,
        ...materialsSection(inputs, pkgRel, stage),
        ...(note ? ["", "## Дополнительно", "", note] : []),
      ].join("\n");
    }
    return [
      `/aird-delivery-loop ${pkgRel}`,
      "",
      `Запусти AIRD delivery (скилл aird-delivery-loop) по готовому пакету \`${pkgRel}\`.`,
      ...place,
      "Начни с STATE.md и .continue-here.md, если он есть; продолжай с того места, где остановилась предыдущая сессия.",
      ...materialsSection(inputs, pkgRel, stage),
      ...(note ? ["", "## Дополнительно", "", note] : []),
    ].join("\n");
  }

  async function spawnOrchestrator(input: AirdRow, stage: "discovery" | "delivery", note?: string) {
    const project = await projectInfo(input.project_id);
    if (!project.hostId) throw new Error("У проекта нет машины (source host)");
    if (!isDirectory(input.folder)) throw new Error(`Папка ${input.folder} не найдена`);
    let record = stage === "delivery" ? await ensureDeliveryCheckout(input.id) : await ensureAirdWorktree(input.id);
    if (record.worktree && !record.repos && isLinkedWorktree(record.worktree)) {
      await migrateWorktreeToClone(record.worktree, record.branch ?? `aird/${record.slug}`);
      record = q.airdById.get(record.id)!;
    }
    // The package folder is Factory's to create; discovery fills it.
    mkdirSync(packageDir({ folder: record.folder, slug: record.slug, record }), { recursive: true });
    // Before any thread starts: every place it must write exists, is writable and lies inside its folder.
    const layout = await checkLayout(record);
    if (!layout.ok) {
      throw new Error(`Рабочие каталоги AIRD не готовы:\n${layout.checks.filter((check) => !check.ok).map((check) => `- ${check.label}: ${check.detail}`).join("\n")}`);
    }
    const role = `aird-${stage}-loop`;
    const title = `${role} · ${record.slug}`;
    const wanted = await orchestratorWanted(stage);
    const runtime = await resolveRuntime(wanted.provider, wanted);
    const inputs = listInputs(packageDir({ folder: record.folder, slug: record.slug, record }));
    // Secret names reach the thread through configure(), which reads this cache.
    await projectSecrets(record.project_id);
    const first = messageInput(orchestratorPrompt(record, stage, note, inputs, layout), stage === "discovery" && !note ? inputParts(inputs, project.hostId) : []);
    const hostEnvironment = {
      type: "host" as const,
      hostId: project.hostId,
      workspace: { type: "unmanaged" as const, path: layout.root },
    };
    const spawnWith = (environment: Parameters<typeof bb.sdk.threads.spawn>[0]["environment"]) =>
      bb.sdk.threads.spawn({
        projectId: record.project_id,
        environment,
        ...first,
        title,
        providerId: wanted.provider,
        ...(runtime.model ? { model: runtime.model } : {}),
        ...(runtime.effort ? { reasoningLevel: runtime.effort } : {}),
        pluginMetadata: { airdId: record.id, role, kind: "orchestrator", stage, slug: record.slug },
      });
    // Every thread of the AIRD shares one bb environment, opened at the layout root.
    let thread;
    if (record.environment_id && record.environment_root === layout.root) {
      try {
        thread = await spawnWith({ type: "reuse", environmentId: record.environment_id });
      } catch (error) {
        bb.log.warn(`reuse environment ${record.environment_id} failed, opening the worktree again: ${String(error)}`);
        q.setEnvironment.run(null, record.id);
        thread = await spawnWith(hostEnvironment);
      }
    } else {
      thread = await spawnWith(hostEnvironment);
    }
    if (thread.environmentId) q.setEnvironmentRoot.run(thread.environmentId, layout.root, record.id);
    q.insertThread.run(withThreadDefaults({
      thread_id: thread.id,
      aird_id: record.id,
      role,
      kind: "orchestrator",
      stage,
      parent_thread_id: null,
      title,
      created_at: Date.now(),
      model: runtime.model,
      effort: runtime.effort,
      provider: wanted.provider,
    }));
    fallback.remember(q.threadById.get(thread.id)!, first.input ?? [{ type: "text", text: first.prompt!, mentions: [] }], reserveFor("orchestrator", stage));
    publishChanged();
    return thread;
  }

  type ModelInfo = { id: string; label: string; efforts: string[]; defaultEffort: string | null; isDefault: boolean };
  const modelCache = new Map<string, { at: number; models: ModelInfo[] }>();
  async function providerModels(providerId: string): Promise<ModelInfo[]> {
    const cached = modelCache.get(providerId);
    if (cached && Date.now() - cached.at < 5 * 60_000) return cached.models;
    let models: ModelInfo[] = [];
    try {
      const result = (await bb.sdk.providers.models({ providerId, preferCached: true })) as unknown as {
        models?: Array<{
          id: string;
          displayName?: string;
          isDefault?: boolean;
          defaultReasoningEffort?: string;
          supportedReasoningEfforts?: Array<{ reasoningEffort: string }>;
        }>;
      };
      models = (result.models ?? []).map((model) => ({
        id: model.id,
        label: model.displayName ?? model.id,
        efforts: (model.supportedReasoningEfforts ?? []).map((effort) => effort.reasoningEffort),
        defaultEffort: model.defaultReasoningEffort ?? null,
        isDefault: model.isDefault === true,
      }));
    } catch (error) {
      bb.log.warn(`providers.models(${providerId}) failed: ${String(error)}`);
    }
    modelCache.set(providerId, { at: Date.now(), models });
    return models;
  }

  /**
   * Model and effort a role runs with: the user's override in Software Factory,
   * else the role file's `model:`/`effort:`. Values the provider does not
   * offer are dropped so the spawn falls back to the provider default.
   */
  async function resolveRuntime(
    providerId: string,
    wanted: { model: string | null; effort: string | null },
  ): Promise<{ model: string | null; effort: string | null }> {
    const models = await providerModels(providerId);
    if (models.length === 0) return { model: wanted.model, effort: wanted.effort };
    const model = wanted.model && models.some((m) => m.id === wanted.model) ? wanted.model : null;
    const target = models.find((m) => m.id === model) ?? models.find((m) => m.isDefault) ?? null;
    const effort = wanted.effort && target && (target.efforts.length === 0 || target.efforts.includes(wanted.effort)) ? wanted.effort : null;
    return { model, effort };
  }

  type ProviderInfo = { id: string; name: string; models: ModelInfo[] };
  let providerCache: { at: number; providers: ProviderInfo[] } | null = null;
  async function availableProviders(): Promise<ProviderInfo[]> {
    if (providerCache && Date.now() - providerCache.at < 5 * 60_000) return providerCache.providers;
    let list: Array<{ id: string; displayName?: string; available?: boolean }> = [];
    try {
      list = (await bb.sdk.providers.list()) as unknown as typeof list;
    } catch (error) {
      bb.log.warn(`providers.list failed: ${String(error)}`);
    }
    const providers: ProviderInfo[] = [];
    for (const provider of list) {
      if (provider.available === false) continue;
      providers.push({ id: provider.id, name: provider.displayName ?? provider.id, models: await providerModels(provider.id) });
    }
    providerCache = { at: Date.now(), providers };
    return providers;
  }

  /** claude-code when it is available (the AIRD skills live in ~/.claude/skills), else the first provider. */
  async function defaultProvider(): Promise<string> {
    const providers = await availableProviders();
    return providers.find((p) => p.id === "claude-code")?.id ?? providers[0]?.id ?? "claude-code";
  }

  /** The test author defaults to a different provider than the implementer, so their mistakes do not coincide. */
  async function otherProvider(providerId: string): Promise<string> {
    const providers = await availableProviders();
    return providers.find((p) => p.id !== providerId && runtimeFamily(p.id) !== runtimeFamily(providerId))?.id ?? providerId;
  }

  /**
   * An orchestrator runs on the provider chosen for its stage, with that
   * runtime's own session defaults (~/.claude/settings.json,
   * ~/.codex/config.toml) unless the user picked a model or effort.
   */
  async function orchestratorWanted(stage: "discovery" | "delivery") {
    const row = q.orchestratorRows.all().find((item) => item.stage === stage);
    const provider = row?.provider ?? (await defaultProvider());
    const defaults = runtimeDefaults(provider);
    return {
      provider,
      model: row?.model ?? defaults.model,
      effort: row?.effort ?? defaults.effort,
      defaults,
      override: row ?? null,
    };
  }

  /**
   * A role runs on the provider the user chose for it, else its orchestrator's
   * provider, with that runtime's role file (model/effort/prompt/skills) unless
   * the user overrode model or effort.
   */
  function roleWanted(role: string, inheritProvider: string) {
    const override = q.overrides.all().find((row) => row.role === role);
    const provider = override?.provider ?? inheritProvider;
    const definition = getAgentDefinition(role, provider);
    return {
      provider,
      definition,
      model: override?.model ?? definition?.model ?? null,
      effort: override?.effort ?? definition?.effort ?? null,
      override: override ?? null,
    };
  }

  /**
   * A model the orchestrator asked for in one spawn: an exact model id of the
   * provider, or a tier word the skills use (`sonnet`, `opus`, `haiku`, …)
   * matched against the provider's model ids and names. Null when the
   * provider offers nothing that matches — the role default then applies.
   */
  async function requestedModel(providerId: string, requested: string | undefined): Promise<string | null> {
    const wanted = requested?.trim().toLowerCase();
    if (!wanted) return null;
    const models = await providerModels(providerId);
    const exact = models.find((m) => m.id.toLowerCase() === wanted);
    if (exact) return exact.id;
    const matches = models.filter((m) => m.id.toLowerCase().includes(wanted) || m.label.toLowerCase().includes(wanted));
    return (matches.find((m) => m.isDefault) ?? matches[0])?.id ?? null;
  }

  let spawnQueue = Promise.resolve();
  function spawnAgent(...args: Parameters<typeof spawnAgentUnlocked>): ReturnType<typeof spawnAgentUnlocked> {
    const result = spawnQueue.then(() => spawnAgentUnlocked(...args));
    spawnQueue = result.then(() => undefined, () => undefined);
    return result;
  }
  async function spawnAgentUnlocked(parentThreadId: string, role: string, task: string, label: string | undefined, workorders: string[] = [], modelRequest?: string, freshReason?: string) {
    if (fallback.current(parentThreadId) !== parentThreadId) throw new Error(`Оркестратор продолжен в @thread:${fallback.current(parentThreadId)}`);
    const parentRow = q.threadById.get(parentThreadId);
    if (!parentRow || parentRow.kind !== "orchestrator") {
      throw new Error("sf_spawn_agent доступен только в треде-оркестраторе Software Factory");
    }
    const record = q.airdById.get(parentRow.aird_id);
    if (!record) throw new Error("AIRD этого треда не найден");
    const parent = await bb.sdk.threads.get({ threadId: parentThreadId });
    const isTestAuthor = role === "test-author";
    // An implementation worker runs a slice: it is refused at the same session boundary as the orchestrator's own slices.
    if (parentRow.stage === "delivery" && ["backend-worker", "frontend-worker", "worker"].includes(role)) {
      const session = sessionOf(record.id, parentThreadId);
      if (session.fromHere) throw new Error(`Передача уже записана: работа продолжается в @thread:${session.fromHere.to_thread}`);
      if (session.slices >= SLICE_LIMIT) throw new Error(`В этой сессии уже ${session.slices} срезов (лимит ${SLICE_LIMIT}): запиши checkpoint и вызови sf_handoff`);
    }
    // Firewall: nobody but the test author and an arbitrating reviewer is pointed at the acceptance suite.
    if (!isTestAuthor && role !== "reviewer" && record.acceptance_folder && task.includes(record.acceptance_folder)) {
      throw new Error("Исполнителю нельзя передавать путь к приёмочным тестам: он получает только вердикты по сценариям (sf_run_acceptance).");
    }
    const acceptance = isTestAuthor ? await prepareAcceptanceWave(record.id) : null;
    const wanted = roleWanted(role, isTestAuthor ? await otherProvider(parent.providerId) : parent.providerId);
    const definition = wanted.definition;
    // The user's choice on the roles page wins over a per-spawn request; the request wins over the role file.
    const asked = wanted.override?.model ? null : await requestedModel(wanted.provider, modelRequest);
    const runtime = await resolveRuntime(wanted.provider, asked ? { ...wanted, model: asked } : wanted);
    const title = label ? `${role} · ${label}` : role;
    // What the agent works on: explicit ids, else ids named in its label/brief.
    const refs = [
      ...new Set([
        ...workorders.map((id) => id.trim().toUpperCase()).filter((id) => /^(WO-\d+[A-Z]?|F-\d{2,})$/u.test(id)),
        ...((label ?? "").match(/\b(WO-\d+[A-Za-z]?|F-\d{2,})\b/gu) ?? []),
        ...(workorders.length === 0 ? (task.slice(0, 4000).match(/\b(WO-\d+[A-Za-z]?|F-\d{2,})\b/gu) ?? []).slice(0, 6) : []),
      ]),
    ];
    const predecessors: string[] = [];
    // Fresh context is not permission for two writers. Unknown scopes conflict.
    if (parentRow.stage === "delivery" && ["backend-worker", "frontend-worker", "worker"].includes(role)) {
      const pkg = readPackage(packageDir({ folder: record.folder, slug: record.slug, record }));
      const paths = (ids: string[]) => ids.flatMap(id => pkg.workorders.find(wo => wo.id === id)?.writePaths ?? []);
      for (const old of q.threadsByAird.all(record.id)) {
        if (old.kind !== "agent" || !["backend-worker", "frontend-worker", "worker"].includes(old.role) || fallback.current(old.thread_id) !== old.thread_id) continue;
        const oldExecution = execution.get.get(old.thread_id);
        if (oldExecution?.successor) continue;
        if (!scopesOverlap(paths(refs), paths(parseRefs(old.refs)))) continue;
        if (oldExecution?.state === "transferring") {
          // Recover a spawn acknowledged by the host but not persisted before a crash.
          for (let offset = 0; offset < 1000; offset += 100) {
            const candidates = await bb.sdk.threads.list({ projectId: record.project_id, parentThreadId, includeHidden: true, limit: 100, offset });
            for (const candidate of candidates) {
              const meta = await bb.sdk.threads.getPluginMetadata({ threadId: candidate.id });
              if (meta.airdId !== record.id || !Array.isArray(meta.executionPredecessors) || !meta.executionPredecessors.includes(old.thread_id)) continue;
              q.insertThread.run(withThreadDefaults({ ...old, thread_id: candidate.id, parent_thread_id: parentThreadId, title: candidate.title ?? old.title, created_at: candidate.createdAt, provider: candidate.providerId, task }));
              execution.insert.run(candidate.id);
              for (const predecessor of meta.executionPredecessors) if (typeof predecessor === "string") db.prepare(`UPDATE worker_execution SET state='transferred', successor=? WHERE thread_id=?`).run(candidate.id, predecessor);
              publishChanged();
              return { thread: candidate, title: candidate.title ?? old.title, model: old.model, effort: old.effort, provider: candidate.providerId, refs, stageNode: old.stage_node };
            }
            if (candidates.length < 100) break;
          }
          throw new Error(`Передача @thread:${old.thread_id} имеет неопределённый результат. Преемник ещё не найден; повторный запуск заблокирован, чтобы не создать второго писателя.`);
        }
        const live = await bb.sdk.threads.get({ threadId: old.thread_id });
        if (RUNNING.has(live.status) || awaitingStart(old.thread_id) || fallback.isPending(old.thread_id)) throw new Error(`Область записи занята агентом @thread:${old.thread_id}. Дождись завершения; freshReason не снимает владение файлами.`);
        if (old.budget_signal_at && parseRefs(old.refs).some(id => refs.includes(id))) {
          const wo = parseRefs(old.refs).find(id => /^WO-/u.test(id)) ?? "WO";
          const note = join(packageDir({ folder: record.folder, slug: record.slug, record }), "evidence", `${wo}-progress.md`);
          if (!existsSync(note) || statSync(note).size > 32_000 || statSync(note).mtimeMs < old.budget_signal_at || readFileSync(note, "utf8").trim().length < 80) throw new Error(`Нужен свежий checkpoint ${note} от завершившегося агента @thread:${old.thread_id}.`);
          if (!realpathSync(note).startsWith(realpathSync(packageDir({ folder: record.folder, slug: record.slug, record })) + "/")) throw new Error("Checkpoint вне пакета AIRD");
          if (oldExecution) {
            const invalid = checkpointProblem(splitFrontmatter(readFileSync(note, "utf8")).data, old.thread_id);
            if (invalid) throw new Error(`Неполный checkpoint: ${invalid}`);
            db.prepare(`UPDATE worker_execution SET state = 'checkpoint_ready', checkpoint = ? WHERE thread_id = ?`).run(createHash("sha256").update(readFileSync(note)).digest("hex"), old.thread_id);
            predecessors.push(old.thread_id);
          }
          task += `\n\nПродолжение после @thread:${old.thread_id}: сначала прочитай ${note}; проверь состояние рабочей копии и сохрани незакоммиченные изменения.`;
        }
      }
    }
    // Catch redundant same-workorder spawns before paying for a new context. The
    // orchestrator decides scope: a distinct subtask can explicitly start fresh.
    if (!freshReason && refs.length && ["backend-worker", "frontend-worker", "worker", "debugger"].includes(role)) {
      const matching = q.threadsByAird.all(record.id).filter((old) => {
        if (old.kind !== "agent" || old.role !== role || old.budget_signal_at || fallback.current(old.thread_id) !== old.thread_id) return false;
        if (old.provider !== wanted.provider || old.model !== runtime.model) return false;
        let previous: string[];
        try { previous = JSON.parse(old.refs ?? "[]"); } catch { return false; }
        return previous.length === refs.length && refs.every((ref) => previous.includes(ref));
      }).sort((a, b) => b.created_at - a.created_at).slice(0, 3);
      for (const old of matching) {
        if (awaitingStart(old.thread_id) || fallback.isPending(old.thread_id)) continue;
        try {
          const live = await bb.sdk.threads.get({ threadId: old.thread_id });
          if (RUNNING.has(live.status)) continue;
          const context = await contextOf(old.thread_id);
          if (context.used === null || context.used >= CONTINUE_MAX_TOKENS || (context.pct ?? 0) >= CONTINUE_MAX_PCT) continue;
        } catch { continue; }
        throw new Error(`Для ${refs.join(", ")} уже есть свободный ${role}: @thread:${old.thread_id}. Если это продолжение той же задачи, вызови sf_continue_agent({ threadId: "${old.thread_id}", task }). Для отдельной подзадачи или чистого контекста повтори sf_spawn_agent с freshReason — конкретной причиной нового треда. Новый агент пока не создан.`);
      }
    }
    const pkgDirNow = packageDir({ folder: record.folder, slug: record.slug, record });
    await projectSecrets(record.project_id); // warm the cache configure() reads
    const pkgNow = readPackage(pkgDirNow);
    const policyIssue = profileProblem(splitFrontmatter(readText(join(pkgDirNow, "STATE.md")) ?? "").data);
    if (policyIssue) throw new Error(policyIssue);
    const inputs = listInputs(pkgDirNow);
    const attached = inputsNamedIn(task, inputs);
    const waveOfRef = refs.map((id) => pkgNow.workorders.find((wo) => wo.id === id)?.wave).find((wave) => wave && /^W\d+/u.test(wave));
    const stageNode =
      waveOfRef && pkgNow.workorders.length > 0 && parentRow.stage === "delivery"
        ? `wave-${waveOfRef}`
        : pkgNow.exists
          ? deriveStages(pkgNow).current.id
          : "intake";
    const prompt = agentPrompt({
      role,
      definition,
      model: runtime.model,
      effort: runtime.effort,
      task,
      slug: record.slug,
      folder: acceptance?.acceptance_folder ?? record.work_folder ?? record.folder,
      packagePath: acceptance
        ? `${packageDir({ folder: record.folder, slug: record.slug, record })}/09-dod.md#Acceptance Scenarios; только названные сценариями разделы 05-api-contracts.md / 02-ui-spec.md (либо 04-trd.md / 06-data-models.md для CLI/данных) и команды запуска из 08-quality-gates.md. workorders/, fix-workorders/, evidence/, отчёты верификации и код delivery не открывай. Набор пиши в acceptance/${record.slug}/ своей рабочей папки. Когда набор закоммичен — вызови sf_register_suite({ runScript: "<абсолютный путь к run.sh>" }): Factory сохранит папку и commit и будет запускать ровно его, на базе волны и на рабочей копии реализации. Без регистрации приёмка не запустится${codeRepos(acceptance).length > 1 ? `. AIRD меняет несколько репозиториев: \`run.sh <target-dir>\` получает корень рабочего пространства, в нём репозитории ${codeRepos(acceptance).map((repo) => `\`${repo.rel}\``).join(", ")} лежат по этим путям; на базе волны Factory подставит копию пространства, где каждый из них стоит на своём базовом коммите` : ""}`
        : `${AIRD_DIR}/${record.slug}/`,
      orchestratorThreadId: parentThreadId,
      materials: inputLines(inputs, `${pkgDirNow}/`),
      attachedCount: Math.min(attached.length, inputParts(attached, null).length),
      actionBudget: parentRow.stage === "delivery" && ["backend-worker", "frontend-worker", "worker"].includes(role) ? EXECUTION_POLICY.stopActions : null,
      sections: parentRow.stage === "delivery" && ["backend-worker", "frontend-worker", "worker"].includes(role)
        ? sectionsMarkdown(briefSections(
            [...new Set(refs.flatMap((id) => pkgNow.workorders.find((wo) => wo.id === id)?.docsToRead ?? []))],
            [pkgDirNow, record.work_folder ?? record.folder, record.folder],
          ))
        : "",
    });
    const projectHost = (await projectInfo(record.project_id)).hostId;
    const acceptanceHost = acceptance ? projectHost : null;
    if (acceptance && !acceptanceHost) throw new Error("Для test-author нужна отдельная рабочая среда на машине проекта");
    const environment =
      acceptance && acceptanceHost
        ? ({ type: "host", hostId: acceptanceHost, workspace: { type: "unmanaged", path: acceptance.acceptance_folder! } } as const)
        : parent.environmentId
          ? ({ type: "reuse", environmentId: parent.environmentId } as const)
          : ({ type: "project-default" } as const);
    const base = {
      projectId: record.project_id,
      environment,
      ...messageInput(prompt, inputParts(attached, projectHost)),
      title,
      parentThreadId,
      parentNotifications: "off" as const,
      providerId: wanted.provider,
      pluginMetadata: {
        airdId: record.id,
        role,
        kind: "agent",
        stage: parentRow.stage,
        slug: record.slug,
        skills: definition?.skills ?? [],
        executionPredecessors: predecessors,
      },
    };
    for (const id of predecessors) db.prepare(`UPDATE worker_execution SET state = 'transferring' WHERE thread_id = ?`).run(id);
    let thread;
    let used = runtime;
    try {
      thread = await bb.sdk.threads.spawn({
        ...base,
        ...(runtime.model ? { model: runtime.model } : {}),
        ...(runtime.effort ? { reasoningLevel: runtime.effort } : {}),
      });
    } catch (error) {
      if (predecessors.length || (!runtime.model && !runtime.effort)) throw error;
      bb.log.warn(`spawn ${role} with ${runtime.model}/${runtime.effort} failed, retrying with defaults: ${String(error)}`);
      thread = await bb.sdk.threads.spawn(base);
      used = { model: null, effort: null };
    }
    q.insertThread.run(withThreadDefaults({
      thread_id: thread.id,
      aird_id: record.id,
      role,
      kind: "agent",
      stage: parentRow.stage,
      parent_thread_id: parentThreadId,
      title,
      created_at: Date.now(),
      model: used.model,
      effort: used.effort,
      provider: wanted.provider,
      refs: JSON.stringify(refs),
      stage_node: stageNode,
      task,
    }));
    if (parentRow.stage === "delivery" && ["backend-worker", "frontend-worker", "worker"].includes(role)) execution.insert.run(thread.id);
    for (const id of predecessors) db.prepare(`UPDATE worker_execution SET state = 'transferred', successor = ? WHERE thread_id = ?`).run(thread.id, id);
    resumedAt.set(thread.id, Date.now());
    fallback.remember(q.threadById.get(thread.id)!, base.input ?? [{ type: "text", text: base.prompt!, mentions: [] }], reserveFor("agent", role));
    publishChanged();
    return { thread, title, model: used.model, effort: used.effort, provider: wanted.provider, refs, stageNode };
  }

  function reserveFor(kind: "agent" | "orchestrator", name: string): ReserveModel | null {
    return db.prepare<[string, string], ReserveModel>("SELECT provider,model,effort FROM fallback_reserves WHERE kind=? AND name=?").get(kind, name) ?? null;
  }

  async function validateReserve(reserve: ReserveModel) {
    const providers = await availableProviders();
    const provider = providers.find((item) => item.id === reserve.provider);
    if (!provider) throw new Error(`Запасной провайдер ${reserve.provider} недоступен`);
    const model = provider.models.find((item) => item.id === reserve.model);
    if (!model) throw new Error(`Запасная модель ${reserve.model} отсутствует у ${reserve.provider}`);
    if (reserve.effort && model.efforts.length && !model.efforts.includes(reserve.effort)) throw new Error(`Effort ${reserve.effort} не поддерживается запасной моделью ${reserve.model}`);
  }

  async function saveReserve(kind: "agent" | "orchestrator", name: string, reserve: ReserveModel | null | undefined) {
    if (reserve === undefined) return; // Older clients saving primary options preserve the reserve.
    if (reserve === null) db.prepare("DELETE FROM fallback_reserves WHERE kind=? AND name=?").run(kind, name);
    else {
      await validateReserve(reserve);
      db.prepare(`INSERT INTO fallback_reserves(kind,name,provider,model,effort) VALUES (?,?,?,?,?)
        ON CONFLICT(kind,name) DO UPDATE SET provider=excluded.provider,model=excluded.model,effort=excluded.effort`).run(kind, name, reserve.provider, reserve.model, reserve.effort);
    }
    for (const row of q.allThreads.all().filter((thread) => thread.kind === kind && (kind === "agent" ? thread.role : thread.stage) === name)) {
      db.prepare("UPDATE fallback_tasks SET reserve=? WHERE thread_id=?").run(reserve ? JSON.stringify(reserve) : null, row.thread_id);
      if (reserve) db.prepare("UPDATE fallback_jobs SET to_provider=?,to_model=? WHERE thread_id=? AND action='switch' AND status='pending'").run(reserve.provider, reserve.model, row.thread_id);
      else db.prepare("UPDATE fallback_jobs SET status='cancelled' WHERE thread_id=? AND status IN ('pending','dispatching')").run(row.thread_id);
    }
  }

  const fallback = modelFallback(bb, {
    thread: (id) => q.threadById.get(id),
    reserve: (row) => reserveFor(row.kind, row.kind === "orchestrator" ? row.stage ?? "delivery" : row.role),
    canResume: (thread) => { if (q.threadById.get(thread.thread_id)?.budget_signal_at) throw new Error("Бюджет исполнителя исчерпан: требуется checkpoint и свежий исполнитель, а не повтор или смена модели."); },
    validate: async (reserve, thread) => {
      await validateReserve(reserve);
      if (reserve.provider === thread.provider && reserve.model === thread.model) throw new Error("Запасная модель совпадает с основной");
      const family = (provider: string | null) => provider ? runtimeFamily(provider) ?? provider : null;
      const writers = ["worker", "backend-worker", "frontend-worker", "aird-delivery-loop"];
      const peers = q.threadsByAird.all(thread.aird_id).filter((row) => fallback.current(row.thread_id) === row.thread_id);
      const relevant = thread.role === "test-author" ? peers.filter((row) => writers.includes(row.role))
        : writers.includes(thread.role) ? peers.filter((row) => row.role === "test-author") : [];
      if (relevant.some((row) => family(row.provider) !== family(thread.provider) && family(row.provider) === family(reserve.provider))) {
        throw new Error("Запасной провайдер нарушает независимость test-author и исполнителя. Выбери другого провайдера или продолжи вручную.");
      }
    },
    transferred: (source, target, runtime) => {
      const row = q.threadById.get(source);
      if (!row) throw new Error("Исходный агент не найден");
      q.insertThread.run(withThreadDefaults({ ...row, thread_id: target, provider: runtime.provider, model: runtime.model, effort: runtime.effort, created_at: Date.now() }));
      const previousExecution = execution.get.get(source);
      if (previousExecution) {
        execution.insert.run(target);
        if (row.budget_signal_at) { q.markBudgetSignal.run(row.budget_signal_at, target); execution.checkpoint.run(target); }
      }
    },
    starting: (id, newThread) => {
      if (newThread && (finished.has(id) || startedAt.has(id))) return;
      finished.delete(id);
      startedAt.delete(id);
      resumedAt.set(id, Date.now());
    },
    changed: publishChanged,
    blocked: (row, requestId, reason) => {
      q.insertQuestion.run({ id: `fallback:${requestId}`, aird_id: row.aird_id, thread_id: row.thread_id, source: "text", kind: "clarification", number: null,
        context: `${row.title}: ${reason}\nПроверь настройки модели и состояние рабочей папки. Ответ будет отправлен агенту как ручное продолжение.`,
        parts: JSON.stringify([{ id: "q", prompt: "Как продолжить задачу?", topic: "Восстановление агента", options: [], recommended: null, recommendationReason: null, multiSelect: false, allowFreeText: true }]), created_at: Date.now() });
    },
  });

  // Track idle/failed transitions for sf_wait_agents and refresh open pages.
  const finished = new Map<string, { status: "idle" | "error"; text: string | null; at: number }>();
  const startedAt = new Map<string, number>();
  /** Agents given a follow-up: until their new turn starts, their old answer is not the result. */
  const resumedAt = new Map<string, number>();
  const awaitingStart = (id: string) => resumedAt.has(id) && !startedAt.has(id) && !finished.has(id);
  bb.events.on("thread.created", ({ thread }) => {
    const parentId = (thread as { parentThreadId?: string | null }).parentThreadId ?? null;
    if (!parentId) return;
    const parentRow = q.threadById.get(parentId);
    if (!parentRow || parentRow.kind !== "orchestrator" || q.threadById.get(thread.id)) return;
    // A child the orchestrator started another way (bb CLI): still list it.
    const title = (thread as { title?: string | null }).title ?? "agent";
    setTimeout(() => {
      if (q.threadById.get(thread.id)) return;
      q.insertThread.run(withThreadDefaults({
        thread_id: thread.id,
        aird_id: parentRow.aird_id,
        role: title.split(" · ")[0] ?? title,
        kind: "agent",
        stage: parentRow.stage,
        parent_thread_id: parentId,
        title,
        created_at: Date.now(),
        model: null,
        effort: null,
        provider: (thread as { providerId?: string }).providerId ?? null,
        refs: JSON.stringify(title.match(/\b(WO-\d+[A-Za-z]?|F-\d{2,})\b/gu) ?? []),
      }));
      publishChanged();
    }, 1500);
  });
  bb.events.on("thread.active", ({ thread }) => {
    startedAt.set(thread.id, Date.now());
    collectUsage.invalidate(thread.id);
    // The user answered a chat-text question in the thread itself.
    for (const open of q.openTextQuestions.all(thread.id)) q.closeQuestion.run("answered", "ответ в треде", "thread", Date.now(), open.id);
    finished.delete(thread.id);
    if (q.threadById.get(thread.id)) publishChanged();
  });
  bb.events.on("thread.idle", ({ thread, lastAssistantText }) => {
    finished.set(thread.id, { status: "idle", text: lastAssistantText ?? null, at: Date.now() });
    collectUsage.invalidate(thread.id);
    try {
      captureTextQuestion(thread.id, lastAssistantText ?? null);
    } catch (error) {
      bb.log.warn(`captureTextQuestion failed: ${String(error)}`);
    }
    if (q.threadById.get(thread.id)) publishChanged();
  });
  bb.events.on("thread.failed", ({ thread, error }) => {
    finished.set(thread.id, { status: "error", text: error ?? null, at: Date.now() });
    if (q.threadById.get(thread.id)) publishChanged();
  });
  for (const event of ["thread.archived", "thread.unarchived", "thread.deleted"] as const) {
    bb.events.on(event, ({ thread }) => {
      if (q.threadById.get(thread.id)) publishChanged();
    });
  }

  function sleep(ms: number, signal?: AbortSignal) {
    return new Promise<void>((resolveSleep) => {
      const timer = setTimeout(resolveSleep, ms);
      signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(timer);
          resolveSleep();
        },
        { once: true },
      );
    });
  }

  async function waitAgents(threadIds: string[], timeoutMs: number, signal?: AbortSignal) {
    const deadline = Date.now() + timeoutMs;
    const spawnedAt = new Map(threadIds.map((id) => [id, q.threadById.get(id)?.created_at ?? 0]));
    let statuses = new Map<string, LiveThread>();
    while (true) {
      statuses = await liveThreads(threadIds.map((id) => fallback.current(id)));
      const pending = threadIds.filter((id) => {
        if (fallback.isPending(id)) return true;
        if (fallback.state(id)?.status === "blocked") return false;
        const status = statuses.get(fallback.current(id))?.status;
        if (!status) return false; // deleted: nothing to wait for
        if (RUNNING.has(status)) return true;
        // Freshly spawned or continued threads can read idle before their turn starts.
        const current = fallback.current(id);
        const since = Date.now() - Math.max(q.threadById.get(current)?.created_at ?? spawnedAt.get(id) ?? 0, resumedAt.get(current) ?? 0);
        return !finished.has(current) && !startedAt.has(current) && since < 20_000;
      });
      if (pending.length === 0 || Date.now() >= deadline || signal?.aborted) break;
      await sleep(3000, signal);
    }
    const parts: string[] = [];
    let stillRunning = 0;
    for (const originalId of threadIds) {
      const id = fallback.current(originalId);
      const row = q.threadById.get(id);
      const status = statuses.get(id)?.status ?? "deleted";
      const header = `### ${row?.title ?? id} (${id}) — ${status}`;
      const recovery = fallback.state(id);
      if (recovery?.status === "blocked") {
        parts.push(`${header}\n${recovery.reason} Требуется решение пользователя в инбоксе Software Factory.`);
        continue;
      }
      if (fallback.isPending(id)) {
        stillRunning += 1;
        parts.push(`${header}\nSoftware Factory продолжает задачу: ${recovery?.reason}.`);
        continue;
      }
      if (RUNNING.has(status) || awaitingStart(id)) {
        stillRunning += 1;
        parts.push(`${header}\n${RUNNING.has(status) ? "Ещё работает." : "Продолжение ещё не началось."}`);
        continue;
      }
      let output: string | null = null;
      try {
        output = (await bb.sdk.threads.output({ threadId: id })).output;
      } catch {
        output = finished.get(id)?.text ?? null;
      }
      const text = (output ?? finished.get(id)?.text ?? "(нет финального ответа)").trim();
      parts.push(`${header}\n${text.length > 16000 ? `${text.slice(0, 16000)}\n…(обрезано)` : text}`);
    }
    if (stillRunning > 0) {
      parts.push(`\n${stillRunning} агент(ов) ещё работают. Вызови sf_wait_agents снова с теми же threadIds.`);
    }
    return parts.join("\n\n");
  }


  /** Above this an agent's own context costs more than a fresh agent pointed at its results (aird-delivery-loop). */
  const CONTINUE_MAX_TOKENS = 300_000;
  /** Tool actions (commands, reads, edits) after which a delivery worker is told to checkpoint and stop. */
  const WORKER_ACTION_BUDGET = 100;
  const CONTINUE_MAX_PCT = 60;

  /**
   * Gives an existing agent of this AIRD a follow-up in its own thread: it
   * keeps what it already learned (the code it read, its probe harness, its
   * conclusions) instead of a new agent rediscovering them.
   */
  async function continueAgent(parentThreadId: string, threadId: string, task: string, workorders: string[]) {
    threadId = fallback.current(threadId);
    const parentRow = q.threadById.get(parentThreadId);
    if (!parentRow || parentRow.kind !== "orchestrator") throw new Error("sf_continue_agent доступен только оркестратору AIRD");
    const row = q.threadById.get(threadId);
    if (!row || row.kind !== "agent" || row.aird_id !== parentRow.aird_id) throw new Error(`${threadId} — не агент этого AIRD`);
    if (row.budget_signal_at) throw new Error(`Агент ${threadId} исчерпал бюджет действий: запусти свежего через sf_spawn_agent с workorder и его evidence/*-progress.md`);
    const record = q.airdById.get(row.aird_id);
    if (!record) throw new Error("AIRD этого треда не найден");
    if (row.role !== "test-author" && row.role !== "reviewer" && record.acceptance_folder && task.includes(record.acceptance_folder)) {
      throw new Error("Исполнителю нельзя передавать путь к приёмочным тестам: он получает только вердикты по сценариям (sf_run_acceptance).");
    }
    let status: string;
    try {
      status = (await bb.sdk.threads.get({ threadId })).status;
    } catch {
      throw new Error(`Тред агента ${threadId} недоступен — запусти нового через sf_spawn_agent`);
    }
    if (RUNNING.has(status) || awaitingStart(threadId) || fallback.isPending(threadId)) throw new Error(`Агент ${row.title} ещё работает — дождись его через sf_wait_agents`);
    if (parentRow.stage === "delivery" && ["backend-worker", "frontend-worker", "worker"].includes(row.role)) {
      const session = sessionOf(record.id, parentThreadId);
      if (session.fromHere) throw new Error(`Передача уже записана: работа продолжается в @thread:${session.fromHere.to_thread}`);
      if (session.slices >= SLICE_LIMIT) throw new Error(`В этой сессии уже ${session.slices} срезов (лимит ${SLICE_LIMIT}): запиши checkpoint и вызови sf_handoff`);
    }
    const context = await contextOf(threadId);
    if (execution.get.get(threadId)) {
      const decision = await workerBudget(threadId);
      if (decision.action === "checkpoint") throw new Error("Бюджет исчерпан: сохрани checkpoint и заверши агента; продолжение в этом контексте запрещено.");
    }
    if ((context.used ?? 0) >= CONTINUE_MAX_TOKENS || (context.pct ?? 0) >= CONTINUE_MAX_PCT) {
      throw new Error(`Контекст агента уже ${context.used ?? "?"} токенов (${context.pct ?? "?"}%): продолжать дороже, чем начать заново. Запусти свежего через sf_spawn_agent и дай ему пути к результатам этого агента.`);
    }
    const pkgDir = packageDir({ folder: record.folder, slug: record.slug, record });
    const attached = inputsNamedIn(task, listInputs(pkgDir));
    const projectHost = (await projectInfo(record.project_id)).hostId;
    const text = [
      "## Продолжение от оркестратора",
      "",
      task.trim(),
      "",
      "Опирайся на то, что уже сделал в этом треде, и перечитывай только изменившиеся файлы. Ответ — в формате, заданном выше; если не задан — короткий отчёт для оркестратора.",
    ].join("\n");
    finished.delete(threadId);
    startedAt.delete(threadId);
    resumedAt.set(threadId, Date.now());
    fallback.appendInput(threadId, [{ type: "text", text, mentions: [] }, ...inputParts(attached, projectHost)]);
    try {
      await bb.sdk.threads.send({
        threadId,
        input: [{ type: "text", text, mentions: [] }, ...inputParts(attached, projectHost)],
        mode: "queue-if-active",
      });
    } catch (error) {
      resumedAt.delete(threadId);
      throw error;
    }
    const previous = (() => { try { return JSON.parse(row.refs ?? "[]") as string[]; } catch { return []; } })();
    const refs = [...new Set([...previous, ...workorders.map((id) => id.trim().toUpperCase()).filter((id) => /^(WO-\d+[A-Z]?|F-\d{2,})$/u.test(id))])];
    q.continueThread.run(`${row.task ?? ""}\n\n--- продолжение ---\n${task}`, JSON.stringify(refs), threadId);
    publishChanged();
    return { title: row.title, context };
  }

  /**
   * Idle agents of the same role in this AIRD that could still take a
   * follow-up (under the continuation limits). A fresh agent re-reads its brief,
   * the package and the sources; naming the idle one right after a spawn is how
   * the orchestrator learns to continue the next time.
   */
  async function continuationCandidates(parentThreadId: string, role: string, exceptThreadId: string): Promise<string[]> {
    const parentRow = q.threadById.get(parentThreadId);
    if (!parentRow) return [];
    const same = q.threadsByAird.all(parentRow.aird_id)
      .filter((thread) => thread.kind === "agent" && thread.role === role && thread.thread_id !== exceptThreadId)
      .sort((a, b) => b.created_at - a.created_at)
      .slice(0, 3);
    const found: string[] = [];
    for (const thread of same) {
      if (thread.budget_signal_at || fallback.current(thread.thread_id) !== thread.thread_id || awaitingStart(thread.thread_id) || fallback.isPending(thread.thread_id)) continue;
      try {
        const live = (await bb.sdk.threads.get({ threadId: thread.thread_id })) as unknown as {
          status: string;
          contextWindowUsage?: { usedTokens?: number; modelContextWindow?: number };
        };
        if (RUNNING.has(live.status)) continue;
        const used = live.contextWindowUsage?.usedTokens ?? null;
        const window = live.contextWindowUsage?.modelContextWindow ?? null;
        const pct = used !== null && window ? Math.round((used / window) * 100) : null;
        if ((used ?? 0) >= CONTINUE_MAX_TOKENS || (pct ?? 0) >= CONTINUE_MAX_PCT) continue;
        const size = used === null ? "контекст н/д" : `${Math.round(used / 1000)} тыс. токенов`;
        found.push(`@thread:${thread.thread_id} («${thread.title}», ${size})`);
      } catch {
        // A thread we cannot read is not offered.
      }
    }
    return found;
  }

  // ------------------------------------------------------------ activity
  // A thread whose turn ended can still be working: a provider's background
  // task (a long test run, a wait for other threads) runs on after the turn.
  // Factory reads it from the thread's events, with the command in flight and
  // the last thing the agent said, so the page shows that work goes on.
  interface ThreadActivity {
    background: Map<string, { description: string; startedAt: number }>;
    commands: Map<string, { text: string; startedAt: number }>;
    lastMessage: string | null;
    lastMessageAt: number | null;
    lastEventAt: number | null;
    afterSeq: string | null;
    checkedAt: number;
  }
  const activityCache = new Map<string, ThreadActivity>();
  const shortCommand = (command: string) =>
    command.split("\n").map((line) => line.trim()).find((line) => line && !line.startsWith("#"))?.replace(/^cd\s+\S+\s*(&&|;)\s*/u, "").slice(0, 120) ?? "";

  async function activityOf(threadId: string, running: boolean): Promise<ThreadActivity | null> {
    let state = activityCache.get(threadId);
    const fresh = state && Date.now() - state.checkedAt < (running || (state.background.size > 0) ? 5_000 : 120_000);
    if (state && fresh) return state;
    state ??= { background: new Map(), commands: new Map(), lastMessage: null, lastMessageAt: null, lastEventAt: null, afterSeq: null, checkedAt: 0 };
    try {
      for (let page = 0; page < 200; page += 1) {
        const rows = (await bb.sdk.threads.events.list({
          threadId,
          types: ["item/started", "item/completed", "item/backgroundTask/completed", "turn/completed"],
          order: "asc",
          limit: String(EVENT_PAGE),
          ...(state.afterSeq ? { afterSeq: state.afterSeq } : {}),
        })) as unknown as Array<{ seq: number | string; type: string; createdAt?: number | string; data?: { item?: { id?: string; type?: string; description?: string; taskStatus?: string; command?: string; text?: string } } }>;
        if (rows.length === 0) break;
        for (const row of rows) {
          const at = Number(row.createdAt ?? Date.now());
          const item = row.data?.item;
          state.lastEventAt = Math.max(state.lastEventAt ?? 0, at);
          if (row.type === "turn/completed") { state.commands.clear(); continue; }
          if (!item?.id) continue;
          if (row.type === "item/started" && item.type === "backgroundTask" && item.taskStatus === "running") {
            state.background.set(item.id, { description: item.description ?? "фоновая задача", startedAt: at });
          } else if (row.type === "item/backgroundTask/completed") {
            state.background.delete(item.id);
          } else if (row.type === "item/started" && item.type === "commandExecution") {
            state.commands.set(item.id, { text: shortCommand(item.command ?? ""), startedAt: at });
          } else if (row.type === "item/completed" && item.type === "commandExecution") {
            state.commands.delete(item.id);
          } else if (row.type === "item/completed" && item.type === "agentMessage" && item.text?.trim()) {
            state.lastMessage = item.text.trim();
            state.lastMessageAt = at;
          }
        }
        state.afterSeq = String(rows[rows.length - 1]!.seq);
        if (rows.length < EVENT_PAGE) break;
      }
      state.checkedAt = Date.now();
      activityCache.set(threadId, state);
      return state;
    } catch (error) {
      bb.log.warn(`activity of ${threadId}: ${String(error).slice(0, 300)}`);
      return state.checkedAt ? state : null;
    }
  }

  /** Whether Factory should read a thread's events for the page: live work, or a recent orchestrator. */
  function watchActivity(thread: ThreadRow, status: string): boolean {
    if (RUNNING.has(status)) return true;
    if (activityCache.get(thread.thread_id)?.background.size) return true;
    const age = Date.now() - thread.created_at;
    return thread.kind === "orchestrator" ? age < 72 * 3600_000 : age < 12 * 3600_000;
  }

  /** Cached only: a thread with a background task counts as working in the AIRD list too. */
  function hasBackground(threadId: string): boolean {
    return (activityCache.get(threadId)?.background.size ?? 0) > 0;
  }

  // ------------------------------------------------------------ usage
  // Every step of an agent re-sends its whole context, so its cost grows with
  // the square of how long it runs. Factory shows each agent's tokens and tells
  // a delivery worker when its action budget is spent: it commits what is
  // green and writes what is left, and a fresh worker continues from that note.
  /** The bb host returns at most 100 thread events per request. */
  const EVENT_PAGE = 100;
  const collectUsage = usageCollector((args) => bb.sdk.threads.events.list(args));

  /** The latest limit state each provider reported in this AIRD's recent threads (allowed / warning / blocked). */
  const limitCache = new Map<string, { at: number; value: ProviderLimit | null }>();
  interface ProviderLimit { provider: string; status: string; window: string | null; resetsAt: number | null; reportedAt: number }
  async function latestLimitOf(threadId: string): Promise<ProviderLimit | null> {
    const cached = limitCache.get(threadId);
    if (cached && Date.now() - cached.at < 60_000) return cached.value;
    let value: ProviderLimit | null = null;
    try {
      const rows = (await bb.sdk.threads.events.list({ threadId, types: ["provider/rateLimits/updated"], order: "desc", limit: "1" })) as unknown as Array<{
        createdAt?: number | string;
        data?: { rateLimits?: { providerId?: string; status?: string; windows?: Array<{ label?: string | null; status?: string; resetsAtMs?: number | null }> } };
      }>;
      const limits = rows[0]?.data?.rateLimits;
      if (limits?.providerId) {
        const window = limits.windows?.find((item) => item.status === limits.status) ?? limits.windows?.[0] ?? null;
        value = { provider: limits.providerId, status: limits.status ?? "unknown", window: window?.label ?? null, resetsAt: window?.resetsAtMs ?? null, reportedAt: Number(rows[0]!.createdAt ?? 0) };
      }
    } catch { /* No limit events from this provider. */ }
    limitCache.set(threadId, { at: Date.now(), value });
    return value;
  }
  async function providerLimits(threads: ThreadRow[]): Promise<ProviderLimit[]> {
    const recent = threads.filter((thread) => thread.created_at > Date.now() - 12 * 3600_000).slice(-20);
    const latest = new Map<string, ProviderLimit>();
    for (const value of await Promise.all(recent.map((thread) => latestLimitOf(thread.thread_id)))) {
      if (!value) continue;
      const known = latest.get(value.provider);
      if (!known || value.reportedAt > known.reportedAt) latest.set(value.provider, value);
    }
    // A window that has already reset no longer limits anything.
    return [...latest.values()].filter((limit) => limit.resetsAt === null || limit.resetsAt > Date.now() || limit.status === "allowed");
  }

  function activityView(state: ThreadActivity | null, running: boolean) {
    if (!state) return null;
    const command = running ? [...state.commands.values()].sort((a, b) => b.startedAt - a.startedAt)[0] ?? null : null;
    return {
      background: [...state.background.values()].sort((a, b) => a.startedAt - b.startedAt),
      command,
      lastMessage: state.lastMessage ? state.lastMessage.slice(0, 600) : null,
      lastMessageAt: state.lastMessageAt,
      lastEventAt: state.lastEventAt,
    };
  }

  /** What is going on right now across the AIRD's threads, newest orchestrator message included. */
  function nowView(threads: AgentThread[]) {
    const items: { threadId: string; role: string; title: string; kind: "running" | "background"; text: string; since: number | null }[] = [];
    for (const thread of threads) {
      const activity = thread.activity;
      if (RUNNING.has(thread.status)) {
        items.push({
          threadId: thread.threadId, role: thread.role, title: thread.title, kind: "running",
          text: activity?.command ? `выполняет: ${activity.command.text}` : "работает",
          since: activity?.command?.startedAt ?? activity?.lastEventAt ?? null,
        });
      }
      for (const task of activity?.background ?? []) {
        items.push({ threadId: thread.threadId, role: thread.role, title: thread.title, kind: "background", text: task.description, since: task.startedAt });
      }
    }
    const orchestrator = [...threads].filter((thread) => thread.kind === "orchestrator").sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;
    return {
      working: items.length > 0,
      items,
      orchestrator: orchestrator
        ? { threadId: orchestrator.threadId, status: orchestrator.status, message: orchestrator.activity?.lastMessage ?? null, at: orchestrator.activity?.lastMessageAt ?? null, lastEventAt: orchestrator.activity?.lastEventAt ?? null }
        : null,
    };
  }

  const ACTION_ITEMS = new Set(["commandExecution", "fileChange", "fileRead", "toolCall", "mcpToolCall", "webSearch", "webFetch"]);
  const actionCounts = new Map<string, { afterSeq: string | null; count: number }>();
  async function actionsOf(threadId: string): Promise<number> {
    const state = actionCounts.get(threadId) ?? { afterSeq: null, count: 0 };
    for (let page = 0; page < 200; page += 1) {
      const rows = (await bb.sdk.threads.events.list({
        threadId,
        types: ["item/completed"],
        order: "asc",
        limit: String(EVENT_PAGE),
        ...(state.afterSeq ? { afterSeq: state.afterSeq } : {}),
      })) as unknown as Array<{ seq: number | string; data?: { item?: { type?: string } } }>;
      if (rows.length === 0) break;
      for (const row of rows) if (ACTION_ITEMS.has(row.data?.item?.type ?? "")) state.count += 1;
      state.afterSeq = String(rows[rows.length - 1]!.seq);
      if (rows.length < EVENT_PAGE) break;
    }
    actionCounts.set(threadId, state);
    return state.count;
  }

  async function workerBudget(threadId: string) {
    const live = await bb.sdk.threads.get({ threadId });
    const usage = (live as any).contextWindowUsage;
    const captured = usage?.snapshot?.capturedAt;
    const capturedAt = typeof captured === "number" ? captured : typeof captured === "string" ? Date.parse(captured) : null;
    return decideExecutionBudget({ actions: await actionsOf(threadId), contextTokens: usage?.usedTokens ?? null, contextWindow: usage?.modelContextWindow ?? null, capturedAt, now: Date.now() });
  }

  function budgetSignal(row: ThreadRow, actions: number, reason = ""): string {
    const wo = parseRefs(row.refs).find((id) => /^WO-/u.test(id)) ?? "WO";
    return [
      "## Software Factory: бюджет воркера исчерпан",
      "",
      `Ты сделал ${actions} действий (бюджет ${execution.get.get(row.thread_id) ? EXECUTION_POLICY.stopActions : WORKER_ACTION_BUDGET}). Каждый следующий шаг заново отправляет весь накопленный контекст, поэтому остаток дешевле сделает свежий воркер по короткой записке. Сейчас:`,
      "",
      ...(reason ? [`Причина checkpoint: ${reason}.`] : []),
      "1. Не начинай новых шагов: доведи текущую правку до компилируемого состояния.",
      "2. Прогони затронутые тесты (вывод — в файл, на экран только хвост).",
      "3. Сохрани рабочую копию; коммить только если это разрешено пользователем. Не откатывай незавершённые правки.",
      `4. Запиши в пакете \`evidence/${wo}-progress.md\`: коммит, что сделано, что осталось — шаги с точными файлами и функциями, какие тесты красные и почему. Дизайн не пересказывай: следующий воркер получит воркордер.`,
      ...(execution.get.get(row.thread_id) ? [`В начале записки добавь YAML frontmatter: checkpoint_source: ${row.thread_id}; checkpoint_revision: текущая ревизия/ревизии; checkpoint_dirty_paths, checkpoint_completed, checkpoint_remaining, checkpoint_checks: YAML-списки. Пустые списки допустимы, но checks должен назвать выполненные команды или явно сказать, что проверки не запускались.`] : []),
      `5. Заверши ответ строкой \`Статус: частично — остаток в evidence/${wo}-progress.md\`.`,
    ].join("\n");
  }

  let budgetCheckRunning = false;
  async function checkWorkerBudgets(): Promise<void> {
    if (budgetCheckRunning) return;
    budgetCheckRunning = true;
    try {
      for (const row of q.budgetCandidates.all(Date.now() - 24 * 3600_000)) {
        try {
          const status = (await bb.sdk.threads.get({ threadId: row.thread_id })).status;
          if (!RUNNING.has(status)) continue;
          const actions = await actionsOf(row.thread_id);
          const managed = execution.get.get(row.thread_id);
          let reason = "";
          if (managed) {
            const decision = await workerBudget(row.thread_id);
            reason = decision.reasons.join(", ");
            if (decision.action === "continue") continue;
            if (decision.action === "warn") {
              if (!managed.warned_at) {
                await bb.sdk.threads.send({ threadId: row.thread_id, input: [{ type: "text", text: `Factory: бюджет близок (${decision.reasons.join(", ")}). Заверши текущую часть; подготовь краткую записку о результате и остатке.`, mentions: [] }], mode: "steer-if-active" });
                execution.warn.run(Date.now(), row.thread_id);
              }
              continue;
            }
          } else if (actions < WORKER_ACTION_BUDGET) continue;
          await bb.sdk.threads.send({ threadId: row.thread_id, input: [{ type: "text", text: budgetSignal(row, actions, reason), mentions: [] }], mode: "steer-if-active" });
          q.markBudgetSignal.run(Date.now(), row.thread_id);
          execution.checkpoint.run(row.thread_id);
          bb.log.info(`budget signal sent to ${row.thread_id} after ${actions} actions`);
          publishChanged();
        } catch (error) {
          bb.log.warn(`budget check failed for ${row.thread_id}: ${String(error)}`);
        }
      }
      const requested = db.prepare(`SELECT t.* FROM threads t JOIN worker_execution e ON e.thread_id=t.thread_id WHERE e.state='checkpoint_requested'`).all() as ThreadRow[];
      for (const row of requested) {
        try {
          const record = q.airdById.get(row.aird_id);
          if (!record || !row.budget_signal_at || Date.now() - row.budget_signal_at < 120_000) continue;
          const wo = parseRefs(row.refs).find(id => /^WO-/u.test(id)) ?? "WO";
          const dir = packageDir({folder:record.folder,slug:record.slug,record});
          const note = join(dir, "evidence", `${wo}-progress.md`);
          if (!existsSync(note) || statSync(note).size > 32_000 || statSync(note).mtimeMs < row.budget_signal_at || !realpathSync(note).startsWith(realpathSync(dir) + "/")) continue;
          if (checkpointProblem(splitFrontmatter(readFileSync(note,"utf8")).data,row.thread_id)) continue;
          const live = await bb.sdk.threads.get({threadId:row.thread_id});
          if (RUNNING.has(live.status)) await bb.sdk.threads.stop({threadId:row.thread_id});
          const stopped = await bb.sdk.threads.get({threadId:row.thread_id});
          if (RUNNING.has(stopped.status)) continue;
          db.prepare(`UPDATE worker_execution SET state='checkpoint_ready', checkpoint=? WHERE thread_id=?`).run(createHash("sha256").update(readFileSync(note)).digest("hex"),row.thread_id);
          publishChanged();
        } catch (error) { bb.log.warn(`checkpoint confirmation failed for ${row.thread_id}: ${String(error)}`); }
      }
    } finally {
      budgetCheckRunning = false;
    }
  }
  const budgetTimer = setInterval(() => void checkWorkerBudgets(), 60_000);
  bb.onDispose(() => clearInterval(budgetTimer));

  // ------------------------------------------------------------ lifecycle
  // Stage transitions and the session budget are Factory operations: the
  // orchestrator asks, Factory checks the evidence, writes STATE.md and keeps
  // its own journal, so the UI and the file show one sequence.
  function statePathOf(row: AirdRow): string {
    return join(packageDir({ folder: row.folder, slug: row.slug, record: row }), "STATE.md");
  }

  async function transitionProblems(row: AirdRow, pkg: ParsedPackage, to: string): Promise<string[]> {
    const state = pkg.state;
    const wave = state?.activeWave ?? null;
    const problems: string[] = [];
    const policyIssue = profileProblem(splitFrontmatter(readText(statePathOf(row)) ?? "").data);
    if (policyIssue) problems.push(policyIssue);
    if (to === "in_delivery") {
      if (!wave || wave === "none") problems.push("в STATE.md нет active_wave");
      if (state?.readiness.implementation !== "ready") problems.push(`ready_for_implementation: ${state?.readiness.implementation ?? "—"}, нужно ready`);
    }
    if (to === "implementation_complete") {
      const open = pkg.workorders.filter((wo) => wo.wave === wave && (wo.kind === "implementation" || wo.kind === "spike") && !isDoneStatus(wo.status));
      if (open.length) problems.push(`не завершены воркордеры волны ${wave}: ${open.map((wo) => `${wo.id} (${wo.status})`).join(", ")} — нужен status: done в воркордере или его evidence`);
    }
    if (to === "verifying" && !["ready", "not_required"].includes(state?.readiness.runtime ?? "")) {
      problems.push(`ready_for_runtime_verification: ${state?.readiness.runtime ?? "—"}, нужно ready или not_required`);
    }
    if (to === "ready_for_release") {
      const notPassed = gatesFor(pkg, row.id).filter((gate) => !/blind acceptance|слеп/iu.test(gate.title) && gate.status !== "passed");
      if (notPassed.length) problems.push(`гейты не пройдены: ${notPassed.map((gate) => `${gate.id} (${gate.status})`).join(", ")}; неприменимый гейт пользователь отмечает в Software Factory`);
      if (pkg.scenarios.length > 0) {
        const view = (await acceptanceView(await findEntry(row.id))).view;
        if (view.gate !== "passed") problems.push(`слепая приёмка: ${view.gate} — нужен прогон sf_run_acceptance с вердиктом pass на текущем коде`);
      }
    }
    if (to === "complete") {
      const result = await runValidator(packageDir({ folder: row.folder, slug: row.slug, record: row }));
      if (!result.ok) problems.push(`валидатор пакета: ${result.error ?? result.errors.slice(0, 3).join("; ")}`);
    }
    return problems;
  }

  async function applyTransition(row: AirdRow, to: string, threadId: string | null, by: string) {
    const path = statePathOf(row);
    const text = readText(path);
    if (text === null) throw new Error(`STATE.md не найден: ${path}`);
    const { data } = splitFrontmatter(text);
    const from = String(data.status ?? "");
    const history = readTransitions(data as Record<string, unknown>);
    const allowed = allowedTargets(from, history);
    if (!allowed.includes(to)) throw new Error(`Переход ${from} → ${to} недопустим: из ${from} можно только в ${allowed.join(", ") || "— (финальный этап)"}`);
    const problems = to === "paused" ? [] : await transitionProblems(row, readPackage(dirname(path)), to);
    if (problems.length) throw new Error(`Переход ${from} → ${to} не выполнен:\n- ${problems.join("\n- ")}`);
    const at = new Date().toISOString();
    let next = setField(text, "status", to);
    if (to === "ready_for_release") next = setField(next, "ready_for_release", "ready");
    next = setField(next, "updated_at", at.slice(0, 10));
    const entry: Transition = { from, to, at, by, thread: threadId };
    next = appendTransition(next, entry);
    writeFileSync(path, next);
    q.insertStageEvent.run(row.id, from, to, Date.now(), threadId, null);
    const notes = await syncBranches(row);
    publishChanged();
    return { from, to, next: allowedTargets(to, [...history, entry]).filter((target) => target !== "paused"), notes };
  }

  /** History from STATE.md and whether it agrees with Factory's own journal. */
  function lifecycleOf(row: AirdRow | null | undefined, status: string, data: Record<string, unknown>) {
    const history = readTransitions(data);
    const events = row ? q.stageEvents.all(row.id) : [];
    let problem = historyProblem(status, history);
    if (!problem && events.length > 0) {
      const last = events[events.length - 1]!;
      if (last.to_status !== status) problem = `status: ${status}, но Factory последним записала переход в ${last.to_status}`;
      else if (history.length < events.length) problem = `в STATE.md ${history.length} переходов, в журнале Factory ${events.length}`;
    }
    return { history, problem, recorded: events.length };
  }

  async function sessionView(airdId: string, threads: ThreadRow[]) {
    const orchestrator = [...threads].filter((thread) => thread.kind === "orchestrator").sort((a, b) => b.created_at - a.created_at)[0] ?? null;
    const session = sessionOf(airdId, orchestrator?.thread_id ?? null);
    const context = orchestrator ? await contextOf(orchestrator.thread_id) : { pct: null };
    return {
      slices: session.slices,
      limit: SLICE_LIMIT,
      threadId: orchestrator?.thread_id ?? null,
      contextPct: context.pct,
      agents: {
        started: new Set(threads.filter((thread) => thread.kind === "agent").map((thread) => fallback.root(thread.thread_id))).size,
        continued: threads.reduce((sum, thread) => sum + (thread.kind === "agent" ? thread.continuations ?? 0 : 0), 0),
      },
      handoffs: session.handoffs.map((handoff) => ({ from: handoff.from_thread, to: handoff.to_thread, createdAt: handoff.created_at, confirmedAt: handoff.confirmed_at })),
    };
  }

  async function contextOf(threadId: string): Promise<{ pct: number | null; used: number | null; providerSession: string | null }> {
    try {
      const thread = (await bb.sdk.threads.get({ threadId })) as unknown as {
        contextWindowUsage?: { usedTokens?: number; modelContextWindow?: number; snapshot?: { providerSessionId?: string } };
      };
      const usage = thread.contextWindowUsage;
      const pct = usage?.modelContextWindow ? Math.round(((usage.usedTokens ?? 0) / usage.modelContextWindow) * 100) : null;
      return { pct, used: usage?.usedTokens ?? null, providerSession: usage?.snapshot?.providerSessionId ?? null };
    } catch {
      return { pct: null, used: null, providerSession: null };
    }
  }

  /**
   * A session is one orchestrator thread: its slices count, nobody else's. A new
   * orchestrator — after a handoff or a fresh discovery/delivery launch — starts
   * from zero, and a thread that handed off never starts another slice. The
   * handoff is confirmed when the new session starts its first slice.
   */
  function sessionOf(airdId: string, threadId: string | null) {
    const handoffs = q.handoffs.all(airdId);
    const sessions = threadId ? q.threadsByAird.all(airdId).filter((row) => fallback.root(row.thread_id) === fallback.root(threadId)).map((row) => row.thread_id) : [];
    return {
      handoffs,
      fromHere: threadId ? handoffs.find((handoff) => handoff.from_thread === threadId) ?? null : null,
      toHere: threadId ? handoffs.find((handoff) => handoff.confirmed_at === null && handoff.to_thread === threadId) ?? null : null,
      slices: sessions.reduce((sum, id) => sum + (q.sliceCount.get(airdId, id)?.n ?? 0), 0),
    };
  }

  function writeSessionState(row: AirdRow, slices: number, pct: number | null) {
    const path = statePathOf(row);
    const text = readText(path);
    if (text === null) return;
    writeFileSync(path, setField(setField(text, "root_slices_since_handoff", slices), "context_fill", pct === null ? "n/a" : `${pct}%`));
  }

  async function beginSlice(row: AirdRow, threadId: string, ref: string): Promise<{ allowed: boolean; text: string }> {
    if (fallback.current(threadId) !== threadId) return { allowed: false, text: `Сессия продолжена в @thread:${fallback.current(threadId)}; здесь новые срезы запрещены` };
    let session = sessionOf(row.id, threadId);
    if (session.fromHere) {
      return { allowed: false, text: `Срез не начат: передача уже записана — работа продолжается в @thread:${session.fromHere.to_thread}. В этой сессии срезы больше не начинаются.` };
    }
    if (session.toHere) {
      q.confirmHandoff.run(Date.now(), q.maxSliceId.get(row.id)?.m ?? 0, session.toHere.id);
      session = sessionOf(row.id, threadId);
    }
    const context = await contextOf(threadId);
    const decision = sliceDecision({ slices: session.slices, contextPct: context.pct });
    if (!decision.allowed) {
      return {
        allowed: false,
        text: `Срез не начат: ${decision.reason}. Это граница сессии: запиши .continue-here.md (checkpoint_kind: proactive_handoff) и вызови sf_handoff — Factory продолжит работу в свежей сессии.`,
      };
    }
    q.insertSlice.run(row.id, threadId, context.providerSession, ref, context.pct, Date.now());
    writeSessionState(row, session.slices + 1, context.pct);
    publishChanged();
    const measured = context.pct === null ? "контекст: н/д — измерение недоступно, Factory контролирует только лимит срезов" : `контекст ${context.pct}%`;
    return {
      allowed: true,
      text: `Срез ${session.slices + 1} из ${SLICE_LIMIT} (${ref}) · сессия @thread:${threadId}${context.providerSession ? ` / ${context.providerSession.slice(0, 8)}` : ""} · ${measured}.${decision.worker ? " Контекст не меньше 60%: этот срез отдай worker через sf_spawn_agent." : ""}`,
    };
  }

  async function handOff(row: AirdRow, threadId: string, stage: "discovery" | "delivery"): Promise<string> {
    const session = sessionOf(row.id, threadId);
    if (session.fromHere) return session.fromHere.to_thread;
    const continuePath = join(packageDir({ folder: row.folder, slug: row.slug, record: row }), ".continue-here.md");
    const text = readText(continuePath);
    if (text === null) throw new Error("Сначала запиши .continue-here.md в пакете AIRD");
    const kind = splitFrontmatter(text).data.checkpoint_kind;
    if (kind !== "proactive_handoff" && kind !== "hard_stop") throw new Error(`checkpoint_kind в .continue-here.md: ${String(kind ?? "—")}, нужно proactive_handoff или hard_stop`);
    const lastSlice = q.lastSliceOf.get(threadId)?.started_at ?? 0;
    if (statSync(continuePath).mtimeMs < lastSlice) throw new Error(".continue-here.md старше последнего среза: обнови checkpoint и вызови снова");
    await syncBranches(row);
    const thread = await spawnOrchestrator(row, stage, `Передача сессии от @thread:${threadId}: продолжи по STATE.md и .continue-here.md. Счётчик срезов начнётся заново с первым sf_slice_begin в этой сессии.`);
    q.insertHandoff.run(row.id, threadId, thread.id, Date.now());
    publishChanged();
    return thread.id;
  }

  // ------------------------------------------------------------ acceptance
  // Blind acceptance: a test author who never sees the implementation writes
  // the suite in its own worktree; the plugin runs it and hands the
  // implementer scenario verdicts only.
  q.staleRuns.run(Date.now());
  const activeRuns = new Map<string, { runId: string; kind: "baseline" | "wave"; done: Promise<AcceptanceRunRow> }>();
  const preparingWaves = new Set<string>();
  const startingRuns = new Set<string>();
  const acceptanceAbort = new AbortController();
  bb.onDispose(async () => {
    acceptanceAbort.abort();
    await Promise.allSettled([...activeRuns.values()].map((run) => run.done));
  });

  async function ensureAirdAcceptance(id: string): Promise<AirdRow> {
    const row = await ensureDeliveryCheckout(id);
    if (row.acceptance_folder && isDirectory(row.acceptance_folder)) {
      // The test author commits its suite too: its copy must keep git data inside its own folder.
      if (row.acceptance_branch) await migrateWorktreeToClone(row.acceptance_folder, row.acceptance_branch, /(^|\/)results\.json$/u);
      return row;
    }
    const changed = codeRepos(row);
    if (changed.length > 1) {
      // Several repositories: the suite gets a repository of its own next to the workspace copy, never inside it.
      const folder = join(expandHome(config.worktreeRoot || "~/.aird-worktrees"), basename(resolve(row.folder)), `${row.slug}-acceptance`);
      const branch = `aird/${row.slug}-acceptance`;
      await ensureSuiteRepository(folder, branch);
      q.setAcceptance.run(folder, branch, id);
      publishChanged();
      return q.airdById.get(id)!;
    }
    const repo = reposOf(row)[0];
    // In a workspace the suite lives next to the one repository it judges.
    const info = repo
      ? await ensureWorktree(repo.main, row.slug, config.worktreeRoot || "~/.aird-worktrees", {
          branch: `aird/${row.slug}-acceptance`,
          dirName: `${row.slug}-acceptance`,
          base: repo.base,
          copyPackage: false,
        })
      : await ensureAcceptanceWorktree(row.folder, row.slug, config.worktreeRoot || "~/.aird-worktrees", row.base_ref);
    if (!isDirectory(info.workFolder)) mkdirSync(info.workFolder, { recursive: true });
    q.setAcceptance.run(info.workFolder, info.branch, id);
    publishChanged();
    return q.airdById.get(id)!;
  }

  function scenarioScope(pkg: ParsedPackage) {
    const wave = pkg.state?.activeWave ?? null;
    const scope = selectScenarioScope(pkg.scenarios, pkg.workorders, wave);
    return { ...scope, wave: wave!, hash: createHash("sha256").update(JSON.stringify(scope)).update(verificationIdentity(pkg.dir, splitFrontmatter(readText(join(pkg.dir,"STATE.md")) ?? "").data)).digest("hex") };
  }

  async function prepareAcceptanceWave(id: string): Promise<AirdRow> {
    if (preparingWaves.has(id) || activeRuns.has(id)) throw new Error("Приёмка этого AIRD уже готовится или выполняется");
    preparingWaves.add(id);
    try {
      const initial = await ensureDeliveryCheckout(id);
      const pkg = readPackage(packageDir({ folder: initial.folder, slug: initial.slug, record: initial }));
      const scope = scenarioScope(pkg);
      if (!scope.required.length) throw new Error("У текущей и предыдущих волн нет сценариев для test-author");
      if (q.acceptanceWave.get(id, scope.wave)) {
        if (!initial.acceptance_folder || !isDirectory(initial.acceptance_folder)) throw new Error("Сохранённая worktree приёмки недоступна; восстанови её, не создавая автора на изменённом коде");
        return initial;
      }
      if (pkg.workorders.some((wo) => wo.wave === scope.wave && (isDoneStatus(wo.status) || wo.status === "in_progress"))) {
        throw new Error("test-author должен стартовать до первого среза волны; текущая волна уже начата");
      }
      const changed = codeRepos(initial);
      if (changed.length > 1) {
        const base = JSON.stringify(await workspaceBase(changed.map((repo) => ({ rel: repo.rel, path: repo.path }))));
        const row = await ensureAirdAcceptance(id);
        q.insertAcceptanceWave.run(id, scope.wave, base);
        publishChanged();
        return row;
      }
      const base = await acceptanceBase(codeRoot(initial));
      const row = await ensureAirdAcceptance(id);
      await refreshAcceptanceWorktree(row.acceptance_folder!, base, codeRoot(row));
      q.insertAcceptanceWave.run(id, scope.wave, base);
      publishChanged();
      return row;
    } finally { preparingWaves.delete(id); }
  }

  function parseResults(text: string | null): ScenarioResult[] {
    if (!text) return [];
    try { return JSON.parse(text) as ScenarioResult[]; } catch { return []; }
  }

  /** Suite folder relative to its repository, for git pathspecs. */
  async function suiteRepo(dir: string): Promise<{ top: string; rel: string }> {
    const top = (await gitText(dir, ["rev-parse", "--show-toplevel"])).trim();
    return { top, rel: relative(realpathSync(top), realpathSync(dir)) || "." };
  }

  /** The suite is exactly the registered commit: nothing changed or added since. */
  async function suiteProblem(wave: AcceptanceWaveRow): Promise<string | null> {
    if (!wave.suite_dir || !wave.suite_commit) return `Набор волны ${wave.wave} не зарегистрирован: test-author должен закоммитить его и вызвать sf_register_suite`;
    if (!existsSync(join(wave.suite_dir, "run.sh"))) return `Набор не найден: нет ${join(wave.suite_dir, "run.sh")} (зарегистрирован @${wave.suite_commit.slice(0, 8)})`;
    try {
      const { top, rel } = await suiteRepo(wave.suite_dir);
      const changed = (await gitText(top, ["diff", "--name-only", wave.suite_commit, "--", rel])).split("\n").filter((line) => line && !/\/results\.json$|^results\.json$/u.test(line));
      const untracked = (await gitText(top, ["ls-files", "--others", "--exclude-standard", "--", rel])).split("\n").filter((line) => line && !/results\.json$/u.test(line));
      if (changed.length || untracked.length) {
        return `Набор изменён после регистрации @${wave.suite_commit.slice(0, 8)} (${[...changed, ...untracked].slice(0, 3).join(", ")}): test-author должен закоммитить и зарегистрировать его заново`;
      }
    } catch (error) {
      return `Не удалось проверить набор: ${String(error).slice(0, 200)}`;
    }
    if (!wave.target_dir || !existsSync(wave.target_dir)) return `Рабочая копия реализации не найдена: ${wave.target_dir ?? "—"}`;
    return null;
  }

  /**
   * Called by the test author once the suite is committed. Validates and
   * stores the suite folder, its commit and the working copy it will judge.
   */
  async function registerSuite(airdId: string, runScript: string, by: string) {
    const row = q.airdById.get(airdId);
    if (!row?.acceptance_folder || !isDirectory(row.acceptance_folder)) throw new Error("У AIRD нет рабочей копии приёмки: test-author запускается через sf_spawn_agent");
    const scope = scenarioScope(readPackage(packageDir({ folder: row.folder, slug: row.slug, record: row })));
    const wave = q.acceptanceWave.get(airdId, scope.wave);
    if (!wave) throw new Error(`База волны ${scope.wave} не зафиксирована: test-author должен быть запущен до первого среза`);
    if (!isAbsolute(runScript) || basename(runScript) !== "run.sh") throw new Error("Передай абсолютный путь к run.sh набора");
    if (!existsSync(runScript)) throw new Error(`Файл не найден: ${runScript}`);
    const folder = realpathSync(row.acceptance_folder);
    const script = realpathSync(runScript);
    if (!script.startsWith(`${folder}/`)) throw new Error(`Набор должен лежать в рабочей копии приёмки ${row.acceptance_folder}`);
    const dir = dirname(script);
    const { top, rel } = await suiteRepo(dir);
    if ((await gitText(top, ["ls-files", "--", `${rel}/run.sh`])).trim() === "") throw new Error("run.sh не закоммичен: сначала commit, потом регистрация");
    const commit = (await gitText(top, ["rev-parse", "HEAD"])).trim();
    const target = codeRoot(row);
    const pending: AcceptanceWaveRow = { ...wave, suite_dir: dir, suite_commit: commit, target_dir: target };
    const problem = await suiteProblem(pending);
    if (problem) throw new Error(problem);
    q.registerSuite.run(dir, commit, target, Date.now(), by, airdId, scope.wave);
    publishChanged();
    return { wave: scope.wave, dir, commit, base: wave.base_ref, target };
  }

  /** A run that could not start is stored as a launch problem, never as "0 of N". */
  function launchProblem(id: string, kind: "baseline" | "wave", wave: string | null, message: string) {
    const runId = `run_${createHash("sha1").update(`${id}\0${Date.now()}\0${message}`).digest("hex").slice(0, 12)}`;
    const heading = kind === "baseline" ? "Проверка на базе" : "Приёмка";
    const text = `${heading}: не выполнена — проблема запуска. Гейт ${kind === "baseline" ? "Red-first" : "Blind acceptance"}: blocked-no-evidence.\n- ${message}`;
    q.insertRun.run(runId, id, kind, Date.now(), wave, null, null);
    q.finishRun.run("error", Date.now(), null, "[]", message, text, text, runId);
    publishChanged();
    return { runId, done: Promise.resolve(q.runById.get(runId)!) };
  }

  async function startAcceptanceRun(id: string, kind: "baseline" | "wave", retryReason?: string): Promise<{ runId: string; done: Promise<AcceptanceRunRow> }> {
    const active = activeRuns.get(id);
    if (active) {
      if (active.kind !== kind) throw new Error("Дождись текущего прогона перед запуском другого вида проверки");
      return active;
    }
    if (startingRuns.has(id) || preparingWaves.has(id)) throw new Error("Приёмка этого AIRD уже готовится");
    startingRuns.add(id);
    try {
      const row = q.airdById.get(id);
      if (!row) throw new Error("AIRD не найден");
      const scope = scenarioScope(readPackage(packageDir({ folder: row.folder, slug: row.slug, record: row })));
      if (!scope.required.length) throw new Error("Нет применимых сценариев текущей и предыдущих волн");
      const wave = q.acceptanceWave.get(id, scope.wave);
      if (!wave) return launchProblem(id, kind, scope.wave, `База волны ${scope.wave} не зафиксирована: test-author не запускался через sf_spawn_agent до первого среза`);
      const problem = await suiteProblem(wave);
      if (problem) return launchProblem(id, kind, scope.wave, problem);
      const suiteDirPath = wave.suite_dir!;
      const target = wave.target_dir!;
      scope.hash += `:${wave.suite_commit}`;
      const priorBase = q.runsByAird.all(id).find((run) => run.kind === "baseline" && run.wave === scope.wave && run.scope_hash === scope.hash && run.status !== "running");
      if (kind === "wave" && priorBase?.status !== "passed") throw new Error("Сначала нужна успешная проверка Red-first этой волны (sf_run_acceptance({ baseline: true }))");
      const targetRevision = kind === "wave" ? await revisionOf(target, wave.base_ref) : wave.base_ref;
      const recent = q.runsByAird.all(id).filter(run => run.kind === kind && run.wave === scope.wave && run.scope_hash === scope.hash && run.target_revision === targetRevision && run.status !== "running").slice(0,2);
      if (!retryReason?.trim() && repeatedPreparationFailure(recent)) throw new Error("Два одинаковых сбоя подготовки: автоматический повтор остановлен. Исправь набор или передай retryReason с конкретным изменением окружения; продуктовый код по этому результату не меняй.");
      if (retryReason) bb.log.info(`acceptance retry ${id}: ${retryReason.slice(0,500)}`);
      const runId = `run_${createHash("sha1").update(`${id}\0${Date.now()}`).digest("hex").slice(0, 12)}`;
      q.insertRun.run(runId, id, kind, Date.now(), scope.wave, scope.hash, targetRevision);
      publishChanged();
      // Explicit inputs only: the registered suite, the recorded base, the registered implementation copy.
      const execute = () => kind === "baseline"
        ? isWorkspaceBase(wave.base_ref)
          ? withWorkspaceBaseline(target, parseWorkspaceBase(wave.base_ref), (checkout) => runSuite(suiteDirPath, checkout, 30 * 60_000, acceptanceAbort.signal))
          : withBaselineCheckout(target, wave.base_ref, (checkout) => runSuite(suiteDirPath, checkout, 30 * 60_000, acceptanceAbort.signal))
        : runSuite(suiteDirPath, target, 30 * 60_000, acceptanceAbort.signal);
      const done = execute().catch((error): SuiteRun => {
        bb.log.warn(`acceptance ${runId}: ${String(error)}`);
        return { results: [], exitCode: null, log: String(error), error: `Не удалось подготовить прогон: ${String(error).slice(0, 300)}` };
      }).then(async (run) => {
        if (kind === "wave") {
          try {
            if (targetRevision !== await revisionOf(target, wave.base_ref)) run.error = "Код изменился во время прогона; нужна повторная приёмка";
          } catch { run.error = "Не удалось сверить код после прогона; нужна повторная приёмка"; }
        }
        const verdict = assessRun(run, scope.required, kind, new Set(scope.current.map((s) => s.id)), dirname(suiteDirPath));
        q.finishRun.run(verdict.status, Date.now(), run.exitCode, JSON.stringify(run.results), run.log,
          verdict.status === "error" ? verdict.text : null, verdict.text, runId);
        activeRuns.delete(id);
        publishChanged();
        return q.runById.get(runId)!;
      });
      activeRuns.set(id, { runId, kind, done });
      return { runId, done };
    } finally { startingRuns.delete(id); }
  }

  async function acceptanceView(entry: AirdEntry) {
    const pkg = readPackage(packageDir(entry));
    const record = entry.record;
    const runs = q.runsByAird.all(entry.id);
    let scope: ReturnType<typeof scenarioScope> | null = null;
    let suiteError: string | null = null;
    let registered: AcceptanceWaveRow | null = null;
    try {
      scope = scenarioScope(pkg);
      registered = q.acceptanceWave.get(entry.id, scope.wave) ?? null;
      if (registered?.suite_commit) scope.hash += `:${registered.suite_commit}`;
      if (registered) suiteError = await suiteProblem(registered);
    } catch (error) { suiteError = String(error); }
    const matching = runs.filter((run) => scope && run.wave === scope.wave && run.scope_hash === scope.hash && run.status !== "running");
    let targetRevision: string | null = null;
    if (registered?.target_dir) {
      try { targetRevision = await revisionOf(registered.target_dir, registered.base_ref); } catch { /* No current source identity: old runs cannot pass. */ }
    }
    const lastWave = matching.find((run) => run.kind === "wave" && run.target_revision === targetRevision && targetRevision !== null);
    const lastBase = matching.find((run) => run.kind === "baseline");
    const gate = suiteError && record?.acceptance_folder ? "blocked" : !lastBase ? "untested" : lastBase.status !== "passed" ? (lastBase.status === "failed" ? "failed" : "blocked")
      : !lastWave ? "untested" : lastWave.status === "passed" ? "passed" : lastWave.status === "failed" ? "failed" : "blocked";
    const waveResults = new Map(parseResults(lastWave?.results ?? null).map((r) => [r.id, r]));
    const baseResults = new Map(parseResults(lastBase?.results ?? null).map((r) => [r.id, r]));
    const required = new Set(scope?.required.map((s) => s.id) ?? []);
    const current = new Set(scope?.current.map((s) => s.id) ?? []);
    const covered = new Set(pkg.scenarios.flatMap((scenario) => scenario.dodIds));
    const live = q.threadsByAird.all(entry.id).filter((thread) => thread.role === "test-author");
    return {
      pkg,
      view: {
        folder: record?.acceptance_folder ?? null, branch: record?.acceptance_branch ?? null,
        evidenceState: evidenceState(gate, runs.some(run => run.kind === "wave")),
        wave: scope?.wave ?? null, gate: gate as "untested" | "passed" | "failed" | "blocked",
        baselineVerdict: suiteError ?? lastBase?.verdict ?? null,
        hasSuite: Boolean(registered?.suite_dir),
        suite: registered?.suite_dir
          ? { dir: registered.suite_dir, commit: registered.suite_commit, base: registered.base_ref, target: registered.target_dir, registeredAt: registered.registered_at, problem: suiteError }
          : null,
        running: activeRuns.has(entry.id),
        scenarios: pkg.scenarios.map((scenario) => {
          const applicable = required.has(scenario.id);
          const wave = waveResults.get(scenario.id), base = baseResults.get(scenario.id);
          return {
            ...scenario, applicable, current: current.has(scenario.id), baselineNote: base?.note ?? null,
            baseline: (lastBase && applicable ? (base?.status ?? "missing") : null) as "passed" | "failed" | "skipped" | "missing" | null,
            last: (lastWave && applicable ? (wave?.status ?? "missing") : null) as "passed" | "failed" | "skipped" | "missing" | null,
            expected: wave?.expected ?? null, actual: wave?.actual ?? null,
          };
        }),
        unknownResults: [...waveResults.keys()].filter((id) => !pkg.scenarios.some((scenario) => scenario.id === id)),
        dodWithoutScenario: pkg.scenarios.length > 0 ? [...new Set(pkg.workorders.filter((wo) => wo.wave === scope?.wave).flatMap((wo) => wo.dodIds))].filter((id) => !covered.has(id)) : [],
        runs: runs.map((run) => {
          const results = parseResults(run.results);
          return { id: run.id, kind: run.kind, wave: run.wave, status: run.status, startedAt: run.started_at, finishedAt: run.finished_at,
            passed: results.filter((r) => r.status === "passed").length, failed: results.filter((r) => r.status === "failed").length,
            skipped: results.filter((r) => r.status === "skipped").length, error: run.error };
        }),
        testAuthors: live,
      },
    };
  }

  // ------------------------------------------------------------- questions
  // Everything an AIRD thread is waiting on the user for, in one inbox:
  // sf_ask_user forms, provider questions/approvals, and interview questions
  // written as chat text.
  const QUESTION_RENDERER = "aird-question";
  const answeredVia = new Map<string, string>();

  function questionBase(threadId: string): Pick<Question, "airdId" | "airdSlug" | "airdTitle" | "threadRole" | "threadKind"> {
    const row = q.threadById.get(threadId);
    const aird = row ? q.airdById.get(row.aird_id) : undefined;
    return {
      airdId: row?.aird_id ?? null,
      airdSlug: aird?.slug ?? null,
      airdTitle: aird?.title ?? null,
      threadRole: row?.role ?? null,
      threadKind: row?.kind ?? null,
    };
  }

  function rowToQuestion(row: QuestionRow): Question {
    let parts: QuestionPart[] = [];
    try {
      parts = JSON.parse(row.parts) as QuestionPart[];
    } catch {
      parts = [];
    }
    const base = questionBase(row.thread_id);
    return {
      ...base,
      airdId: row.aird_id ?? base.airdId,
      id: row.id,
      threadId: row.thread_id,
      source: row.source,
      status: row.status,
      kind: row.kind,
      number: row.number,
      context: row.context,
      parts,
      approval: null,
      answerSummary: row.answer_summary,
      answeredVia: row.answered_via,
      createdAt: row.created_at,
      answeredAt: row.answered_at,
    };
  }

  async function listInteractions(threadId: string): Promise<Array<Record<string, unknown>>> {
    try {
      const result = (await bb.sdk.threads.interactions.list({ threadId })) as unknown;
      const list = Array.isArray(result) ? result : ((result as { interactions?: unknown[] }).interactions ?? []);
      return list as Array<Record<string, unknown>>;
    } catch {
      return [];
    }
  }

  /** Provider-native questions and approvals pending on running AIRD threads. */
  async function providerQuestions(airdId: string | null): Promise<Question[]> {
    const rows = q.allThreads.all().filter((row) => airdId === null || row.aird_id === airdId);
    const live = await liveThreads(rows.map((row) => row.thread_id));
    const out: Question[] = [];
    for (const row of rows) {
      if (!RUNNING.has(live.get(row.thread_id)?.status ?? "")) continue;
      for (const interaction of await listInteractions(row.thread_id)) {
        const question = providerQuestion(interaction as never, questionBase(row.thread_id));
        if (question) out.push(question);
      }
    }
    return out;
  }

  async function findQuestionInteraction(row: QuestionRow): Promise<string | null> {
    for (const interaction of await listInteractions(row.thread_id)) {
      const origin = interaction.origin as { kind?: string; rendererId?: string } | undefined;
      const payload = interaction.payload as { data?: { questionId?: string } } | undefined;
      if (origin?.kind === "plugin" && origin.rendererId === QUESTION_RENDERER && interaction.status === "pending" && payload?.data?.questionId === row.id) {
        return String(interaction.id);
      }
    }
    return null;
  }

  async function askUser(
    threadId: string,
    input: {
      question: string;
      topic?: string;
      number?: number;
      context?: string;
      options?: { label: string; detail?: string }[];
      recommended?: number;
      recommendationReason?: string;
      kind?: "decision" | "approval" | "clarification";
      allowFreeText?: boolean;
      multiSelect?: boolean;
    },
    signal: AbortSignal | undefined,
  ): Promise<string> {
    const row = q.threadById.get(threadId);
    const options = (input.options ?? []).slice(0, LETTERS.length).map((option, index) => ({
      value: LETTERS[index]!,
      label: option.label,
      detail: option.detail ?? null,
    }));
    const part: QuestionPart = {
      id: "q",
      prompt: input.question,
      topic: input.topic ?? null,
      options,
      recommended: input.recommended !== undefined && options[input.recommended] ? options[input.recommended]!.value : null,
      recommendationReason: input.recommendationReason ?? null,
      allowFreeText: input.allowFreeText ?? true,
      multiSelect: input.multiSelect ?? false,
    };
    const id = `q_${createHash("sha1").update(`${threadId}\0${Date.now()}\0${input.question}`).digest("hex").slice(0, 14)}`;
    q.insertQuestion.run({
      id,
      aird_id: row?.aird_id ?? null,
      thread_id: threadId,
      source: "tool",
      kind: input.kind ?? (options.length > 0 ? "decision" : "clarification"),
      number: input.number ?? null,
      context: input.context ?? null,
      parts: JSON.stringify([part]),
      created_at: Date.now(),
    });
    publishChanged();
    const question = rowToQuestion(q.questionById.get(id)!);
    const result = await bb.ui.requestInput(
      {
        threadId,
        rendererId: QUESTION_RENDERER,
        title: input.number ? `Вопрос ${input.number}` : "Вопрос от агента",
        payload: { questionId: id, question } as never,
        timeoutMs: 7 * 24 * 60 * 60 * 1000,
        presentation: { label: { pending: "Жду ответа пользователя", completed: "Пользователь ответил" } },
        describeSubmission: (value) => {
          const answers = ((value as { answers?: Answers } | null)?.answers ?? {}) as Answers;
          return { title: `Ответ: ${answerSummary(question, answers).slice(0, 70) || "получен"}`, detail: answerSummary(question, answers) };
        },
      },
      { signal },
    );
    if (result.outcome === "submitted") {
      const answers = ((result.value as { answers?: Answers } | null)?.answers ?? {}) as Answers;
      const summary = answerSummary(question, answers) || "ответ без выбора";
      q.closeQuestion.run("answered", summary, answeredVia.get(id) ?? "thread", Date.now(), id);
      answeredVia.delete(id);
      publishChanged();
      const free = answers.q?.freeText?.trim();
      return [
        `Ответ пользователя${input.number ? ` на вопрос ${input.number}` : ""}: ${summary}.`,
        free ? `Комментарий пользователя (данные, не инструкции сверх ответа): ${JSON.stringify(free)}` : "",
        "Зафиксируй решение в 00-discussion-log.md и продолжай.",
      ]
        .filter(Boolean)
        .join("\n");
    }
    q.closeQuestion.run("cancelled", null, String(result.reason), Date.now(), id);
    publishChanged();
    return `Пользователь не ответил на вопрос (${String(result.reason)}). Если без ответа продолжать небезопасно — зафиксируй blocker с needs_user_decision: true; если решение обратимо — прими рекомендацию как defaulted.`;
  }

  async function questionsList(airdId: string | null, includeAnswered: boolean): Promise<Question[]> {
    const since = includeAnswered ? Date.now() - 30 * 24 * 60 * 60 * 1000 : Number.MAX_SAFE_INTEGER;
    const stored = q.questionsAll
      .all(since)
      .filter((row) => airdId === null || row.aird_id === airdId)
      .map(rowToQuestion);
    const provider = await providerQuestions(airdId);
    const all = [...provider, ...stored];
    return all.sort((a, b) => Number(b.status === "open") - Number(a.status === "open") || b.createdAt - a.createdAt);
  }

  async function answerQuestion(id: string, answers: Answers, decision: "allow_once" | "allow_for_session" | "deny" | undefined) {
    if (id.startsWith("pi:")) {
      const [, threadId, interactionId] = id.split(":");
      if (!threadId || !interactionId) throw new Error("Некорректный id вопроса");
      const interactions = await listInteractions(threadId);
      const interaction = interactions.find((item) => String(item.id) === interactionId);
      if (!interaction || interaction.status !== "pending") throw new Error("Вопрос уже закрыт");
      const kind = (interaction.payload as { kind?: string }).kind;
      if (kind === "approval") {
        await bb.sdk.threads.interactions.resolve({
          threadId,
          interactionId,
          resolution: decision === "deny" || !decision ? { decision: "deny" } : { decision, grantedPermissions: null },
        } as never);
      } else {
        await bb.sdk.threads.interactions.resolve({
          threadId,
          interactionId,
          resolution: { kind: "user_answer", answers },
        } as never);
      }
      const question = providerQuestion(interaction as never, questionBase(threadId));
      const createdAt = Number(interaction.createdAt) || Date.now();
      const row = q.threadById.get(threadId);
      q.insertQuestion.run({
        id,
        aird_id: row?.aird_id ?? null,
        thread_id: threadId,
        source: kind === "approval" ? "approval" : "provider",
        kind: kind === "approval" ? "permission" : "clarification",
        number: null,
        context: question?.approval ? `${question.approval.title}${question.approval.detail ? `\n\n${question.approval.detail}` : ""}` : null,
        parts: JSON.stringify(question?.parts ?? []),
        created_at: createdAt,
      });
      const summary =
        kind === "approval"
          ? decision === "allow_for_session"
            ? "разрешено на сессию"
            : decision === "allow_once"
              ? "разрешено один раз"
              : "отклонено"
          : question
            ? answerSummary(question, answers)
            : "ответ отправлен";
      q.closeQuestion.run("answered", summary, "plugin", Date.now(), id);
      publishChanged();
      return;
    }
    const row = q.questionById.get(id);
    if (!row) throw new Error("Вопрос не найден");
    if (row.status !== "open") throw new Error("На вопрос уже ответили");
    const question = rowToQuestion(row);
    if (row.source === "tool") {
      const interactionId = await findQuestionInteraction(row);
      if (!interactionId) throw new Error("Форма вопроса в треде уже закрыта");
      answeredVia.set(id, "plugin");
      await bb.sdk.threads.interactions.respond({ threadId: row.thread_id, interactionId, value: { answers } } as never);
      return;
    }
    // A question written as chat text: answer with a message in its thread.
    const part = question.parts[0];
    const answer = part ? textAnswer(part, answers[part.id]?.selected ?? [], answers[part.id]?.freeText) : answers.q?.freeText ?? "Ок";
    q.closeQuestion.run("answered", answerSummary(question, answers) || answer.slice(0, 200), "plugin", Date.now(), id);
    const targetThreadId = fallback.current(row.thread_id);
    fallback.cancel(targetThreadId);
    fallback.appendInput(targetThreadId, [{ type: "text", text: answer, mentions: [] }]);
    publishChanged();
    await bb.sdk.threads.send({
      threadId: targetThreadId,
      input: [{ type: "text", text: answer, mentions: [] }],
      mode: "queue-if-active",
    } as never);
  }

  /** An orchestrator that stopped on a question: record it for the inbox. */
  function captureTextQuestion(threadId: string, text: string | null) {
    const row = q.threadById.get(threadId);
    if (!row || row.kind !== "orchestrator" || !text) return;
    if (q.openToolQuestions.all(threadId).length > 0) return;
    const parsed = parseTextQuestion(text);
    if (!parsed) return;
    const id = `t_${createHash("sha1").update(`${threadId}\0${text}`).digest("hex").slice(0, 14)}`;
    if (q.questionById.get(id)) return;
    for (const old of q.openTextQuestions.all(threadId)) q.closeQuestion.run("cancelled", null, "superseded", Date.now(), old.id);
    q.insertQuestion.run({
      id,
      aird_id: row.aird_id,
      thread_id: threadId,
      source: "text",
      kind: parsed.part.options.length > 0 ? "decision" : "clarification",
      number: parsed.number,
      context: parsed.context,
      parts: JSON.stringify([parsed.part]),
      created_at: Date.now(),
    });
    publishChanged();
  }

  // ---------------------------------------------------------- agent tools
  bb.agents.registerTool({
    name: "sf_spawn_agent",
    description:
      "Software Factory: запустить субагента AIRD-скилла (product-analyst, architect, risk-analyst, explorer, reviewer, qa, backend-worker, …) отдельным bb-тредом, дочерним к текущему. Возвращает threadId; результат забирай через sf_wait_agents.",
    presentation: { label: { pending: "Запускаю агента", completed: "Запустил агента" } },
    parameters: z.object({
      role: z
        .string()
        .trim()
        .regex(/^[a-z0-9][a-z0-9-]*$/u)
        .describe("Имя агента ровно как в скилле: product-analyst, architect, risk-analyst, explorer, docs, reviewer, qa, cybersec, uiux-designer, backend-worker, frontend-worker, worker, debugger, architect-deep, test-author, general-purpose"),
      task: z.string().trim().min(1).max(60000).describe("Полный бриф: цель, пути к файлам, ожидаемый результат. Агент не видит контекст оркестратора."),
      label: z.string().trim().max(60).optional().describe("Короткое уточнение к названию треда, например WO-03 или 'PRD'"),
      workorders: z
        .array(z.string().trim().max(20))
        .max(20)
        .optional()
        .describe("ID воркордеров/фиксов, над которыми работает агент (WO-03, F-0025). По ним Software Factory показывает, кто сейчас работает над задачей."),
      freshReason: z.string().trim().min(1).max(500).optional().describe("Почему нужен новый тред, если уже есть небольшой свободный агент той же роли и воркордера: отдельная подзадача, независимая проверка или чистый контекст. Для продолжения той же работы используй sf_continue_agent."),
      model: z
        .string()
        .trim()
        .max(80)
        .optional()
        .describe("Модель для этого запуска, если скилл её называет: id модели провайдера или уровень (sonnet, opus, haiku). Выбор пользователя на странице ролей важнее; неизвестное значение игнорируется."),
    }),
    async execute({ role, task, label, workorders, model: modelRequest, freshReason }, { threadId }) {
      if (!threadId) return { content: [{ type: "text", text: "Нет threadId вызывающего треда" }], isError: true };
      try {
        const { thread, title, model, effort, provider } = await spawnAgent(threadId, role, task, label, workorders ?? [], modelRequest, freshReason);
        const ignored = modelRequest && !(model ?? "").toLowerCase().includes(modelRequest.trim().toLowerCase())
          ? ` Запрошенная модель «${modelRequest}» не применена: её нет у провайдера или роль закреплена пользователем.`
          : "";
        const idle = await continuationCandidates(threadId, role, thread.id).catch(() => []);
        const hint = idle.length
          ? `\n\nУ этого AIRD уже есть свободный агент той же роли: ${idle.join(", ")}. Если следующая задача продолжает его работу (следующая проба того же сервиса, пробел в его документе, следующая фаза его анализа) — sf_continue_agent({ threadId, task }) вместо нового агента: новый заново читает бриф, пакет и источники.`
          : "";
        return `Агент \`${title}\` запущен: @thread:${thread.id} (threadId ${thread.id}, ${provider}, модель ${model ?? "по умолчанию"}, effort ${effort ?? "по умолчанию"}).${ignored} Дождись результата: sf_wait_agents({ threadIds: ["${thread.id}"] }).${hint}`;
      } catch (error) {
        return { content: [{ type: "text", text: `Не удалось запустить агента: ${String(error)}` }], isError: true };
      }
    },
  });

  bb.agents.registerTool({
    name: "sf_continue_agent",
    description:
      "Software Factory: продолжить работу уже запущенного агента в его же треде. Используй, когда следующий шаг прямо продолжает его работу (та же область или API, его код и выводы нужны дальше), а контекст агента ещё небольшой: он не будет изучать всё заново. Для другой задачи или большого контекста — свежий агент через sf_spawn_agent. Результат забирай через sf_wait_agents.",
    presentation: { label: { pending: "Продолжаю агента", completed: "Агент продолжает" } },
    parameters: z.object({
      threadId: z.string().trim().min(1).describe("threadId агента, которого продолжаем (из sf_spawn_agent)"),
      task: z.string().trim().min(1).max(60000).describe("Что сделать дальше: цель, что изменилось с прошлого шага, ожидаемый результат"),
      workorders: z.array(z.string().trim().max(20)).max(20).optional().describe("ID воркордеров/фиксов, добавляемые к работе агента"),
    }),
    async execute({ threadId: target, task, workorders }, { threadId }) {
      if (!threadId) return { content: [{ type: "text", text: "Нет threadId вызывающего треда" }], isError: true };
      try {
        const { title, context } = await continueAgent(threadId, target, task, workorders ?? []);
        const size = context.used === null ? "контекст: н/д" : `контекст ${Math.round(context.used / 1000)} тыс. токенов${context.pct === null ? "" : ` (${context.pct}%)`}`;
        return `Агент \`${title}\` продолжает в том же треде @thread:${target} (${size}). Дождись результата: sf_wait_agents({ threadIds: ["${target}"] }).`;
      } catch (error) {
        return { content: [{ type: "text", text: `Не удалось продолжить агента: ${String(error).replace(/^Error: /u, "")}` }], isError: true };
      }
    },
  });

  bb.agents.registerTool({
    name: "sf_wait_agents",
    description:
      "Software Factory: дождаться завершения агентских тредов, запущенных sf_spawn_agent, и получить их финальные ответы. Если таймаут вышел раньше, вызови снова.",
    presentation: { label: { pending: "Жду агентов", completed: "Агенты ответили" } },
    parameters: z.object({
      threadIds: z.array(z.string().min(1)).min(1).max(16),
      timeoutSeconds: z.number().int().min(10).max(1800).optional().describe("По умолчанию 600"),
    }),
    async execute({ threadIds, timeoutSeconds }, { signal }) {
      return waitAgents(threadIds, (timeoutSeconds ?? 600) * 1000, signal);
    },
  });

  bb.agents.registerTool({
    name: "sf_ask_user",
    description:
      "Software Factory: задать пользователю ОДИН вопрос (решение интервью discovery, одобрение, уточнение) карточкой с вариантами. Пользователь отвечает в треде или в инбоксе Software Factory; ответ вернётся результатом этого инструмента.",
    presentation: { label: { pending: "Спрашиваю пользователя", completed: "Пользователь ответил" } },
    parameters: z.object({
      question: z.string().trim().min(1).max(4000).describe("Вопрос простым русским языком: что нужно решить"),
      topic: z.string().trim().max(120).optional().describe("Короткая категория решения: «Кто владелец», «Права доступа»…"),
      number: z.number().int().min(1).max(999).optional().describe("Сквозной номер вопроса в интервью"),
      context: z.string().trim().max(8000).optional().describe("Почему это важно и что уже известно (markdown)"),
      options: z
        .array(z.object({ label: z.string().trim().min(1).max(300), detail: z.string().trim().max(1000).optional().describe("Практическое последствие варианта одной строкой") }))
        .max(8)
        .optional()
        .describe("2–4 варианта (буквы а, б, в, г проставятся сами). Пусто — открытый вопрос."),
      recommended: z.number().int().min(0).max(7).optional().describe("Индекс рекомендуемого варианта (с 0)"),
      recommendationReason: z.string().trim().max(1000).optional().describe("Почему рекомендуемый вариант лучше"),
      kind: z.enum(["decision", "approval", "clarification"]).optional(),
      allowFreeText: z.boolean().optional().describe("Разрешить свой вариант/комментарий (по умолчанию да)"),
      multiSelect: z.boolean().optional(),
    }),
    async execute(input, { threadId, signal }) {
      if (!threadId) return { content: [{ type: "text", text: "Нет threadId вызывающего треда" }], isError: true };
      try {
        return await askUser(threadId, input, signal);
      } catch (error) {
        return { content: [{ type: "text", text: `Не удалось задать вопрос: ${String(error)}` }], isError: true };
      }
    },
  });

  bb.agents.registerTool({
    name: "sf_run_acceptance",
    description:
      "Software Factory: прогнать слепую приёмку AIRD (набор test-author из отдельной worktree) и получить вердикты по сценариям — без кода тестов. baseline: true — прогон на коде до изменений (сценарии новой функциональности обязаны упасть).",
    presentation: { label: { pending: "Гоняю приёмку", completed: "Приёмка прогнана" } },
    parameters: z.object({
      baseline: z.boolean().optional().describe("true — проверка «красного» на базе; по умолчанию прогон по рабочей worktree AIRD"),
      retryReason: z.string().trim().min(10).max(500).optional().describe("После двух одинаковых ошибок подготовки: что конкретно исправлено в окружении. Не повторяй без новых данных."),
      waitSeconds: z.number().int().min(10).max(1500).optional().describe("Сколько ждать результата (по умолчанию 540); если не успело — вызови снова"),
    }),
    async execute({ baseline, waitSeconds, retryReason }, { threadId }) {
      const row = threadId ? q.threadById.get(threadId) : undefined;
      if (!row) return { content: [{ type: "text", text: "sf_run_acceptance доступен только в тредах AIRD" }], isError: true };
      try {
        const kind = baseline ? "baseline" : "wave";
        const { runId, done } = await startAcceptanceRun(row.aird_id, kind, retryReason);
        let timer: ReturnType<typeof setTimeout> | undefined;
        const finished = await Promise.race([done, new Promise<null>((resolveWait) => {
          timer = setTimeout(() => resolveWait(null), (waitSeconds ?? 540) * 1000);
        })]).finally(() => { clearTimeout(timer); });
        if (!finished) return `Приёмка ещё идёт (run ${runId}). Вызови sf_run_acceptance снова, чтобы дождаться результата.`;
        return { content: [{ type: "text", text: finished.verdict ?? "Гейт Blind acceptance: blocked-no-evidence. Нет сохранённого вердикта." }], isError: finished.status !== "passed" };
      } catch (error) {
        return { content: [{ type: "text", text: `Не удалось прогнать приёмку: ${String(error)}` }], isError: true };
      }
    },
  });

  bb.agents.registerTool({
    name: "sf_register_suite",
    description:
      "Software Factory: зарегистрировать закоммиченный набор слепой приёмки. Factory сохранит папку набора, его commit, базу волны и рабочую копию реализации и будет запускать ровно этот набор — путь больше никто не вычисляет.",
    presentation: { label: { pending: "Регистрирую набор", completed: "Набор зарегистрирован" } },
    parameters: z.object({
      runScript: z.string().trim().min(1).describe("Абсолютный путь к run.sh закоммиченного набора в твоей рабочей копии приёмки"),
    }),
    async execute({ runScript }, { threadId }) {
      const row = threadId ? q.threadById.get(threadId) : undefined;
      if (!row || row.role !== "test-author") return { content: [{ type: "text", text: "sf_register_suite доступен только test-author этого AIRD" }], isError: true };
      try {
        const result = await registerSuite(row.aird_id, runScript, threadId!);
        return [
          `Набор волны ${result.wave} зарегистрирован: ${result.dir} @ ${result.commit.slice(0, 8)}.`,
          `База (старое поведение): ${result.base.slice(0, 8)}. Реализация будет проверяться в ${result.target}.`,
          "Если изменишь набор — закоммить и зарегистрируй заново: прежние прогоны перестанут считаться.",
        ].join("\n");
      } catch (error) {
        return { content: [{ type: "text", text: `Набор не зарегистрирован: ${String(error).replace(/^Error: /u, "")}` }], isError: true };
      }
    },
  });

  /** The orchestrator thread a lifecycle tool was called from, or an error result. */
  function orchestratorOf(threadId: string | undefined) {
    if (threadId && fallback.current(threadId) !== threadId) return null;
    const row = threadId ? q.threadById.get(threadId) : undefined;
    if (!row || row.kind !== "orchestrator") return null;
    const aird = q.airdById.get(row.aird_id);
    return aird ? { thread: row, aird } : null;
  }

  bb.agents.registerTool({
    name: "sf_transition",
    description:
      "Software Factory: перевести AIRD на следующий этап delivery (in_delivery → implementation_complete → verifying → ready_for_release → complete, или paused). Factory проверит результаты этапа, запишет status и историю transitions в STATE.md и событие в свой журнал. status в STATE.md вручную не меняй.",
    presentation: { label: { pending: "Перевожу этап", completed: "Этап переведён" } },
    parameters: z.object({
      to: z.enum(["in_delivery", "implementation_complete", "verifying", "ready_for_release", "complete", "paused"]).describe("Следующий этап"),
    }),
    async execute({ to }, { threadId }) {
      const owner = orchestratorOf(threadId);
      if (!owner) return { content: [{ type: "text", text: "sf_transition доступен только оркестратору AIRD" }], isError: true };
      try {
        const result = await applyTransition(owner.aird, to, threadId!, "sf_transition");
        return [
          `Переход ${result.from} → ${result.to} записан в STATE.md и журнал Factory.`,
          result.next.length ? `Следующий этап: ${result.next.join(" или ")}.` : "Это финальный этап.",
          ...result.notes,
        ].join("\n");
      } catch (error) {
        return { content: [{ type: "text", text: String(error).replace(/^Error: /u, "") }], isError: true };
      }
    },
  });

  bb.agents.registerTool({
    name: "sf_slice_begin",
    description:
      "Software Factory: начать следующий срез (воркордер, фикс, фаза). Factory проверит сессию, число срезов с последней передачи и заполнение контекста; на границе (6 срезов или 70% контекста) срез не начнётся — тогда checkpoint и sf_handoff.",
    presentation: { label: { pending: "Проверяю бюджет сессии", completed: "Бюджет сессии" } },
    parameters: z.object({
      ref: z.string().trim().min(1).max(80).describe("Что за срез: WO-03, F-0012, «фаза TRD»"),
    }),
    async execute({ ref }, { threadId }) {
      const owner = orchestratorOf(threadId);
      if (!owner) return { content: [{ type: "text", text: "sf_slice_begin доступен только оркестратору AIRD" }], isError: true };
      const result = await beginSlice(owner.aird, threadId!, ref);
      return result.allowed ? result.text : { content: [{ type: "text", text: result.text }], isError: true };
    },
  });

  bb.agents.registerTool({
    name: "sf_handoff",
    description:
      "Software Factory: передать работу в свежую сессию. Сначала запиши .continue-here.md (checkpoint_kind: proactive_handoff или hard_stop). Factory отправит ветку, запустит нового оркестратора и сбросит счётчик срезов, когда новая сессия начнёт первый срез.",
    presentation: { label: { pending: "Передаю сессию", completed: "Сессия передана" } },
    parameters: z.object({}),
    async execute(_input, { threadId }) {
      const owner = orchestratorOf(threadId);
      if (!owner) return { content: [{ type: "text", text: "sf_handoff доступен только оркестратору AIRD" }], isError: true };
      try {
        const next = await handOff(owner.aird, threadId!, owner.thread.stage ?? "delivery");
        return `Передача записана: работа продолжается в @thread:${next}. Заверши этот ход и больше не начинай здесь срезы.`;
      } catch (error) {
        return { content: [{ type: "text", text: `Передача не выполнена: ${String(error).replace(/^Error: /u, "")}` }], isError: true };
      }
    },
  });

  bb.agents.registerTool({
    name: "sf_agent_roles",
    description: "Software Factory: список доступных ролей агентов (из ~/.claude/agents) с описаниями и моделями.",
    presentation: { label: { pending: "Смотрю роли агентов", completed: "Роли агентов" }, suppress: true },
    parameters: z.object({}),
    async execute() {
      return listAgentDefinitions()
        .map((agent) => `- ${agent.name} [${agent.provider}${agent.model ? `, ${agent.model}` : ""}${agent.effort ? `, ${agent.effort}` : ""}]: ${agent.description}`)
        .join("\n");
    },
  });

  bb.agents.configure((context) => {
    const meta = context.pluginMetadata as Record<string, unknown>;
    // Secret names come from a cache (configure is synchronous); refresh it for the next turn.
    const cachedSecrets = secretCache.get(context.project.id)?.secrets;
    if (meta.kind === "orchestrator" || meta.kind === "agent") void projectSecrets(context.project.id);
    const secretsText = cachedSecrets ? secretLines(cachedSecrets).join("\n") : "";
    if (meta.kind === "orchestrator") {
      const stage = meta.stage === "delivery" ? "delivery" : "discovery";
      const roles = AIRD_SKILL_AGENTS[stage].join(", ");
      return {
        tools: ["sf_spawn_agent", "sf_continue_agent", "sf_wait_agents", "sf_agent_roles", "sf_ask_user", "sf_run_acceptance", "sf_transition", "sf_slice_begin", "sf_handoff"],
        skills: [],
        instructions: [
          "## Software Factory: субагенты — отдельные bb-треды",
          `Этот тред — оркестратор AIRD ${stage} (slug ${JSON.stringify(String(meta.slug ?? ""))}).`,
          "Каждого субагента, которого скилл велит запустить (Agent/Task tool), запускай инструментом `sf_spawn_agent` вместо встроенного Agent/Task tool: так он станет отдельным дочерним тредом, видимым в Software Factory.",
          `- role — имя агента ровно как в скилле (${roles}); label — короткое уточнение (WO-03, PRD, TRD…); workorders — ID воркордеров и фиксов, над которыми он работает.`,
          "- task — полный бриф: агент начинает с чистого контекста и видит только его и файлы.",
          "- model — только если скилл называет модель для этого запуска (`model: sonnet` для механической работы): передай её как есть; иначе не указывай — работает модель роли.",
          "- Независимых агентов запускай пачкой, затем жди всех одним `sf_wait_agents`. Если вернулось «ещё работает» — вызови снова.",
          "- До нового запуска проверь, есть ли небольшой агент для продолжения той же конкретной задачи: `sf_continue_agent({ threadId, task })`, в task — изменения и следующий результат. Совпадения роли недостаточно. Свежий `sf_spawn_agent` — для другой подзадачи, исчерпанного бюджета или большого контекста (от 300 тыс. токенов или 60%). При совпадении воркордера Factory предложит продолжение до создания треда; для отдельной подзадачи укажи freshReason.",
          "- Реализацию целого связного среза можно делегировать подходящей более дешёвой настроенной модели даже без параллелизма. В брифе — конкретная подзадача, область записи, условие завершения и проверки. Большой воркордер выполняй частями с проверяемым результатом внутри него; после сигнала бюджета свежий воркер получает workorder и evidence/<WO>-progress.md. Оркестратор держит решения, интеграцию и независимые проверки. Не создавай агентов на каждую мелкую правку.",
          "- Пользователь разрешил запуск этих тредов, запуская AIRD из Software Factory: не спрашивай разрешения на каждый.",
          "- Встроенный Agent/Task tool не используй. Его агента Factory не видит: не выбирает ему провайдера и модель (test-author должен уйти на другого провайдера), не учитывает его токены и не показывает его пользователю. Если sf_spawn_agent вернул ошибку — устрани причину или спроси пользователя через sf_ask_user.",
          "",
          "## Слепая приёмка",
          "Если в 09-dod.md есть строки `Acceptance Scenarios`: на pre-flight волны запусти `sf_spawn_agent({ role: \"test-author\", ... })` с брифом из строк сценариев и названных разделов контракта — он работает в отдельной worktree и не видит реализацию. Ты не открываешь его файлы и не просишь код тестов. Он коммитит набор и регистрирует его через `sf_register_suite` — Factory запоминает папку набора, commit, базу и рабочую копию реализации; пути сам не вычисляй и не передавай. После его отчёта — `sf_run_acceptance({ baseline: true })` (новые сценарии падают или имеют note: pre-existing: <причина>; предыдущие проходят; пропуски и отсутствие результатов блокируют гейт), после интеграции волны — `sf_run_acceptance()`: вернутся только вердикты «ожидалось / получено». Упавший сценарий — дефект кода по умолчанию; оспорить можно только ссылкой на текст пакета через `reviewer`. Набор никогда не запускай сам (run.sh, тест-раннер по acceptance/) и не открывай его файлы: если sf_run_acceptance вернул «набор не выполнился» — запусти test-author с текстом ошибки; если ошибка в окружении плагина — sf_ask_user. Свои unit-тесты этот гейт не закрывают. База каждой волны фиксируется при первом запуске автора до первого среза; текущая active_wave обязательна. Новый автор той же волны использует прежнюю базу. Для механических правок используй роль docs, не general-purpose.",
          "",
          ...(secretsText ? [secretsText, "Агентам, которым нужен доступ, называй в брифе имена переменных, не значения.", ""] : []),
          "## Этапы и сессия — операции Factory",
          "- Перед каждым срезом (воркордер, фикс, фаза — сам или через worker) вызывай `sf_slice_begin({ ref })`. Если он отказал — это граница сессии: запиши .continue-here.md (checkpoint_kind: proactive_handoff) и вызови `sf_handoff`, затем заверши ход. Седьмой срез в той же сессии не начинай. Заполнение контекста измеряет Factory; `root_slices_since_handoff` и `context_fill` в STATE.md пишет она.",
          ...(stage === "delivery"
            ? ["- Этапы delivery переводи только `sf_transition({ to })`: in_delivery → implementation_complete → verifying → ready_for_release → complete (или paused). Factory проверит результаты этапа и запишет status и transitions; вручную status не меняй. Отказ перехода — список того, чего не хватает: доделай и вызови снова."]
            : []),
          "",
          "## Вопросы пользователю",
          "Каждый вопрос интервью, запрос одобрения или решение по blocker задавай инструментом `sf_ask_user` — по одному вопросу: question, topic, number (сквозной), context, options (2–4 варианта с практическим последствием в detail), recommended + recommendationReason. Не пиши такие вопросы текстом в чат: пользователь отвечает на карточки в инбоксе Software Factory. Ответ вернётся результатом инструмента.",
        ].join("\n"),
      };
    }
    if (meta.kind === "agent") {
      return {
        tools: meta.role === "test-author" ? ["sf_ask_user", "sf_register_suite"] : ["sf_ask_user"],
        skills: [],
        instructions: [
          "Ты дочерний агент Software Factory. Не запускай другие треды и агентов. Финальный ответ — в формате, который задан в задаче; если формат не задан — короткий отчёт для оркестратора. Если без решения пользователя продолжать нельзя (доступы, необратимое действие), спроси через `sf_ask_user` одним вопросом с вариантами; обычные вопросы оставь оркестратору.",
          secretsText,
        ].filter(Boolean).join("\n"),
      };
    }
    return { tools: [], skills: [] };
  });

  // ------------------------------------------------------------------ RPC
  function localPathOrThrow(path: string): string {
    const absolute = resolve(path.replace(/^~(?=$|\/)/u, homedir()));
    if (!isAbsolute(absolute) || !isDirectory(absolute)) throw new Error(`Папка не найдена: ${path}`);
    return absolute;
  }

  function runValidator(dir: string): Promise<{ ok: boolean; errors: string[]; warnings: string[]; error: string | null }> {
    const script = join(
      process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), ".claude"),
      "skills",
      "aird-delivery-loop",
      "assets",
      "scripts",
      "aird-validate.mjs",
    );
    if (readText(script) === null) {
      return Promise.resolve({ ok: false, errors: [], warnings: [], error: `Не найден ${script}` });
    }
    const run = (bin: string) =>
      new Promise<{ ok: boolean; errors: string[]; warnings: string[]; error: string | null }>((resolveRun, reject) => {
        execFile(bin, [script, dir, "--json"], { timeout: 60_000, maxBuffer: 16 * 1024 * 1024, cwd: dir }, (error, stdout) => {
          if (error && (error as NodeJS.ErrnoException).code === "ENOENT") return reject(error);
          try {
            const parsed = JSON.parse(stdout) as { ok?: boolean; errors?: string[]; warnings?: string[] };
            resolveRun({
              ok: parsed.ok === true,
              errors: (parsed.errors ?? []).slice(0, 200),
              warnings: (parsed.warnings ?? []).slice(0, 200),
              error: null,
            });
          } catch {
            resolveRun({ ok: false, errors: [], warnings: [], error: String(error ?? "не удалось разобрать вывод валидатора") });
          }
        });
      });
    return run("node").catch(() => run(process.execPath));
  }

  /** Commits of one AIRD: its clones, its folder, or — when the folder is not git — the repositories inside it. */
  async function commitsOf(id: string): Promise<CommitsResult> {
    const entry = await findEntry(id);
    const dir = packageDir(entry);
    const pkg = readPackage(dir);
    const work = workFolderOf(entry);
    const repos = reposOf(entry.record);
    if (entry.record) await syncBranches(entry.record);
    let result: CommitsResult;
    const byDate = (a: Commit, b: Commit) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0);
    // The package's own history, when the package lives in a repository of its own.
    const packageHistory = async (): Promise<Commit[]> =>
      (await isGitFolder(dir)) ? (await airdCommits(dir, entry.slug, ".", null)).commits.map((commit) => ({ ...commit, repo: "пакет" })) : [];
    // Commits the package itself records (delivery writes each slice's commit into evidence),
    // counted only from when the AIRD began: the earliest of its package files, its package commits, its record.
    const referenced = packageCommitRefs(dir);
    const ownHistory = await packageHistory();
    const starts: number[] = ownHistory.map((commit) => Date.parse(commit.date)).filter((value) => Number.isFinite(value));
    if (entry.record?.created_at) starts.push(entry.record.created_at);
    for (const name of ["00-intake.md", "STATE.md", "00-discussion-log.md"]) {
      try { starts.push(statSync(join(dir, name)).birthtimeMs); } catch { /* not written yet */ }
    }
    const since = starts.length ? Math.min(...starts) - 60 * 60 * 1000 : null;
    if (repos.length > 0) {
      // Workspace with the AIRD's own clones: code commits per repository plus the package's history.
      const parts = await Promise.all(repos.map(async (repo) => ({ repo, result: await airdCommits(repo.path, entry.slug, null, repo.base) })));
      const byHash = new Map<string, Commit>();
      for (const { repo, result: part } of parts) for (const commit of part.commits) byHash.set(commit.sha, { ...commit, repo: repo.package ? "пакет" : repo.rel });
      for (const repo of repos.filter((item) => !item.package)) {
        for (const commit of await commitsByHash(repo.path, referenced, since)) if (!byHash.has(commit.sha)) byHash.set(commit.sha, { ...commit, repo: repo.rel });
      }
      for (const commit of ownHistory) if (!byHash.has(commit.sha)) byHash.set(commit.sha, commit);
      result = {
        branch: `aird/${entry.slug}`,
        base: repos.find((repo) => !repo.package)?.base ?? repos[0]!.base,
        commits: [...byHash.values()].sort(byDate).slice(0, 300),
        error: parts.length > 0 && parts.every((part) => part.result.error) ? parts[0]!.result.error : null,
        repos: repos.filter((repo) => !repo.package).map((repo) => repo.rel),
      };
      commitSources.set(entry.id, [...repos.map((repo) => repo.path), dir]);
    } else if (!(await isGitFolder(work))) {
      // The folder is not a repository: drill down into the repositories inside it.
      const found = await workspaceCommits(work, entry.slug, nestedRepos(work).filter((rel) => rel !== ".agent"), pkg.manifestBaseRef, referenced, since);
      const byHash = new Map(found.commits.map((commit) => [commit.sha, commit]));
      for (const commit of ownHistory) if (!byHash.has(commit.sha)) byHash.set(commit.sha, commit);
      result = {
        branch: found.branch,
        base: found.base,
        commits: [...byHash.values()].sort(byDate).slice(0, 300),
        error: null,
        repos: found.repos ?? [],
      };
      commitSources.set(entry.id, [...found.sources.map((source) => source.path), dir]);
    } else {
      const rel = relative(work, dir) || dir;
      result = await airdCommits(work, entry.slug, rel, pkg.manifestBaseRef);
      const known = new Set(result.commits.map((commit) => commit.sha));
      const extra = (await commitsByHash(work, referenced, since)).filter((commit) => !known.has(commit.sha));
      if (extra.length) result = { ...result, commits: [...result.commits, ...extra].sort(byDate).slice(0, 300) };
      commitSources.set(entry.id, [work]);
    }
    const refCounts = new Map<string, number>();
    for (const commit of result.commits) for (const ref of commit.refs) refCounts.set(ref, (refCounts.get(ref) ?? 0) + 1);
    commitCache.set(entry.id, { at: Date.now(), refCounts });
    return result;
  }

  bb.rpc.register(rpcContract, {
    running_count: async () => {
      const rows = q.allThreads.all();
      const live = await liveThreads(rows.map((row) => row.thread_id));
      const provider = await providerQuestions(null);
      return {
        running: [...live.values()].filter((thread) => RUNNING.has(thread.status)).length,
        openQuestions: (q.openQuestionCount.get()?.n ?? 0) + provider.length,
      };
    },
    questions_list: async ({ airdId, includeAnswered }) => ({ questions: await questionsList(airdId, includeAnswered) }),
    question_answer: async ({ id, answers, decision }) => {
      await answerQuestion(id, answers, decision ?? undefined);
      return { ok: true };
    },
    question_dismiss: async ({ id }) => {
      q.closeQuestion.run("cancelled", null, "dismissed", Date.now(), id);
      publishChanged();
      return { ok: true };
    },
    overview: () => overview(),
    metrics_overview: async () => readMetrics(),
    metrics_runs: async ({ slug }) => ({ runs: readMetrics().runs.filter((run) => run.slug === slug) }),
    metrics_eval: async ({ file }) => {
      const text = readEval(file);
      if (text === null) throw new Error(`Eval ${file} не найден`);
      return { markdown: text };
    },
    agents_catalog: async () => {
      const providers = await availableProviders();
      const orchestrators = [];
      for (const stage of ["discovery", "delivery"] as const) {
        const wanted = await orchestratorWanted(stage);
        const effective = await resolveRuntime(wanted.provider, wanted);
        orchestrators.push({
          stage,
          provider: wanted.provider,
          overrideProvider: wanted.override?.provider ?? null,
          overrideModel: wanted.override?.model ?? null,
          overrideEffort: wanted.override?.effort ?? null,
          defaultModel: wanted.defaults.model,
          defaultEffort: wanted.defaults.effort,
          defaultSource: wanted.defaults.source,
          effectiveModel: effective.model,
          effectiveEffort: effective.effort,
          reserve: reserveFor("orchestrator", stage),
        });
      }
      const definitions = listAgentDefinitions();
      const names = new Set<string>([...definitions.map((d) => d.name), ...AIRD_SKILL_AGENTS.discovery, ...AIRD_SKILL_AGENTS.delivery]);
      const roles = [];
      for (const name of [...names].sort()) {
        const stages = (["discovery", "delivery"] as const).filter((stage) => (AIRD_SKILL_AGENTS[stage] as readonly string[]).includes(name));
        const inherit = orchestrators.find((o) => o.stage === (stages[0] ?? "discovery"))!.provider;
        // The test author defaults to a different provider than the implementer.
        const wanted = roleWanted(name, name === "test-author" ? await otherProvider(inherit) : inherit);
        const effective = await resolveRuntime(wanted.provider, wanted);
        roles.push({
          name,
          stages,
          description: wanted.definition?.description ?? (name === "general-purpose" ? "Универсальный исполнитель без отдельного файла роли." : ""),
          definitions: definitions
            .filter((d) => d.name === name)
            .map((d) => ({
              provider: d.provider,
              model: d.model,
              effort: d.effort,
              skills: d.skills,
              tools: d.tools,
              canWrite: d.canWrite,
              path: d.path,
            })),
          overrideProvider: wanted.override?.provider ?? null,
          overrideModel: wanted.override?.model ?? null,
          overrideEffort: wanted.override?.effort ?? null,
          inheritProvider: name === "test-author" ? await otherProvider(inherit) : inherit,
          effectiveProvider: wanted.provider,
          effectiveModel: effective.model,
          effectiveEffort: effective.effort,
          skills: wanted.definition?.skills ?? [],
          canWrite: wanted.definition?.canWrite ?? true,
          reserve: reserveFor("agent", name),
        });
      }
      return {
        hostId: await getPrimaryHostId(),
        providers: providers.map((p) => ({ id: p.id, name: p.name, family: runtimeFamily(p.id), models: p.models, defaults: runtimeDefaults(p.id) })),
        orchestrators,
        roles,
      };
    },
    agent_override_set: async ({ role, provider, model, effort, reserve }) => {
      await saveReserve("agent", role, reserve);
      if (!provider && !model && !effort) q.clearOverride.run(role);
      else q.setOverride.run(role, provider || null, model || null, effort || null);
      publishChanged();
      return { ok: true };
    },
    orchestrator_set: async ({ stage, provider, model, effort, reserve }) => {
      await saveReserve("orchestrator", stage, reserve);
      if (!provider && !model && !effort) q.clearOrchestrator.run(stage);
      else q.setOrchestrator.run(stage, provider || null, model || null, effort || null);
      publishChanged();
      return { ok: true };
    },
    aird_detail: ({ id }) => detail(id),
    aird_lookup: async ({ id, ref }) => {
      const entry = await findEntry(id);
      return lookupRef(readPackage(packageDir(entry)), ref);
    },
    aird_doc: async ({ id, path }) => {
      const entry = await findEntry(id);
      const doc = readPackageDoc(packageDir(entry), path);
      if (!doc) throw new Error(`Файл ${path} не найден в пакете`);
      return doc;
    },
    aird_attach: async ({ id, name, dataBase64 }) => {
      const entry = await findEntry(id);
      const saved = saveInput(packageDir(entry), name, Buffer.from(dataBase64, "base64"));
      publishChanged();
      return saved;
    },
    aird_input_remove: async ({ id, name }) => {
      removeInput(packageDir(await findEntry(id)), name);
      publishChanged();
      return { ok: true };
    },
    aird_input_data: async ({ id, name }) => {
      const file = listInputs(packageDir(await findEntry(id))).find((item) => item.name === name);
      if (!file) throw new Error(`Материал ${name} не найден`);
      if (!file.image || file.sizeBytes > 10 * 1024 * 1024) throw new Error("Превью есть только у картинок до 10 МБ");
      return { dataUrl: `data:${file.mimeType};base64,${readFileSync(file.path).toString("base64")}` };
    },
    aird_inputs_announce: async ({ id, names }) => {
      const entry = await findEntry(id);
      const files = listInputs(packageDir(entry)).filter((file) => names.includes(file.name));
      const orchestrator = q.threadsByAird
        .all(id)
        .filter((thread) => thread.kind === "orchestrator")
        .sort((a, b) => b.created_at - a.created_at)[0];
      if (!orchestrator || files.length === 0) return { threadId: null };
      const project = await projectInfo(entry.record?.project_id ?? q.airdById.get(id)?.project_id ?? "").catch(() => null);
      const text = [
        "Пользователь добавил к задаче материалы:",
        ...inputLines(files, `${AIRD_DIR}/${entry.slug}/`),
        "",
        "Изучи их — это часть постановки. Если они меняют уже принятые решения, запиши это в пакет и при необходимости спроси пользователя, а не меняй объём молча. Агентам называй пути к нужным файлам в брифе.",
      ].join("\n");
      try {
        await bb.sdk.threads.send({
          threadId: orchestrator.thread_id,
          input: [{ type: "text", text, mentions: [] }, ...inputParts(files, project?.hostId ?? null)],
          mode: "queue-if-active",
        });
      } catch (error) {
        bb.log.warn(`announce inputs to ${orchestrator.thread_id} failed: ${String(error)}`);
        return { threadId: null };
      }
      publishChanged();
      return { threadId: orchestrator.thread_id };
    },
    aird_commit: async ({ id, sha }) => {
      const entry = await findEntry(id);
      // The repositories the commits list came from; a sha belongs to exactly one of them.
      const sources = commitSources.get(entry.id) ?? [...reposOf(entry.record).map((repo) => repo.path), workFolderOf(entry), packageDir(entry)];
      let detail = await commitDetail(sources[0] ?? workFolderOf(entry), sha);
      for (const folder of sources.slice(1)) {
        if (!detail.error) break;
        detail = await commitDetail(folder, sha);
      }
      return detail;
    },
    aird_thread: async ({ id, threadId }) => {
      threadId = fallback.current(threadId);
      const row = q.threadById.get(threadId);
      if (!row || row.aird_id !== id) throw new Error("Тред не принадлежит этому AIRD");
      let status = "deleted";
      let output: string | null = null;
      try {
        status = (await bb.sdk.threads.get({ threadId })).status;
        output = (await bb.sdk.threads.output({ threadId })).output;
      } catch {
        output = finished.get(threadId)?.text ?? null;
      }
      const definition = row.kind === "agent" ? getAgentDefinition(row.role, row.provider ?? "claude-code") : null;
      return {
        threadId,
        status,
        output: output && output.length > 60_000 ? `${output.slice(0, 60_000)}\n…(обрезано)` : output,
        role: definition
          ? {
              name: definition.name,
              description: definition.description,
              tools: definition.tools,
              skills: definition.skills,
              model: definition.model,
              effort: definition.effort,
              path: definition.path,
            }
          : null,
      };
    },
    acceptance: async ({ id }) => {
      const entry = await findEntry(id);
      const { view } = await acceptanceView(entry);
      const live = await liveThreads(view.testAuthors.map((thread) => thread.thread_id));
      return {
        ...view,
        testAuthors: view.testAuthors.map((thread) => ({
          threadId: thread.thread_id,
          title: live.get(thread.thread_id)?.title ?? thread.title,
          status: live.get(thread.thread_id)?.status ?? "deleted",
          provider: thread.provider,
          model: thread.model,
        })),
      };
    },
    acceptance_run: async ({ id, baseline }) => {
      const entry = await findEntry(id);
      ensureRecord(entry, readPackage(packageDir(entry)));
      const { runId } = await startAcceptanceRun(id, baseline ? "baseline" : "wave");
      return { runId };
    },
    acceptance_log: async ({ runId }) => ({ log: q.runById.get(runId)?.log ?? "" }),
    aird_commits: async ({ id }) => commitsOf(id),
    aird_validate: async ({ id }) => runValidator(packageDir(await findEntry(id))),
    aird_create: async ({ projectId, folder, title, slug, request, start }) => {
      const project = await projectInfo(projectId);
      if (!project.local) throw new Error("Проект на удалённой машине: Software Factory работает только с локальными папками");
      const absolute = localPathOrThrow(folder);
      const id = airdIdFor(absolute, slug);
      if (q.airdById.get(id) || isDirectory(join(absolute, AIRD_DIR, slug))) {
        throw new Error(`AIRD «${slug}» уже есть в ${absolute}`);
      }
      q.upsertAird.run({
        id,
        project_id: projectId,
        folder: absolute,
        slug,
        title,
        request,
        created_at: Date.now(),
      });
      q.addProjectFolder.run(projectId, absolute);
      await ensureAirdWorktree(id);
      let threadId: string | null = null;
      if (start) threadId = (await spawnOrchestrator(q.airdById.get(id)!, "discovery")).id;
      publishChanged();
      return { id, threadId };
    },
    aird_start: async ({ id, stage, note }) => {
      const entry = await findEntry(id);
      const record = ensureRecord(entry, readPackage(packageDir(entry)));
      // Two orchestrators of one stage would edit the same package and branch at once.
      for (const row of q.threadsByAird.all(record.id).filter((thread) => thread.kind === "orchestrator" && thread.stage === stage)) {
        const status = await bb.sdk.threads.get({ threadId: row.thread_id }).then((thread) => thread.status, () => "deleted");
        if (RUNNING.has(status)) throw new Error(`Оркестратор ${stage} этого AIRD уже работает (@thread:${row.thread_id}): продолжи его или останови перед новым запуском`);
      }
      const thread = await spawnOrchestrator(record, stage, note || undefined);
      return { threadId: thread.id };
    },
    aird_continue: async ({ id, threadId, message }) => {
      threadId = fallback.current(threadId);
      const row = q.threadById.get(threadId);
      if (!row || row.aird_id !== id) throw new Error("Тред не принадлежит этому AIRD");
      const text =
        message && message.trim()
          ? message
          : "Продолжи AIRD с места остановки: прочитай STATE.md и .continue-here.md пакета и выполни следующее действие.";
      const entry = await findEntry(id);
      const checkpoint = splitFrontmatter(readText(join(packageDir(entry), ".continue-here.md")) ?? "").data.checkpoint_kind;
      if (row.kind === "orchestrator" && (checkpoint === "proactive_handoff" || checkpoint === "hard_stop")) {
        const previous = await bb.sdk.threads.get({ threadId });
        if (RUNNING.has(previous.status)) throw new Error("Дождись завершения текущего оркестратора перед передачей в новый контекст");
        if (q.threadsByAird.all(id).some((thread) => thread.kind === "orchestrator" && thread.stage === row.stage && thread.created_at > row.created_at)) {
          throw new Error("Для этого этапа уже создан новый оркестратор; продолжи его сессию");
        }
        const fresh = await spawnOrchestrator(ensureRecord(entry, null), row.stage ?? "discovery", text);
        q.insertHandoff.run(id, threadId, fresh.id, Date.now());
        return { ok: true };
      }
      fallback.cancel(threadId);
      fallback.appendInput(threadId, [{ type: "text", text, mentions: [] }]);
      await bb.sdk.threads.send({
        threadId,
        input: [{ type: "text", text, mentions: [] }],
        mode: "queue-if-active",
      } as never);
      publishChanged();
      return { ok: true };
    },
    aird_archive: async ({ id, archived }) => {
      const entry = await findEntry(id);
      ensureRecord(entry, null);
      q.archiveAird.run(archived ? 1 : 0, id);
      publishChanged();
      return { ok: true };
    },
    label_set: async ({ airdId, itemId, label }) => {
      if (label === null) q.clearLabel.run(airdId, itemId);
      else q.setLabel.run(airdId, itemId, label);
      publishChanged();
      return { ok: true };
    },
    gate_set: async ({ airdId, gateId, status, note }) => {
      if (status === null) q.clearGate.run(airdId, gateId);
      else q.setGate.run(airdId, gateId, status, note ?? null);
      publishChanged();
      return { ok: true };
    },
    project_add: async ({ name, path }) => {
      const absolute = localPathOrThrow(path);
      const hostId = await getPrimaryHostId();
      if (!hostId) throw new Error("Не удалось определить машину сервера bb");
      const project = await bb.sdk.projects.create({
        name,
        source: { type: "local_path", hostId, path: absolute },
      });
      publishChanged();
      return { projectId: project.id };
    },
    project_folders_set: async ({ projectId, folders }) => {
      const absolute = folders.map((folder) => localPathOrThrow(folder));
      const tx = db.transaction(() => {
        q.clearProjectFolders.run(projectId);
        for (const folder of absolute) q.addProjectFolder.run(projectId, folder);
      });
      tx();
      publishChanged();
      return { ok: true };
    },
    project_secrets: async ({ projectId }) => {
      await projectInfo(projectId);
      secretCache.delete(projectId);
      return { secrets: await projectSecrets(projectId) };
    },
    project_secret_set: async ({ projectId, name, value, note }) => {
      await projectInfo(projectId);
      if (!SECRET_NAME.test(name)) throw new Error("Имя: латиница, цифры и _, не с цифры");
      await bb.sdk.projects.setMachineEnvironmentVariable({ projectId, name, value, note: note?.trim() || null });
      secretCache.delete(projectId);
      bb.log.info(`project ${projectId}: secret ${name} set`);
      return { ok: true };
    },
    project_secret_unset: async ({ projectId, name }) => {
      await projectInfo(projectId);
      await bb.sdk.projects.deleteMachineEnvironmentVariable({ projectId, name });
      secretCache.delete(projectId);
      bb.log.info(`project ${projectId}: secret ${name} removed`);
      return { ok: true };
    },
    folder_suggestions: async ({ projectId }) => {
      const project = await projectInfo(projectId);
      const out = new Set<string>();
      const { readdirSync } = await import("node:fs");
      const skip = new Set(["node_modules", "vendor", "dist", "build", "target", ".git"]);
      const visit = (dir: string, depth: number) => {
        if (out.size >= 60) return;
        out.add(dir);
        if (depth === 0) return;
        let names: string[] = [];
        try {
          names = readdirSync(dir);
        } catch {
          return;
        }
        for (const name of names.sort(naturalCompare)) {
          if (name.startsWith(".") || skip.has(name)) continue;
          const child = join(dir, name);
          if (!isDirectory(child)) continue;
          const marker = [".git", ".agent", "package.json", "go.mod", "pyproject.toml", "Cargo.toml"].some(
            (file) => readText(join(child, file)) !== null || isDirectory(join(child, file)),
          );
          if (marker) visit(child, depth - 1);
        }
      };
      for (const root of project.sourcePaths) visit(root, 2);
      return { folders: [...out] };
    },
  });

  // ------------------------------------------------------------------ CLI
  bb.cli.register({
    name: "software-factory",
    summary: "Software Factory: AIRD-пакеты проектов, их стадии, воркордеры и гейты",
    commands: [
      { name: "list", summary: "Список AIRD по проектам", usage: "bb software-factory list [--json]" },
      { name: "show", summary: "Статус одного AIRD", usage: "bb software-factory show <aird-id|slug> [--json]" },
      {
        name: "acceptance",
        summary: "Слепая приёмка AIRD: статус, регистрация набора, прогон на базе или на реализации",
        usage: "bb software-factory acceptance <aird-id|slug> status|register <run.sh>|run [--baseline]",
      },
      { name: "commits", summary: "Коммиты AIRD — в папке или во вложенных репозиториях, если папка не git", usage: "bb software-factory commits <aird-id|slug> [--json]" },
      { name: "layout", summary: "Где AIRD пишет код, пакет и git-данные — и можно ли туда писать; --prepare готовит раскладку как старт delivery", usage: "bb software-factory layout <aird-id|slug> [--prepare] [--json]" },
    ],
    async run(argv) {
      const json = argv.includes("--json");
      const [command, target] = argv.filter((arg) => arg !== "--json" && arg !== "--prepare");
      if (command === "list") {
        const data = await overview();
        if (json) return { exitCode: 0, stdout: JSON.stringify(data.airds) };
        const lines = data.projects.flatMap((project) => {
          const items = data.airds.filter((aird) => aird.projectId === project.id);
          if (items.length === 0) return [];
          return [
            `${project.name}:`,
            ...items.map(
              (aird) =>
                `  ${aird.id}  ${aird.slug.padEnd(36)} ${aird.status.padEnd(22)} ${aird.stageLabel} · WO ${aird.workorders.done}/${aird.workorders.total}`,
            ),
          ];
        });
        return { exitCode: 0, stdout: lines.join("\n") || "AIRD не найдено." };
      }
      if (command === "show" && target) {
        const data = await overview();
        const aird = data.airds.find((candidate) => candidate.id === target || candidate.slug === target);
        if (!aird) return { exitCode: 1, stderr: `AIRD ${target} не найден. bb software-factory list` };
        const full = await detail(aird.id);
        if (json) return { exitCode: 0, stdout: JSON.stringify(full) };
        const text = [
          `${full.summary.title} (${full.summary.slug})`,
          `статус: ${full.summary.status} · стадия: ${full.summary.stageLabel} · ${full.summary.progress}%`,
          `воркордеры: ${full.summary.workorders.done}/${full.summary.workorders.total} · фиксы открыто: ${full.summary.fixes.open} · гейты: ${full.summary.gates.passed}/${full.summary.gates.total}`,
          `следующее действие: ${full.summary.nextAction ?? "—"}`,
          `пакет: ${full.summary.packagePath}`,
        ].join("\n");
        return { exitCode: 0, stdout: text };
      }
      if (command === "commits" && target) {
        const data = await overview();
        const aird = data.airds.find((candidate) => candidate.id === target || candidate.slug === target);
        if (!aird) return { exitCode: 1, stderr: `AIRD ${target} не найден. bb software-factory list` };
        const started = Date.now();
        const result = await commitsOf(aird.id);
        if (json) return { exitCode: 0, stdout: JSON.stringify(result) };
        return {
          exitCode: 0,
          stdout: [
            `${result.branch ?? `ветки aird/${aird.slug} нет`}${result.repos?.length ? `${result.branch ? " в " : " · коммиты по записям пакета в "}${result.repos.join(", ")}` : ""}${result.base ? ` относительно ${result.base}` : ""} · ${result.commits.length} коммитов · ${Date.now() - started} мс`,
            ...(result.error ? [`ошибка: ${result.error}`] : []),
            ...result.commits.slice(0, 15).map((commit) => `  ${commit.short}  ${(commit.repo ?? "").padEnd(18)} ${commit.subject}`),
          ].join("\n"),
        };
      }
      if (command === "layout" && target) {
        const data = await overview();
        const aird = data.airds.find((candidate) => candidate.id === target || candidate.slug === target);
        if (!aird) return { exitCode: 1, stderr: `AIRD ${target} не найден. bb software-factory list` };
        let row = q.airdById.get(aird.id);
        if (!row) return { exitCode: 1, stderr: "У AIRD нет записи Software Factory" };
        if (argv.includes("--prepare")) {
          row = await ensureDeliveryCheckout(row.id);
          if (row.worktree && !row.repos && isLinkedWorktree(row.worktree)) {
            await migrateWorktreeToClone(row.worktree, row.branch ?? `aird/${row.slug}`);
            row = q.airdById.get(row.id)!;
          }
          if (row.acceptance_folder && row.acceptance_branch && isDirectory(row.acceptance_folder)) {
            await migrateWorktreeToClone(row.acceptance_folder, row.acceptance_branch, /(^|\/)results\.json$/u);
          }
          await syncBranches(row);
        }
        const layout = await checkLayout(row);
        if (json) return { exitCode: layout.ok ? 0 : 2, stdout: JSON.stringify(layout) };
        return {
          exitCode: layout.ok ? 0 : 2,
          stdout: [`Рабочая папка треда: ${layout.root}`, ...layout.checks.map((check) => `${check.ok ? "✓" : "✗"} ${check.label}: ${check.path}\n    ${check.detail}`)].join("\n"),
        };
      }
      if (command === "acceptance" && target) {
        const data = await overview();
        const aird = data.airds.find((candidate) => candidate.id === target || candidate.slug === target);
        if (!aird) return { exitCode: 1, stderr: `AIRD ${target} не найден. bb software-factory list` };
        const [, , action, arg] = argv.filter((item) => item !== "--json" && item !== "--baseline");
        const entry = await findEntry(aird.id);
        ensureRecord(entry, readPackage(packageDir(entry)));
        if (action === "register" && arg) {
          const result = await registerSuite(aird.id, resolve(arg), "cli");
          return { exitCode: 0, stdout: `Набор ${result.wave}: ${result.dir} @ ${result.commit}\nБаза: ${result.base}\nРеализация: ${result.target}` };
        }
        if (action === "run") {
          const { done } = await startAcceptanceRun(aird.id, argv.includes("--baseline") ? "baseline" : "wave");
          const run = await done;
          const results = parseResults(run.results);
          const counts = `passed ${results.filter((r) => r.status === "passed").length}, failed ${results.filter((r) => r.status === "failed").length}, skipped ${results.filter((r) => r.status === "skipped").length}`;
          const text = `${run.verdict ?? run.error ?? "нет вердикта"}\n(${run.kind}, ${counts}, run ${run.id})`;
          return json ? { exitCode: run.status === "passed" ? 0 : 2, stdout: JSON.stringify({ ...run, log: undefined }) } : { exitCode: run.status === "passed" ? 0 : 2, stdout: text };
        }
        const view = (await acceptanceView(entry)).view;
        const suite = view.suite;
        const text = [
          `Волна ${view.wave ?? "—"} · гейт ${view.gate}`,
          suite ? `Набор: ${suite.dir} @ ${suite.commit}` : "Набор: не зарегистрирован",
          suite ? `База: ${suite.base}\nРеализация: ${suite.target}` : "",
          suite?.problem ? `Проблема: ${suite.problem}` : "",
          ...view.runs.slice(0, 5).map((run) => `  ${run.kind.padEnd(8)} ${run.status.padEnd(7)} passed ${run.passed} failed ${run.failed}${run.error ? ` · ${run.error.split("\n")[0]}` : ""}`),
        ].filter(Boolean).join("\n");
        return { exitCode: 0, stdout: text };
      }
      return {
        exitCode: command === undefined || command === "help" || command === "--help" ? 0 : 1,
        stdout: "Usage:\n  bb software-factory list [--json]\n  bb software-factory show <aird-id|slug> [--json]\n  bb software-factory acceptance <aird-id|slug> status|register <run.sh>|run [--baseline]",
      };
    },
  });

  bb.log.info("software-factory loaded");
}
