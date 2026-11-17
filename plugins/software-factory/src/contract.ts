// Shared RPC contract between server.ts and the app. Both sides validate at the
// wire boundary; the app imports only the types.
import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

export const itemLabelSchema = z.enum(["bug", "task"]);
export type ItemLabel = z.infer<typeof itemLabelSchema>;

export const gateStatusSchema = z.enum([
  "passed",
  "failed",
  "blocked",
  "evidence",
  "pending",
]);
export type GateStatus = z.infer<typeof gateStatusSchema>;

export const stageStateSchema = z.enum(["done", "current", "todo", "blocked"]);
export type StageState = z.infer<typeof stageStateSchema>;

const readinessSchema = z.object({
  implementation: z.string().nullable(),
  runtime: z.string().nullable(),
  release: z.string().nullable(),
});

export const projectSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  rootPath: z.string().nullable(),
  hostId: z.string().nullable(),
  local: z.boolean(),
  folders: z.array(z.string()),
  activeCount: z.number(),
  doneCount: z.number(),
});
export type ProjectSummary = z.infer<typeof projectSummarySchema>;

/** A project secret as agents see it: name and purpose, never the value. */
export const secretSchema = z.object({
  name: z.string(),
  note: z.string().nullable(),
  inherited: z.boolean(),
});
export type Secret = z.infer<typeof secretSchema>;

export const airdSummarySchema = z.object({
  id: z.string(),
  projectId: z.string(),
  folder: z.string(),
  slug: z.string(),
  title: z.string(),
  packagePath: z.string(),
  workFolder: z.string(),
  worktree: z.string().nullable(),
  branch: z.string().nullable(),
  worktreeNote: z.string().nullable(),
  exists: z.boolean(),
  archived: z.boolean(),
  status: z.string(),
  done: z.boolean(),
  paused: z.boolean(),
  profile: z.string().nullable(),
  activePhase: z.string().nullable(),
  activeWave: z.string().nullable(),
  nextAction: z.string().nullable(),
  updatedAt: z.string().nullable(),
  stageLabel: z.string(),
  stageLane: z.enum(["discovery", "delivery"]),
  progress: z.number(),
  readiness: readinessSchema,
  workorders: z.object({
    total: z.number(),
    done: z.number(),
    inProgress: z.number(),
    blocked: z.number(),
  }),
  fixes: z.object({ total: z.number(), open: z.number() }),
  gates: z.object({
    total: z.number(),
    passed: z.number(),
    failed: z.number(),
    blocked: z.number(),
  }),
  blockersOpen: z.number(),
  threads: z.object({ total: z.number(), running: z.number() }),
  createdAt: z.number().nullable(),
});
export type AirdSummary = z.infer<typeof airdSummarySchema>;

export const stageNodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  lane: z.enum(["discovery", "delivery"]),
  state: stageStateSchema,
  detail: z.string().nullable(),
});
export type StageNode = z.infer<typeof stageNodeSchema>;

export const workorderSchema = z.object({
  id: z.string(),
  file: z.string(),
  title: z.string(),
  kind: z.string(),
  status: z.string(),
  statusSource: z.enum(["file", "inferred"]),
  wave: z.string(),
  surface: z.string().nullable(),
  workClass: z.string().nullable(),
  dependsOn: z.array(z.string()),
  riskIds: z.array(z.string()),
  gateIds: z.array(z.string()),
  dodIds: z.array(z.string()),
  agent: z.string().nullable(),
  label: itemLabelSchema,
  labelSource: z.enum(["auto", "user"]),
  commitCount: z.number(),
});
export type Workorder = z.infer<typeof workorderSchema>;

export const fixSchema = z.object({
  id: z.string(),
  file: z.string(),
  kind: z.enum(["fix-workorder", "finding-note"]),
  title: z.string(),
  findingClass: z.string().nullable(),
  rootCause: z.string().nullable(),
  severity: z.string().nullable(),
  sourceGate: z.string().nullable(),
  originalWorkorder: z.string().nullable(),
  closed: z.boolean().nullable(),
  label: itemLabelSchema,
  labelSource: z.enum(["auto", "user"]),
  commitCount: z.number(),
});
export type Fix = z.infer<typeof fixSchema>;

