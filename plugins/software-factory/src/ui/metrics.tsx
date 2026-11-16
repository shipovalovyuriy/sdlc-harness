// "Самоулучшение AIRD": the process metrics both AIRD loops record at their
// terminal outcome (~/.agent/aird-metrics), the signals the improvement phase
// reacts to, and the backlog of proposals, watch items and eval cases.
import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { BacklogEntry, MetricsOverview, MetricsRun } from "../contract";
import { CHANGED, TONE_COLORS, errorText, shortPath, useFactoryRpc, type Tone } from "./data";
import { Chip, EmptyState, ErrorText, MarkdownView, Pill, Segmented, SplitBar, Stat, Tabs } from "./kit";
import { useRealtime } from "@get-bb/plugin-sdk/app";

type Selection =
  | { kind: "run"; key: string }
  | { kind: "backlog"; index: number }
  | { kind: "eval"; file: string }
  | { kind: "signal"; id: string };

type KindFilter = "all" | "discovery" | "delivery";

const CLASS_COLORS = ["#3b82f6", "#e5484d", "#e0a019", "#22a35a", "#8b5cf6", "#06b6d4", "#ec4899", "#84cc16", "#f97316", "#64748b", "#14b8a6", "#a855f7", "#8b8f98"];

export function outcomeTone(outcome: string | null): Tone {
  if (outcome === "complete") return "good";
  if (outcome === "escalated") return "warn";
  if (outcome === "abandoned") return "bad";
  return "neutral";
}

const OUTCOME_LABELS: Record<string, string> = { complete: "завершён", escalated: "эскалация", abandoned: "брошен" };

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

