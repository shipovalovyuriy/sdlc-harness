import { PROFILE_DESCRIPTIONS } from "../process-policy";
// One AIRD: stage track, workorders (DAG + bug/not-bug marking), gates,
// agent threads and commits. Clicking anything opens the details panel.
import { useCallback, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useBbNavigate } from "@get-bb/plugin-sdk/app";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { AgentThread, AirdDetail, Gate, GateStatus, ValidationResult } from "../contract";
import {
  GATE_STATUS,
  THREAD_STATUS_LABELS,
  WO_STATUS_LABELS,
  errorText,
  formatTokens,
  sinceText,
  TONE_COLORS,
  HEAVY_AGENT_TOKENS,
  relativeTime,
  shortPath,
  statusLabel,
  statusTone,
  threadTone,
  agentActivity,
  isRunningThread,
  useCommits,
  useDetail,
  useFactoryRpc,
  woStatusTone,
} from "./data";
import { GateStatusSelect, LabelToggle } from "./controls";
import { GateGraph, StageGraph, WorkorderGraph, WorkorderMindMap } from "./graphs";
import {
  InspectorPanel,
  InspectorProvider,
  Linkified,
  RefLink,
  targetKey,
  useInspect,
  useInspectedRef,
  type InspectTarget,
} from "./inspector";
import { Chip, Dot, EmptyState, ErrorText, Pill, Segmented, SplitBar, Stat, Tabs, TextArea } from "./kit";
import { MaterialsSection } from "./materials";
import { SecretsDialog, useProjectSecrets } from "./secrets-dialog";
import { AcceptanceTab } from "./acceptance";
import { AirdMetricsSection } from "./metrics";
import { QuestionsInbox, useQuestions } from "./questions";

export type DetailTab = "overview" | "questions" | "workorders" | "acceptance" | "gates" | "agents" | "commits";

export function DetailView({
  id,
  tab,
  onTab,
  onBack,
  onAgents,
  onMetrics,
}: {
  id: string;
  tab: DetailTab;
  onTab: (tab: DetailTab) => void;
  onBack: () => void;
  onAgents: () => void;
  onMetrics: (runKey?: string) => void;
}) {
  const { data, error, loading, refetch } = useDetail(id);
  const [stack, setStack] = useState<InspectTarget[]>([]);
  const open = useCallback((target: InspectTarget) => {
    setStack((current) => {
      if (targetKey(current[current.length - 1] ?? null) === targetKey(target)) return current;
      return [...current, target].slice(-30);
    });
  }, []);
  const inspector = useMemo(() => ({ open, current: stack[stack.length - 1] ?? null }), [open, stack]);
  const close = useCallback(() => setStack([]), []);

  if (data === null) {
    return (
      <div className="h-full min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-6xl space-y-4 p-6">
          <BackButton onBack={onBack} />
          {error ? <ErrorText>{error}</ErrorText> : <EmptyState icon="Loading">Читаю пакет…</EmptyState>}
        </div>
      </div>
    );
  }

  return (
    <InspectorProvider value={inspector}>
      <div className="relative flex h-full min-h-0 flex-1">
        <div className="min-w-0 flex-1 overflow-y-auto">
          <DetailBody data={data} tab={tab} onTab={onTab} onBack={onBack} onAgents={onAgents} onMetrics={onMetrics} loading={loading} refetch={refetch} />
        </div>
        {stack.length > 0 ? (
          <aside className="absolute inset-0 z-20 flex flex-col bg-background md:static md:z-auto md:w-[min(48%,660px)] md:shrink-0 md:border-l md:border-border">
            <InspectorPanel
              data={data}
              stack={stack}
              onBack={() => setStack((current) => current.slice(0, -1))}
              onClose={close}
              onChanged={refetch}
            />
          </aside>
        ) : null}
      </div>
    </InspectorProvider>
  );
}