export const gateSchema = z.object({
  id: z.string(),
  title: z.string(),
  criterion: z.string().nullable(),
  evidence: z.string().nullable(),
  riskIds: z.array(z.string()),
  dodIds: z.array(z.string()),
  workorders: z.array(z.string()),
  status: gateStatusSchema,
  statusSource: z.enum(["derived", "user"]),
  note: z.string().nullable(),
  mentions: z.array(z.string()),
});
export type Gate = z.infer<typeof gateSchema>;

export const riskSchema = z.object({ id: z.string(), title: z.string() });
export type Risk = z.infer<typeof riskSchema>;

export const blockerSchema = z.object({
  id: z.string(),
  statement: z.string(),
  owner: z.string().nullable(),
  needsUserDecision: z.boolean(),
  resolved: z.boolean(),
});
export type Blocker = z.infer<typeof blockerSchema>;

export const findingSchema = z.object({
  id: z.string(),
  statement: z.string(),
  closed: z.boolean(),
});
export type Finding = z.infer<typeof findingSchema>;

export const agentThreadSchema = z.object({
  threadId: z.string(),
  role: z.string(),
  kind: z.enum(["orchestrator", "agent"]),
  stage: z.enum(["discovery", "delivery"]).nullable(),
  title: z.string(),
  status: z.string(),
  parentThreadId: z.string().nullable(),
  createdAt: z.number(),
  archived: z.boolean(),
  model: z.string().nullable(),
  effort: z.string().nullable(),
  skills: z.array(z.string()),
  provider: z.string().nullable(),
  refs: z.array(z.string()),
  stageNode: z.string().nullable(),
  task: z.string().nullable(),
});
export type AgentThread = z.infer<typeof agentThreadSchema>;

export const commitSchema = z.object({
  sha: z.string(),
  short: z.string(),
  subject: z.string(),
  author: z.string(),
  date: z.string(),
  refs: z.array(z.string()),
  /** Repository folder the commit came from, when the AIRD spans several repositories. */
  repo: z.string().nullable().optional(),
});
export type Commit = z.infer<typeof commitSchema>;

export const artifactSchema = z.object({
  name: z.string(),
  status: z.string(),
  exists: z.boolean(),
});
export type Artifact = z.infer<typeof artifactSchema>;

/** A file the user attached to the AIRD (package `inputs/`). */
export const inputFileSchema = z.object({
  name: z.string(),
  path: z.string(),
  sizeBytes: z.number(),
  mimeType: z.string(),
  image: z.boolean(),
  addedAt: z.number(),
});
export type InputFile = z.infer<typeof inputFileSchema>;

export const airdDetailSchema = z.object({
  summary: airdSummarySchema,
  hostId: z.string().nullable(),
  request: z.string().nullable(),
  stages: z.array(stageNodeSchema),
  workorders: z.array(workorderSchema),
  fixes: z.array(fixSchema),
  gates: z.array(gateSchema),
  risks: z.array(riskSchema),
  blockers: z.array(blockerSchema),
  findings: z.array(findingSchema),
  artifacts: z.array(artifactSchema),
  threads: z.array(agentThreadSchema),
  waves: z.array(z.string()),
  inputs: z.array(inputFileSchema),
  /** Polyrepo workspace: repositories delivery works on (checked out, or planned from the workorders). */
  deliveryRepos: z.array(z.string()),
  /** Whether those repositories already have their AIRD worktrees. */
  deliveryReposReady: z.boolean(),
  /** The places a delivery writes, checked by Factory (null before a working copy exists). */
  layout: z
    .object({
      root: z.string(),
      ok: z.boolean(),
      checks: z.array(z.object({ label: z.string(), path: z.string(), ok: z.boolean(), detail: z.string() })),
    })
    .nullable(),
  /** Stage history from STATE.md `transitions` and whether it matches Factory's journal. */
  lifecycle: z.object({
    history: z.array(z.object({ from: z.string(), to: z.string(), at: z.string(), by: z.string(), thread: z.string().nullable().optional() })),
    problem: z.string().nullable(),
    recorded: z.number(),
  }),
  /** Session budget since the last confirmed handoff. */
  session: z.object({
    slices: z.number(),
    limit: z.number(),
    threadId: z.string().nullable(),
    contextPct: z.number().nullable(),
    handoffs: z.array(z.object({ from: z.string(), to: z.string(), createdAt: z.number(), confirmedAt: z.number().nullable() })),
  }),
});
export type AirdDetail = z.infer<typeof airdDetailSchema>;