function fmtDate(ts: string | null): string {
  if (!ts) return "—";
  const date = new Date(ts);
  return Number.isNaN(date.getTime()) ? ts.slice(0, 10) : date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function firstPass(run: MetricsRun): number | null {
  return run.gatesFirstPass !== null && run.gatesTotal ? run.gatesFirstPass / run.gatesTotal : null;
}

export function MetricsView({ onBack, initialRun }: { onBack: () => void; initialRun: string | null }) {
  const rpc = useFactoryRpc();
  const [data, setData] = useState<MetricsOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<KindFilter>("all");
  const [repo, setRepo] = useState<string>("");
  const [selection, setSelection] = useState<Selection | null>(initialRun ? { kind: "run", key: initialRun } : null);
  const [backlogTab, setBacklogTab] = useState<"proposal" | "watch" | "eval">("proposal");
  const load = () =>
    rpc.call("metrics_overview", null).then(
      (value) => {
        setData(value);
        setError(null);
      },
      (cause) => setError(errorText(cause)),
    );
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rpc]);
  useRealtime(CHANGED, () => void load());

  const runs = useMemo(
    () => (data?.runs ?? []).filter((run) => (filter === "all" || run.kind === filter) && (!repo || run.repo === repo)),
    [data, filter, repo],
  );
  const repos = useMemo(() => [...new Set((data?.runs ?? []).map((run) => run.repo).filter((r): r is string => Boolean(r)))].sort(), [data]);

  if (data === null) {
    return (
      <div className="h-full min-h-0 flex-1 overflow-y-auto p-6">
        <BackLink onBack={onBack} />
        {error ? <ErrorText>{error}</ErrorText> : <EmptyState icon="Loading">Читаю метрики AIRD…</EmptyState>}
      </div>
    );
  }

  const deliveries = runs.filter((run) => run.kind === "delivery");
  const discoveries = runs.filter((run) => run.kind === "discovery");
  const escalated = runs.filter((run) => run.outcome === "escalated").length;
  const fpMedian = median(deliveries.map(firstPass).filter((v): v is number => v !== null));
  const durMedian = median(runs.map((run) => run.durationHours).filter((v): v is number => v !== null));
  const findingsSum = runs.reduce((sum, run) => sum + (run.findingsTotal ?? 0), 0);
  const proposals = data.backlog.filter((entry) => entry.type === "proposal");
  const watch = data.backlog.filter((entry) => entry.type === "watch");
  const proposalStatus = (status: string) => proposals.filter((p) => p.status === status).length;

  return (
    <div className="relative flex h-full min-h-0 flex-1">
      <div className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-7xl space-y-4 px-4 py-4 md:px-6 md:py-5">
          <BackLink onBack={onBack} />
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold">Самоулучшение AIRD</h2>
              <p className="text-sm text-muted-foreground">
                Метрики, которые discovery и delivery пишут в конце каждого прогона, сигналы правила «повторилось дважды → правило» и backlog улучшений скиллов.
                <span className="ml-1 font-mono text-xs">{shortPath(data.dir)}</span>
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Segmented<KindFilter>
                value={filter}
                onChange={setFilter}
                items={[
                  { value: "all", label: "Все" },
                  { value: "discovery", label: "Discovery", tone: "accent" },
                  { value: "delivery", label: "Delivery", tone: "info" },
                ]}
              />
              <select value={repo} onChange={(event) => setRepo(event.target.value)} className="h-8 cursor-pointer rounded-md border border-input bg-transparent px-2 text-xs">
                <option value="">Все репозитории</option>
                {repos.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <ErrorText>{data.error ?? error}</ErrorText>

          <div className="@container">
          <div className="grid grid-cols-2 gap-3 @lg:grid-cols-4 @6xl:grid-cols-8">
            <Stat label="Прогонов" value={runs.length} sub={`${discoveries.length} disc · ${deliveries.length} deliv`} />
            <Stat label="Эскалаций" value={escalated} tone={escalated > 0 ? "warn" : undefined} sub={runs.length ? `${Math.round((escalated / runs.length) * 100)}% прогонов` : undefined} />
            <Stat label="First-pass гейтов" value={fpMedian === null ? "—" : `${Math.round(fpMedian * 100)}%`} sub="медиана delivery" />
            <Stat label="Длительность" value={durMedian === null ? "—" : `${durMedian} ч`} sub="медиана" />
            <Stat label="Находок" value={findingsSum} sub="ревью + QA" />
            <Stat label="Предложения" value={proposals.length} sub={`${proposalStatus("proposed")} ждут · ${proposalStatus("applied")} применено`} />
            <Stat label="Наблюдения" value={watch.length} sub="watch items" />
            <Stat label="Eval-кейсы" value={data.evals.length} />
          </div>
          </div>

          <Card title="Прогоны во времени" hint="точка — прогон; цвет — исход; размер — число находок; кольцо — ⚠-сигнал">
            <RunsTimeline runs={runs} selected={selection?.kind === "run" ? selection.key : null} onSelect={(key) => setSelection({ kind: "run", key })} />
          </Card>

          <div className="@container">
          <div className="grid gap-4 @4xl:grid-cols-2">
            <Card title="First-pass гейтов по delivery" hint="доля гейтов, прошедших с первого раза; пунктир — медиана">
              <FirstPassChart runs={deliveries} median={fpMedian} selected={selection?.kind === "run" ? selection.key : null} onSelect={(key) => setSelection({ kind: "run", key })} />
            </Card>
            <Card title="Сигналы улучшения" hint="сколько прогонов зажгли сигнал; ⚠ — предлагается сразу, ≥2 — системный">
              <SignalsChart runs={runs} selected={selection?.kind === "signal" ? selection.id : null} onSelect={(id) => setSelection({ kind: "signal", id })} />
            </Card>
            <Card title="Находки по классам" hint="суммарно по прогонам">
              <ClassBars runs={runs} />
            </Card>
            <Card title="Где рождаются находки (delivery)" hint="code — реализация; workorder — пакет; intent — запрос">
              <RootCauseBars runs={deliveries} onSelect={(key) => setSelection({ kind: "run", key })} />
            </Card>
          </div>
          </div>

          <Card title={`Прогоны (${runs.length})`}>
            <RunsTable runs={runs} selected={selection?.kind === "run" ? selection.key : null} onSelect={(key) => setSelection({ kind: "run", key })} />
          </Card>

          <Card title="Backlog улучшений скиллов">
            <Tabs<"proposal" | "watch" | "eval">
              value={backlogTab}
              onChange={setBacklogTab}
              items={[
                { value: "proposal", label: "Предложения", count: proposals.length },
                { value: "watch", label: "Наблюдения", count: watch.length },
                { value: "eval", label: "Eval-кейсы", count: data.evals.length },
              ]}
            />
            {backlogTab === "proposal" ? (
              <div className="space-y-2">
                <SplitBar
                  parts={[
                    { value: proposalStatus("proposed"), tone: "accent", label: "ждут решения" },
                    { value: proposalStatus("accepted"), tone: "info", label: "приняты" },
                    { value: proposalStatus("applied"), tone: "good", label: "применены" },
                    { value: proposalStatus("rejected"), tone: "bad", label: "отклонены" },
                  ]}
                />
                <BacklogList entries={data.backlog} type="proposal" selected={selection} onSelect={(index) => setSelection({ kind: "backlog", index })} />
              </div>
            ) : backlogTab === "watch" ? (
              <BacklogList entries={data.backlog} type="watch" selected={selection} onSelect={(index) => setSelection({ kind: "backlog", index })} />
            ) : (
              <ul className="divide-y divide-border rounded-lg border border-border">
                {data.evals.map((item) => (
                  <li key={item.file}>
                    <button
                      type="button"
                      onClick={() => setSelection({ kind: "eval", file: item.file })}
                      className={cn(
                        "flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm hover:bg-state-hover",
                        selection?.kind === "eval" && selection.file === item.file && "bg-state-active",
                      )}
                    >
                      <Icon name="FileText" className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{item.title}</span>
                      <span className="hidden font-mono text-[11px] text-muted-foreground @2xl:inline">{item.file}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>
      {selection ? (
        <aside className="absolute inset-0 z-20 flex flex-col bg-background md:static md:z-auto md:w-[min(46%,620px)] md:shrink-0 md:border-l md:border-border">
          <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border px-3">
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{selectionTitle(selection, data)}</span>
            <Button variant="ghost" size="icon" className="size-8" aria-label="Закрыть" onClick={() => setSelection(null)}>
              <Icon name="X" fallback="ClosePluginPane" className="size-4" />
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            {selection.kind === "run" ? (
              <RunDetail run={data.runs.find((run) => run.key === selection.key) ?? null} onSignal={(id) => setSelection({ kind: "signal", id })} />
            ) : selection.kind === "backlog" ? (
              <MarkdownCard content={data.backlog[selection.index]?.markdown ?? ""} />
            ) : selection.kind === "eval" ? (
              <EvalDetail file={selection.file} />
            ) : (
              <SignalDetail id={selection.id} runs={data.runs} onRun={(key) => setSelection({ kind: "run", key })} />
            )}
          </div>
        </aside>
      ) : null}
    </div>
  );
}

function selectionTitle(selection: Selection, data: MetricsOverview): string {
  if (selection.kind === "run") {
    const run = data.runs.find((r) => r.key === selection.key);
    return run ? `${run.kind} · ${run.slug ?? "—"} · ${fmtDate(run.ts)}` : "Прогон";
  }
  if (selection.kind === "backlog") return data.backlog[selection.index]?.id ?? data.backlog[selection.index]?.title.slice(0, 60) ?? "Запись backlog";
  if (selection.kind === "eval") return selection.file;
  return "Сигнал";
}

function BackLink({ onBack }: { onBack: () => void }) {
  return (
    <button type="button" onClick={onBack} className="inline-flex cursor-pointer items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
      <Icon name="ArrowLeft" className="size-4" />
      Все AIRD
    </button>
  );
}

function Card({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">{title}</h3>
        {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
      </div>
      {children}
    </section>
  );
}

function MarkdownCard({ content }: { content: string }) {
  return <MarkdownView content={content || "_Пусто_"} />;
}

// ------------------------------------------------------------------ charts

function RunsTimeline({ runs, selected, onSelect }: { runs: MetricsRun[]; selected: string | null; onSelect: (key: string) => void }) {
  const dated = runs.filter((run) => run.ts && !Number.isNaN(Date.parse(run.ts)));
  if (dated.length === 0) return <p className="text-sm text-muted-foreground">Нет прогонов с датой.</p>;
  const times = dated.map((run) => Date.parse(run.ts!));
  const min = Math.min(...times);
  const max = Math.max(...times);
  const span = Math.max(max - min, 86_400_000);
  const width = 1000;
  const left = 90;
  const right = 20;
  const lanes = { discovery: 40, delivery: 100, other: 140 } as const;
  const x = (t: number) => left + ((t - min) / span) * (width - left - right);
  const months: number[] = [];
  const start = new Date(min);
  for (let d = new Date(start.getFullYear(), start.getMonth(), 1); d.getTime() <= max; d.setMonth(d.getMonth() + 1)) {
    if (d.getTime() >= min - 86_400_000 * 31) months.push(d.getTime());
  }
  const maxFindings = Math.max(1, ...dated.map((run) => run.findingsTotal ?? 0));
  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${width} 165`} className="block h-auto w-full min-w-[640px]" role="img" aria-label="Прогоны AIRD во времени">
        {months
          .map((t) => ({ t, px: x(Math.max(t, min)) }))
          .filter((item, index, list) => index === list.length - 1 || list[index + 1]!.px - item.px > 70)
          .map(({ t, px }) => (
            <g key={t}>
              <line x1={px} x2={px} y1={14} y2={130} className="stroke-border" strokeDasharray="2 4" />
              <text x={px + 3} y={150} fontSize={10} className="fill-muted-foreground">
                {new Date(t).toLocaleDateString("ru-RU", { month: "short", year: "2-digit" })}
              </text>
            </g>
          ))}
        {(["discovery", "delivery"] as const).map((lane) => (
          <g key={lane}>
            <line x1={left} x2={width - right} y1={lanes[lane]} y2={lanes[lane]} className="stroke-border" />
            <text x={8} y={lanes[lane] + 4} fontSize={11} fontWeight={600} className="fill-muted-foreground">
              {lane}
            </text>
          </g>
        ))}
        {dated.map((run) => {
          const cx = x(Date.parse(run.ts!));
          const cy = lanes[run.kind];
          const r = 5 + ((run.findingsTotal ?? 0) / maxFindings) * 9;
          const color = TONE_COLORS[outcomeTone(run.outcome)];
          const severe = run.signals.some((s) => s.severe);
          const isSel = selected === run.key;
          return (
            <g key={run.key} className="cursor-pointer" onClick={() => onSelect(run.key)}>
              <title>{`${fmtDate(run.ts)} · ${run.kind} · ${run.slug ?? ""} · ${OUTCOME_LABELS[run.outcome ?? ""] ?? run.outcome ?? ""} · находок ${run.findingsTotal ?? "—"} · сигналов ${run.signals.length}`}</title>
              {severe ? <circle cx={cx} cy={cy} r={r + 4} fill="none" stroke={TONE_COLORS.bad} strokeWidth={1.5} strokeDasharray="3 2" /> : null}
              <circle cx={cx} cy={cy} r={r} fill={color} fillOpacity={0.75} stroke={isSel ? TONE_COLORS.info : color} strokeWidth={isSel ? 3 : 1} />
            </g>
          );
        })}
      </svg>
      <div className="mt-1 flex flex-wrap gap-3 text-[11px] text-muted-foreground">
        {(["complete", "escalated", "abandoned"] as const).map((outcome) => (
          <span key={outcome} className="inline-flex items-center gap-1">
            <span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: TONE_COLORS[outcomeTone(outcome)] }} />
            {OUTCOME_LABELS[outcome]}
          </span>
        ))}
      </div>
    </div>
  );
}

function FirstPassChart({ runs, median: med, selected, onSelect }: { runs: MetricsRun[]; median: number | null; selected: string | null; onSelect: (key: string) => void }) {
  const rows = runs.map((run) => ({ run, rate: firstPass(run) }));
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Нет delivery-прогонов.</p>;
  const barW = 30;
  const gap = 10;
  const height = 170;
  const top = 12;
  const base = 130;
  const width = Math.max(320, 40 + rows.length * (barW + gap));
  return (
    <div className="w-full overflow-x-auto">
      <svg width={width} height={height} className="block" role="img" aria-label="First-pass гейтов">
        {[0, 0.5, 1].map((v) => (
          <g key={v}>
            <line x1={30} x2={width} y1={base - v * (base - top)} y2={base - v * (base - top)} className="stroke-border" strokeDasharray="2 4" />
            <text x={2} y={base - v * (base - top) + 3} fontSize={9.5} className="fill-muted-foreground">
              {Math.round(v * 100)}%
            </text>
          </g>
        ))}
        {med !== null ? <line x1={30} x2={width} y1={base - med * (base - top)} y2={base - med * (base - top)} stroke={TONE_COLORS.accent} strokeWidth={1.5} strokeDasharray="6 4" /> : null}
        {rows.map(({ run, rate }, index) => {
          const xPos = 40 + index * (barW + gap);
          const h = rate === null ? 0 : rate * (base - top);
          const color = rate === null ? undefined : rate >= (med ?? 0) ? TONE_COLORS.good : TONE_COLORS.warn;
          return (
            <g key={run.key} className="cursor-pointer" onClick={() => onSelect(run.key)}>
              <title>{`${run.slug} · ${fmtDate(run.ts)} · ${rate === null ? "first-pass не записан" : `${run.gatesFirstPass}/${run.gatesTotal} = ${Math.round(rate * 100)}%`}`}</title>
              <rect x={xPos} y={top} width={barW} height={base - top} fill="transparent" />
              {rate === null ? (
                <text x={xPos + barW / 2} y={base - 4} textAnchor="middle" fontSize={10} className="fill-muted-foreground">
                  n/a
                </text>
              ) : (
                <rect x={xPos} y={base - h} width={barW} height={h} rx={3} fill={color} stroke={selected === run.key ? TONE_COLORS.info : undefined} strokeWidth={2} />
              )}
              <text x={xPos + barW / 2} y={base + 12} textAnchor="middle" fontSize={9} className="fill-muted-foreground">
                {fmtDate(run.ts).slice(0, 5)}
              </text>
              <text x={xPos + barW / 2} y={base + 24} textAnchor="middle" fontSize={8.5} className="fill-muted-foreground">
                {(run.slug ?? "").slice(0, 6)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function HBar({ label, value, max, color, right, onClick, active, title }: { label: ReactNode; value: number; max: number; color: string; right?: ReactNode; onClick?: () => void; active?: boolean; title?: string }) {
  return (
    <div
      title={title}
      onClick={onClick}
      className={cn("grid grid-cols-[minmax(0,13rem)_minmax(0,1fr)_auto] items-center gap-2 rounded px-1 py-0.5 text-xs", onClick && "cursor-pointer hover:bg-state-hover", active && "bg-state-active")}
    >
      <span className="truncate">{label}</span>
      <span className="h-2.5 overflow-hidden rounded-full bg-muted">
        <span className="block h-full rounded-full" style={{ width: `${(value / Math.max(max, 1)) * 100}%`, backgroundColor: color }} />
      </span>
      <span className="w-14 text-right tabular-nums">{right ?? value}</span>
    </div>
  );
}

function SignalsChart({ runs, selected, onSelect }: { runs: MetricsRun[]; selected: string | null; onSelect: (id: string) => void }) {
  const stats = new Map<string, { label: string; severe: boolean; count: number }>();
  for (const run of runs) {
    for (const signal of run.signals) {
      const entry = stats.get(signal.id) ?? { label: signal.id === "top-class-repeat" ? "Повтор верхнего класса находок" : signal.label, severe: signal.severe, count: 0 };
      entry.count += 1;
      stats.set(signal.id, entry);
    }
  }
  const rows = [...stats.entries()].sort((a, b) => b[1].count - a[1].count);
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Сигналов нет.</p>;
  const max = Math.max(...rows.map(([, s]) => s.count));
  return (
    <div className="space-y-0.5">
      {rows.map(([id, signal]) => (
        <HBar
          key={id}
          label={
            <span>
              {signal.severe ? <span style={{ color: TONE_COLORS.bad }}>⚠ </span> : null}
              {signal.label}
            </span>
          }
          title={signal.label}
          value={signal.count}
          max={max}
          color={signal.severe ? TONE_COLORS.bad : signal.count >= 2 ? TONE_COLORS.warn : TONE_COLORS.neutral}
          right={
            <span>
              {signal.count}
              {signal.count >= 2 ? <span className="ml-1 text-[10px] text-muted-foreground">сист.</span> : null}
            </span>
          }
          onClick={() => onSelect(id)}
          active={selected === id}
        />
      ))}
    </div>
  );
}

function ClassBars({ runs }: { runs: MetricsRun[] }) {
  const totals = new Map<string, { discovery: number; delivery: number }>();
  for (const run of runs) {
    if (!run.findingsByClass) continue;
    for (const [cls, value] of Object.entries(run.findingsByClass)) {
      const entry = totals.get(cls) ?? { discovery: 0, delivery: 0 };
      if (run.kind === "discovery") entry.discovery += value;
      else entry.delivery += value;
      totals.set(cls, entry);
    }
  }
  const rows = [...totals.entries()].map(([cls, v]) => ({ cls, ...v, total: v.discovery + v.delivery })).filter((r) => r.total > 0).sort((a, b) => b.total - a.total);
  const unknown = runs.filter((run) => (run.findingsTotal ?? 0) > 0 && !run.findingsByClass).length;
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Классы находок не записаны.</p>;
  const max = Math.max(...rows.map((r) => r.total));
  return (
    <div className="space-y-1">
      {rows.map((row, index) => (
        <div key={row.cls} className="grid grid-cols-[8rem_minmax(0,1fr)_auto] items-center gap-2 text-xs">
          <span className="truncate font-mono">{row.cls}</span>
          <span className="flex h-2.5 overflow-hidden rounded-full bg-muted" style={{ width: `${(row.total / max) * 100}%` }}>
            <span title={`discovery: ${row.discovery}`} style={{ width: `${(row.discovery / row.total) * 100}%`, backgroundColor: TONE_COLORS.accent }} />
            <span title={`delivery: ${row.delivery}`} style={{ width: `${(row.delivery / row.total) * 100}%`, backgroundColor: CLASS_COLORS[index % CLASS_COLORS.length] }} />
          </span>
          <span className="w-10 text-right tabular-nums">{row.total}</span>
        </div>
      ))}
      <div className="flex flex-wrap gap-3 pt-1 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: TONE_COLORS.accent }} />
          discovery-ревью
        </span>
        <span>остальное — delivery</span>
        {unknown > 0 ? <span>· {unknown} прогон(ов) без классов (не попали в график)</span> : null}
      </div>
    </div>
  );
}

function RootCauseBars({ runs, onSelect }: { runs: MetricsRun[]; onSelect: (key: string) => void }) {
  const rows = runs.filter((run) => run.findingsByRootCause && Object.values(run.findingsByRootCause).some((v) => v > 0));
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">root_cause у находок пока не записан.</p>;
  const colors: Record<string, string> = { code: TONE_COLORS.info, workorder: TONE_COLORS.warn, intent: TONE_COLORS.accent };
  const totals = { code: 0, workorder: 0, intent: 0 } as Record<string, number>;
  for (const run of rows) for (const key of Object.keys(totals)) totals[key] = (totals[key] ?? 0) + (run.findingsByRootCause?.[key] ?? 0);
  return (
    <div className="space-y-2">
      <SplitBar parts={Object.entries(totals).map(([key, value]) => ({ value, tone: key === "code" ? "info" : key === "workorder" ? "warn" : "accent", label: key }))} />
      <div className="flex flex-wrap gap-3 text-[11px] text-muted-foreground">
        {Object.entries(totals).map(([key, value]) => (
          <span key={key} className="inline-flex items-center gap-1">
            <span className="inline-block size-2.5 rounded-full" style={{ backgroundColor: colors[key] }} />
            {key}: {value}
          </span>
        ))}
      </div>
      <div className="space-y-1">
        {rows.map((run) => {
          const rc = run.findingsByRootCause!;
          const total = Object.values(rc).reduce((a, b) => a + b, 0);
          return (
            <div key={run.key} onClick={() => onSelect(run.key)} className="grid cursor-pointer grid-cols-[minmax(0,12rem)_minmax(0,1fr)_auto] items-center gap-2 rounded px-1 py-0.5 text-xs hover:bg-state-hover">
              <span className="truncate">
                {fmtDate(run.ts)} · {run.slug}
              </span>
              <span className="flex h-2.5 overflow-hidden rounded-full bg-muted">
                {["code", "workorder", "intent"].map((key) =>
                  (rc[key] ?? 0) > 0 ? <span key={key} title={`${key}: ${rc[key]}`} style={{ width: `${((rc[key] ?? 0) / total) * 100}%`, backgroundColor: colors[key] }} /> : null,
                )}
              </span>
              <span className="w-8 text-right tabular-nums">{total}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ lists

function RunsTable({ runs, selected, onSelect }: { runs: MetricsRun[]; selected: string | null; onSelect: (key: string) => void }) {
  const cols = "grid items-center gap-x-3 grid-cols-[64px_70px_minmax(0,1fr)_80px] @3xl:grid-cols-[64px_70px_minmax(0,1fr)_70px_80px_56px_64px_56px_90px]";
  return (
    <div className="@container overflow-hidden rounded-lg border border-border">
      <div className={cn(cols, "border-b border-border bg-muted/40 px-3 py-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground")}>
        <span>Дата</span>
        <span>Тип</span>
        <span>Репо · AIRD</span>
        <span className="hidden @3xl:block">Профиль</span>
        <span>Исход</span>
        <span className="hidden text-right @3xl:block">Часы</span>
        <span className="hidden text-right @3xl:block">Гейты</span>
        <span className="hidden text-right @3xl:block">Нах.</span>
        <span className="hidden @3xl:block">Сигналы</span>
      </div>
      <ul className="divide-y divide-border">
        {[...runs].reverse().map((run) => {
          const severe = run.signals.filter((s) => s.severe).length;
          return (
            <li key={run.key}>
              <button
                type="button"
                onClick={() => onSelect(run.key)}
                className={cn(cols, "w-full cursor-pointer px-3 py-1.5 text-left text-xs hover:bg-state-hover", selected === run.key && "bg-state-active")}
              >
                <span className="tabular-nums text-muted-foreground">{fmtDate(run.ts)}</span>
                <span>
                  <Pill tone={run.kind === "discovery" ? "accent" : "info"}>{run.kind === "discovery" ? "disc" : run.kind === "delivery" ? "deliv" : run.kind}</Pill>
                </span>
                <span className="min-w-0 truncate">
                  <span className="text-muted-foreground">{run.repo} · </span>
                  <span className="font-medium">{run.slug}</span>
                </span>
                <span className="hidden truncate text-muted-foreground @3xl:block">{run.profile ?? "—"}</span>
                <span>
                  <Pill tone={outcomeTone(run.outcome)}>{OUTCOME_LABELS[run.outcome ?? ""] ?? run.outcome ?? "—"}</Pill>
                </span>
                <span className="hidden text-right tabular-nums @3xl:block">{run.durationHours ?? "—"}</span>
                <span className="hidden text-right tabular-nums @3xl:block">{run.kind === "delivery" ? `${run.gatesFirstPass ?? "?"}/${run.gatesTotal ?? "?"}` : "—"}</span>
                <span className="hidden text-right tabular-nums @3xl:block">{run.findingsTotal ?? "—"}</span>
                <span className="hidden items-center gap-1 @3xl:flex">
                  {severe > 0 ? <Pill tone="bad">⚠ {severe}</Pill> : null}
                  {run.signals.length - severe > 0 ? <Pill tone="warn">{run.signals.length - severe}</Pill> : null}
                  {run.signals.length === 0 ? <span className="text-muted-foreground">—</span> : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

const BACKLOG_STATUS: Record<string, { label: string; tone: Tone }> = {
  proposed: { label: "ждёт решения", tone: "accent" },
  accepted: { label: "принято", tone: "info" },
  applied: { label: "применено", tone: "good" },
  rejected: { label: "отклонено", tone: "bad" },
  watch: { label: "наблюдение", tone: "warn" },
  closed: { label: "закрыто", tone: "neutral" },
};

function BacklogList({ entries, type, selected, onSelect }: { entries: BacklogEntry[]; type: "proposal" | "watch"; selected: Selection | null; onSelect: (index: number) => void }) {
  const rows = entries.map((entry, index) => ({ entry, index })).filter(({ entry }) => entry.type === type);
  rows.sort((a, b) => {
    const order = ["proposed", "watch", "accepted", "applied", "closed", "rejected"];
    return (order.indexOf(a.entry.status) + 10) % 20 - (order.indexOf(b.entry.status) + 10) % 20 || (b.entry.date ?? "").localeCompare(a.entry.date ?? "");
  });
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Пусто.</p>;
  return (
    <ul className="divide-y divide-border rounded-lg border border-border">
      {rows.map(({ entry, index }) => {
        const meta = BACKLOG_STATUS[entry.status] ?? { label: entry.status, tone: "neutral" as Tone };
        return (
          <li key={index}>
            <button
              type="button"
              onClick={() => onSelect(index)}
              className={cn("flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left text-sm hover:bg-state-hover", selected?.kind === "backlog" && selected.index === index && "bg-state-active")}
            >
              <Pill tone={meta.tone}>{meta.label}</Pill>
              {entry.id ? <span className="shrink-0 font-mono text-[11px] text-muted-foreground">{entry.id}</span> : null}
              <span className="min-w-0 flex-1 truncate">{entry.title}</span>
              <span className="shrink-0 text-[11px] text-muted-foreground">{entry.date ?? ""}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

// ------------------------------------------------------------------ panel

function RunDetail({ run, onSignal }: { run: MetricsRun | null; onSignal: (id: string) => void }) {
  if (!run) return <ErrorText>Прогон не найден</ErrorText>;
  const fields: [string, ReactNode][] = [
    ["Репозиторий", run.repo],
    ["AIRD", run.slug],
    ["Профиль", run.profile],
    ["Runtime", run.runtime],
    ["Длительность, ч", run.durationHours],
    ["Handoff'ов", run.rootHandoffs],
  ];
  if (run.kind === "discovery") {
    fields.push(
      ["Вопросов интервью", run.interviewQuestions],
      ["Решения", run.decisions ? Object.entries(run.decisions).map(([k, v]) => `${k}: ${v}`).join(", ") : null],
      ["Existential-риски", run.existentialRisks ? Object.entries(run.existentialRisks).map(([k, v]) => `${k}: ${v}`).join(", ") : null],
      ["Итераций discovery", run.discoveryIterations],
      ["Воркордеров", run.workordersTotal],
      ["Находок финального ревью", run.reviewFindings],
      ["Покрытие ревью", run.reviewCoverage],
      ["Исправлений по --strict", run.strictValidatorFixes],
      ["Поздних исправлений", run.scopedCorrections],
    );
  } else {
    fields.push(
      ["Слайсов", run.slicesTotal],
      ["Воркеров запущено", run.workersSpawned],
      ["Гейтов", run.gatesTotal],
      ["Прошли с 1-го раза", run.gatesFirstPass],
      ["Без доказательств", run.gatesBlockedNoEvidence],
      ["Waived", run.gatesWaived],
      ["Находок", run.findingsTotal],
      ["Циклов исправлений", run.fixCycles],
      ["Макс. попыток ревизии", run.maxRevisionAttempts],
      ["Эскалаций", run.escalations],
      ["Без класса", run.unclassified],
      ["Дефектов discovery", run.discoveryDefects],
      ["Переписанных файлов пакета", run.packageReworkFiles],
      ["Hard stop", run.hardStops],
      ["Автокомпакций", run.autoCompactions],
    );
  }
  const shown = fields.filter(([, v]) => v !== null && v !== undefined && v !== "");
  const missing = fields.filter(([, v]) => v === null || v === undefined || v === "").map(([k]) => k);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone={run.kind === "discovery" ? "accent" : "info"}>{run.kind}</Pill>
        <Pill tone={outcomeTone(run.outcome)}>{OUTCOME_LABELS[run.outcome ?? ""] ?? run.outcome ?? "—"}</Pill>
        <span className="text-xs text-muted-foreground">{run.ts}</span>
      </div>
      <section className="space-y-1.5">
        <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Сигналы ({run.signals.length})</h4>
        {run.signals.length === 0 ? (
          <p className="text-sm text-muted-foreground">Сигналов нет — прогон не требует улучшений скилла.</p>
        ) : (
          <ul className="space-y-1">
            {run.signals.map((signal) => (
              <li key={signal.id}>
                <button type="button" onClick={() => onSignal(signal.id)} className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-left text-sm hover:bg-state-hover">
                  <span style={{ color: signal.severe ? TONE_COLORS.bad : TONE_COLORS.warn }}>{signal.severe ? "⚠" : "●"}</span>
                  <span>{signal.label}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
      <dl className="grid grid-cols-[minmax(130px,auto)_minmax(0,1fr)] gap-x-3 gap-y-1 rounded-lg border border-border bg-card/60 p-3 text-xs">
        {shown.map(([name, value]) => (
          <div key={name} className="contents">
            <dt className="text-muted-foreground">{name}</dt>
            <dd className="tabular-nums">{String(value)}</dd>
          </div>
        ))}
      </dl>
      {run.findingsByClass ? (
        <section className="space-y-1">
          <h4 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Находки по классам</h4>
          {Object.entries(run.findingsByClass)
            .sort((a, b) => b[1] - a[1])
            .map(([cls, value], index) => (
              <HBar key={cls} label={<span className="font-mono">{cls}</span>} value={value} max={Math.max(...Object.values(run.findingsByClass!))} color={CLASS_COLORS[index % CLASS_COLORS.length]!} />
            ))}
        </section>
      ) : null}
      {run.findingsByRootCause ? (
        <div className="flex flex-wrap gap-1.5">
          {Object.entries(run.findingsByRootCause).map(([key, value]) => (
            <Chip key={key}>
              {key}: {value}
            </Chip>
          ))}
        </div>
      ) : null}
      {run.notes ? <p className="whitespace-pre-wrap rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">{run.notes}</p> : null}
      {missing.length > 0 ? <p className="text-[11px] text-muted-foreground">Не записано (null): {missing.join(", ")}</p> : null}
      <details>
        <summary className="cursor-pointer text-xs text-muted-foreground">Исходная запись history.jsonl</summary>
        <pre className="mt-2 max-h-96 overflow-auto rounded-md bg-muted/40 p-2 text-[11px]">{run.raw}</pre>
      </details>
    </div>
  );
}

function SignalDetail({ id, runs, onRun }: { id: string; runs: MetricsRun[]; onRun: (key: string) => void }) {
  const hits = runs.filter((run) => run.signals.some((s) => s.id === id));
  const label = hits[0]?.signals.find((s) => s.id === id)?.label ?? id;
  const severe = hits[0]?.signals.find((s) => s.id === id)?.severe ?? false;
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {severe ? <Pill tone="bad">⚠ сразу предложение</Pill> : hits.length >= 2 ? <Pill tone="warn">системный (≥2)</Pill> : <Pill tone="neutral">наблюдение</Pill>}
      </div>
      <h3 className="text-base font-semibold">{label}</h3>
      <p className="text-sm text-muted-foreground">
        По правилу «повторилось дважды → правило» сигнал, сработавший в текущем и хотя бы одном прошлом прогоне, обязан дать предложение в backlog; ⚠-сигналы дают предложение с первого раза.
      </p>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {hits.map((run) => (
          <li key={run.key}>
            <button type="button" onClick={() => onRun(run.key)} className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-state-hover">
              <span className="tabular-nums text-muted-foreground">{fmtDate(run.ts)}</span>
              <Pill tone={run.kind === "discovery" ? "accent" : "info"}>{run.kind}</Pill>
              <span className="min-w-0 flex-1 truncate">{run.slug}</span>
              <Pill tone={outcomeTone(run.outcome)}>{OUTCOME_LABELS[run.outcome ?? ""] ?? run.outcome ?? "—"}</Pill>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

function EvalDetail({ file }: { file: string }) {
  const rpc = useFactoryRpc();
  const [markdown, setMarkdown] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    setMarkdown(null);
    rpc.call("metrics_eval", { file }).then(
      (result) => setMarkdown(result.markdown),
      (cause) => setError(errorText(cause)),
    );
  }, [rpc, file]);
  if (error) return <ErrorText>{error}</ErrorText>;
  if (markdown === null) return <EmptyState icon="Loading">Загружаю…</EmptyState>;
  return <MarkdownCard content={markdown} />;
}

/** Compact per-AIRD block for the AIRD overview: this package's recorded runs. */
export function AirdMetricsSection({ slug, onOpen }: { slug: string; onOpen: (key: string) => void }) {
  const rpc = useFactoryRpc();
  const [runs, setRuns] = useState<MetricsRun[] | null>(null);
  useEffect(() => {
    rpc.call("metrics_runs", { slug }).then(
      (result) => setRuns(result.runs),
      () => setRuns([]),
    );
  }, [rpc, slug]);
  if (!runs || runs.length === 0) return null;
  return (
    <section className="space-y-2.5 rounded-xl border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Метрики процесса (самоулучшение)</h3>
        <span className="text-xs text-muted-foreground">{runs.length} записей в history.jsonl</span>
      </div>
      <ul className="divide-y divide-border rounded-lg border border-border">
        {runs.map((run) => (
          <li key={run.key}>
            <button type="button" onClick={() => onOpen(run.key)} className="flex w-full cursor-pointer flex-wrap items-center gap-2 px-3 py-2 text-left text-xs hover:bg-state-hover">
              <span className="tabular-nums text-muted-foreground">{fmtDate(run.ts)}</span>
              <Pill tone={run.kind === "discovery" ? "accent" : "info"}>{run.kind}</Pill>
              <Pill tone={outcomeTone(run.outcome)}>{OUTCOME_LABELS[run.outcome ?? ""] ?? run.outcome ?? "—"}</Pill>
              {run.kind === "delivery" ? <Chip>гейты {run.gatesFirstPass ?? "?"}/{run.gatesTotal ?? "?"}</Chip> : <Chip>вопросов {run.interviewQuestions ?? "—"}</Chip>}
              <Chip>находок {run.findingsTotal ?? "—"}</Chip>
              <span className="ml-auto flex flex-wrap gap-1">
                {run.signals.slice(0, 4).map((signal) => (
                  <Pill key={signal.id} tone={signal.severe ? "bad" : "warn"}>
                    {signal.severe ? "⚠ " : ""}
                    {signal.label.length > 34 ? `${signal.label.slice(0, 33)}…` : signal.label}
                  </Pill>
                ))}
                {run.signals.length > 4 ? <Chip>+{run.signals.length - 4}</Chip> : null}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
