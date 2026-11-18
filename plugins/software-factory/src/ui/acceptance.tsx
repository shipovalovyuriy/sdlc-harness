// "Приёмка": the blind acceptance gate of an AIRD. Scenarios come from
// 09-dod.md (`### Acceptance Scenarios`), the suite from a test author who
// never saw the implementation, verdicts from runs the plugin itself makes.
import { useCallback, useEffect, useState } from "react";
import { useRealtime } from "@get-bb/plugin-sdk/app";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { Acceptance, AcceptanceRun, AirdDetail, Scenario } from "../contract";
import { CHANGED, THREAD_STATUS_LABELS, TONE_COLORS, errorText, isRunningThread, relativeTime, shortPath, threadTone, useFactoryRpc, type Tone } from "./data";
import { RefLink, useInspect } from "./inspector";
import { Chip, Dot, EmptyState, ErrorText, Pill, SplitBar, Stat } from "./kit";

const RESULT: Record<string, { label: string; tone: Tone }> = {
  passed: { label: "прошёл", tone: "good" },
  failed: { label: "не прошёл", tone: "bad" },
  skipped: { label: "пропущен", tone: "warn" },
  missing: { label: "нет теста", tone: "warn" },
};

function useAcceptance(id: string) {
  const rpc = useFactoryRpc();
  const [data, setData] = useState<Acceptance | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    rpc.call("acceptance", { id }).then(
      (value) => {
        setData(value);
        setError(null);
      },
      (cause) => setError(errorText(cause)),
    );
  }, [rpc, id]);
  useEffect(() => {
    load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 6000);
    return () => clearInterval(timer);
  }, [load]);
  useRealtime(CHANGED, load);
  return { data, error, reload: load };
}