export const commitsResultSchema = z.object({
  branch: z.string().nullable(),
  base: z.string().nullable(),
  commits: z.array(commitSchema),
  error: z.string().nullable(),
  /** Repositories (workspace-relative) where the AIRD branch or its merges were found. */
  repos: z.array(z.string()).optional(),
});
export type CommitsResult = z.infer<typeof commitsResultSchema>;

export const validationResultSchema = z.object({
  ok: z.boolean(),
  errors: z.array(z.string()),
  warnings: z.array(z.string()),
  error: z.string().nullable(),
});
export type ValidationResult = z.infer<typeof validationResultSchema>;

export const modelOptionSchema = z.object({
  id: z.string(),
  label: z.string(),
  efforts: z.array(z.string()),
  defaultEffort: z.string().nullable(),
  isDefault: z.boolean(),
});
export type ModelOption = z.infer<typeof modelOptionSchema>;

export const providerOptionSchema = z.object({
  id: z.string(),
  name: z.string(),
  family: z.enum(["claude-code", "codex"]).nullable(),
  models: z.array(modelOptionSchema),
  defaults: z.object({ model: z.string().nullable(), effort: z.string().nullable(), source: z.string() }),
});
export type ProviderOption = z.infer<typeof providerOptionSchema>;

export const roleDefinitionSchema = z.object({
  provider: z.enum(["claude-code", "codex"]),
  model: z.string().nullable(),
  effort: z.string().nullable(),
  skills: z.array(z.string()),
  tools: z.array(z.string()),
  canWrite: z.boolean(),
  path: z.string(),
});
export type RoleDefinition = z.infer<typeof roleDefinitionSchema>;

export const agentRoleSchema = z.object({
  name: z.string(),
  stages: z.array(z.enum(["discovery", "delivery"])),
  description: z.string(),
  definitions: z.array(roleDefinitionSchema),
  overrideProvider: z.string().nullable(),
  overrideModel: z.string().nullable(),
  overrideEffort: z.string().nullable(),
  inheritProvider: z.string(),
  effectiveProvider: z.string(),
  effectiveModel: z.string().nullable(),
  effectiveEffort: z.string().nullable(),
  skills: z.array(z.string()),
  canWrite: z.boolean(),
});
export type AgentRole = z.infer<typeof agentRoleSchema>;

export const orchestratorConfigSchema = z.object({
  stage: z.enum(["discovery", "delivery"]),
  provider: z.string(),
  overrideProvider: z.string().nullable(),
  overrideModel: z.string().nullable(),
  overrideEffort: z.string().nullable(),
  defaultModel: z.string().nullable(),
  defaultEffort: z.string().nullable(),
  defaultSource: z.string(),
  effectiveModel: z.string().nullable(),
  effectiveEffort: z.string().nullable(),
});
export type OrchestratorConfig = z.infer<typeof orchestratorConfigSchema>;

export const agentsCatalogSchema = z.object({
  hostId: z.string().nullable(),
  providers: z.array(providerOptionSchema),
  orchestrators: z.array(orchestratorConfigSchema),
  roles: z.array(agentRoleSchema),
});
export type AgentsCatalog = z.infer<typeof agentsCatalogSchema>;

