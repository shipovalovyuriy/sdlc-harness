// The details panel: clicking any workorder, fix, gate, risk, DoD, blocker,
// finding, stage, artifact, commit or agent thread opens it on the right.
// IDs inside the panel are links, so WO-03 → G-04 → R-05 walks the package;
// Back returns along that path.
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { ThreadChat, useBbNavigate } from "@get-bb/plugin-sdk/app";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { AgentThread, AirdDetail, CommitDetail, DocDetail, RefDetail, StageNode, ThreadDetail } from "../contract";
import {
  GATE_STATUS,
  STAGE_TONES,
  THREAD_STATUS_LABELS,
  WO_STATUS_LABELS,
  agentActivity,
  errorText,
  isRunningThread,
  relativeTime,
  shortPath,
  threadTone,
  useCommits,
  useFactoryRpc,
  woStatusTone,
  type Tone,
} from "./data";
import { GateStatusSelect, LabelToggle } from "./controls";
import { Chip, Dot, EmptyState, ErrorText, MarkdownView, Pill } from "./kit";

export type InspectTarget =
  | { kind: "ref"; ref: string }
  | { kind: "doc"; path: string }
  | { kind: "commit"; sha: string }
  | { kind: "thread"; threadId: string; tab?: "session" | "summary" }
  | { kind: "stage"; stageId: string };

export function targetKey(target: InspectTarget | null): string | null {
  if (!target) return null;
  switch (target.kind) {
    case "ref":
      return `ref:${target.ref}`;
    case "doc":
      return `doc:${target.path}`;
    case "commit":
      return `commit:${target.sha}`;
    case "thread":
      return `thread:${target.threadId}`;
    case "stage":
      return `stage:${target.stageId}`;
  }
}

interface InspectorApi {
  open: (target: InspectTarget) => void;
  current: InspectTarget | null;
}

const InspectorContext = createContext<InspectorApi>({ open: () => undefined, current: null });

export function InspectorProvider({ value, children }: { value: InspectorApi; children: ReactNode }) {
  return <InspectorContext.Provider value={value}>{children}</InspectorContext.Provider>;
}

export function useInspect(): InspectorApi {
  return useContext(InspectorContext);
}

/** The selected id when the panel shows a ref (for highlighting in graphs and tables). */
export function useInspectedRef(): string | null {
  const { current } = useInspect();
  return current?.kind === "ref" ? current.ref : null;
}

const REF_SPLIT = /(\b(?:WO-\d+[A-Za-z]?|F-\d{2,}|G-\d+|R-\d+|DOD-\d+|B-\d+|EC-\d+)\b)/u;
const REF_EXACT = /^(?:WO-\d+[A-Za-z]?|F-\d{2,}|G-\d+|R-\d+|DOD-\d+|B-\d+|EC-\d+)$/u;

export function RefLink({ id, className }: { id: string; className?: string }) {
  const { open, current } = useInspect();
  const active = current?.kind === "ref" && current.ref === id;
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        open({ kind: "ref", ref: id });
      }}
      className={cn(
        "inline-flex cursor-pointer items-center rounded-md border px-1.5 py-0.5 font-mono text-[11px] leading-4 transition-colors",
        active ? "border-foreground/50 bg-state-active text-foreground" : "border-border bg-muted/40 text-muted-foreground hover:border-foreground/40 hover:text-foreground",
        className,
      )}
    >
      {id}
    </button>
  );
}

/** Text with every AIRD id turned into a link. */
export function Linkified({ text, className }: { text: string; className?: string }) {
  const parts = text.split(REF_SPLIT);
  return (
    <span className={className}>
      {parts.map((part, index) =>
        REF_EXACT.test(part) ? (
          <RefLink key={index} id={part} className="mx-0.5 align-baseline" />
        ) : (
          <span key={index}>{part}</span>
        ),
      )}
    </span>
  );
}

function useLoad<T>(load: () => Promise<T>, deps: unknown[]) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  useEffect(() => {
    let alive = true;
    setData(null);
    setError(null);
    load().then(
      (value) => alive && setData(value),
      (cause) => alive && setError(errorText(cause)),
    );
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version]);
  return { data, error, reload: () => setVersion((v) => v + 1) };
}

// ------------------------------------------------------------------ panel