function DetailBody({
  data,
  tab,
  onTab,
  onBack,
  onAgents,
  onMetrics,
  loading,
  refetch,
}: {
  data: AirdDetail;
  tab: DetailTab;
  onTab: (tab: DetailTab) => void;
  onBack: () => void;
  onAgents: () => void;
  onMetrics: (runKey?: string) => void;
  loading: boolean;
  refetch: () => void;
}) {
  const rpc = useFactoryRpc();
  const navigate = useBbNavigate();
  const [launch, setLaunch] = useState<"discovery" | "delivery" | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [validating, setValidating] = useState(false);
  const s = data.summary;
  const id = s.id;
  const { questions: airdQuestions } = useQuestions(id, false);
  const openQuestions = (airdQuestions ?? []).filter((question) => question.status === "open").length;
  const inspector = useInspect();
  const orchestrators = data.threads.filter((t) => t.kind === "orchestrator");
  const latestOrchestrator = [...orchestrators].sort((a, b) => b.createdAt - a.createdAt)[0] ?? null;
  const run = async (action: () => Promise<unknown>) => {
    setActionError(null);
    try {
      await action();
      refetch();
    } catch (cause) {
      setActionError(errorText(cause));
    }
  };

  return (
    <div className="@container mx-auto w-full max-w-6xl space-y-4 px-4 py-4 md:px-6 md:py-5">
      <BackButton onBack={onBack} />

      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-semibold">{s.title}</h2>
            <Pill tone={statusTone(s.status)}>{statusLabel(s.status)}</Pill>
            {data.now?.working ? <NowChip now={data.now} /> : null}
            {s.profile ? <span title={PROFILE_DESCRIPTIONS[s.profile] ?? s.profile}><Chip>{s.profile}</Chip></span> : null}
            {s.archived ? <Chip>в архиве</Chip> : null}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            <span className="font-mono">{s.slug}</span>
            <span className="inline-flex items-center gap-1">
              <Icon name="Folder" className="size-3.5" />
              {shortPath(s.folder)}
            </span>
            <span className="inline-flex items-center gap-1">
              <Icon name="GitBranch" className="size-3.5" />
              {s.branch ?? `aird/${s.slug}`}
            </span>
            {data.deliveryReposReady ? (
              <span className="inline-flex items-center gap-1" title={s.worktreeNote ?? "Копия рабочего пространства: worktree для изменяемых репозиториев, остальное — ссылки"}>
                <Icon name="FolderGit" fallback="Folder" className="size-3.5" />
                клон {data.deliveryRepos.join(", ")}
              </span>
            ) : data.deliveryRepos.length > 0 ? (
              <span className="inline-flex items-center gap-1" title={s.worktreeNote ?? undefined}>
                <Icon name="FolderGit" fallback="Folder" className="size-3.5" />
                клон {data.deliveryRepos.join(", ")} — при запуске delivery
              </span>
            ) : s.worktree ? (
              <span className="inline-flex items-center gap-1" title="Отдельная git worktree этого AIRD">
                <Icon name="FolderGit" fallback="Folder" className="size-3.5" />
                worktree {shortPath(s.worktree)}
              </span>
            ) : s.worktreeNote ? (
              <span className="inline-flex items-center gap-1" style={{ color: "#e0a019" }} title={s.worktreeNote}>
                <Icon name="AlertTriangle" fallback="Info" className="size-3.5" />
                без worktree
              </span>
            ) : (
              <span className="inline-flex items-center gap-1" title="Рабочая копия AIRD создаётся при первом запуске discovery или delivery">
                <Icon name="FolderGit" fallback="Folder" className="size-3.5" />
                клон при запуске
              </span>
            )}
            <span>обновлён {relativeTime(s.updatedAt ?? s.createdAt)}</span>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="icon" aria-label="Обновить" onClick={refetch} disabled={loading}>
            <Icon name="ArrowReloadHorizontal" className={cn("size-4", loading && "animate-spin")} />
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={validating || !s.exists}
            onClick={async () => {
              setValidating(true);
              try {
                setValidation(await rpc.call("aird_validate", { id }));
              } catch (cause) {
                setActionError(errorText(cause));
              } finally {
                setValidating(false);
              }
            }}
          >
            <Icon name="SecurityCheck" fallback="Check" className="size-4" />
            {validating ? "Проверяю…" : "Проверить пакет"}
          </Button>
          {latestOrchestrator ? (
            <Button variant="outline" size="sm" onClick={() => run(() => rpc.call("aird_continue", { id, threadId: latestOrchestrator.threadId }))}>
              <Icon name="Play" className="size-4" />
              Продолжить
            </Button>
          ) : null}
          <Button variant="outline" size="sm" onClick={() => setLaunch("discovery")}>
            <Icon name="Search" className="size-4" />
            Discovery
          </Button>
          <Button size="sm" onClick={() => setLaunch("delivery")} disabled={!s.exists}>
            <Icon name="ToolCase" fallback="Play" className="size-4" />
            Delivery
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={s.archived ? "Вернуть из архива" : "В архив"}
            onClick={() => run(() => rpc.call("aird_archive", { id, archived: !s.archived }))}
          >
            <Icon name={s.archived ? "ArchiveRestore" : "Archive"} fallback="Archive" className="size-4" />
          </Button>
        </div>
      </header>

      <ErrorText>{actionError}</ErrorText>
      {validation ? <ValidationPanel result={validation} onClose={() => setValidation(null)} /> : null}

      <Tabs<DetailTab>
        value={tab}
        onChange={onTab}
        items={[
          { value: "overview", label: "Обзор", icon: "GridView" },
          { value: "questions", label: "Вопросы", icon: "MessageQuestion", ...(openQuestions > 0 ? { count: openQuestions } : {}) },
          { value: "workorders", label: "Воркордеры", count: data.workorders.length + data.fixes.length, icon: "ListTodo" },
          { value: "acceptance", label: "Приёмка", icon: "Target" },
          { value: "gates", label: "Гейты", count: data.gates.length, icon: "SecurityCheck" },
          { value: "agents", label: "Агенты", count: data.threads.length, icon: "Bot" },
          { value: "commits", label: "Коммиты", icon: "GitMerge" },
        ]}
      />

      {openQuestions > 0 && tab !== "questions" ? (
        <button
          type="button"
          onClick={() => onTab("questions")}
          className="flex w-full cursor-pointer items-center gap-2 rounded-xl border px-4 py-2.5 text-left text-sm"
          style={{ borderColor: "#e0a01966", backgroundColor: "#e0a0190d" }}
        >
          <Icon name="MessageQuestion" fallback="CircleQuestion" className="size-4" style={{ color: "#e0a019" }} />
          <span className="font-medium">Агенты ждут ответа: {openQuestions}</span>
          <span className="ml-auto text-xs text-muted-foreground">Открыть вопросы →</span>
        </button>
      ) : null}

      {tab === "questions" ? (
        <QuestionsInbox
          airdId={id}
          showAird={false}
          onOpenSession={(threadId) =>
            data.threads.some((thread) => thread.threadId === threadId)
              ? inspector.open({ kind: "thread", threadId, tab: "session" })
              : navigate.toThread(threadId, { split: true })
          }
          emptyHint="Агенты этого AIRD ничего не ждут от тебя."
        />
      ) : tab === "overview" ? (
        <OverviewTab data={data} onTab={onTab} onMetrics={onMetrics} />
      ) : tab === "workorders" ? (
        <WorkordersTab data={data} onChanged={refetch} />
      ) : tab === "acceptance" ? (
        <AcceptanceTab data={data} />
      ) : tab === "gates" ? (
        <GatesTab data={data} onChanged={refetch} />
      ) : tab === "agents" ? (
        <AgentsTab data={data} onLaunch={setLaunch} onAgents={onAgents} />
      ) : (
        <CommitsTab data={data} />
      )}

      <LaunchDialog
        stage={launch}
        data={data}
        onClose={() => setLaunch(null)}
        onLaunched={(threadId) => {
          setLaunch(null);
          refetch();
          navigate.toThread(threadId);
        }}
      />
    </div>
  );
}

function BackButton({ onBack }: { onBack: () => void }) {
  return (
    <button type="button" onClick={onBack} className="inline-flex cursor-pointer items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <Icon name="ArrowLeft" className="size-4" />
      Все AIRD
    </button>
  );
}

/**
 * What is going on right now, in one line next to the status. A thread whose
 * turn ended can still be working in the background (a long test run, a wait
 * for other threads); the hover shows every item and the orchestrator's last
 * message, a click opens the thread.
 */
function NowChip({ now }: { now: NonNullable<AirdDetail["now"]> }) {
  const { open } = useInspect();
  const first = now.items[0]!;
  const label = first.kind === "background" ? `в фоне: ${first.text}` : `${first.title}${first.text !== "работает" ? ` — ${first.text}` : ""}`;
  const details = [
    ...now.items.map((item) => `${item.title} · ${item.kind === "background" ? "в фоне" : "работает"}: ${item.text}${item.since ? ` · ${sinceText(item.since)}` : ""}`),
    ...(now.orchestrator?.message ? ["", `Оркестратор${now.orchestrator.at ? `, ${sinceText(now.orchestrator.at)} назад` : ""}: ${now.orchestrator.message}`] : []),
  ].join("\n");
  return (
    <button
      type="button"
      title={details}
      onClick={() => open({ kind: "thread", threadId: first.threadId })}
      className="inline-flex max-w-[28rem] cursor-pointer items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs hover:bg-state-hover"
      style={{ borderColor: `${TONE_COLORS.info}55`, color: TONE_COLORS.info }}
    >
      <Dot tone="info" pulse />
      <span className="truncate">{label}</span>
      {first.since ? <span className="shrink-0 opacity-70">{sinceText(first.since)}</span> : null}
      {now.items.length > 1 ? <span className="shrink-0 opacity-70">+{now.items.length - 1}</span> : null}
    </button>
  );
}

function Section({ title, children, actions }: { title: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <section className="space-y-2.5 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {actions}
      </div>
      {children}
    </section>
  );
}

function Clickable({ onClick, children, className, active = false }: { onClick: () => void; children: ReactNode; className?: string; active?: boolean }) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onClick();
        }
      }}
      className={cn("cursor-pointer rounded-md transition-colors hover:bg-state-hover", active && "bg-state-active", className)}
    >
      {children}
    </div>
  );
}

// --------------------------------------------------------------- overview

