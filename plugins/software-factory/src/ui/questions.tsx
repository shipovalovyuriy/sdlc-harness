// Questions and requests from AIRD agents: one card design used in the
// Software Factory inbox, the AIRD "Вопросы" tab and, as a pending-interaction
// form, inside the thread itself.
import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { useBbNavigate, useRealtime, type PluginPendingInteractionProps } from "@get-bb/plugin-sdk/app";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { Answers, Question, QuestionPart } from "../contract";
import { CHANGED, TONE_COLORS, errorText, relativeTime, useFactoryRpc, type Tone } from "./data";
import { Chip, EmptyState, ErrorText, MarkdownView, Pill, Segmented } from "./kit";

const KIND_META: Record<Question["kind"], { label: string; tone: Tone; icon: string }> = {
  decision: { label: "Решение", tone: "accent", icon: "CircleQuestion" },
  approval: { label: "Одобрение", tone: "info", icon: "CircleCheck" },
  clarification: { label: "Уточнение", tone: "neutral", icon: "MessageQuestion" },
  permission: { label: "Разрешение", tone: "warn", icon: "SecurityCheck" },
};

const SOURCE_LABEL: Record<Question["source"], string> = {
  tool: "",
  provider: "вопрос в треде",
  approval: "запрос в треде",
  text: "вопрос текстом в чате",
};

const VIA_LABEL: Record<string, string> = {
  plugin: "в Software Factory",
  thread: "в треде",
  dismissed: "скрыт",
  superseded: "заменён новым",
  timeout: "истёк",
};

// ------------------------------------------------------------------ data

export function useQuestions(airdId: string | null, includeAnswered: boolean) {
  const rpc = useFactoryRpc();
  const [questions, setQuestions] = useState<Question[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(() => {
    rpc.call("questions_list", { airdId, includeAnswered }).then(
      (result) => {
        setQuestions(result.questions);
        setError(null);
      },
      (cause) => setError(errorText(cause)),
    );
  }, [rpc, airdId, includeAnswered]);
  useEffect(() => {
    load();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 8000);
    return () => clearInterval(timer);
  }, [load]);
  useRealtime(CHANGED, load);
  return { questions, error, reload: load };
}

// ------------------------------------------------------------------ card

type Selection = Record<string, { selected: string[]; freeText: string }>;

function emptySelection(parts: QuestionPart[]): Selection {
  return Object.fromEntries(parts.map((part) => [part.id, { selected: [], freeText: "" }]));
}

function toAnswers(selection: Selection): Answers {
  return Object.fromEntries(
    Object.entries(selection).map(([id, value]) => [id, { selected: value.selected, ...(value.freeText.trim() ? { freeText: value.freeText.trim() } : {}) }]),
  );
}

function OptionRow({
  letter,
  label,
  detail,
  recommended,
  reason,
  selected,
  multi,
  disabled,
  onToggle,
}: {
  letter: string;
  label: string;
  detail: string | null;
  recommended: boolean;
  reason: string | null;
  selected: boolean;
  multi: boolean;
  disabled: boolean;
  onToggle: () => void;
}) {
  const accent = TONE_COLORS.accent;
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onToggle}
      aria-pressed={selected}
      className={cn(
        "group flex w-full cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors disabled:cursor-default",
        selected ? "border-foreground/60 bg-state-active" : "border-border hover:border-foreground/30 hover:bg-state-hover",
      )}
      style={recommended && !selected ? { borderColor: `${accent}80`, backgroundColor: `${accent}0d` } : undefined}
    >
      <span
        className={cn(
          "mt-0.5 flex size-6 shrink-0 items-center justify-center text-xs font-bold uppercase",
          multi ? "rounded-md" : "rounded-full",
          selected ? "bg-foreground text-background" : "border border-border text-muted-foreground group-hover:text-foreground",
        )}
      >
        {selected && multi ? "✓" : letter}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium leading-snug">{label}</span>
          {recommended ? (
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold" style={{ color: accent, backgroundColor: `${accent}1f` }}>
              ★ Рекомендация
            </span>
          ) : null}
        </span>
        {detail ? <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">{detail}</span> : null}
        {recommended && reason ? <span className="mt-1 block text-xs leading-snug" style={{ color: accent }}>→ {reason}</span> : null}
      </span>
    </button>
  );
}