const fieldSchema = z.object({ name: z.string(), value: z.string() });

export const refDetailSchema = z.object({
  ref: z.string(),
  kind: z.enum(["workorder", "fix", "gate", "risk", "dod", "edge-case", "blocker", "finding", "unknown"]),
  title: z.string(),
  file: z.string().nullable(),
  fields: z.array(fieldSchema),
  markdown: z.string().nullable(),
  related: z.array(z.string()),
  mentions: z.array(z.object({ file: z.string(), line: z.string() })),
});
export type RefDetail = z.infer<typeof refDetailSchema>;

export const docDetailSchema = z.object({
  path: z.string(),
  markdown: z.string(),
  fields: z.array(fieldSchema),
  truncated: z.boolean(),
});
export type DocDetail = z.infer<typeof docDetailSchema>;

export const commitDetailSchema = z.object({
  sha: z.string(),
  short: z.string(),
  subject: z.string(),
  body: z.string(),
  author: z.string(),
  date: z.string(),
  refs: z.array(z.string()),
  files: z.array(z.object({ path: z.string(), additions: z.number().nullable(), deletions: z.number().nullable() })),
  patch: z.string(),
  truncated: z.boolean(),
  error: z.string().nullable(),
});
export type CommitDetail = z.infer<typeof commitDetailSchema>;

export const threadDetailSchema = z.object({
  threadId: z.string(),
  status: z.string(),
  output: z.string().nullable(),
  role: z
    .object({
      name: z.string(),
      description: z.string(),
      tools: z.array(z.string()),
      skills: z.array(z.string()),
      model: z.string().nullable(),
      effort: z.string().nullable(),
      path: z.string().nullable(),
    })
    .nullable(),
});
export type ThreadDetail = z.infer<typeof threadDetailSchema>;

const countsSchema = z.record(z.string(), z.number()).nullable();
export const metricsRunSchema = z.object({
  key: z.string(),
  ts: z.string().nullable(),
  kind: z.enum(["discovery", "delivery", "other"]),
  runtime: z.string().nullable(),
  repo: z.string().nullable(),
  slug: z.string().nullable(),
  profile: z.string().nullable(),
  outcome: z.string().nullable(),
  durationHours: z.number().nullable(),
  rootHandoffs: z.number().nullable(),
  interviewQuestions: z.number().nullable(),
  decisions: countsSchema,
  existentialRisks: countsSchema,
  workordersTotal: z.number().nullable(),
  reviewFindings: z.number().nullable(),
  reviewCoverage: z.string().nullable(),
  strictValidatorFixes: z.number().nullable(),
  scopedCorrections: z.number().nullable(),
  discoveryIterations: z.number().nullable(),
  slicesTotal: z.number().nullable(),
  workersSpawned: z.number().nullable(),
  gatesTotal: z.number().nullable(),
  gatesFirstPass: z.number().nullable(),
  gatesBlockedNoEvidence: z.number().nullable(),
  gatesWaived: z.number().nullable(),
  findingsTotal: z.number().nullable(),
  fixCycles: z.number().nullable(),
  maxRevisionAttempts: z.number().nullable(),
  escalations: z.number().nullable(),
  unclassified: z.number().nullable(),
  discoveryDefects: z.number().nullable(),
  packageReworkFiles: z.number().nullable(),
  hardStops: z.number().nullable(),
  autoCompactions: z.number().nullable(),
  findingsByClass: countsSchema,
  findingsByRootCause: countsSchema,
  notes: z.string().nullable(),
  signals: z.array(z.object({ id: z.string(), label: z.string(), severe: z.boolean() })),
  raw: z.string(),
});
export type MetricsRun = z.infer<typeof metricsRunSchema>;

export const backlogEntrySchema = z.object({
  id: z.string().nullable(),
  type: z.enum(["proposal", "watch", "note"]),
  title: z.string(),
  status: z.string(),
  date: z.string().nullable(),
  markdown: z.string(),
});
export type BacklogEntry = z.infer<typeof backlogEntrySchema>;

