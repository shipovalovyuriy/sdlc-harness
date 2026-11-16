// Data hooks and presentation helpers for the Software Factory page.
import { useCallback, useEffect, useRef, useState } from "react";
import { useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import type {
  AirdDetail,
  CommitsResult,
  GateStatus,
  ProjectSummary,
  AirdSummary,
  RpcContract,
  StageState,
} from "../contract";

export const PANEL_PATH = "factory";
export const CHANGED = "sf-changed";

export function useFactoryRpc() {
  return useRpc<RpcContract>();
}

export function errorText(cause: unknown): string {
  if (cause instanceof Error) return cause.message;
  return String(cause);
}

/** Fetch with refetch on the server's change signal and a slow poll (packages change on disk). */
function useLiveQuery<T>(load: () => Promise<T>, deps: unknown[], pollMs: number) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);
  const refetch = useCallback(() => {
    const id = ++seq.current;
    setLoading(true);
    load().then(
      (value) => {
        if (id !== seq.current) return;
        setData(value);
        setError(null);
        setLoading(false);
      },
      (cause) => {
        if (id !== seq.current) return;
        setError(errorText(cause));
        setLoading(false);
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => {
    refetch();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refetch();
    }, pollMs);
    return () => clearInterval(timer);
  }, [refetch, pollMs]);
  useRealtime(CHANGED, refetch);
  return { data, error, loading, refetch };
}

export function useOverview() {
  const rpc = useFactoryRpc();
  return useLiveQuery(() => rpc.call("overview", null), [rpc], 20_000);
}

export function useDetail(id: string) {
  const rpc = useFactoryRpc();
  return useLiveQuery<AirdDetail>(() => rpc.call("aird_detail", { id }), [rpc, id], 10_000);
}

export function useCommits(id: string, enabled: boolean) {
  const rpc = useFactoryRpc();
  const [data, setData] = useState<CommitsResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const refetch = useCallback(() => {
    rpc.call("aird_commits", { id }).then(
      (value) => {
        setData(value);
        setError(null);
      },
      (cause) => setError(errorText(cause)),
    );
  }, [rpc, id]);
  useEffect(() => {
    if (enabled) refetch();
  }, [enabled, refetch]);
  return { data, error, refetch };
}

export type { AirdSummary, ProjectSummary };

// ------------------------------------------------------------ presentation

export const STATUS_LABELS: Record<string, string> = {
  draft: "Черновик",
  discovery: "Discovery",
  ready_for_delivery: "Готов к delivery",
  in_delivery: "Delivery",
  implementation_complete: "Реализация готова",
  verifying: "Верификация",
  ready_for_release: "Готов к релизу",
  complete: "Завершён",
  completed: "Завершён",
  delivered: "Доставлен",
  released: "Выпущен",
  done: "Завершён",
  paused: "Пауза",
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}

export type Tone = "neutral" | "info" | "good" | "warn" | "bad" | "accent";

export const TONE_COLORS: Record<Tone, string> = {
  neutral: "#8b8f98",
  info: "#3b82f6",
  good: "#22a35a",
  warn: "#e0a019",
  bad: "#e5484d",
  accent: "#8b5cf6",
};

export function statusTone(status: string): Tone {
  if (["complete", "completed", "delivered", "released", "done", "ready_for_release"].includes(status)) return "good";
  if (status === "paused") return "warn";
  if (["in_delivery", "implementation_complete", "verifying"].includes(status)) return "info";
  if (status === "discovery" || status === "ready_for_delivery") return "accent";
  return "neutral";
}

export function woStatusTone(status: string): Tone {
  switch (status) {
    case "done":
      return "good";
    case "in_progress":
      return "info";
    case "blocked":
      return "bad";
    case "deferred":
      return "warn";
    case "ready":
      return "accent";
    default:
      return "neutral";
  }
}

export const WO_STATUS_LABELS: Record<string, string> = {
  draft: "черновик",
  ready: "готов",
  in_progress: "в работе",
  done: "сделан",
  blocked: "блок",
  deferred: "отложен",
  unknown: "—",
};