export function InspectorPanel({
  data,
  stack,
  onBack,
  onClose,
  onChanged,
}: {
  data: AirdDetail;
  stack: InspectTarget[];
  onBack: () => void;
  onClose: () => void;
  onChanged: () => void;
}) {
  const target = stack[stack.length - 1]!;
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-11 shrink-0 items-center gap-1 border-b border-border px-2">
        <Button variant="ghost" size="icon" className="size-8" aria-label="Назад" disabled={stack.length < 2} onClick={onBack}>
          <Icon name="ArrowLeft" className="size-4" />
        </Button>
        <div className="flex min-w-0 flex-1 items-center gap-1 overflow-hidden text-xs text-muted-foreground">
          {stack.slice(-4).map((item, index, list) => (
            <span key={`${targetKey(item)}-${index}`} className={cn("truncate", index === list.length - 1 && "font-medium text-foreground")}>
              {index > 0 ? <span className="mx-1 opacity-50">›</span> : null}
              {crumb(item, data)}
            </span>
          ))}
        </div>
        <Button variant="ghost" size="icon" className="size-8" aria-label="Закрыть подробности" onClick={onClose}>
          <Icon name="X" fallback="ClosePluginPane" className="size-4" />
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {target.kind === "ref" ? (
          <RefInspector key={target.ref} data={data} refId={target.ref} onChanged={onChanged} />
        ) : target.kind === "doc" ? (
          <DocInspector key={target.path} data={data} path={target.path} />
        ) : target.kind === "commit" ? (
          <CommitInspector key={target.sha} data={data} sha={target.sha} />
        ) : target.kind === "thread" ? (
          <ThreadInspector key={`${target.threadId}:${target.tab ?? ""}`} data={data} threadId={target.threadId} initialTab={target.tab ?? "session"} />
        ) : (
          <StageInspector key={target.stageId} data={data} stageId={target.stageId} />
        )}
      </div>
    </div>
  );
}

function crumb(target: InspectTarget, data: AirdDetail): string {
  switch (target.kind) {
    case "ref":
      return target.ref;
    case "doc":
      return target.path.split("/").pop() ?? target.path;
    case "commit":
      return target.sha.slice(0, 8);
    case "thread":
      return data.threads.find((t) => t.threadId === target.threadId)?.role ?? "тред";
    case "stage":
      return data.stages.find((s) => s.id === target.stageId)?.label ?? "стадия";
  }
}

function Header({ kind, tone = "neutral", id, title, actions }: { kind: string; tone?: Tone; id?: string; title: string; actions?: ReactNode }) {
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={tone}>{kind}</Pill>
        {id ? <span className="font-mono text-sm font-semibold">{id}</span> : null}
        <div className="ml-auto flex items-center gap-1">{actions}</div>
      </div>
      <h3 className="text-base font-semibold leading-snug">{title}</h3>
    </div>
  );
}

function Block({ title, children, count }: { title: string; children: ReactNode; count?: number }) {
  return (
    <section className="space-y-2">
      <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
        {count !== undefined ? <span className="ml-1 opacity-70">{count}</span> : null}
      </h4>
      {children}
    </section>
  );
}

function Fields({ fields }: { fields: { name: string; value: string }[] }) {
  if (fields.length === 0) return null;
  return (
    <dl className="grid grid-cols-[minmax(90px,auto)_minmax(0,1fr)] gap-x-3 gap-y-1.5 rounded-lg border border-border bg-card/60 p-3 text-xs">
      {fields.map((field, index) => (
        <div key={`${field.name}-${index}`} className="contents">
          <dt className="text-muted-foreground">{field.name}</dt>
          <dd className="min-w-0 whitespace-pre-wrap break-words">
            <Linkified text={field.value.replace(/`/gu, "")} />
          </dd>
        </div>
      ))}
    </dl>
  );
}

function MarkdownBlock({ content }: { content: string }) {
  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-border bg-card/40 px-4 py-3">
      <MarkdownView content={content} />
    </div>
  );
}

function OpenInBb({ data, path }: { data: AirdDetail; path: string }) {
  const navigate = useBbNavigate();
  if (!data.hostId) return null;
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={() =>
        navigate.experimental_openFilePreview({
          target: { kind: "host", hostId: data.hostId!, path: `${data.summary.packagePath}/${path}` },
          location: null,
        })
      }
    >
      <Icon name="ExternalLink" className="size-3.5" />
      Открыть файл
    </Button>
  );
}

function Mentions({ mentions }: { mentions: RefDetail["mentions"] }) {
  const { open } = useInspect();
  const [all, setAll] = useState(false);
  if (mentions.length === 0) return null;
  const shown = all ? mentions : mentions.slice(0, 12);
  return (
    <Block title="Где упоминается" count={mentions.length}>
      <ul className="space-y-1">
        {shown.map((mention, index) => (
          <li key={index} className="rounded-md bg-muted/30 px-2 py-1.5 text-xs">
            <button
              type="button"
              className="mb-0.5 cursor-pointer font-mono text-[11px] text-muted-foreground hover:text-foreground hover:underline"
              onClick={() => open({ kind: "doc", path: mention.file })}
            >
              {mention.file}
            </button>
            <div className="line-clamp-3 break-words">
              <Linkified text={mention.line.replace(/`/gu, "")} />
            </div>
          </li>
        ))}
      </ul>
      {mentions.length > shown.length ? (
        <button type="button" className="cursor-pointer text-xs text-muted-foreground hover:text-foreground" onClick={() => setAll(true)}>
          Показать все ({mentions.length})
        </button>
      ) : null}
    </Block>
  );
}