export const metricsOverviewSchema = z.object({
  dir: z.string(),
  runs: z.array(metricsRunSchema),
  backlog: z.array(backlogEntrySchema),
  evals: z.array(z.object({ file: z.string(), title: z.string() })),
  error: z.string().nullable(),
});
export type MetricsOverview = z.infer<typeof metricsOverviewSchema>;

export const questionPartSchema = z.object({
  id: z.string(),
  prompt: z.string(),
  topic: z.string().nullable(),
  options: z.array(z.object({ value: z.string(), label: z.string(), detail: z.string().nullable() })),
  recommended: z.string().nullable(),
  recommendationReason: z.string().nullable(),
  allowFreeText: z.boolean(),
  multiSelect: z.boolean(),
});
export type QuestionPart = z.infer<typeof questionPartSchema>;

export const questionSchema = z.object({
  id: z.string(),
  airdId: z.string().nullable(),
  airdSlug: z.string().nullable(),
  airdTitle: z.string().nullable(),
  threadId: z.string(),
  threadRole: z.string().nullable(),
  threadKind: z.enum(["orchestrator", "agent"]).nullable(),
  /** tool: sf_ask_user; provider: native question; approval: permission request; text: question written in chat. */
  source: z.enum(["tool", "provider", "approval", "text"]),
  status: z.enum(["open", "answered", "cancelled"]),
  kind: z.enum(["decision", "approval", "clarification", "permission"]),
  number: z.number().nullable(),
  context: z.string().nullable(),
  parts: z.array(questionPartSchema),
  approval: z
    .object({
      title: z.string(),
      detail: z.string().nullable(),
      reason: z.string().nullable(),
      decisions: z.array(z.string()),
    })
    .nullable(),
  answerSummary: z.string().nullable(),
  answeredVia: z.string().nullable(),
  createdAt: z.number(),
  answeredAt: z.number().nullable(),
});
export type Question = z.infer<typeof questionSchema>;

export const answersSchema = z.record(
  z.string(),
  z.object({ selected: z.array(z.string().max(200)).max(20), freeText: z.string().max(20000).optional() }),
);
export type Answers = z.infer<typeof answersSchema>;

const scenarioStatusSchema = z.enum(["passed", "failed", "skipped", "missing"]).nullable();
export const scenarioSchema = z.object({
  id: z.string(),
  dodIds: z.array(z.string()),
  boundary: z.string().nullable(),
  given: z.string().nullable(),
  when: z.string().nullable(),
  then: z.string().nullable(),
  approved: z.enum(["user", "agent"]).nullable(),
  applicable: z.boolean(),
  current: z.boolean(),
  baselineNote: z.string().nullable(),
  /** Result on the pre-change checkout: a new-behaviour scenario must fail there. */
  baseline: scenarioStatusSchema,
  last: scenarioStatusSchema,
  expected: z.string().nullable(),
  actual: z.string().nullable(),
});
export type Scenario = z.infer<typeof scenarioSchema>;

export const acceptanceRunSchema = z.object({
  id: z.string(),
  kind: z.enum(["baseline", "wave"]),
  wave: z.string().nullable(),
  status: z.enum(["running", "passed", "failed", "error"]),
  startedAt: z.number(),
  finishedAt: z.number().nullable(),
  passed: z.number(),
  failed: z.number(),
  skipped: z.number(),
  error: z.string().nullable(),
});
export type AcceptanceRun = z.infer<typeof acceptanceRunSchema>;