export const GATE_STATUS: Record<GateStatus, { label: string; tone: Tone }> = {
  passed: { label: "Пройден", tone: "good" },
  failed: { label: "Провален", tone: "bad" },
  blocked: { label: "Заблокирован", tone: "warn" },
  evidence: { label: "Есть evidence", tone: "info" },
  pending: { label: "Ожидает", tone: "neutral" },
};

export const STAGE_TONES: Record<StageState, Tone> = {
  done: "good",
  current: "info",
  blocked: "warn",
  todo: "neutral",
};

export function threadTone(status: string): Tone {
  if (["active", "starting", "pending", "stopping"].includes(status)) return "info";
  if (status === "error") return "bad";
  if (status === "deleted") return "neutral";
  return "good";
}

export const THREAD_STATUS_LABELS: Record<string, string> = {
  active: "работает",
  starting: "запускается",
  pending: "в очереди",
  stopping: "останавливается",
  idle: "готов",
  error: "ошибка",
  deleted: "удалён",
};

export function relativeTime(value: string | number | null): string {
  if (value === null || value === "") return "—";
  const time = typeof value === "number" ? value : Date.parse(value);
  if (!Number.isFinite(time)) return String(value);
  const diff = Date.now() - time;
  const minutes = Math.round(diff / 60_000);
  if (minutes < 1) return "только что";
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} дн назад`;
  return new Date(time).toLocaleDateString("ru-RU");
}

const TRANSLIT: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y",
  к: "k", л: "l", м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f",
  х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .split("")
    .map((ch) => TRANSLIT[ch] ?? ch)
    .join("")
    .replace(/[^a-z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .split("-")
    .slice(0, 6)
    .join("-")
    .slice(0, 60);
}

export function shortPath(path: string): string {
  return path.replace(/^\/Users\/[^/]+/u, "~");
}

// ------------------------------------------------------------- agent activity

const RUNNING_THREAD = new Set(["active", "starting", "pending", "stopping"]);

export function isRunningThread(status: string): boolean {
  return RUNNING_THREAD.has(status);
}

export interface Activity {
  running: number;
  total: number;
}

/**
 * Which agent threads belong to which workorder/fix and stage node. Agents
 * carry the ids and stage they were launched for; a running orchestrator
 * belongs to the AIRD's current stage.
 */
export function agentActivity(data: {
  threads: import("../contract").AgentThread[];
  stages: import("../contract").StageNode[];
}): {
  byRef: Map<string, import("../contract").AgentThread[]>;
  byStage: Map<string, import("../contract").AgentThread[]>;
  refActivity: Record<string, Activity>;
  stageActivity: Record<string, Activity>;
} {
  const byRef = new Map<string, import("../contract").AgentThread[]>();
  const byStage = new Map<string, import("../contract").AgentThread[]>();
  const current = data.stages.find((stage) => stage.state === "current" || stage.state === "blocked")?.id ?? null;
  const push = (map: Map<string, import("../contract").AgentThread[]>, key: string, thread: import("../contract").AgentThread) => {
    const list = map.get(key) ?? [];
    list.push(thread);
    map.set(key, list);
  };
  for (const thread of data.threads) {
    if (thread.kind === "agent") {
      for (const ref of thread.refs) push(byRef, ref, thread);
      if (thread.stageNode) push(byStage, thread.stageNode, thread);
    } else if (current && isRunningThread(thread.status)) {
      push(byStage, current, thread);
    }
  }
  const summarize = (map: Map<string, import("../contract").AgentThread[]>) =>
    Object.fromEntries(
      [...map.entries()].map(([key, list]) => [key, { running: list.filter((t) => isRunningThread(t.status)).length, total: list.length }]),
    );
  for (const list of [...byRef.values(), ...byStage.values()]) {
    list.sort((a, b) => Number(isRunningThread(b.status)) - Number(isRunningThread(a.status)) || b.createdAt - a.createdAt);
  }
  return { byRef, byStage, refActivity: summarize(byRef), stageActivity: summarize(byStage) };
}
