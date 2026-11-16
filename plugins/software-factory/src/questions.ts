// Questions and requests AIRD threads put to the user, normalized into one
// shape: the plugin's own sf_ask_user forms, provider-native questions and
// permission requests, and interview questions written as plain text in the
// AIRD discussion format (aird-discovery-loop references/interview.md):
//
//   7) <решение>?
//      а) <вариант> — <последствие>
//      б) <вариант> — <последствие>
//   Рекомендация: б) <вариант> — <почему>.
//   Какой вариант выбираете?
import type { Question, QuestionPart } from "./contract";

export const LETTERS = ["а", "б", "в", "г", "д", "е", "ж", "з", "и", "к"];

const OPTION_LINE = /^\s*(?:[-*]\s*)?(?:\*\*)?([а-яёa-z])\)(?:\*\*)?\s+(.+?)\s*$/iu;
const HEAD_LINE = /^\s*(?:#{1,4}\s*)?(?:\*\*)?(?:Вопрос\s*)?(\d{1,3})[).]\s*(?:\*\*)?\s*(.+?)\s*$/u;
const RECOMMEND_LINE = /рекомендац[а-яё]*\**\s*:?\s*\**\s*([а-яёa-z])\)\s*(.*)$/imu;

function splitDetail(text: string): { label: string; detail: string | null } {
  const clean = text.replace(/\*\*/gu, "").trim();
  const match = /^(.+?)\s+[—–-]\s+(.+)$/u.exec(clean);
  return match ? { label: match[1]!.trim(), detail: match[2]!.trim() } : { label: clean, detail: null };
}

export interface ParsedTextQuestion {
  number: number | null;
  topic: string | null;
  context: string | null;
  part: QuestionPart;
}

/**
 * Finds the question a thread's last message ends on. Returns null when the
 * message does not wait for the user (no lettered options and no closing
 * question mark).
 */
export function parseTextQuestion(text: string): ParsedTextQuestion | null {
  const lines = text.replace(/\r/gu, "").split("\n");
  // Lettered options closest to the end of the message.
  let lastOption = -1;
  for (let i = lines.length - 1; i >= 0; i -= 1) {
    if (OPTION_LINE.test(lines[i]!)) {
      lastOption = i;
      break;
    }
  }
  if (lastOption >= 0) {
    let first = lastOption;
    while (first - 1 >= 0 && (OPTION_LINE.test(lines[first - 1]!) || /^\s{2,}\S/u.test(lines[first - 1]!) && !HEAD_LINE.test(lines[first - 1]!))) first -= 1;
    const options: QuestionPart["options"] = [];
    for (let i = first; i <= lastOption; i += 1) {
      const match = OPTION_LINE.exec(lines[i]!);
      if (match) {
        const { label, detail } = splitDetail(match[2]!);
        options.push({ value: match[1]!.toLowerCase(), label, detail });
      } else if (options.length > 0) {
        const prev = options[options.length - 1]!;
        prev.detail = `${prev.detail ? `${prev.detail} ` : ""}${lines[i]!.trim()}`;
      }
    }
    // The question: the nearest numbered head above, else the paragraph above.
    let headIndex = -1;
    for (let i = first - 1; i >= Math.max(0, first - 12); i -= 1) {
      if (HEAD_LINE.test(lines[i]!)) {
        headIndex = i;
        break;
      }
      if (lines[i]!.trim() === "" && i < first - 1) break;
    }
    let number: number | null = null;
    let prompt: string;
    let contextEnd: number;
    if (headIndex >= 0) {
      const match = HEAD_LINE.exec(lines[headIndex]!)!;
      number = Number(match[1]);
      prompt = [match[2]!, ...lines.slice(headIndex + 1, first)].join("\n").trim();
      contextEnd = headIndex;
    } else {
      let start = first - 1;
      while (start >= 0 && lines[start]!.trim() === "") start -= 1;
      let begin = start;
      while (begin - 1 >= 0 && lines[begin - 1]!.trim() !== "") begin -= 1;
      prompt = lines.slice(Math.max(begin, 0), start + 1).join("\n").trim();
      contextEnd = Math.max(begin, 0);
    }
    const tail = lines.slice(lastOption + 1).join("\n");
    const rec = RECOMMEND_LINE.exec(tail);
    const recommended = rec ? rec[1]!.toLowerCase() : null;
    const context = lines.slice(0, contextEnd).join("\n").trim();
    return {
      number,
      topic: null,
      context: context ? context.slice(-4000) : null,
      part: {
        id: "q",
        prompt: prompt.replace(/\*\*/gu, "") || "Выберите вариант",
        topic: null,
        options,
        recommended: recommended && options.some((o) => o.value === recommended) ? recommended : null,
        recommendationReason: rec ? splitDetail(rec[2]!).detail ?? rec[2]!.replace(/\*\*/gu, "").trim() : null,
        allowFreeText: true,
        multiSelect: false,
      },
    };
  }
  // No options: a plain question at the end of the message.
  const trimmed = text.trim();
  const paragraphs = trimmed.split(/\n\s*\n/u);
  const last = paragraphs[paragraphs.length - 1] ?? "";
  if (!/[?？]\s*(\*\*)?\s*$/u.test(last)) return null;
  return {
    number: null,
    topic: null,
    context: paragraphs.slice(0, -1).join("\n\n").slice(-4000) || null,
    part: {
      id: "q",
      prompt: last.replace(/\*\*/gu, "").trim(),
      topic: null,
      options: [],
      recommended: null,
      recommendationReason: null,
      allowFreeText: true,
      multiSelect: false,
    },
  };
}