export const acceptanceSchema = z.object({
  folder: z.string().nullable(),
  branch: z.string().nullable(),
  wave: z.string().nullable(),
  gate: z.enum(["untested", "passed", "failed", "blocked"]),
  baselineVerdict: z.string().nullable(),
  hasSuite: z.boolean(),
  /** The suite the test author registered: exactly what runs, against which base and working copy. */
  suite: z
    .object({
      dir: z.string(),
      commit: z.string().nullable(),
      base: z.string(),
      target: z.string().nullable(),
      registeredAt: z.number().nullable(),
      problem: z.string().nullable(),
    })
    .nullable(),
  running: z.boolean(),
  scenarios: z.array(scenarioSchema),
  /** Results the suite reports for ids 09-dod.md does not define. */
  unknownResults: z.array(z.string()),
  dodWithoutScenario: z.array(z.string()),
  runs: z.array(acceptanceRunSchema),
  testAuthors: z.array(
    z.object({ threadId: z.string(), title: z.string(), status: z.string(), provider: z.string().nullable(), model: z.string().nullable() }),
  ),
});
export type Acceptance = z.infer<typeof acceptanceSchema>;

const slugSchema = z
  .string()
  .trim()
  .min(2)
  .max(80)
  .regex(/^[a-z0-9][a-z0-9-]*$/u, "slug: латиница, цифры и дефисы");

