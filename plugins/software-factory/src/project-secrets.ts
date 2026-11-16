// Project secrets for agents: bb's project-scoped machine environment
// variables. bb encrypts the values and never returns them; they reach every
// next agent turn of the project's threads, in every worktree. Software
// Factory only writes them and tells agents the names and what each is for.

export const SECRET_NAME = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/u;

export interface SecretInfo {
  name: string;
  note: string | null;
  inherited: boolean;
}

/** Codex hides these from its shell by default (shell_environment_policy). */
export function hiddenFromCodex(name: string): boolean {
  return /KEY|SECRET|TOKEN/iu.test(name);
}

/** Lines for an agent prompt: names and purpose, never values. */
export function secretLines(secrets: SecretInfo[]): string[] {
  const own = secrets.filter((secret) => !secret.inherited);
  if (own.length === 0) {
    return [
      "",
      "## Секреты проекта",
      "",
      "Секретов у проекта нет. Если проверке нужен вход в приложение, ключ или токен — спроси пользователя через `sf_ask_user`, чтобы он добавил переменную в Software Factory (проект → «Секреты»). Никогда не проси прислать пароль или ключ в чат.",
    ];
  }
  return [
    "",
    "## Секреты проекта",
    "",
    "Доступны как переменные окружения в командах (bash, Playwright и т.п.):",
    ...own.map((secret) => `- \`$${secret.name}\`${secret.note ? ` — ${secret.note}` : ""}`),
    "",
    "Подставляй их только через окружение (`$NAME`, `process.env.NAME`): не печатай значения, не пиши их в файлы, отчёты, evidence, коммиты, логи и скриншоты, не вставляй в аргументы инструментов. Вход в приложение — скриптом, который читает переменные сам. Нужна ещё переменная — спроси пользователя через `sf_ask_user`, не в чате.",
  ];
}

export interface ParsedSecret {
  name: string;
  value: string;
  /** From a `# comment` line directly above the key. */
  note: string | null;
  line: number;
}

/**
 * Parses a pasted list of secrets: dotenv (`KEY=value`, `export KEY=value`)
 * or flat YAML (`KEY: value`). Quoted values keep their content (double
 * quotes understand \n, \t, \" and \\). A `# comment` line right above a key
 * becomes its note. There are no inline comments: a password may contain
 * ` #`. Later duplicates win; multi-line values are rejected.
 */
export function parseSecretList(text: string): { entries: ParsedSecret[]; errors: { line: number; message: string }[] } {
  const entries = new Map<string, ParsedSecret>();
  const errors: { line: number; message: string }[] = [];
  let pendingNote: string | null = null;
  const lines = text.replace(/^\uFEFF/u, "").split(/\r?\n/u);
  lines.forEach((raw, index) => {
    const line = index + 1;
    const trimmed = raw.trim();
    if (trimmed === "" || trimmed === "---") {
      pendingNote = null;
      return;
    }
    if (trimmed.startsWith("#")) {
      pendingNote = trimmed.replace(/^#+\s*/u, "") || null;
      return;
    }
    const match = /^(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*(?:=|:(?=\s|$))\s*(.*)$/u.exec(trimmed);
    if (!match) {
      errors.push({ line, message: "не похоже на KEY=value или KEY: value" });
      pendingNote = null;
      return;
    }
    const name = match[1]!;
    let value = match[2]!;
    const quote = value[0];
    if (quote === '"' || quote === "'") {
      if (value.length < 2 || value[value.length - 1] !== quote) {
        errors.push({ line, message: `${name}: незакрытая кавычка (многострочные значения не поддерживаются)` });
        pendingNote = null;
        return;
      }
      value = value.slice(1, -1);
      if (quote === '"') value = value.replace(/\\([nt"\\])/gu, (_, c: string) => (c === "n" ? "\n" : c === "t" ? "\t" : c));
    } else if (value === "|" || value === ">" || value.startsWith("|") || value.startsWith(">-")) {
      errors.push({ line, message: `${name}: многострочные YAML-значения не поддерживаются — запиши в одну строку` });
      pendingNote = null;
      return;
    }
    if (value === "") {
      errors.push({ line, message: `${name}: пустое значение` });
      pendingNote = null;
      return;
    }
    if (!SECRET_NAME.test(name)) {
      errors.push({ line, message: `${name}: имя длиннее 64 символов` });
      pendingNote = null;
      return;
    }
    if (entries.has(name)) errors.push({ line, message: `${name}: встречается повторно — берётся это значение` });
    entries.set(name, { name, value, note: pendingNote, line });
    pendingNote = null;
  });
  return { entries: [...entries.values()], errors };
}