function readinessTone(value: string | null) {
  if (value === "ready" || value === "not_required") return "good" as const;
  if (value === "blocked") return "warn" as const;
  return "neutral" as const;
}

function OverviewTab({ data, onTab, onMetrics }: { data: AirdDetail; onTab: (tab: DetailTab) => void; onMetrics: (runKey?: string) => void }) {
  const { open, current } = useInspect();
  const s = data.summary;
  const openBlockers = data.blockers.filter((b) => !b.resolved);
  const openFindings = data.findings.filter((f) => !f.closed);
  const bugs = data.workorders.filter((w) => w.label === "bug").length + data.fixes.filter((f) => f.label === "bug").length;
  const runningAgents = data.threads.filter((t) => isRunningThread(t.status)).length;
  const selectedStage = current?.kind === "stage" ? current.stageId : null;
  const selectedRef = current?.kind === "ref" ? current.ref : null;
  const selectedDoc = current?.kind === "doc" ? current.path : null;
  return (
    <div className="space-y-4">
      <Section
        title="Стадии"
        actions={
          <span className="text-xs text-muted-foreground">
            {s.stageLabel}
            {s.activePhase ? ` · фаза ${s.activePhase}` : ""} · {s.progress}% · нажми на стадию
          </span>
        }
      >
        <StageGraph
          stages={data.stages}
          selectedId={selectedStage}
          onSelect={(stageId) => open({ kind: "stage", stageId })}
          activity={agentActivity(data).stageActivity}
        />
      </Section>

      <div className="@container">
      <div className="grid grid-cols-2 gap-3 @xl:grid-cols-3 @4xl:grid-cols-6">
        <button type="button" className="cursor-pointer text-left" onClick={() => onTab("workorders")}>
          <Stat label="Воркордеры" value={`${s.workorders.done}/${s.workorders.total}`} sub={`${s.workorders.inProgress} в работе`} />
        </button>
        <button type="button" className="cursor-pointer text-left" onClick={() => onTab("workorders")}>
          <Stat label="Баги" value={bugs} tone={bugs > 0 ? "bad" : undefined} sub={`${s.fixes.open} открытых фиксов`} />
        </button>
        <button type="button" className="cursor-pointer text-left" onClick={() => onTab("gates")}>
          <Stat label="Гейты" value={`${s.gates.passed}/${s.gates.total}`} tone={s.gates.failed > 0 ? "bad" : undefined} sub={`${s.gates.blocked} блок · ${s.gates.failed} провал`} />
        </button>
        <Stat label="Блокеры" value={openBlockers.length} tone={openBlockers.length > 0 ? "warn" : undefined} />
        <Stat label="Находки" value={openFindings.length} sub={`${data.findings.length} всего`} />
        <button type="button" className="cursor-pointer text-left" onClick={() => onTab("agents")}>
          <Stat label="Агенты" value={runningAgents} tone={runningAgents > 0 ? "info" : undefined} sub={`${data.threads.length} тредов`} />
        </button>
      </div>
      </div>

      {data.efficiency ? <p className="text-sm text-muted-foreground">Результат: {({ accepted: "принят", blocked: "заблокирован", in_progress: "ещё не принят" })[data.efficiency.outcome]}. Календарное время всех попыток: {data.efficiency.calendarMs === null ? "нет данных" : `${Math.round(data.efficiency.calendarMs / 60_000)} мин`}, включая ожидания. Расход ниже включает незавершённые и неудачные попытки.</p> : null}
      {data.session.tokens?.byModel ? <UsageSection usage={data.session.tokens} /> : null}

      <div className="grid gap-4 @4xl:grid-cols-2">
        <Section title="Где мы">
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-muted-foreground">Следующее действие</dt>
            <dd className="font-medium">
              <Linkified text={s.nextAction ?? "—"} />
            </dd>
            <dt className="text-muted-foreground">Активная фаза</dt>
            <dd>{s.activePhase ?? "—"}</dd>
            <dt className="text-muted-foreground">Активная волна</dt>
            <dd>{s.activeWave ?? "—"}</dd>
            <dt className="text-muted-foreground">Готовность</dt>
            <dd className="flex flex-wrap gap-1.5">
              <Pill tone={readinessTone(s.readiness.implementation)}>реализация: {s.readiness.implementation ?? "—"}</Pill>
              <Pill tone={readinessTone(s.readiness.runtime)}>runtime: {s.readiness.runtime ?? "—"}</Pill>
              <Pill tone={readinessTone(s.readiness.release)}>релиз: {s.readiness.release ?? "—"}</Pill>
            </dd>
            {data.lifecycle.history.length > 0 || data.lifecycle.problem ? (
              <>
                <dt className="text-muted-foreground">Этапы</dt>
                <dd className="grid gap-1">
                  <span className="flex flex-wrap items-center gap-1 text-xs">
                    {data.lifecycle.history.length > 0 ? (
                      <>
                        <span className="font-mono">{data.lifecycle.history[0]!.from}</span>
                        {data.lifecycle.history.map((step, index) => (
                          <span key={index} className="inline-flex items-center gap-1" title={`${step.at} · ${step.by}`}>
                            <Icon name="ArrowRight" className="size-3 text-muted-foreground" />
                            <span className="font-mono">{step.to}</span>
                          </span>
                        ))}
                      </>
                    ) : (
                      <span className="text-muted-foreground">переходы не записаны</span>
                    )}
                  </span>
                  {data.lifecycle.problem ? <span className="text-xs text-destructive">Не подтверждено Factory: {data.lifecycle.problem}</span> : null}
                </dd>
              </>
            ) : null}
            {data.session.threadId ? (
              <>
                <dt className="text-muted-foreground">Сессия</dt>
                <dd className="flex flex-wrap items-center gap-1.5 text-xs">
                  <Pill tone={data.session.slices >= data.session.limit ? "bad" : data.session.slices >= data.session.limit - 1 ? "warn" : "neutral"}>
                    срезов {data.session.slices}/{data.session.limit}
                  </Pill>
                  <Pill tone={data.session.contextPct === null ? "neutral" : data.session.contextPct >= 70 ? "bad" : data.session.contextPct >= 60 ? "warn" : "neutral"}>
                    контекст {data.session.contextPct === null ? "н/д" : `${data.session.contextPct}%`}
                  </Pill>
                  {data.session.agents.started > 0 ? (
                    <span
                      className="text-muted-foreground"
                      title="Новые треды агентов и продолжения через sf_continue_agent. Продолжение не перечитывает бриф, пакет и источники заново."
                    >
                      агентов: {data.session.agents.started} новых · {data.session.agents.continued} продолжений
                    </span>
                  ) : null}
                  {(data.session.limits ?? []).map((limit) => (
                    <Pill key={limit.provider} tone={limit.status === "blocked" ? "bad" : limit.status === "warning" ? "warn" : "neutral"}>
                      <span title={`Последнее сообщение провайдера о лимите подписки: ${new Date(limit.reportedAt).toLocaleString()}`}>
                        {limit.provider}: {limit.status === "blocked" ? "лимит исчерпан" : limit.status === "warning" ? "лимит близко" : "лимит в норме"}
                        {limit.resetsAt && limit.status !== "allowed" ? ` · сброс ${new Date(limit.resetsAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : ""}
                      </span>
                    </Pill>
                  ))}
                  {data.session.tokens && data.session.tokens.total > 0 ? (
                    <span className="text-muted-foreground" title="Измеренные токены всех тредов AIRD и доступных вложенных агентов. Детализация по моделям — выше.">
                      токенов: {formatTokens(data.session.tokens.total)}
                      {data.session.tokens.byProvider.length > 1
                        ? ` (${data.session.tokens.byProvider.map((part) => `${part.provider} ${formatTokens(part.tokens)}`).join(" · ")})`
                        : ""}
                    </span>
                  ) : null}
                  {data.session.handoffs.length > 0 ? (
                    <span className="text-muted-foreground">
                      передач: {data.session.handoffs.length}
                      {data.session.handoffs.some((handoff) => handoff.confirmedAt === null) ? " (последняя ждёт первого среза новой сессии)" : ""}
                    </span>
                  ) : null}
                </dd>
              </>
            ) : null}
            {data.layout ? (
              <>
                <dt className="text-muted-foreground">Рабочие каталоги</dt>
                <dd className="grid gap-0.5 text-xs">
                  {data.layout.checks.map((check) => (
                    <span key={check.label} className="flex min-w-0 items-center gap-1.5" title={`${check.path}\n${check.detail}`}>
                      <Dot tone={check.ok ? "good" : "bad"} />
                      <span className="shrink-0">{check.label}</span>
                      <span className={cn("min-w-0 truncate", check.ok ? "text-muted-foreground" : "text-destructive")}>{check.ok ? shortPath(check.path) : check.detail}</span>
                    </span>
                  ))}
                </dd>
              </>
            ) : null}
          </dl>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={() => open({ kind: "doc", path: "STATE.md" })} disabled={!s.exists}>
              <Icon name="FileText" className="size-3.5" />
              STATE.md
            </Button>
          </div>
          {data.request ? (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">Исходный запрос</summary>
              <p className="mt-2 whitespace-pre-wrap">{data.request}</p>
            </details>
          ) : null}
        </Section>

        <Section title={`Блокеры (${openBlockers.length} открыто)`}>
          {data.blockers.length === 0 ? (
            <p className="text-sm text-muted-foreground">Блокеров нет.</p>
          ) : (
            <div className="space-y-1">
              {[...data.blockers]
                .sort((a, b) => Number(a.resolved) - Number(b.resolved))
                .map((blocker) => (
                  <Clickable
                    key={blocker.id}
                    active={selectedRef === blocker.id}
                    onClick={() => open({ kind: "ref", ref: blocker.id })}
                    className={cn("px-2 py-1.5 text-sm", blocker.resolved && "opacity-55")}
                  >
                    <div className="flex items-center gap-2">
                      <Dot tone={blocker.resolved ? "good" : blocker.needsUserDecision ? "bad" : "warn"} />
                      <span className="font-mono text-xs font-semibold">{blocker.id}</span>
                      {blocker.needsUserDecision && !blocker.resolved ? <Pill tone="bad">нужно решение</Pill> : null}
                      {blocker.resolved ? <Pill tone="good">снят</Pill> : null}
                      {blocker.owner ? <span className="text-xs text-muted-foreground">владелец: {blocker.owner}</span> : null}
                      <Icon name="ChevronRight" className="ml-auto size-3.5 text-muted-foreground" />
                    </div>
                    <p className="ml-4 mt-0.5 line-clamp-2 text-muted-foreground">{blocker.statement}</p>
                  </Clickable>
                ))}
            </div>
          )}
        </Section>
      </div>

      <AirdMetricsSection slug={s.slug} onOpen={(key) => onMetrics(key)} />

      <div className="grid gap-4 @4xl:grid-cols-2">
        <Section title={`Находки ревью (${openFindings.length} открыто)`}>
          {data.findings.length === 0 ? (
            <p className="text-sm text-muted-foreground">Находок в STATE.md нет.</p>
          ) : (
            <div className="max-h-80 space-y-0.5 overflow-y-auto pr-1">
              {[...data.findings]
                .sort((a, b) => Number(a.closed) - Number(b.closed))
                .map((finding) => (
                  <Clickable
                    key={finding.id}
                    active={selectedRef === finding.id}
                    onClick={() => open({ kind: "ref", ref: finding.id })}
                    className={cn("flex gap-2 px-2 py-1.5 text-sm", finding.closed && "opacity-55")}
                  >
                    <Dot tone={finding.closed ? "good" : "bad"} />
                    <span className="shrink-0 font-mono text-xs font-semibold">{finding.id}</span>
                    <span className="line-clamp-2 text-muted-foreground">{finding.statement}</span>
                  </Clickable>
                ))}
            </div>
          )}
        </Section>
        <details className="group min-w-0 self-start rounded-xl border border-border bg-card p-4">
          <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-semibold [&::-webkit-details-marker]:hidden">
            <Icon name="ChevronRight" className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-90" />
            <span className="min-w-0 flex-1">Материалы и артефакты</span>
            <span className="shrink-0 text-xs font-normal text-muted-foreground" title="Материалы и существующие документы пакета">{data.inputs.length + data.artifacts.filter((artifact) => artifact.exists).length}</span>
          </summary>
          <div className="mt-4 space-y-4">
            <div className="space-y-2.5">
              <h4 className="text-xs font-medium text-muted-foreground">Материалы ({data.inputs.length})</h4>
              <MaterialsSection data={data} id={s.id} />
            </div>
            <div className="space-y-2.5 border-t pt-3">
              <h4 className="text-xs font-medium text-muted-foreground">Документы пакета</h4>
              {data.artifacts.length === 0 ? (
                <p className="text-sm text-muted-foreground">Пакет ещё не создан — discovery создаст его в {shortPath(s.packagePath)}.</p>
              ) : (
                <div className="grid grid-cols-1 gap-0.5 @md:grid-cols-2">
                  {data.artifacts.map((artifact) => (
                    <button
                      key={artifact.name}
                      type="button"
                      disabled={!artifact.exists}
                      onClick={() => open({ kind: "doc", path: artifact.name })}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-left text-xs hover:bg-state-hover disabled:cursor-default disabled:opacity-50",
                        selectedDoc === artifact.name && "bg-state-active",
                      )}
                    >
                      <Icon name={artifact.exists ? "FileText" : "FileQuestion"} fallback="File" className="size-3.5 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate font-mono">{artifact.name}</span>
                      <span className="text-muted-foreground">{artifact.status}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}

// ------------------------------------------------------------- workorders

type LabelFilter = "all" | "bug" | "task";
type WorkorderView = "mindmap" | "graph" | "table";

function UsageSection({ usage }: { usage: NonNullable<AirdDetail["session"]["tokens"]> }) {
  const count = (value: number | null) => value === null ? "н/д" : formatTokens(value);
  const duration = (value: number | null) => value === null ? "н/д" : value >= 3_600_000 ? `${(value / 3_600_000).toFixed(1)} ч` : `${Math.round(value / 60_000)} мин`;
  return (
    <Section title="Расход по моделям">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="font-medium">{formatTokens(usage.total)} обработано</span>
        <Pill tone={usage.partial ? "warn" : "neutral"}>{usage.partial ? "частичные данные" : "данные получены"}</Pill>
        {usage.native && usage.native.detected > 0 ? <span className="text-muted-foreground">вложенные агенты: учтено {usage.native.measured}/{usage.native.detected}</span> : null}
        {usage.missingThreads ? <span className="text-muted-foreground">без счётчика: {usage.missingThreads} тредов</span> : null}
      </div>
      {usage.timing ? <p className="text-xs text-muted-foreground">Окно завершённых ходов: {duration(usage.timing.observedWindowMs)} · без двойного счёта параллельных ходов: {duration(usage.timing.occupiedMs)}{usage.timing.incomplete ? " · измерение неполное" : ""}. Включает ожидания внутри хода; это не чистое время генерации и не срок до принятия результата. От зафиксированного лимита до следующего запуска: {duration(usage.timing.providerWaitMs)}; незавершённых ожиданий лимита: {usage.timing.openProviderWaits}. Остальные причины ожидания не определены.</p> : null}
      <div className="max-w-full overflow-x-auto">
        <table className="w-full text-left text-xs tabular-nums">
          <caption className="sr-only">Токены по моделям. Кеш и свежий ввод показаны отдельно; время — сумма длительностей работы агентов.</caption>
          <thead className="text-muted-foreground">
            <tr>{["Модель", "Свежий ввод", "Чтение кеша", "Запись кеша", "Вывод", "Всего", "Время работы"].map((label) => <th key={label} className="whitespace-nowrap px-3 py-2 font-medium first:pl-0">{label}</th>)}</tr>
          </thead>
          <tbody>
            {(usage.byModel ?? []).map((part) => (
              <tr key={`${part.provider}/${part.model}`} className="border-t">
                <th scope="row" className="min-w-44 px-0 py-2 pr-3 font-normal">
                  <span className="break-all font-medium">{part.model ?? "Модель не сообщена"}{part.partial ? " *" : ""}</span>
                  <span className="block text-muted-foreground">{part.provider}{part.nativeSources ? ` · вложенных: ${part.nativeSources}` : ""}</span>
                </th>
                {[part.freshInput, part.cacheRead, part.cacheWrite, part.output, part.total].map((value, i) => <td key={i} className="whitespace-nowrap px-3 py-2" title={value === null ? "Провайдер не сообщил данные" : value.toLocaleString()}>{count(value)}</td>)}
                <td className="whitespace-nowrap px-3 py-2">{duration(part.durationMs)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground">Время суммируется по агентам, включая параллельную работу. * — часть данных недоступна. Токены включают повторную обработку истории и кеш; стоимость и расход лимита подписки не рассчитаны: провайдеры не сообщают тарифы и вес моделей в лимите.</p>
    </Section>
  );
}

function readView(): WorkorderView {
  try {
    const value = localStorage.getItem("sf.woView");
    return value === "graph" || value === "table" || value === "mindmap" ? value : "mindmap";
  } catch {
    return "mindmap";
  }
}

/** Role chips of the agents on a workorder: running ones pulse; click opens the session. */
function AgentChips({ threads }: { threads: AgentThread[] }) {
  const { open } = useInspect();
  if (threads.length === 0) return <span className="text-muted-foreground">—</span>;
  const running = threads.filter((t) => isRunningThread(t.status));
  const shown = running.length > 0 ? running : threads.slice(0, 1);
  return (
    <span className="flex flex-wrap items-center gap-1" onClick={(event) => event.stopPropagation()}>
      {shown.slice(0, 3).map((thread) => (
        <button
          key={thread.threadId}
          type="button"
          title={`${thread.title} — ${THREAD_STATUS_LABELS[thread.status] ?? thread.status}. Открыть сессию`}
          onClick={() => open({ kind: "thread", threadId: thread.threadId, tab: "session" })}
          className="inline-flex cursor-pointer items-center gap-1 rounded-full border border-border px-1.5 py-0.5 font-mono text-[10.5px] hover:border-foreground/40"
        >
          <Dot tone={threadTone(thread.status)} pulse={isRunningThread(thread.status)} />
          {thread.role}
        </button>
      ))}
      {running.length === 0 && threads.length > 1 ? <span className="text-[10.5px] text-muted-foreground">+{threads.length - 1}</span> : null}
      {running.length > 3 ? <span className="text-[10.5px] text-muted-foreground">+{running.length - 3}</span> : null}
    </span>
  );
}

function WorkordersTab({ data, onChanged }: { data: AirdDetail; onChanged: () => void }) {
  const { open } = useInspect();
  const selected = useInspectedRef();
  const [filter, setFilter] = useState<LabelFilter>("all");
  const [showFixes, setShowFixes] = useState(true);
  const [view, setViewState] = useState<WorkorderView>(readView);
  const setView = (next: WorkorderView) => {
    setViewState(next);
    try {
      localStorage.setItem("sf.woView", next);
    } catch {
      /* storage unavailable */
    }
  };
  const activity = useMemo(() => agentActivity(data), [data]);
  const airdId = data.summary.id;
  const wos = data.workorders.filter((wo) => filter === "all" || wo.label === filter);
  const fixes = data.fixes.filter((fix) => filter === "all" || fix.label === filter);
  const statusCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const wo of data.workorders) counts.set(wo.status, (counts.get(wo.status) ?? 0) + 1);
    return counts;
  }, [data.workorders]);
  const select = (ref: string) => open({ kind: "ref", ref });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented<WorkorderView>
            value={view}
            onChange={setView}
            items={[
              { value: "mindmap", label: "Майндмап" },
              { value: "graph", label: "Зависимости" },
              { value: "table", label: "Таблица" },
            ]}
          />
          <Segmented<LabelFilter>
            value={filter}
            onChange={setFilter}
            items={[
              { value: "all", label: "Все" },
              { value: "bug", label: "Баги", tone: "bad" },
              { value: "task", label: "Не баги", tone: "good" },
            ]}
          />
          <label className="inline-flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
            <input type="checkbox" checked={showFixes} onChange={(event) => setShowFixes(event.target.checked)} />
            Фиксы
          </label>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[...statusCounts.entries()].map(([status, count]) => (
            <Pill key={status} tone={woStatusTone(status)}>
              {WO_STATUS_LABELS[status] ?? status}: {count}
            </Pill>
          ))}
        </div>
      </div>

      {view === "mindmap" ? (
        <WorkorderMindMap
          title={data.summary.title}
          workorders={wos}
          fixes={fixes}
          showFixes={showFixes}
          selectedId={selected}
          onSelect={select}
          activity={activity.refActivity}
        />
      ) : view === "graph" ? (
        <WorkorderGraph workorders={wos} fixes={fixes} showFixes={showFixes} selectedId={selected} onSelect={select} activity={activity.refActivity} />
      ) : null}

      {view === "table" ? (
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">ID</th>
              <th className="w-full px-3 py-2 font-medium">Задача</th>
              <th className="hidden px-3 py-2 font-medium @2@4xl:table-cell">Волна</th>
              <th className="px-3 py-2 font-medium">Статус</th>
              <th className="hidden px-3 py-2 font-medium @4xl:table-cell">Агент</th>
              <th className="hidden px-3 py-2 font-medium @4xl:table-cell">Гейты</th>
              <th className="hidden px-3 py-2 font-medium @3xl:table-cell">Агенты</th>
              <th className="px-3 py-2 font-medium">Тип</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {wos.map((wo) => (
              <tr key={wo.id} className={cn("cursor-pointer hover:bg-state-hover", selected === wo.id && "bg-state-active")} onClick={() => select(wo.id)}>
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs font-semibold">{wo.id}</td>
                <td className="max-w-md px-3 py-2 [overflow-wrap:anywhere]">
                  <span className="line-clamp-2">{wo.title}</span>
                </td>
                <td className="hidden px-3 py-2 text-xs @2@4xl:table-cell">{wo.wave === "none" ? "—" : wo.wave}</td>
                <td className="px-3 py-2">
                  <Pill tone={woStatusTone(wo.status)} title={wo.statusSource === "inferred" ? "Выведено из статуса пакета или evidence" : undefined}>
                    {WO_STATUS_LABELS[wo.status] ?? wo.status}
                    {wo.statusSource === "inferred" ? "*" : ""}
                  </Pill>
                </td>
                <td className="hidden px-3 py-2 font-mono text-xs text-muted-foreground @4xl:table-cell">{wo.agent ?? "—"}</td>
                <td className="hidden px-3 py-2 @4xl:table-cell">
                  <div className="flex flex-wrap gap-1">
                    {wo.gateIds.slice(0, 4).map((gate) => (
                      <RefLink key={gate} id={gate} />
                    ))}
                    {wo.gateIds.length > 4 ? <Chip>+{wo.gateIds.length - 4}</Chip> : null}
                  </div>
                </td>
                <td className="hidden px-3 py-2 @3xl:table-cell">
                  <AgentChips threads={activity.byRef.get(wo.id) ?? []} />
                </td>
                <td className="px-3 py-2">
                  <LabelToggle item={wo} airdId={airdId} onChanged={onChanged} />
                </td>
              </tr>
            ))}
            {fixes.map((fix) => (
              <tr key={fix.id} className={cn("cursor-pointer hover:bg-state-hover", selected === fix.id && "bg-state-active")} onClick={() => select(fix.id)}>
                <td className="whitespace-nowrap px-3 py-2 font-mono text-xs font-semibold">{fix.id}</td>
                <td className="max-w-md px-3 py-2 [overflow-wrap:anywhere]">
                  <span className="line-clamp-2">{fix.title}</span>
                  <span className="text-[11px] text-muted-foreground">
                    {fix.kind === "finding-note" ? "finding note" : "fix workorder"}
                    {fix.findingClass ? ` · ${fix.findingClass}` : ""}
                    {fix.severity ? ` · ${fix.severity.slice(0, 40)}` : ""}
                  </span>
                </td>
                <td className="hidden px-3 py-2 text-xs @2@4xl:table-cell">фикс</td>
                <td className="px-3 py-2">
                  <Pill tone={fix.closed === true ? "good" : fix.closed === false ? "bad" : "neutral"}>
                    {fix.closed === true ? "закрыт" : fix.closed === false ? "открыт" : "—"}
                  </Pill>
                </td>
                <td className="hidden px-3 py-2 text-xs text-muted-foreground @4xl:table-cell">
                  {fix.originalWorkorder ? <Linkified text={fix.originalWorkorder.slice(0, 60)} /> : "—"}
                </td>
                <td className="hidden px-3 py-2 @4xl:table-cell">{fix.sourceGate ? <Linkified text={fix.sourceGate.slice(0, 40)} className="text-xs text-muted-foreground" /> : null}</td>
                <td className="hidden px-3 py-2 @3xl:table-cell">
                  <AgentChips threads={activity.byRef.get(fix.id) ?? []} />
                </td>
                <td className="px-3 py-2">
                  <LabelToggle item={fix} airdId={airdId} onChanged={onChanged} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {wos.length + fixes.length === 0 ? <p className="p-6 text-center text-sm text-muted-foreground">Ничего не найдено.</p> : null}
      </div>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ gates

function GatesTab({ data, onChanged }: { data: AirdDetail; onChanged: () => void }) {
  const { open } = useInspect();
  const selected = useInspectedRef();
  const gates = data.gates;
  const counts = (status: GateStatus) => gates.filter((gate) => gate.status === status).length;
  return (
    <div className="space-y-4">
      <div className="space-y-2 rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-2">
          {(Object.keys(GATE_STATUS) as GateStatus[]).map((status) => (
            <Pill key={status} tone={GATE_STATUS[status].tone}>
              {GATE_STATUS[status].label}: {counts(status)}
            </Pill>
          ))}
          <span className="ml-auto text-xs text-muted-foreground">нажми на риск, гейт или DoD</span>
        </div>
        <SplitBar parts={(Object.keys(GATE_STATUS) as GateStatus[]).map((status) => ({ value: counts(status), tone: GATE_STATUS[status].tone, label: GATE_STATUS[status].label }))} />
      </div>
      <GateGraph gates={gates} risks={data.risks} selectedId={selected} onSelect={(ref) => open({ kind: "ref", ref })} />
      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {gates.map((gate) => (
          <GateRow key={gate.id} gate={gate} airdId={data.summary.id} active={selected === gate.id} onOpen={() => open({ kind: "ref", ref: gate.id })} onChanged={onChanged} />
        ))}
      </div>
    </div>
  );
}

function GateRow({ gate, airdId, active, onOpen, onChanged }: { gate: Gate; airdId: string; active: boolean; onOpen: () => void; onChanged: () => void }) {
  const meta = GATE_STATUS[gate.status];
  return (
    <div className={cn("flex cursor-pointer flex-wrap items-center gap-3 px-4 py-2.5 hover:bg-state-hover", active && "bg-state-active")} onClick={onOpen}>
      <Dot tone={meta.tone} />
      <span className="font-mono text-xs font-semibold">{gate.id}</span>
      <span className="min-w-0 flex-1 truncate text-sm">{gate.title}</span>
      <span className="hidden flex-wrap gap-1 @3xl:flex">
        {gate.workorders.slice(0, 3).map((wo) => (
          <RefLink key={wo} id={wo} />
        ))}
        {gate.workorders.length > 3 ? <Chip>+{gate.workorders.length - 3}</Chip> : null}
      </span>
      <Pill tone={meta.tone} title={gate.statusSource === "user" ? "Статус задан вручную" : "Статус выведен из отчётов верификации"}>
        {meta.label}
        {gate.statusSource === "user" ? " ✎" : ""}
      </Pill>
      <GateStatusSelect airdId={airdId} gate={gate} onChanged={onChanged} />
    </div>
  );
}

// ----------------------------------------------------------------- agents

function AgentRow({ thread, depth }: { thread: AgentThread; depth: number }) {
  const navigate = useBbNavigate();
  const { open, current } = useInspect();
  const tone = threadTone(thread.status);
  const running = ["active", "starting", "pending"].includes(thread.status);
  const label = thread.title.includes(" · ") ? thread.title.slice(thread.title.indexOf(" · ") + 3) : null;
  const active = current?.kind === "thread" && current.threadId === thread.threadId;
  return (
    <div
      className={cn("flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1.5 px-4 py-2.5 hover:bg-state-hover", depth > 0 && "pl-10", active && "bg-state-active")}
      onClick={() => open({ kind: "thread", threadId: thread.threadId })}
    >
      {depth > 0 ? <span className="-ml-5 text-muted-foreground">└</span> : null}
      <Dot tone={tone} pulse={running} />
      <span className={cn("font-mono text-sm", thread.kind === "orchestrator" ? "font-bold" : "font-semibold")}>{thread.role}</span>
      {label ? <span className="text-sm text-muted-foreground">{label}</span> : null}
      <span className="flex flex-wrap items-center gap-1">
        {thread.provider ? <Chip>{thread.provider}</Chip> : null}
        {thread.model ? <Chip mono>{thread.model}</Chip> : <Chip>модель по умолчанию</Chip>}
        {thread.effort ? <Chip>effort: {thread.effort}</Chip> : null}
        {thread.tokens ? (
          <Pill tone={thread.tokens >= HEAVY_AGENT_TOKENS ? "warn" : "neutral"}>
            <span title="Токены треда: каждый шаг заново отправляет весь накопленный контекст">{formatTokens(thread.tokens)} токенов</span>
          </Pill>
        ) : null}
        {thread.executionState && thread.executionState !== "running" ? <Pill tone={thread.executionState === "transferring" ? "warn" : "info"}>{({ checkpoint_requested: "ожидается checkpoint", checkpoint_ready: "checkpoint сохранён", transferring: "передача: требуется подтверждение", transferred: "передан преемнику" } as Record<string, string>)[thread.executionState] ?? thread.executionState}</Pill> : thread.budgetSignalAt ? <Pill tone="info">бюджет исчерпан — завершает с запиской</Pill> : null}
        {(thread.sessions?.length ?? 0) > 1 ? <Pill tone="warn">запасная · {thread.sessions!.length} сессии</Pill> : null}
        {thread.recovery ? <span className="text-xs text-muted-foreground">{thread.recovery.reason}</span> : null}
        {thread.skills.map((skill) => (
          <Chip key={skill} mono>
            /{skill}
          </Chip>
        ))}
      </span>
      <span className="ml-auto flex min-w-0 items-center gap-3 text-xs text-muted-foreground">
        {thread.activity?.background.length ? (
          <span className="min-w-0 truncate" style={{ color: TONE_COLORS.info }} title={thread.activity.background.map((task) => task.description).join("\n")}>
            {thread.activity.background[0]!.description} · {sinceText(thread.activity.background[0]!.startedAt)}
          </span>
        ) : thread.activity?.command ? (
          <span className="min-w-0 truncate font-mono" title={thread.activity.command.text}>
            {thread.activity.command.text}
          </span>
        ) : null}
        <span>{THREAD_STATUS_LABELS[thread.status] ?? thread.status}</span>
        <span>{relativeTime(thread.createdAt)}</span>
        <span onClick={(event) => event.stopPropagation()}>
          <Button variant="ghost" size="sm" disabled={thread.status === "deleted"} onClick={() => navigate.toThread(thread.threadId)}>
            <Icon name="ExternalLink" className="size-3.5" />
            Открыть
          </Button>
        </span>
      </span>
    </div>
  );
}

function AgentsTab({ data, onLaunch, onAgents }: { data: AirdDetail; onLaunch: (stage: "discovery" | "delivery") => void; onAgents: () => void }) {
  const threads = data.threads;
  const orchestrators = threads.filter((t) => t.kind === "orchestrator").sort((a, b) => b.createdAt - a.createdAt);
  const known = new Set(orchestrators.map((o) => o.threadId));
  const orphans = threads.filter((t) => t.kind === "agent" && (!t.parentThreadId || !known.has(t.parentThreadId)));
  const roleCounts = new Map<string, number>();
  for (const thread of threads) if (thread.kind === "agent") roleCounts.set(thread.role, (roleCounts.get(thread.role) ?? 0) + 1);

  if (threads.length === 0) {
    return (
      <EmptyState icon="Bot">
        Для этого AIRD ещё не запускались треды из Software Factory.
        <div className="flex gap-2">
          <Button size="sm" variant="outline" onClick={() => onLaunch("discovery")}>
            Запустить discovery
          </Button>
          <Button size="sm" onClick={() => onLaunch("delivery")} disabled={!data.summary.exists}>
            Запустить delivery
          </Button>
        </div>
      </EmptyState>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          {[...roleCounts.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([role, count]) => (
              <Chip key={role} mono>
                {role} × {count}
              </Chip>
            ))}
        </div>
        <Button variant="ghost" size="sm" onClick={onAgents}>
          <Icon name="SlidersHorizontal" fallback="Settings" className="size-4" />
          Модели и скиллы ролей
        </Button>
      </div>
      {orchestrators.map((orchestrator) => {
        const children = threads.filter((t) => t.parentThreadId === orchestrator.threadId).sort((a, b) => a.createdAt - b.createdAt);
        return (
          <div key={orchestrator.threadId} className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            <AgentRow thread={orchestrator} depth={0} />
            {children.map((child) => (
              <AgentRow key={child.threadId} thread={child} depth={1} />
            ))}
            {children.length === 0 ? <p className="px-10 py-2 text-xs text-muted-foreground">Агенты ещё не запускались.</p> : null}
          </div>
        );
      })}
      {orphans.length > 0 ? (
        <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {orphans.map((thread) => (
            <AgentRow key={thread.threadId} thread={thread} depth={0} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- commits

function CommitsTab({ data }: { data: AirdDetail }) {
  const { open, current } = useInspect();
  const { data: commits, error, refetch } = useCommits(data.summary.id, true);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <div className="flex flex-wrap items-center gap-2 text-muted-foreground">
          <Icon name="GitBranch" className="size-4" />
          {commits?.branch ? <span className="font-mono text-foreground">{commits.branch}</span> : <span>ветки aird/{data.summary.slug} нет</span>}
          {commits?.repos && commits.repos.length > 0 ? (
            <span>
              {commits.branch ? "в " : "· коммиты по записям пакета в "}
              {commits.repos.map((repo, index) => (
                <span key={repo}>
                  {index > 0 ? ", " : ""}
                  <span className="font-mono text-foreground">{repo}</span>
                </span>
              ))}
            </span>
          ) : null}
          {commits?.base ? <span>относительно {commits.base}</span> : null}
          {commits ? <span>· {commits.commits.length} коммитов</span> : null}
        </div>
        <Button variant="ghost" size="sm" onClick={refetch}>
          <Icon name="ArrowReloadHorizontal" className="size-4" />
          Обновить
        </Button>
      </div>
      <ErrorText>{error ?? commits?.error}</ErrorText>
      {commits === null ? (
        <EmptyState icon="Loading">Читаю git…</EmptyState>
      ) : commits.commits.length === 0 ? (
        <EmptyState icon="GitMerge">Коммитов этого AIRD пока нет.</EmptyState>
      ) : (
        <ol className="overflow-hidden rounded-xl border border-border bg-card">
          {commits.commits.map((commit) => {
            const active = current?.kind === "commit" && current.sha === commit.sha;
            return (
              <li
                key={commit.sha}
                onClick={() => open({ kind: "commit", sha: commit.sha })}
                className={cn("flex cursor-pointer items-start gap-3 border-b border-border px-4 py-2.5 last:border-b-0 hover:bg-state-hover", active && "bg-state-active")}
              >
                <span className="mt-1.5 size-2 shrink-0 rounded-full border-2 border-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {commit.repo ? (
                      <span className="rounded border border-border px-1.5 py-px font-mono text-[10px] text-muted-foreground" title="Репозиторий">
                        {commit.repo}
                      </span>
                    ) : null}
                    <span className="text-sm">{commit.subject}</span>
                    {commit.refs.map((ref) => (
                      <RefLink key={ref} id={ref} />
                    ))}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    <span className="font-mono">{commit.short}</span> · {commit.author} · {relativeTime(commit.date)}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- dialogs

function LaunchDialog({
  stage,
  data,
  onClose,
  onLaunched,
}: {
  stage: "discovery" | "delivery" | null;
  data: AirdDetail;
  onClose: () => void;
  onLaunched: (threadId: string) => void;
}) {
  const rpc = useFactoryRpc();
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [secretsOpen, setSecretsOpen] = useState(false);
  const s = data.summary;
  const { secrets, reload: reloadSecrets } = useProjectSecrets(s.projectId, stage !== null && !secretsOpen);
  const ownSecrets = (secrets ?? []).filter((secret) => !secret.inherited);
  const navigate = useBbNavigate();
  const running = stage
    ? data.threads.find((thread) => thread.kind === "orchestrator" && thread.stage === stage && ["active", "starting", "pending", "stopping"].includes(thread.status))
    : undefined;
  const warn =
    stage === "delivery" && ["discovery", "draft"].includes(s.status)
      ? "Пакет ещё в discovery: delivery-скилл откажется исполнять непринятые волны."
      : stage === "discovery" && !["discovery", "draft", "paused"].includes(s.status)
        ? "Discovery уже пройден; новый запуск продолжит или пересмотрит пакет."
        : null;
  const launch = async () => {
    if (!stage) return;
    setPending(true);
    setError(null);
    try {
      // Omit empty optional fields: the RPC transport turns undefined into null.
      const result = await rpc.call("aird_start", { id: s.id, stage, ...(note.trim() ? { note: note.trim() } : {}) });
      setNote("");
      onLaunched(result.threadId);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setPending(false);
    }
  };
  return (
    <Dialog open={stage !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Запустить {stage === "delivery" ? "aird-delivery-loop" : "aird-discovery-loop"}</DialogTitle>
          <DialogDescription>
            {stage === "delivery" && data.deliveryRepos.length > 0 ? (
              <>
                Новый тред-оркестратор в копии рабочего пространства: {data.deliveryRepos.map((rel) => <code key={rel}>{rel}</code>)} — git worktree на ветке <code>aird/{s.slug}</code>
                {data.deliveryReposReady ? "" : " (создастся при запуске)"}, остальные папки — ссылки на <code>{shortPath(s.folder)}</code>. Твои checkout'ы и их ветки не меняются.
              </>
            ) : (
              <>
                Новый тред-оркестратор в {s.worktree ? "worktree" : "папке"} <code>{shortPath(s.worktree ? s.workFolder : s.folder)}</code>
                {s.worktree ? <> (ветка <code>{s.branch}</code>)</> : s.worktreeNote ? <> — {s.worktreeNote}</> : <> — отдельная worktree на ветке <code>aird/{s.slug}</code> создастся при запуске</>}.
              </>
            )}{" "}Агенты скилла (
            {stage === "delivery" ? "backend-worker, frontend-worker, reviewer, qa…" : "explorer, product-analyst, risk-analyst, architect…"}) запустятся дочерними тредами со своими моделями и скиллами.
          </DialogDescription>
        </DialogHeader>
        {running ? (
          <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm">
            <span className="min-w-0 flex-1">Оркестратор {stage} уже работает. Второй запуск правил бы тот же пакет и ветку параллельно — продолжи текущий.</span>
            <Button variant="outline" size="sm" onClick={() => navigate.toThread(running.threadId)}>
              Открыть
            </Button>
          </div>
        ) : null}
        {warn ? <p className="rounded-md bg-muted/50 px-3 py-2 text-sm text-muted-foreground">{warn}</p> : null}
        <div className="flex items-center gap-2 rounded-md bg-muted/50 px-3 py-2 text-sm">
          <Icon name="Lock" fallback="Settings" className="size-4 shrink-0 text-muted-foreground" />
          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-1 text-muted-foreground">
            {secrets === null
              ? "Секреты проекта…"
              : ownSecrets.length > 0
                ? <>
                    <span>Агенты получат секреты:</span>
                    {ownSecrets.map((secret) => (
                      <code key={secret.name} className="rounded bg-background/60 px-1 text-xs text-foreground">{secret.name}</code>
                    ))}
                  </>
                : stage === "delivery"
                  ? "Секретов нет: если для проверок нужен вход в приложение, агенты остановятся на живых гейтах."
                  : "Секретов нет."}
          </span>
          <Button variant="ghost" size="sm" onClick={() => setSecretsOpen(true)}>
            {ownSecrets.length > 0 ? "Изменить" : "Добавить"}
          </Button>
        </div>
        <SecretsDialog
          open={secretsOpen}
          onOpenChange={(open) => {
            setSecretsOpen(open);
            if (!open) reloadSecrets();
          }}
          projectId={s.projectId}
          projectName={null}
        />
        <TextArea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Дополнительные указания (необязательно)" rows={4} />
        <ErrorText>{error}</ErrorText>
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Отмена
          </Button>
          <Button onClick={launch} disabled={pending || running !== undefined}>
            {pending ? "Запускаю…" : "Запустить"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ValidationPanel({ result, onClose }: { result: ValidationResult; onClose: () => void }) {
  return (
    <div className={cn("space-y-2 rounded-xl border p-4", result.ok ? "border-border" : "border-destructive/40")}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Pill tone={result.ok ? "good" : "bad"}>{result.ok ? "PASS" : "FAIL"}</Pill>
          aird-validate.mjs · {result.errors.length} ошибок · {result.warnings.length} предупреждений
        </div>
        <Button variant="ghost" size="icon" className="size-7" aria-label="Закрыть" onClick={onClose}>
          <Icon name="X" fallback="ClosePluginPane" className="size-4" />
        </Button>
      </div>
      <ErrorText>{result.error}</ErrorText>
      {result.errors.length + result.warnings.length > 0 ? (
        <ul className="max-h-64 space-y-1 overflow-y-auto text-xs">
          {result.errors.map((line, index) => (
            <li key={`e${index}`} className="flex gap-2">
              <Dot tone="bad" />
              <Linkified text={line} />
            </li>
          ))}
          {result.warnings.map((line, index) => (
            <li key={`w${index}`} className="flex gap-2 text-muted-foreground">
              <Dot tone="warn" />
              <Linkified text={line} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
