// Agent roles the AIRD skills name (product-analyst, architect, risk-analyst,
// explorer, reviewer, qa, backend-worker, …) and the defaults the user's own
// runtimes declare for them:
//   claude-code: ~/.claude/agents/<name>.md   (frontmatter model/effort/tools, body = role prompt)
//                ~/.claude/settings.json       (model, effortLevel — the session default)
//   codex:       ~/.codex/agents/<name>.toml  (model, model_reasoning_effort, sandbox_mode,
//                                              developer_instructions = role prompt)
//                ~/.codex/config.toml          (model, model_reasoning_effort; [agents.<name>].description)
// Software Factory launches each role as its own bb thread with these values
// unless the user overrides them on the Роли агентов page.
import { readdirSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { readText, splitFrontmatter } from "./aird";

export type RuntimeFamily = "claude-code" | "codex";

export interface AgentDefinition {
  name: string;
  provider: RuntimeFamily;
  description: string;
  tools: string[];
  model: string | null;
  effort: string | null;
  /** Skills the role file lists under "Skills to use…". */
  skills: string[];
  canWrite: boolean;
  prompt: string;
  path: string;
}

/** Reads the "Skills to use (when relevant):" bullet list from a role prompt. */
export function parseRoleSkills(body: string): string[] {
  const skills: string[] = [];
  const lines = body.split(/\r?\n/u);
  for (let i = 0; i < lines.length; i += 1) {
    if (!/^\s*(#+\s*)?(skills to use|скиллы)/iu.test(lines[i]!)) continue;
    for (let j = i + 1; j < lines.length; j += 1) {
      const match = /^\s*[-*]\s*`?\/?([a-z0-9][a-z0-9:_-]*)`?/iu.exec(lines[j]!);
      if (match) skills.push(match[1]!);
      else if (lines[j]!.trim() !== "" || skills.length > 0) break;
    }
  }
  return [...new Set(skills)];
}

export const AIRD_SKILL_AGENTS = {
  discovery: [
    "explorer",
    "product-analyst",
    "uiux-designer",
    "risk-analyst",
    "architect",
    "architect-deep",
    "cybersec",
    "docs",
    "reviewer",
    "qa",
    "debugger",
    "general-purpose",
  ],
  delivery: [
    "test-author",
    "backend-worker",
    "frontend-worker",
    "worker",
    "reviewer",
    "qa",
    "cybersec",
    "docs",
    "debugger",
    "architect",
    "general-purpose",
  ],
} as const;

export function runtimeFamily(providerId: string): RuntimeFamily | null {
  if (providerId === "claude-code" || providerId.startsWith("claude")) return "claude-code";
  if (providerId === "codex" || providerId.startsWith("codex")) return "codex";
  return null;
}

function claudeDir(): string {
  return process.env.CLAUDE_CONFIG_DIR || join(homedir(), ".claude");
}

function codexDir(): string {
  return process.env.CODEX_HOME || join(homedir(), ".codex");
}

function listMd(dir: string, ext: string): string[] {
  try {
    return readdirSync(dir).filter((name) => name.endsWith(ext));
  } catch {
    return [];
  }
}

// ------------------------------------------------------------- minimal TOML

/**
 * Top-level `key = "…"`, `key = '…'`, `key = """…"""` and bare scalars of one
 * TOML table. Enough for Codex agent files and config.toml defaults; arrays
 * and nested values are ignored.
 */
export function tomlTable(text: string, table: string | null): Record<string, string> {
  const out: Record<string, string> = {};
  const lines = text.split(/\r?\n/u);
  let current: string | null = null;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    const header = /^\s*\[([^\]]+)\]\s*$/u.exec(line);
    if (header) {
      current = header[1]!.trim();
      continue;
    }
    if (current !== table) continue;
    const kv = /^\s*([A-Za-z0-9_.-]+)\s*=\s*(.*)$/u.exec(line);
    if (!kv) continue;
    const key = kv[1]!;
    let value = kv[2]!.trim();
    if (value.startsWith('"""') || value.startsWith("'''")) {
      const quote = value.slice(0, 3);
      let rest = value.slice(3);
      const parts: string[] = [];
      while (true) {
        const end = rest.indexOf(quote);
        if (end >= 0) {
          parts.push(rest.slice(0, end));
          break;
        }
        parts.push(rest);
        i += 1;
        if (i >= lines.length) break;
        rest = `\n${lines[i]!}`;
      }
      out[key] = parts.join("").replace(/^\n/u, "");
      continue;
    }
    const quoted = /^"((?:[^"\\]|\\.)*)"|^'([^']*)'/u.exec(value);
    if (quoted) value = quoted[1] !== undefined ? quoted[1].replace(/\\"/gu, '"').replace(/\\n/gu, "\n") : quoted[2]!;
    else value = value.replace(/\s+#.*$/u, "");
    out[key] = value;
  }
  return out;
}

// ------------------------------------------------------------- definitions