export function AcceptanceTab({ data: aird }: { data: AirdDetail }) {
  const rpc = useFactoryRpc();
  const { open } = useInspect();
  const { data, error, reload } = useAcceptance(aird.summary.id);
  const [actionError, setActionError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [logRun, setLogRun] = useState<{ run: AcceptanceRun; log: string } | null>(null);

  if (data === null) return error ? <ErrorText>{error}</ErrorText> : <EmptyState icon="Loading">Читаю сценарии приёмки…</EmptyState>;

  const start = (baseline: boolean) => {
    setActionError(null);
    rpc.call("acceptance_run", { id: aird.summary.id, baseline }).then(reload, (cause) => setActionError(errorText(cause)));
  };
  const showLog = (run: AcceptanceRun) => {
    rpc.call("acceptance_log", { runId: run.id }).then(
      (result) => setLogRun({ run, log: result.log }),
      (cause) => setActionError(errorText(cause)),
    );
  };

  const scenarios = data.scenarios;
  const required = scenarios.filter((s) => s.applicable);
  const current = required.filter((s) => s.current);
  const byUser = required.filter((s) => s.approved === "user").length;
  const ran = required.some((s) => s.last !== null);
  const passed = required.filter((s) => s.last === "passed").length;
  const failed = required.filter((s) => s.last === "failed").length;
  const noEvidence = required.filter((s) => s.last === "skipped" || s.last === "missing").length;
  const baselineRan = current.some((s) => s.baseline !== null);
  const redOnBase = current.filter((s) => s.baseline === "failed").length;
  const greenOnBase = current.filter((s) => s.baseline === "passed" && !/^pre-existing:\s*\S/iu.test(s.baselineNote ?? "")).map((s) => s.id);
  const gate = {
    untested: { label: "ещё не запускалась", tone: "neutral" },
    passed: { label: "пройдена", tone: "good" },
    failed: { label: "не пройдена", tone: "bad" },
    blocked: { label: "blocked-no-evidence", tone: "warn" },
  }[data.gate] as { label: string; tone: Tone };

  if (scenarios.length === 0) {
    return (
      <EmptyState icon="SecurityCheck">
        <span className="max-w-xl">
          В <code>09-dod.md</code> этого пакета нет раздела <code>### Acceptance Scenarios</code>. Discovery теперь фиксирует там ожидаемые результаты
          (дано → действие → ожидаемое) до кода; по ним независимый <code>test-author</code> пишет приёмочные тесты, которых исполнитель не видит.
          Для уже принятого пакета сценарии можно добавить через Discovery.
        </span>
      </EmptyState>
    );
  }

  return (
    <div className="space-y-4">
      <div className="@container">
        <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-5">
          <Stat label="Гейт приёмки" value={<span className="text-base">{gate.label}</span>} tone={gate.tone} />
          <Stat label={`Сценарии · ${data.wave ?? "волна не выбрана"}`} value={required.length} sub={`${byUser} утверждены тобой · ${scenarios.length - required.length} пока вне волны`} />
          <Stat label="Прошли" value={ran ? `${passed}/${required.length}` : "—"} tone={data.gate === "passed" ? "good" : undefined} sub={ran ? `${failed} упали · ${noEvidence} без доказательств` : "запусков не было"} />
          <Stat
            label="Красные на базе"
            value={baselineRan ? `${redOnBase}/${current.length}` : "—"}
            tone={baselineRan && (greenOnBase.length > 0 || current.some((s) => s.baseline === "missing" || s.baseline === "skipped")) ? "warn" : undefined}
            sub="Только новые сценарии; пропуски не считаются красными"
          />
          <Stat label="DoD без сценария" value={data.dodWithoutScenario.length} tone={data.dodWithoutScenario.length > 0 ? "warn" : undefined} />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-card px-4 py-3 text-sm">
        <Icon name="FolderGit" fallback="Folder" className="size-4 text-muted-foreground" />
        {data.folder ? (
          <span className="min-w-0 truncate text-muted-foreground">
            Тесты: <span className="font-mono text-foreground">{shortPath(data.folder)}</span>
            {data.branch ? <> · ветка <span className="font-mono">{data.branch}</span></> : null}
          </span>
        ) : (
          <span className="text-muted-foreground">Worktree приёмки создастся при запуске test-author.</span>
        )}
        {data.testAuthors.map((thread) => (
          <button
            key={thread.threadId}
            type="button"
            onClick={() => open({ kind: "thread", threadId: thread.threadId, tab: "session" })}
            className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-border px-2 py-0.5 font-mono text-[11px] hover:border-foreground/40"
            title={`${THREAD_STATUS_LABELS[thread.status] ?? thread.status} · ${thread.provider ?? ""} ${thread.model ?? ""}`}
          >
            <Dot tone={threadTone(thread.status)} pulse={isRunningThread(thread.status)} />
            test-author{thread.provider ? ` · ${thread.provider}` : ""}
          </button>
        ))}
        <span className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" disabled={data.running || !data.hasSuite} onClick={() => start(true)}>
            Проверить на базе
          </Button>
          <Button size="sm" disabled={data.running || !data.hasSuite} onClick={() => start(false)}>
            <Icon name="Play" className="size-4" />
            {data.running ? "Идёт прогон…" : "Запустить приёмку"}
          </Button>
        </span>
      </div>
      {data.suite ? (
        <div className="grid gap-1 rounded-xl border border-border bg-card px-4 py-3 text-xs">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Dot tone={data.suite.problem ? "bad" : "good"} />
            Зарегистрированный набор — запускается ровно он
          </div>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-0.5 text-muted-foreground">
            <dt>Набор</dt>
            <dd className="truncate font-mono text-foreground" title={data.suite.dir}>
              {shortPath(data.suite.dir)} @ {data.suite.commit?.slice(0, 8) ?? "—"}
            </dd>
            <dt>База (старое поведение)</dt>
            <dd className="font-mono text-foreground">{data.suite.base.slice(0, 8)}</dd>
            <dt>Реализация</dt>
            <dd className="truncate font-mono text-foreground" title={data.suite.target ?? ""}>{data.suite.target ? shortPath(data.suite.target) : "—"}</dd>
          </dl>
          {data.suite.problem ? <p className="text-destructive">Проблема запуска: {data.suite.problem}</p> : null}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">
          Набор не зарегистрирован: <code>test-author</code> пишет его на pre-flight волны, коммитит и вызывает <code>sf_register_suite</code>. До этого приёмка не запускается.
        </p>
      )}
      <ErrorText>{actionError ?? error}</ErrorText>
      {data.evidenceState ? <p className="text-xs text-muted-foreground">Доказательство: {({valid:"актуально для текущих входов",stale:"устарело — входы проверки изменились",missing:"ещё не получено",blocked:"недостаточно для принятия"})[data.evidenceState]}. Полная финальная приёмка остаётся обязательной.</p> : null}
      {data.baselineVerdict ? <p className="whitespace-pre-wrap break-words text-xs text-muted-foreground">{data.baselineVerdict}</p> : null}
      {greenOnBase.length > 0 ? (
        <p className="rounded-lg px-3 py-2 text-sm" style={{ backgroundColor: `${TONE_COLORS.warn}14`, color: TONE_COLORS.warn }}>
          Проходят ещё до изменений и ничего не доказывают: {greenOnBase.join(", ")}. Их нужно исправить или пометить pre-existing.
        </p>
      ) : null}
      {data.dodWithoutScenario.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
          <span>Пункты DoD без сценария:</span>
          {data.dodWithoutScenario.map((id) => (
            <RefLink key={id} id={id} />
          ))}
        </div>
      ) : null}

      {ran ? (
        <SplitBar
          parts={[
            { value: passed, tone: "good", label: "прошли" },
            { value: failed, tone: "bad", label: "не прошли" },
            { value: noEvidence, tone: "warn", label: "без доказательств" },
          ]}
        />
      ) : null}

      <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
        {scenarios.map((scenario) => (
          <ScenarioRow key={scenario.id} scenario={scenario} open={expanded === scenario.id} onToggle={() => setExpanded(expanded === scenario.id ? null : scenario.id)} />
        ))}
      </div>

      {data.runs.length > 0 ? (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold">Прогоны</h3>
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {data.runs.map((run) => (
              <li key={run.id}>
                <button type="button" onClick={() => showLog(run)} className="flex w-full cursor-pointer flex-wrap items-center gap-2 px-4 py-2 text-left text-xs hover:bg-state-hover">
                  <Pill tone={run.status === "passed" ? "good" : run.status === "running" ? "info" : run.status === "failed" ? "bad" : "warn"}>
                    {run.status === "running" ? "идёт" : run.status === "passed" ? (run.kind === "baseline" ? "выполнен" : "пройден") : run.status === "failed" ? "не пройден" : "ошибка"}
                  </Pill>
                  <Chip>{run.kind === "baseline" ? "на базе" : "по волне"}</Chip>
                  {run.wave ? <Chip>{run.wave}</Chip> : null}
                  <span className="tabular-nums">
                    <span style={{ color: TONE_COLORS.good }}>{run.passed}</span> / <span style={{ color: TONE_COLORS.bad }}>{run.failed}</span> / <span style={{ color: TONE_COLORS.warn }}>{run.skipped}</span>
                  </span>
                  {run.error ? <span className="min-w-0 flex-1 truncate" style={{ color: TONE_COLORS.warn }}>{run.error}</span> : <span className="flex-1" />}
                  <span className="text-muted-foreground">{relativeTime(run.startedAt)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {logRun ? (
        <section className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold">Лог прогона · {relativeTime(logRun.run.startedAt)}</h3>
            <Button variant="ghost" size="sm" onClick={() => setLogRun(null)}>
              Скрыть
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">Полный лог виден только тебе; оркестратор получает лишь вердикты по сценариям.</p>
          <pre className="max-h-96 overflow-auto rounded-xl border border-border bg-muted/30 p-3 text-[11px] leading-snug">{logRun.log || "Лог пуст."}</pre>
        </section>
      ) : null}
    </div>
  );
}

function ScenarioRow({ scenario, open, onToggle }: { scenario: Scenario; open: boolean; onToggle: () => void }) {
  const last = scenario.last ? RESULT[scenario.last] : null;
  const base = scenario.baseline;
  return (
    <div className={cn(open && "bg-state-active/40")}>
      <button type="button" onClick={onToggle} className="flex w-full cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 text-left hover:bg-state-hover">
        <Dot tone={last?.tone ?? "neutral"} />
        <span className="font-mono text-xs font-semibold">{scenario.id}</span>
        <span className="min-w-0 flex-1 truncate text-sm">{scenario.then ?? scenario.when ?? "—"}</span>
        {scenario.approved === "user" ? <Pill tone="accent">утверждён тобой</Pill> : <Pill tone="neutral">агент</Pill>}
        {base !== null ? (
          <Pill tone={base === "failed" ? (scenario.current ? "good" : "bad") : base === "passed" ? (!scenario.current || scenario.baselineNote?.startsWith("pre-existing:") ? "good" : "warn") : "warn"} title={scenario.baselineNote ?? "Новые сценарии должны падать на базе, сценарии предыдущих волн — проходить"}>
            база: {RESULT[base].label}
          </Pill>
        ) : null}
        {last ? <Pill tone={last.tone}>{last.label}</Pill> : <Pill tone="neutral">{scenario.applicable ? "не запускался" : "вне текущей волны"}</Pill>}
      </button>
      {open ? (
        <div className="space-y-2 border-t border-border px-4 py-3 text-sm">
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1.5">
            <dt className="text-muted-foreground">Дано</dt>
            <dd>{scenario.given ?? "—"}</dd>
            <dt className="text-muted-foreground">Действие</dt>
            <dd>{scenario.when ?? "—"}</dd>
            <dt className="text-muted-foreground">Ожидается</dt>
            <dd className="font-medium">{scenario.then ?? "—"}</dd>
            <dt className="text-muted-foreground">Граница</dt>
            <dd className="font-mono text-xs">{scenario.boundary ?? "—"}</dd>
            <dt className="text-muted-foreground">DoD</dt>
            <dd className="flex flex-wrap gap-1">{scenario.dodIds.length ? scenario.dodIds.map((id) => <RefLink key={id} id={id} />) : "—"}</dd>
          </dl>
          {scenario.last === "failed" ? (
            <div className="grid gap-2 rounded-lg border px-3 py-2 text-xs @container md:grid-cols-2" style={{ borderColor: `${TONE_COLORS.bad}55` }}>
              <div>
                <div className="mb-0.5 text-muted-foreground">Ожидалось</div>
                <div className="whitespace-pre-wrap break-words font-mono">{scenario.expected ?? scenario.then ?? "—"}</div>
              </div>
              <div>
                <div className="mb-0.5" style={{ color: TONE_COLORS.bad }}>Получено</div>
                <div className="whitespace-pre-wrap break-words font-mono">{scenario.actual ?? "—"}</div>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