const KIND_LABELS: Record<RefDetail["kind"], { label: string; tone: Tone }> = {
  workorder: { label: "Воркордер", tone: "info" },
  fix: { label: "Фикс", tone: "bad" },
  gate: { label: "Гейт", tone: "accent" },
  risk: { label: "Риск", tone: "warn" },
  dod: { label: "DoD", tone: "good" },
  "edge-case": { label: "Edge case", tone: "neutral" },
  blocker: { label: "Блокер", tone: "warn" },
  finding: { label: "Находка ревью", tone: "bad" },
  unknown: { label: "Ссылка", tone: "neutral" },
};

/** Agents working (or that worked) on a workorder or a stage, with a way into their session. */
function AgentList({ threads, title }: { threads: AgentThread[]; title: string }) {
  const { open } = useInspect();
  const navigate = useBbNavigate();
  if (threads.length === 0) return null;
  const running = threads.filter((thread) => isRunningThread(thread.status)).length;
  return (
    <Block title={`${title}${running > 0 ? ` · ${running} работают` : ""}`} count={threads.length}>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {threads.map((thread) => {
          const label = thread.title.includes(" · ") ? thread.title.split(" · ").slice(1).join(" · ") : null;
          return (
            <li key={thread.threadId} className="flex flex-wrap items-center gap-2 px-3 py-2 text-xs">
              <Dot tone={threadTone(thread.status)} pulse={isRunningThread(thread.status)} />
              <span className="font-mono font-semibold">{thread.role}</span>
              {label ? <span className="text-muted-foreground">{label}</span> : null}
              <span className="text-muted-foreground">{THREAD_STATUS_LABELS[thread.status] ?? thread.status}</span>
              {thread.model ? <Chip mono>{thread.model}</Chip> : null}
              <span className="ml-auto flex items-center gap-1">
                <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => open({ kind: "thread", threadId: thread.threadId, tab: "session" })}>
                  <Icon name="MessageSquare" className="size-3.5" />
                  Сессия
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  disabled={thread.status === "deleted"}
                  onClick={() => navigate.toThread(thread.threadId, { split: true })}
                >
                  <Icon name="ExternalLink" className="size-3.5" />
                </Button>
              </span>
            </li>
          );
        })}
      </ul>
    </Block>
  );
}