function PartForm({
  part,
  value,
  onChange,
  disabled,
  showPrompt,
  hideTopic = false,
}: {
  part: QuestionPart;
  value: { selected: string[]; freeText: string };
  onChange: (next: { selected: string[]; freeText: string }) => void;
  disabled: boolean;
  showPrompt: boolean;
  hideTopic?: boolean;
}) {
  return (
    <div className="space-y-2.5">
      {showPrompt ? (
        <div className="space-y-1">
          {part.topic && !hideTopic ? <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{part.topic}</div> : null}
          <MarkdownView content={part.prompt} className="text-[15px] font-medium leading-snug" />
        </div>
      ) : null}
      {part.options.length > 0 ? (
        <div className="space-y-1.5">
          {part.options.map((option) => (
            <OptionRow
              key={option.value}
              letter={option.value}
              label={option.label}
              detail={option.detail}
              recommended={part.recommended === option.value}
              reason={part.recommendationReason}
              selected={value.selected.includes(option.value)}
              multi={part.multiSelect}
              disabled={disabled}
              onToggle={() => {
                const has = value.selected.includes(option.value);
                const selected = part.multiSelect
                  ? has
                    ? value.selected.filter((v) => v !== option.value)
                    : [...value.selected, option.value]
                  : has
                    ? []
                    : [option.value];
                onChange({ ...value, selected });
              }}
            />
          ))}
        </div>
      ) : null}
      {part.allowFreeText ? (
        <textarea
          value={value.freeText}
          disabled={disabled}
          onChange={(event) => onChange({ ...value, freeText: event.target.value })}
          placeholder={part.options.length > 0 ? "Свой вариант или комментарий к выбору (необязательно)" : "Ваш ответ"}
          rows={part.options.length > 0 ? 2 : 3}
          className="w-full resize-y rounded-lg border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      ) : null}
    </div>
  );
}

export function QuestionCard({
  question,
  onSubmit,
  onDecision,
  onDismiss,
  onOpenSession,
  onOpenAird,
  showAird = true,
  embedded = false,
}: {
  question: Question;
  onSubmit?: (answers: Answers) => Promise<void>;
  onDecision?: (decision: "allow_once" | "allow_for_session" | "deny") => Promise<void>;
  onDismiss?: () => Promise<void>;
  onOpenSession?: () => void;
  onOpenAird?: () => void;
  showAird?: boolean;
  embedded?: boolean;
}) {
  const [selection, setSelection] = useState<Selection>(() => emptySelection(question.parts));
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [contextOpen, setContextOpen] = useState(false);
  const meta = KIND_META[question.kind];
  const color = TONE_COLORS[meta.tone];
  const open = question.status === "open";
  const recommendedPart = question.parts.length === 1 ? question.parts[0] : undefined;
  const canSubmit = question.parts.every((part) => {
    const value = selection[part.id];
    return value && (value.selected.length > 0 || value.freeText.trim().length > 0);
  });

  const run = async (action: () => Promise<void>) => {
    setPending(true);
    setError(null);
    try {
      await action();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setPending(false);
    }
  };

  return (
    <article
      className={cn("relative overflow-hidden rounded-xl border bg-card", embedded ? "border-border" : "border-border shadow-sm")}
      style={{ borderLeftColor: open ? color : undefined, borderLeftWidth: open ? 3 : undefined }}
      data-question-form
    >
      <div className="space-y-3 p-4">
        <header className="flex flex-wrap items-start gap-x-2 gap-y-1">
          <span className="inline-flex items-center gap-1.5">
            <Icon name={meta.icon} fallback="CircleQuestion" className="size-4" style={{ color }} />
            <Pill tone={meta.tone}>{meta.label}</Pill>
          </span>
          {question.number ? <span className="text-sm font-semibold">Вопрос {question.number}</span> : null}
          {question.parts.length === 1 && question.parts[0]!.topic ? <span className="text-sm text-muted-foreground">· {question.parts[0]!.topic}</span> : null}
          <span className="ml-auto flex items-center gap-2 text-[11px] text-muted-foreground">
            {!open ? (
              <Pill tone={question.status === "answered" ? "good" : "neutral"}>
                {question.status === "answered" ? `отвечено ${VIA_LABEL[question.answeredVia ?? ""] ?? ""}` : (VIA_LABEL[question.answeredVia ?? ""] ?? "отменён")}
              </Pill>
            ) : null}
            {relativeTime(question.createdAt)}
          </span>
        </header>

        {showAird || question.threadRole ? (
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {showAird && question.airdTitle ? (
              <button type="button" onClick={onOpenAird} disabled={!onOpenAird} className="max-w-[24rem] cursor-pointer truncate font-medium text-foreground hover:underline disabled:cursor-default disabled:no-underline">
                {question.airdTitle}
              </button>
            ) : null}
            {question.threadRole ? <Chip mono>{question.threadRole}</Chip> : null}
            {SOURCE_LABEL[question.source] ? <span>{SOURCE_LABEL[question.source]}</span> : null}
            {onOpenSession ? (
              <button type="button" onClick={onOpenSession} className="ml-auto inline-flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 hover:bg-state-hover hover:text-foreground">
                <Icon name="MessageSquare" className="size-3.5" />
                Сессия
              </button>
            ) : null}
          </div>
        ) : null}

        {question.approval ? (
          <div className="space-y-2">
            <div className="text-[15px] font-medium">{question.approval.title}</div>
            {question.approval.reason ? <p className="text-sm text-muted-foreground">{question.approval.reason}</p> : null}
            {question.approval.detail ? (
              <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                <MarkdownView content={question.approval.detail} />
              </div>
            ) : null}
          </div>
        ) : null}

        {question.context ? (
          <div>
            <button type="button" onClick={() => setContextOpen((v) => !v)} className="inline-flex cursor-pointer items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
              <Icon name={contextOpen ? "ChevronDown" : "ChevronRight"} className="size-3.5" />
              Контекст
            </button>
            {contextOpen ? (
              <div className="mt-1.5 max-h-72 overflow-y-auto rounded-lg border border-border bg-muted/20 px-3 py-2">
                <MarkdownView content={question.context} />
              </div>
            ) : null}
          </div>
        ) : null}

        {open ? (
          <div className="space-y-4">
            {question.parts.map((part) => (
              <PartForm
                key={part.id}
                part={part}
                value={selection[part.id] ?? { selected: [], freeText: "" }}
                onChange={(next) => setSelection((current) => ({ ...current, [part.id]: next }))}
                disabled={pending}
                showPrompt
                hideTopic={question.parts.length === 1}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-1.5">
            {question.parts.map((part) => (
              <MarkdownView key={part.id} content={part.prompt} className="font-medium" />
            ))}
            {question.answerSummary ? (
              <div className="flex items-start gap-2 rounded-lg bg-muted/40 px-3 py-2 text-sm">
                <Icon name="Check" className="mt-0.5 size-4 shrink-0" style={{ color: TONE_COLORS.good }} />
                <span>{question.answerSummary}</span>
              </div>
            ) : null}
          </div>
        )}

        <ErrorText>{error}</ErrorText>

        {open ? (
          <footer className="flex flex-wrap items-center justify-end gap-2">
            {onDismiss && question.source === "text" ? (
              <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(onDismiss)} className="mr-auto text-muted-foreground">
                Это не вопрос
              </Button>
            ) : null}
            {question.approval && onDecision ? (
              <>
                {question.approval.decisions.includes("deny") ? (
                  <Button variant="outline" size="sm" disabled={pending} onClick={() => run(() => onDecision("deny"))}>
                    Отклонить
                  </Button>
                ) : null}
                {question.approval.decisions.includes("allow_for_session") ? (
                  <Button variant="outline" size="sm" disabled={pending} onClick={() => run(() => onDecision("allow_for_session"))}>
                    Разрешить на сессию
                  </Button>
                ) : null}
                {question.approval.decisions.includes("allow_once") ? (
                  <Button size="sm" disabled={pending} onClick={() => run(() => onDecision("allow_once"))}>
                    Разрешить
                  </Button>
                ) : null}
              </>
            ) : onSubmit ? (
              <>
                {recommendedPart?.recommended ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={pending}
                    onClick={() => run(() => onSubmit({ [recommendedPart.id]: { selected: [recommendedPart.recommended!] } }))}
                  >
                    ★ Принять рекомендацию
                  </Button>
                ) : null}
                <Button size="sm" disabled={pending || !canSubmit} onClick={() => run(() => onSubmit(toAnswers(selection)))}>
                  {pending ? "Отправляю…" : "Ответить"}
                </Button>
              </>
            ) : null}
          </footer>
        ) : null}
      </div>
    </article>
  );
}

// ------------------------------------------------------------------ inbox

type InboxFilter = "open" | "history";

export function QuestionsInbox({
  airdId,
  onOpenAird,
  onOpenSession,
  showAird,
  limit,
  emptyHint,
}: {
  airdId: string | null;
  onOpenAird?: (airdId: string) => void;
  onOpenSession?: (threadId: string) => void;
  showAird: boolean;
  limit?: number;
  emptyHint?: ReactNode;
}) {
  const rpc = useFactoryRpc();
  const navigate = useBbNavigate();
  const [filter, setFilter] = useState<InboxFilter>("open");
  const { questions, error, reload } = useQuestions(airdId, true);
  const open = useMemo(() => (questions ?? []).filter((q) => q.status === "open"), [questions]);
  const history = useMemo(() => (questions ?? []).filter((q) => q.status !== "open"), [questions]);
  const list = filter === "open" ? open : history;
  const shown = limit ? list.slice(0, limit) : list;

  const answer = (question: Question) => async (answers: Answers) => {
    await rpc.call("question_answer", { id: question.id, answers });
    reload();
  };
  const decide = (question: Question) => async (decision: "allow_once" | "allow_for_session" | "deny") => {
    await rpc.call("question_answer", { id: question.id, answers: {}, decision });
    reload();
  };
  const dismiss = (question: Question) => async () => {
    await rpc.call("question_dismiss", { id: question.id });
    reload();
  };

  return (
    <div className="space-y-3">
      {limit === undefined ? (
        <Segmented<InboxFilter>
          value={filter}
          onChange={setFilter}
          items={[
            { value: "open", label: `Ждут ответа · ${open.length}`, tone: open.length > 0 ? "warn" : undefined },
            { value: "history", label: `История решений · ${history.length}` },
          ]}
        />
      ) : null}
      <ErrorText>{error}</ErrorText>
      {questions === null ? (
        <EmptyState icon="Loading">Собираю вопросы…</EmptyState>
      ) : shown.length === 0 ? (
        limit !== undefined ? null : (
          <EmptyState icon="CircleCheck">{filter === "open" ? (emptyHint ?? "Агенты ничего не ждут от тебя.") : "Решений пока нет."}</EmptyState>
        )
      ) : (
        <div className="space-y-3">
          {shown.map((question) => (
            <QuestionCard
              key={question.id}
              question={question}
              showAird={showAird}
              onSubmit={answer(question)}
              onDecision={decide(question)}
              onDismiss={dismiss(question)}
              onOpenAird={question.airdId && onOpenAird ? () => onOpenAird(question.airdId!) : undefined}
              onOpenSession={() => (onOpenSession ? onOpenSession(question.threadId) : navigate.toThread(question.threadId, { split: true }))}
            />
          ))}
          {limit !== undefined && list.length > limit ? <p className="text-xs text-muted-foreground">И ещё {list.length - limit}…</p> : null}
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------- in-thread form

/** The sf_ask_user form bb shows in the thread composer. */
export function ThreadQuestionForm({ interaction, submit, cancel }: PluginPendingInteractionProps) {
  const payload = (interaction.payload ?? {}) as { question?: Question };
  const question = payload.question;
  if (!question) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 text-sm">
        Вопрос агента недоступен.{" "}
        <button type="button" className="cursor-pointer underline" onClick={() => void cancel()}>
          Закрыть
        </button>
      </div>
    );
  }
  return (
    <div className="max-h-[70vh] overflow-y-auto">
      <QuestionCard
        question={{ ...question, status: "open" }}
        showAird={false}
        embedded
        onSubmit={async (answers) => {
          await submit({ answers });
        }}
      />
    </div>
  );
}

// ------------------------------------------------------- page and panels

/** On the home page: what agents wait on, before anything else. */
export function HomeQuestions({ onAll, onOpenAird }: { onAll: () => void; onOpenAird: (id: string) => void }) {
  const { questions } = useQuestions(null, false);
  const open = (questions ?? []).filter((question) => question.status === "open");
  if (open.length === 0) return null;
  return (
    <section className="space-y-3 rounded-xl border p-4" style={{ borderColor: `${TONE_COLORS.warn}66`, backgroundColor: `${TONE_COLORS.warn}0a` }}>
      <div className="flex flex-wrap items-center gap-2">
        <Icon name="MessageQuestion" fallback="CircleQuestion" className="size-4" style={{ color: TONE_COLORS.warn }} />
        <h3 className="text-sm font-semibold">Агенты ждут твоего ответа</h3>
        <Pill tone="warn">{open.length}</Pill>
        <button type="button" onClick={onAll} className="ml-auto cursor-pointer text-xs text-muted-foreground hover:text-foreground">
          Все вопросы →
        </button>
      </div>
      <QuestionsInbox airdId={null} showAird limit={2} onOpenAird={onOpenAird} />
    </section>
  );
}

export function QuestionsView({ onBack, onOpenAird }: { onBack: () => void; onOpenAird: (id: string) => void }) {
  return (
    <div className="h-full min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl space-y-4 px-4 py-4 md:px-6 md:py-5">
        <button type="button" onClick={onBack} className="inline-flex cursor-pointer items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <Icon name="ArrowLeft" className="size-4" />
          Все AIRD
        </button>
        <div>
          <h2 className="text-xl font-semibold">Вопросы агентов</h2>
          <p className="text-sm text-muted-foreground">
            Решения интервью discovery, одобрения, уточнения и запросы разрешений от оркестраторов и агентов всех AIRD. Ответ уходит в тред, где задан вопрос; ответить можно и прямо в треде.
          </p>
        </div>
        <QuestionsInbox airdId={null} showAird onOpenAird={onOpenAird} />
      </div>
    </div>
  );
}