function readClaudeAgent(path: string, fallbackName: string): AgentDefinition | null {
  const text = readText(path);
  if (text === null) return null;
  const { data, body } = splitFrontmatter(text);
  const name = typeof data.name === "string" && data.name.trim() ? data.name.trim() : fallbackName;
  const tools =
    typeof data.tools === "string"
      ? data.tools.split(",").map((tool) => tool.trim()).filter(Boolean)
      : Array.isArray(data.tools)
        ? data.tools.filter((tool): tool is string => typeof tool === "string")
        : [];
  return {
    name,
    provider: "claude-code",
    description: typeof data.description === "string" ? data.description : "",
    tools,
    model: typeof data.model === "string" ? data.model : null,
    effort: typeof data.effort === "string" ? data.effort : null,
    skills: Array.isArray(data.skills)
      ? data.skills.filter((skill): skill is string => typeof skill === "string")
      : parseRoleSkills(body),
    canWrite: tools.length === 0 || tools.some((tool) => ["Edit", "Write", "NotebookEdit"].includes(tool)),
    prompt: body.trim(),
    path,
  };
}

function readCodexAgent(path: string, name: string, description: string): AgentDefinition | null {
  const text = readText(path);
  if (text === null) return null;
  const root = tomlTable(text, null);
  const prompt = (root.developer_instructions ?? root.instructions ?? "").trim();
  const sandbox = root.sandbox_mode ?? null;
  return {
    name,
    provider: "codex",
    description: description || (/Purpose:\s*(.+)/u.exec(prompt)?.[1] ?? ""),
    tools: sandbox ? [`sandbox: ${sandbox}`] : [],
    model: root.model ?? null,
    effort: root.model_reasoning_effort ?? null,
    skills: parseRoleSkills(prompt),
    canWrite: sandbox !== "read-only",
    prompt,
    path,
  };
}

function claudeDefinitions(): AgentDefinition[] {
  const dir = join(claudeDir(), "agents");
  return listMd(dir, ".md")
    .map((file) => readClaudeAgent(join(dir, file), file.replace(/\.md$/u, "")))
    .filter((def): def is AgentDefinition => def !== null);
}

function codexDefinitions(): AgentDefinition[] {
  const config = readText(join(codexDir(), "config.toml")) ?? "";
  const dir = join(codexDir(), "agents");
  const byName = new Map<string, AgentDefinition>();
  for (const file of listMd(dir, ".toml")) {
    const name = file.replace(/\.toml$/u, "");
    const meta = tomlTable(config, `agents.${name}`);
    const def = readCodexAgent(join(dir, file), name, meta.description ?? "");
    if (def) byName.set(name, def);
  }
  // Agents declared in config.toml with a config_file elsewhere.
  for (const match of config.matchAll(/^\s*\[agents\.([A-Za-z0-9_-]+)\]\s*$/gmu)) {
    const name = match[1]!;
    if (byName.has(name)) continue;
    const meta = tomlTable(config, `agents.${name}`);
    if (!meta.config_file) continue;
    const def = readCodexAgent(join(codexDir(), meta.config_file), name, meta.description ?? "");
    if (def) byName.set(name, def);
  }
  return [...byName.values()];
}

export function listAgentDefinitions(provider?: RuntimeFamily): AgentDefinition[] {
  const all = [
    ...(provider === undefined || provider === "claude-code" ? claudeDefinitions() : []),
    ...(provider === undefined || provider === "codex" ? codexDefinitions() : []),
  ];
  return all.sort((a, b) => a.name.localeCompare(b.name) || a.provider.localeCompare(b.provider));
}

/** The role as the given runtime defines it, falling back to the other runtime's file. */
export function getAgentDefinition(name: string, providerId = "claude-code"): AgentDefinition | null {
  const family = runtimeFamily(providerId) ?? "claude-code";
  const own = listAgentDefinitions(family).find((def) => def.name === name);
  if (own) return own;
  const other = listAgentDefinitions(family === "codex" ? "claude-code" : "codex").find((def) => def.name === name);
  return other ? { ...other, model: null, effort: null } : null;
}

/** Session defaults each runtime is configured with (used for orchestrators). */
export function runtimeDefaults(providerId: string): { model: string | null; effort: string | null; source: string } {
  const family = runtimeFamily(providerId);
  if (family === "codex") {
    const path = join(codexDir(), "config.toml");
    const root = tomlTable(readText(path) ?? "", null);
    return { model: root.model ?? null, effort: root.model_reasoning_effort ?? null, source: path };
  }
  if (family === "claude-code") {
    const path = join(claudeDir(), "settings.json");
    try {
      const settings = JSON.parse(readText(path) ?? "{}") as { model?: unknown; effortLevel?: unknown };
      return {
        model: typeof settings.model === "string" ? settings.model : null,
        effort: typeof settings.effortLevel === "string" ? settings.effortLevel : null,
        source: path,
      };
    } catch {
      return { model: null, effort: null, source: path };
    }
  }
  return { model: null, effort: null, source: "" };
}