export const rpcContract = defineRpcContract({
  running_count: {
    input: z.null(),
    output: z.object({ running: z.number(), openQuestions: z.number() }),
  },
  questions_list: {
    input: z.object({ airdId: z.string().nullable(), includeAnswered: z.boolean() }),
    output: z.object({ questions: z.array(questionSchema) }),
  },
  question_answer: {
    input: z.object({
      id: z.string(),
      answers: answersSchema,
      decision: z.enum(["allow_once", "allow_for_session", "deny"]).nullish(),
    }),
    output: z.object({ ok: z.boolean() }),
  },
  question_dismiss: {
    input: z.object({ id: z.string() }),
    output: z.object({ ok: z.boolean() }),
  },
  metrics_overview: {
    input: z.null(),
    output: metricsOverviewSchema,
  },
  metrics_runs: {
    input: z.object({ slug: z.string() }),
    output: z.object({ runs: z.array(metricsRunSchema) }),
  },
  metrics_eval: {
    input: z.object({ file: z.string().regex(/^[A-Za-z0-9._-]+\.md$/u) }),
    output: z.object({ markdown: z.string() }),
  },
  agents_catalog: {
    input: z.null(),
    output: agentsCatalogSchema,
  },
  agent_override_set: {
    input: z.object({
      role: z.string().regex(/^[a-z0-9][a-z0-9-]*$/u),
      provider: z.string().trim().max(80).nullable(),
      model: z.string().trim().max(120).nullable(),
      effort: z.string().trim().max(40).nullable(),
    }),
    output: z.object({ ok: z.boolean() }),
  },
  orchestrator_set: {
    input: z.object({
      stage: z.enum(["discovery", "delivery"]),
      provider: z.string().trim().max(80).nullable(),
      model: z.string().trim().max(120).nullable(),
      effort: z.string().trim().max(40).nullable(),
    }),
    output: z.object({ ok: z.boolean() }),
  },
  overview: {
    input: z.null(),
    output: z.object({
      projects: z.array(projectSummarySchema),
      airds: z.array(airdSummarySchema),
    }),
  },
  aird_detail: {
    input: z.object({ id: z.string() }),
    output: airdDetailSchema,
  },
  aird_lookup: {
    input: z.object({ id: z.string(), ref: z.string().regex(/^[A-Za-z][A-Za-z0-9_.-]{0,60}$/u) }),
    output: refDetailSchema,
  },
  aird_doc: {
    input: z.object({ id: z.string(), path: z.string().min(1).max(400) }),
    output: docDetailSchema,
  },
  aird_commit: {
    input: z.object({ id: z.string(), sha: z.string().regex(/^[0-9a-fA-F]{4,40}$/u) }),
    output: commitDetailSchema,
  },
  aird_thread: {
    input: z.object({ id: z.string(), threadId: z.string() }),
    output: threadDetailSchema,
  },
  acceptance: {
    input: z.object({ id: z.string() }),
    output: acceptanceSchema,
  },
  acceptance_run: {
    input: z.object({ id: z.string(), baseline: z.boolean() }),
    output: z.object({ runId: z.string() }),
  },
  acceptance_log: {
    input: z.object({ runId: z.string() }),
    output: z.object({ log: z.string() }),
  },
  aird_commits: {
    input: z.object({ id: z.string() }),
    output: commitsResultSchema,
  },
  aird_validate: {
    input: z.object({ id: z.string() }),
    output: validationResultSchema,
  },
  aird_create: {
    input: z.object({
      projectId: z.string(),
      folder: z.string().trim().min(1),
      title: z.string().trim().min(1).max(200),
      slug: slugSchema,
      request: z.string().trim().min(1).max(20000),
      start: z.boolean(),
    }),
    output: z.object({ id: z.string(), threadId: z.string().nullable() }),
  },
  aird_attach: {
    input: z.object({
      id: z.string(),
      name: z.string().trim().min(1).max(200),
      // base64 of up to 25 MB
      dataBase64: z.string().min(1).max(36 * 1024 * 1024),
    }),
    output: inputFileSchema,
  },
  aird_input_remove: {
    input: z.object({ id: z.string(), name: z.string().min(1).max(200) }),
    output: z.object({ ok: z.boolean() }),
  },
  aird_input_data: {
    input: z.object({ id: z.string(), name: z.string().min(1).max(200) }),
    output: z.object({ dataUrl: z.string() }),
  },
  aird_inputs_announce: {
    input: z.object({ id: z.string(), names: z.array(z.string().min(1).max(200)).min(1).max(40) }),
    output: z.object({ threadId: z.string().nullable() }),
  },
  aird_start: {
    input: z.object({
      id: z.string(),
      stage: z.enum(["discovery", "delivery"]),
      note: z.string().trim().max(20000).nullish(),
    }),
    output: z.object({ threadId: z.string() }),
  },
  aird_continue: {
    input: z.object({
      id: z.string(),
      threadId: z.string(),
      message: z.string().trim().max(20000).nullish(),
    }),
    output: z.object({ ok: z.boolean() }),
  },
  aird_archive: {
    input: z.object({ id: z.string(), archived: z.boolean() }),
    output: z.object({ ok: z.boolean() }),
  },
  label_set: {
    input: z.object({
      airdId: z.string(),
      itemId: z.string().regex(/^(WO|F)-[A-Za-z0-9-]+$/u),
      label: itemLabelSchema.nullable(),
    }),
    output: z.object({ ok: z.boolean() }),
  },
  gate_set: {
    input: z.object({
      airdId: z.string(),
      gateId: z.string().regex(/^G-\d+$/u),
      status: gateStatusSchema.nullable(),
      note: z.string().trim().max(2000).nullish(),
    }),
    output: z.object({ ok: z.boolean() }),
  },
  project_add: {
    input: z.object({
      name: z.string().trim().min(1).max(120),
      path: z.string().trim().min(1),
    }),
    output: z.object({ projectId: z.string() }),
  },
  project_folders_set: {
    input: z.object({
      projectId: z.string(),
      folders: z.array(z.string().trim().min(1)).max(50),
    }),
    output: z.object({ ok: z.boolean() }),
  },
  project_secrets: {
    input: z.object({ projectId: z.string() }),
    output: z.object({ secrets: z.array(secretSchema) }),
  },
  project_secret_set: {
    input: z.object({
      projectId: z.string(),
      name: z.string().regex(/^[A-Za-z_][A-Za-z0-9_]{0,63}$/u, "Имя: латиница, цифры и _, не с цифры"),
      value: z.string().min(1).max(20000),
      note: z.string().trim().max(300).nullish(),
    }),
    output: z.object({ ok: z.boolean() }),
  },
  project_secret_unset: {
    input: z.object({ projectId: z.string(), name: z.string().min(1).max(64) }),
    output: z.object({ ok: z.boolean() }),
  },
  folder_suggestions: {
    input: z.object({ projectId: z.string() }),
    output: z.object({ folders: z.array(z.string()) }),
  },
});

export type RpcContract = typeof rpcContract;