/** The reply a text question gets in its thread. */
export function textAnswer(part: QuestionPart, selected: string[], freeText: string | undefined): string {
  const chosen = selected
    .map((value) => part.options.find((option) => option.value === value))
    .filter((option): option is NonNullable<typeof option> => Boolean(option))
    .map((option) => `${option.value}) ${option.label}`);
  return [chosen.join(", "), freeText?.trim() ?? ""].filter(Boolean).join("\n\n") || "Ок";
}

/** One-line summary of an answer, for history and the agent's tool result. */
export function answerSummary(question: Pick<Question, "parts">, answers: Record<string, { selected: string[]; freeText?: string }>): string {
  return question.parts
    .map((part) => {
      const answer = answers[part.id];
      if (!answer) return null;
      const chosen = answer.selected
        .map((value) => {
          const option = part.options.find((o) => o.value === value);
          return option ? `${option.value}) ${option.label}` : value;
        })
        .join(", ");
      const text = answer.freeText?.trim();
      const body = [chosen, text ? `«${text}»` : ""].filter(Boolean).join(" — ");
      return question.parts.length > 1 ? `${part.topic ?? part.prompt.slice(0, 60)}: ${body}` : body;
    })
    .filter(Boolean)
    .join("; ");
}

type ProviderInteraction = {
  id: string;
  threadId: string;
  status: string;
  createdAt: number;
  origin?: { kind: string; rendererId?: string };
  payload: {
    kind: string;
    questions?: Array<{
      id: string;
      prompt: string;
      shortLabel?: string;
      allowFreeText: boolean;
      multiSelect: boolean;
      options?: Array<{ value: string; label: string; description?: string }>;
    }>;
    availableDecisions?: string[];
    reason?: string | null;
    subject?: Record<string, unknown> & { kind: string };
    data?: unknown;
  };
};

function describeSubject(subject: (Record<string, unknown> & { kind: string }) | undefined): { title: string; detail: string | null } {
  if (!subject) return { title: "Запрос разрешения", detail: null };
  switch (subject.kind) {
    case "command": {
      const actions = Array.isArray(subject.actions) ? subject.actions : [];
      const command = typeof subject.command === "string" ? subject.command : actions.map((a) => JSON.stringify(a)).join("\n");
      return { title: "Выполнить команду", detail: `\`\`\`sh\n${command}\n\`\`\`${typeof subject.cwd === "string" ? `\nв \`${subject.cwd}\`` : ""}` };
    }
    case "file_change":
      return { title: "Изменить файлы", detail: typeof subject.writeScope === "string" ? `Область записи: \`${subject.writeScope}\`` : null };
    case "plan":
      return { title: "Утвердить план", detail: typeof subject.plan === "string" ? subject.plan : null };
    case "tool_use":
      return { title: `Использовать инструмент ${typeof subject.tool === "string" ? subject.tool : ""}`.trim(), detail: subject.presentation ? `\`\`\`json\n${JSON.stringify(subject.presentation, null, 2)}\n\`\`\`` : null };
    case "permission_grant":
      return { title: "Выдать права", detail: `\`\`\`json\n${JSON.stringify(subject.permissions ?? {}, null, 2)}\n\`\`\`` };
    default:
      return { title: "Запрос разрешения", detail: `\`\`\`json\n${JSON.stringify(subject, null, 2)}\n\`\`\`` };
  }
}

/** A provider's own pending question or approval, as a Question (not stored). */
export function providerQuestion(
  interaction: ProviderInteraction,
  base: Pick<Question, "airdId" | "airdSlug" | "airdTitle" | "threadRole" | "threadKind">,
): Question | null {
  if (interaction.status !== "pending") return null;
  if (interaction.origin?.kind === "plugin") return null;
  const id = `pi:${interaction.threadId}:${interaction.id}`;
  if (interaction.payload.kind === "user_question") {
    const parts: QuestionPart[] = (interaction.payload.questions ?? []).map((q) => ({
      id: q.id,
      prompt: q.prompt,
      topic: q.shortLabel ?? null,
      options: (q.options ?? []).map((o) => ({ value: o.value, label: o.label, detail: o.description ?? null })),
      recommended: null,
      recommendationReason: null,
      allowFreeText: q.allowFreeText,
      multiSelect: q.multiSelect,
    }));
    return {
      ...base,
      id,
      threadId: interaction.threadId,
      source: "provider",
      status: "open",
      kind: "clarification",
      number: null,
      context: null,
      parts,
      approval: null,
      answerSummary: null,
      answeredVia: null,
      createdAt: interaction.createdAt,
      answeredAt: null,
    };
  }
  if (interaction.payload.kind === "approval") {
    const { title, detail } = describeSubject(interaction.payload.subject);
    return {
      ...base,
      id,
      threadId: interaction.threadId,
      source: "approval",
      status: "open",
      kind: "permission",
      number: null,
      context: null,
      parts: [],
      approval: {
        title,
        detail,
        reason: interaction.payload.reason ?? null,
        decisions: (interaction.payload.availableDecisions ?? ["allow_once", "deny"]).filter((d) => ["allow_once", "allow_for_session", "deny"].includes(d)),
      },
      answerSummary: null,
      answeredVia: null,
      createdAt: interaction.createdAt,
      answeredAt: null,
    };
  }
  return null;
}