function RefInspector({ data, refId, onChanged }: { data: AirdDetail; refId: string; onChanged: () => void }) {
  const rpc = useFactoryRpc();
  const { open } = useInspect();
  const { data: detail, error } = useLoad(() => rpc.call("aird_lookup", { id: data.summary.id, ref: refId }), [rpc, data.summary.id, refId]);
  const isCommitRef = /^(WO|F)-/u.test(refId);
  const { data: commits } = useCommits(data.summary.id, isCommitRef);
  if (error) return <ErrorText>{error}</ErrorText>;
  if (!detail) return <EmptyState icon="Loading">Загружаю {refId}…</EmptyState>;

  const wo = data.workorders.find((item) => item.id === refId) ?? null;
  const fix = data.fixes.find((item) => item.id === refId) ?? null;
  const gate = data.gates.find((item) => item.id === refId) ?? null;
  const meta = KIND_LABELS[detail.kind];
  const refCommits = (commits?.commits ?? []).filter((commit) => commit.refs.includes(refId));

  return (
    <div className="space-y-4">
      <Header kind={meta.label} tone={meta.tone} id={refId} title={detail.title} actions={detail.file ? <OpenInBb data={data} path={detail.file} /> : null} />

      {wo || fix || gate ? (
        <div className="flex flex-wrap items-center gap-2">
          {wo ? (
            <>
              <Pill tone={woStatusTone(wo.status)}>{WO_STATUS_LABELS[wo.status] ?? wo.status}</Pill>
              {wo.wave !== "none" ? <Chip>{wo.wave}</Chip> : null}
              {wo.surface ? <Chip>{wo.surface}</Chip> : null}
              {wo.agent ? <Chip mono>{wo.agent}</Chip> : null}
              <LabelToggle item={wo} airdId={data.summary.id} onChanged={onChanged} />
            </>
          ) : null}
          {fix ? (
            <>
              <Pill tone={fix.closed === true ? "good" : fix.closed === false ? "bad" : "neutral"}>
                {fix.closed === true ? "закрыт" : fix.closed === false ? "открыт" : "статус неизвестен"}
              </Pill>
              {fix.severity ? <Chip>severity: {fix.severity}</Chip> : null}
              {fix.findingClass ? <Chip>class: {fix.findingClass}</Chip> : null}
              <LabelToggle item={fix} airdId={data.summary.id} onChanged={onChanged} />
            </>
          ) : null}
          {gate ? (
            <>
              <Pill tone={GATE_STATUS[gate.status].tone}>
                {GATE_STATUS[gate.status].label}
                {gate.statusSource === "user" ? " ✎" : ""}
              </Pill>
              <GateStatusSelect airdId={data.summary.id} gate={gate} onChanged={onChanged} />
            </>
          ) : null}
        </div>
      ) : null}

      <AgentList threads={agentActivity(data).byRef.get(refId) ?? []} title="Агенты на этой задаче" />

      <Fields fields={detail.fields} />

      {detail.related.length > 0 ? (
        <Block title="Связано" count={detail.related.length}>
          <div className="flex flex-wrap gap-1">
            {detail.related.map((id) => (
              <RefLink key={id} id={id} />
            ))}
          </div>
        </Block>
      ) : null}

      {gate && gate.mentions.length > 0 ? (
        <Block title="Отчёты верификации" count={gate.mentions.length}>
          <ul className="space-y-1">
            {gate.mentions.map((mention, index) => (
              <li key={index} className="rounded-md bg-muted/30 px-2 py-1.5 text-xs">
                <Linkified text={mention.replace(/`/gu, "")} />
              </li>
            ))}
          </ul>
        </Block>
      ) : null}

      {isCommitRef && refCommits.length > 0 ? (
        <Block title="Коммиты" count={refCommits.length}>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {refCommits.map((commit) => (
              <li key={commit.sha}>
                <button
                  type="button"
                  onClick={() => open({ kind: "commit", sha: commit.sha })}
                  className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-xs hover:bg-state-hover"
                >
                  <span className="font-mono text-muted-foreground">{commit.short}</span>
                  <span className="min-w-0 flex-1 truncate">{commit.subject}</span>
                  <span className="shrink-0 text-muted-foreground">{relativeTime(commit.date)}</span>
                </button>
              </li>
            ))}
          </ul>
        </Block>
      ) : null}

      {detail.markdown ? (
        <Block title={detail.file ?? "Описание"}>
          <MarkdownBlock content={detail.markdown} />
        </Block>
      ) : null}

      <Mentions mentions={detail.mentions} />
    </div>
  );
}

function DocInspector({ data, path, embedded = false }: { data: AirdDetail; path: string; embedded?: boolean }) {
  const rpc = useFactoryRpc();
  const { data: doc, error } = useLoad<DocDetail>(() => rpc.call("aird_doc", { id: data.summary.id, path }), [rpc, data.summary.id, path]);
  if (error) return <ErrorText>{error}</ErrorText>;
  if (!doc) return <EmptyState icon="Loading">Открываю {path}…</EmptyState>;
  return (
    <div className="space-y-4">
      {embedded ? null : <Header kind="Документ" id={doc.path} title={shortPath(`${data.summary.packagePath}/${doc.path}`)} actions={<OpenInBb data={data} path={doc.path} />} />}
      <Fields fields={doc.fields} />
      <MarkdownBlock content={doc.markdown || "_Пусто_"} />
      {doc.truncated ? <p className="text-xs text-muted-foreground">Документ обрезан — полностью он открывается кнопкой «Открыть файл».</p> : null}
    </div>
  );
}

function PatchView({ patch }: { patch: string }) {
  const lines = patch.split("\n");
  const shown = lines.slice(0, 4000);
  return (
    <div className="max-h-[60vh] overflow-auto rounded-lg border border-border bg-card/40 font-mono text-[11px] leading-[1.45]">
      {shown.map((line, index) => {
        const cls = line.startsWith("diff --git")
          ? "mt-2 border-t border-border bg-muted/50 px-3 py-1 font-semibold text-foreground first:mt-0 first:border-t-0"
          : line.startsWith("@@")
            ? "bg-muted/30 px-3 text-muted-foreground"
            : line.startsWith("+") && !line.startsWith("+++")
              ? "px-3"
              : line.startsWith("-") && !line.startsWith("---")
                ? "px-3"
                : "px-3 text-muted-foreground";
        const color = line.startsWith("+") && !line.startsWith("+++") ? "#22a35a" : line.startsWith("-") && !line.startsWith("---") ? "#e5484d" : undefined;
        return (
          <div key={index} className={cn("whitespace-pre", cls)} style={color ? { color, backgroundColor: `${color}14` } : undefined}>
            {line || " "}
          </div>
        );
      })}
      {lines.length > shown.length ? <div className="px-3 py-2 text-muted-foreground">… ещё {lines.length - shown.length} строк</div> : null}
    </div>
  );
}

function CommitInspector({ data, sha }: { data: AirdDetail; sha: string }) {
  const rpc = useFactoryRpc();
  const { data: commit, error } = useLoad<CommitDetail>(() => rpc.call("aird_commit", { id: data.summary.id, sha }), [rpc, data.summary.id, sha]);
  if (error) return <ErrorText>{error}</ErrorText>;
  if (!commit) return <EmptyState icon="Loading">Читаю коммит…</EmptyState>;
  if (commit.error) return <ErrorText>{commit.error}</ErrorText>;
  const additions = commit.files.reduce((sum, file) => sum + (file.additions ?? 0), 0);
  const deletions = commit.files.reduce((sum, file) => sum + (file.deletions ?? 0), 0);
  return (
    <div className="space-y-4">
      <Header kind="Коммит" id={commit.short} title={commit.subject} />
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>{commit.author}</span>
        <span>· {relativeTime(commit.date)}</span>
        <span className="font-mono">· {commit.sha}</span>
      </div>
      {commit.refs.length > 0 ? (
        <div className="flex flex-wrap gap-1">
          {commit.refs.map((ref) => (
            <RefLink key={ref} id={ref} />
          ))}
        </div>
      ) : null}
      {commit.body ? (
        <div className="whitespace-pre-wrap rounded-lg border border-border bg-card/40 px-3 py-2 text-sm">
          <Linkified text={commit.body} />
        </div>
      ) : null}
      <Block title="Файлы" count={commit.files.length}>
        <div className="flex items-center gap-2 text-xs">
          <span style={{ color: "#22a35a" }}>+{additions}</span>
          <span style={{ color: "#e5484d" }}>−{deletions}</span>
        </div>
        <ul className="max-h-56 overflow-y-auto rounded-lg border border-border text-xs">
          {commit.files.map((file) => (
            <li key={file.path} className="flex items-center gap-2 border-b border-border px-3 py-1 last:border-b-0">
              <span className="min-w-0 flex-1 truncate font-mono">{file.path}</span>
              <span style={{ color: "#22a35a" }}>{file.additions === null ? "bin" : `+${file.additions}`}</span>
              <span style={{ color: "#e5484d" }}>{file.deletions === null ? "" : `−${file.deletions}`}</span>
            </li>
          ))}
        </ul>
      </Block>
      <Block title="Изменения">
        <PatchView patch={commit.patch} />
        {commit.truncated ? <p className="text-xs text-muted-foreground">Diff обрезан.</p> : null}
      </Block>
    </div>
  );
}

function ThreadInspector({ data, threadId, initialTab }: { data: AirdDetail; threadId: string; initialTab: "session" | "summary" }) {
  const [tab, setTab] = useState<"session" | "summary">(initialTab);
  const thread = data.threads.find((item) => item.threadId === threadId) ?? null;
  const navigate = useBbNavigate();
  return (
    <div className="flex min-h-full flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={thread?.kind === "orchestrator" ? "accent" : "info"}>{thread?.kind === "orchestrator" ? "Оркестратор" : "Агент"}</Pill>
        <span className="font-mono text-sm font-semibold">{thread?.role ?? threadId}</span>
        <Dot tone={threadTone(thread?.status ?? "deleted")} pulse={isRunningThread(thread?.status ?? "")} />
        <span className="text-xs text-muted-foreground">{THREAD_STATUS_LABELS[thread?.status ?? "deleted"] ?? thread?.status}</span>
        <div className="ml-auto flex items-center gap-1">
          <div className="inline-flex rounded-md border border-border bg-muted/30 p-0.5 text-xs">
            {(["session", "summary"] as const).map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setTab(value)}
                className={cn("cursor-pointer rounded px-2 py-0.5", tab === value ? "bg-background font-medium shadow-sm" : "text-muted-foreground hover:text-foreground")}
              >
                {value === "session" ? "Сессия" : "Сводка"}
              </button>
            ))}
          </div>
          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={thread?.status === "deleted"} onClick={() => navigate.toThread(threadId, { split: true })}>
            <Icon name="ExternalLink" className="size-3.5" />
            В отдельной панели
          </Button>
        </div>
      </div>
      {tab === "session" ? (
        thread?.status === "deleted" ? (
          <p className="text-sm text-muted-foreground">Тред удалён.</p>
        ) : (
          <div className="h-[calc(100vh-11rem)] min-h-[420px] overflow-hidden rounded-lg border border-border">
            <ThreadChat threadId={threadId} variant="compact" />
          </div>
        )
      ) : (
        <ThreadSummary data={data} threadId={threadId} />
      )}
    </div>
  );
}

function ThreadSummary({ data, threadId }: { data: AirdDetail; threadId: string }) {
  const rpc = useFactoryRpc();
  const navigate = useBbNavigate();
  const { open } = useInspect();
  const thread = data.threads.find((item) => item.threadId === threadId) ?? null;
  const { data: detail, error } = useLoad<ThreadDetail>(() => rpc.call("aird_thread", { id: data.summary.id, threadId }), [rpc, data.summary.id, threadId]);
  const children = data.threads.filter((item) => item.parentThreadId === threadId);
  const status = detail?.status ?? thread?.status ?? "deleted";
  return (
    <div className="space-y-4">
      <Header
        kind={thread?.kind === "orchestrator" ? "Оркестратор" : "Агент"}
        tone={thread?.kind === "orchestrator" ? "accent" : "info"}
        id={thread?.role}
        title={thread?.title ?? threadId}
        actions={
          <Button variant="ghost" size="sm" disabled={status === "deleted"} onClick={() => navigate.toThread(threadId)}>
            <Icon name="ExternalLink" className="size-3.5" />
            Открыть тред
          </Button>
        }
      />
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={threadTone(status)}>{THREAD_STATUS_LABELS[status] ?? status}</Pill>
        {thread?.provider ? <Chip>{thread.provider}</Chip> : null}
        {thread?.model ? <Chip mono>{thread.model}</Chip> : <Chip>модель по умолчанию</Chip>}
        {thread?.effort ? <Chip>effort: {thread.effort}</Chip> : null}
        {thread ? <span className="text-xs text-muted-foreground">запущен {relativeTime(thread.createdAt)}</span> : null}
      </div>
      {thread && (thread.refs.length > 0 || thread.stageNode) ? (
        <div className="flex flex-wrap items-center gap-1 text-xs">
          <span className="text-muted-foreground">Работает над:</span>
          {thread.refs.map((ref) => (
            <RefLink key={ref} id={ref} />
          ))}
          {thread.stageNode ? (
            <button type="button" onClick={() => open({ kind: "stage", stageId: thread.stageNode! })} className="cursor-pointer rounded-md border border-border px-1.5 py-0.5 text-[11px] text-muted-foreground hover:text-foreground">
              стадия: {data.stages.find((stage) => stage.id === thread.stageNode)?.label ?? thread.stageNode}
            </button>
          ) : null}
        </div>
      ) : null}
      {thread?.task ? (
        <Block title="Бриф от оркестратора">
          <div className="max-h-48 overflow-y-auto whitespace-pre-wrap rounded-lg border border-border bg-card/40 px-3 py-2 text-xs">
            <Linkified text={thread.task} />
          </div>
        </Block>
      ) : null}
      {detail?.role ? (
        <Block title="Роль">
          <div className="space-y-2 rounded-lg border border-border bg-card/60 p-3 text-xs">
            <p className="text-muted-foreground">{detail.role.description}</p>
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-muted-foreground">В определении роли:</span>
              <Chip mono>{detail.role.model ?? "—"}</Chip>
              <Chip>effort: {detail.role.effort ?? "—"}</Chip>
            </div>
            {detail.role.skills.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-muted-foreground">Скиллы:</span>
                {detail.role.skills.map((skill) => (
                  <Chip key={skill} mono>
                    /{skill}
                  </Chip>
                ))}
              </div>
            ) : null}
            {detail.role.tools.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-muted-foreground">Инструменты:</span>
                {detail.role.tools.map((tool) => (
                  <Chip key={tool}>{tool}</Chip>
                ))}
              </div>
            ) : null}
          </div>
        </Block>
      ) : null}
      {children.length > 0 ? (
        <Block title="Агенты этого оркестратора" count={children.length}>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {children.map((child) => (
              <li key={child.threadId}>
                <button
                  type="button"
                  onClick={() => open({ kind: "thread", threadId: child.threadId })}
                  className="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-xs hover:bg-state-hover"
                >
                  <Dot tone={threadTone(child.status)} pulse={["active", "starting", "pending"].includes(child.status)} />
                  <span className="font-mono font-semibold">{child.role}</span>
                  <span className="min-w-0 flex-1 truncate text-muted-foreground">{child.title.includes(" · ") ? child.title.split(" · ").slice(1).join(" · ") : ""}</span>
                  <span className="text-muted-foreground">{THREAD_STATUS_LABELS[child.status] ?? child.status}</span>
                </button>
              </li>
            ))}
          </ul>
        </Block>
      ) : null}
      <ErrorText>{error}</ErrorText>
      <Block title="Последний ответ">
        {detail === null && !error ? (
          <EmptyState icon="Loading">Загружаю…</EmptyState>
        ) : detail?.output ? (
          <MarkdownBlock content={detail.output} />
        ) : (
          <p className="text-sm text-muted-foreground">Ответа пока нет.</p>
        )}
      </Block>
    </div>
  );
}

const STAGE_INFO: Record<string, { text: string; files: string[] }> = {
  intake: { text: "Приём задачи: цель, пользователи, ограничения и профиль discovery (lite / standard / deep).", files: ["00-intake.md", "STATE.md"] },
  discussion: { text: "Обсуждение: решения фиксируются по одному вопросу, с вариантами и рекомендацией.", files: ["00-discussion-log.md"] },
  recon: { text: "Разведка текущего кода, окружения и рантайма.", files: ["codemap.md"] },
  probe: { text: "Existential probe: несущие внешние предположения проверяются на реальном пути до проектирования.", files: ["03-risk-register.md"] },
  product: { text: "PRD и UX-рамка: ценность, сценарии, edge cases, критерии приёмки.", files: ["01-prd.md", "02-ux-problem-framing.md", "02-ui-spec.md"] },
  prototype: { text: "Минимальный прототип интерфейса на моковых данных.", files: ["02-ui-prototype.md"] },
  risks: { text: "Реестр рисков, митигации и проверки.", files: ["03-risk-register.md"] },
  trd: { text: "Технический дизайн, контракты API и модели данных.", files: ["04-trd.md", "05-api-contracts.md", "06-data-models.md"] },
  plan: { text: "План реализации: волны, воркордеры, гейты качества и Definition of Done.", files: ["07-implementation-plan.md", "08-quality-gates.md", "09-dod.md"] },
  review: { text: "Финальное совмещённое ревью пакета и принятие волны.", files: ["DISCOVERY-SUMMARY.md", "REVIEW-MANIFEST.json"] },
  accepted: { text: "Волна принята: пакет готов к delivery.", files: ["REVIEW-MANIFEST.json", "07-implementation-plan.md"] },
  implemented: { text: "Все обязательные воркордеры реализованы; доказательства релиза ещё собираются.", files: ["10-backend-verification.md", "STATE.md"] },
  verifying: { text: "Runtime-, браузерные и релизные проверки.", files: ["10-backend-verification.md", "10-ui-verification.md"] },
  release: { text: "Все обязательные гейты пройдены с доказательствами.", files: ["08-quality-gates.md", "09-dod.md"] },
  complete: { text: "Delivery закрыт.", files: ["STATE.md", "DISCOVERY-SUMMARY.md"] },
};

const STAGE_STATE_LABELS: Record<StageNode["state"], string> = {
  done: "пройдена",
  current: "текущая",
  blocked: "на паузе",
  todo: "впереди",
};

function StageInspector({ data, stageId }: { data: AirdDetail; stageId: string }) {
  const { open } = useInspect();
  const stage = data.stages.find((item) => item.id === stageId);
  const [doc, setDoc] = useState<string | null>(null);
  const isWave = stageId.startsWith("wave-");
  const wave = isWave ? stageId.slice(5) : null;
  const info = isWave
    ? { text: wave === "*" ? "Реализация воркордеров пакета." : `Реализация воркордеров волны ${wave}.`, files: ["07-implementation-plan.md", "STATE.md"] }
    : (STAGE_INFO[stageId] ?? { text: "", files: [] });
  const existing = new Set(data.artifacts.filter((a) => a.exists).map((a) => a.name));
  const files = info.files.filter((file) => existing.has(file) || file === "STATE.md" || file === "REVIEW-MANIFEST.json");
  const shownDoc = doc ?? files.find((file) => file.endsWith(".md")) ?? null;
  const pickDoc = useCallback((file: string) => setDoc(file), []);
  if (!stage) return <ErrorText>Стадия не найдена</ErrorText>;
  const items = isWave ? data.workorders.filter((wo) => wave === "*" || wo.wave === wave) : [];
  return (
    <div className="space-y-4">
      <Header kind={stage.lane === "discovery" ? "Discovery" : "Delivery"} tone={STAGE_TONES[stage.state]} title={stage.label} />
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={STAGE_TONES[stage.state]}>{STAGE_STATE_LABELS[stage.state]}</Pill>
        {stage.detail ? <Chip>{stage.detail}</Chip> : null}
        {data.summary.activePhase && (stage.state === "current" || stage.state === "blocked") ? <Chip>фаза: {data.summary.activePhase}</Chip> : null}
      </div>
      {info.text ? <p className="text-sm text-muted-foreground">{info.text}</p> : null}
      <AgentList threads={agentActivity(data).byStage.get(stageId) ?? []} title="Агенты на стадии" />
      {items.length > 0 ? (
        <Block title="Воркордеры" count={items.length}>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {items.map((wo) => (
              <li key={wo.id}>
                <button
                  type="button"
                  onClick={() => open({ kind: "ref", ref: wo.id })}
                  className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-state-hover"
                >
                  <Dot tone={woStatusTone(wo.status)} />
                  <span className="font-mono font-semibold">{wo.id}</span>
                  <span className="min-w-0 flex-1 truncate">{wo.title}</span>
                  {wo.label === "bug" ? <Pill tone="bad">баг</Pill> : null}
                  {(agentActivity(data).refActivity[wo.id]?.running ?? 0) > 0 ? (
                    <span className="inline-flex items-center gap-1 text-[11px]">
                      <Dot tone="info" pulse />
                      {agentActivity(data).refActivity[wo.id]!.running}
                    </span>
                  ) : null}
                  <span className="text-muted-foreground">{WO_STATUS_LABELS[wo.status] ?? wo.status}</span>
                </button>
              </li>
            ))}
          </ul>
        </Block>
      ) : null}
      {files.length > 0 ? (
        <Block title="Документы стадии">
          <div className="flex flex-wrap gap-1.5">
            {files.map((file) => (
              <button
                key={file}
                type="button"
                onClick={() => (file.endsWith(".md") ? pickDoc(file) : open({ kind: "doc", path: file }))}
                className={cn(
                  "cursor-pointer rounded-md border px-2 py-1 font-mono text-[11px]",
                  file === shownDoc ? "border-foreground/50 bg-state-active" : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {file}
              </button>
            ))}
          </div>
          {shownDoc ? <DocInspector key={shownDoc} data={data} path={shownDoc} embedded /> : null}
        </Block>
      ) : null}
    </div>
  );
}