/** The first message of an agent thread: role prompt, then the orchestrator's task. */
export function agentPrompt(options: {
  role: string;
  definition: AgentDefinition | null;
  model: string | null;
  effort: string | null;
  task: string;
  slug: string;
  folder: string;
  packagePath: string;
  orchestratorThreadId: string;
  /** Lines describing the user's materials (see src/inputs.ts). */
  materials?: string[];
  /** How many of them are attached to this message natively. */
  attachedCount?: number;
  /** Delivery implementation workers: tool actions before Factory asks for a checkpoint. */
  actionBudget?: number | null;
  /** The workorder's `docs_to_read` sections, already cut out of the package (markdown). */
  sections?: string;
}): string {
  const { role, definition, task, slug, folder, packagePath, orchestratorThreadId, model, effort, materials = [], attachedCount = 0, actionBudget = null, sections = "" } = options;
  const lines = [
    `Ты — агент \`${role}\` в AIRD «${slug}» (Software Factory). Тебя запустил оркестратор @thread:${orchestratorThreadId}.`,
    "",
  ];
  if (definition) {
    lines.push("## Роль (из определения агента)", "", definition.prompt, "");
    if (definition.skills.length > 0) {
      lines.push(
        `Скиллы роли: ${definition.skills.map((skill) => `\`/${skill}\``).join(", ")}. Загружай их, когда задача их касается (для ревью и реализации — до начала работы). Справочники скилла (\`references/\`) открывай по одному: общий и тот, что про язык и слой изменения (например \`go.md\`, \`backend.md\`), — не все подряд.`,
        "",
      );
    }
    if (!definition.canWrite) lines.push("Не изменяй исходный код. Записывать указанные в задаче доказательства, отчёты и скриншоты можно.", "");
    else if (definition.tools.length > 0) lines.push(`Инструменты роли: ${definition.tools.join(", ")}.`, "");
  } else if (role === "general-purpose") {
    lines.push("## Роль", "", "Универсальный исполнитель: делай ровно то, что описано в задаче.", "");
  } else {
    lines.push("## Роль", "", `Определение агента \`${role}\` не найдено; действуй как специалист с этим именем.`, "");
  }
  lines.push(
    "## Контекст",
    "",
    `- Рабочая папка: \`${folder}\``,
    `- AIRD-пакет: \`${packagePath}\``,
    `- Модель/effort этого треда: ${model ?? "по умолчанию"} / ${effort ?? "по умолчанию"}`,
    "- Родительский контекст недоступен: опирайся только на задачу и файлы, на которые она указывает.",
    "- Не запускай других агентов и треды.",
    ...(materials.length > 0
      ? [
          `- Материалы пользователя (часть постановки)${attachedCount > 0 ? `; названные в задаче приложены к этому сообщению (${attachedCount})` : ""}. Открывай те, что относятся к задаче:`,
          ...materials.map((line) => `  ${line}`),
        ]
      : []),
    "",
    "## Экономия контекста",
    "",
    "Всё, что ты прочитал, вывел и обдумал, отправляется модели заново на каждом следующем шаге. Поэтому:",
    "- ищи `rg -n` по имени, затем читай `sed -n` окном до 80 строк вокруг найденного; не выводи файлы целиком (`cat`, `sed` на сотни строк);",
    "- документы пакета — только разделы, названные в задаче и в `docs_to_read`; из справочников скиллов — только файл твоего языка или области;",
    "- длинный вывод (тесты, сборка, логи, диффы) — в файл, на экран хвост `tail -n 40` или счётчик;",
    "- не перечитывай то, что уже прочитал в этом треде.",
    ...(actionBudget
      ? [
          `- Бюджет: около ${actionBudget} действий (команд, чтений, правок). Если задача больше, Factory пришлёт сигнал: тогда сохрани рабочую копию (коммит только с разрешением пользователя), запиши остаток в \`evidence/<WO>-progress.md\` с ревизией, незакоммиченными путями, сделанным, остатком и командами проверок и заверши с пометкой «частично» — остаток сделает свежий воркер по записке.`,
          "- Для новых исполнителей Factory также предупреждает при 120 тыс. токенов/40% контекста и просит checkpoint при 160 тыс./50%; применяется первый достигнутый порог. Измерение может быть недоступно — это не нулевой контекст.",
          "- Работай над одной указанной подзадачей с проверяемым результатом. Закончи связную часть и её проверки до следующей; если остаток выходит за бюджет, передай его через ту же progress-записку. Не создавай дополнительные воркордеры ради деления исполнения.",
        ]
      : []),
    "",
    "## Задача от оркестратора",
    "",
    task.trim(),
    "",
    ...(sections ? [sections, ""] : []),
    "## Ответ",
    "",
    "Следуй формату отчёта из задачи. Если он не задан — короткий отчёт для оркестратора: вердикт, ключевые факты, пути к прочитанным или записанным файлам. Без пересказа файлов целиком.",
  );
  return lines.join("\n");
}
