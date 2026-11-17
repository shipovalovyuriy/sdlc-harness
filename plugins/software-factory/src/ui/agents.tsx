// Models for AIRD threads: the discovery/delivery orchestrators and every
// agent role, across all providers bb has (Claude Code, Codex, …). Defaults
// come from the user's own files: ~/.claude/agents/*.md, ~/.codex/agents/*.toml,
// ~/.claude/settings.json and ~/.codex/config.toml.
import { useCallback, useEffect, useState } from "react";
import { useBbNavigate, useRealtime } from "@get-bb/plugin-sdk/app";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { AgentRole, AgentsCatalog, OrchestratorConfig, ProviderOption, ReserveModel } from "../contract";
import { CHANGED, errorText, shortPath, useFactoryRpc } from "./data";
import { Chip, EmptyState, ErrorText, Pill } from "./kit";

const selectClass = "h-8 w-full min-w-0 cursor-pointer truncate rounded-md border border-input bg-transparent px-1.5 text-xs";

function providerName(catalog: AgentsCatalog, id: string | null): string {
  if (!id) return "—";
  return catalog.providers.find((p) => p.id === id)?.name ?? id;
}

function modelLabel(provider: ProviderOption | undefined, id: string | null): string {
  if (!id) return "модель провайдера по умолчанию";
  return provider?.models.find((m) => m.id === id)?.label ?? id;
}

function effortsFor(provider: ProviderOption | undefined, modelId: string | null): string[] {
  const model = provider?.models.find((m) => m.id === modelId) ?? provider?.models.find((m) => m.isDefault) ?? provider?.models[0];
  return model?.efforts ?? ["low", "medium", "high", "xhigh", "max"];
}

export function AgentsView({ onBack }: { onBack: () => void }) {
  const rpc = useFactoryRpc();
  const [catalog, setCatalog] = useState<AgentsCatalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stageFilter, setStageFilter] = useState<"all" | "discovery" | "delivery">("all");
  const load = useCallback(() => {
    rpc.call("agents_catalog", null).then(
      (value) => {
        setCatalog(value);
        setError(null);
      },
      (cause) => setError(errorText(cause)),
    );
  }, [rpc]);
  useEffect(load, [load]);
  useRealtime(CHANGED, load);

  const roles = (catalog?.roles ?? []).filter((role) => stageFilter === "all" || role.stages.includes(stageFilter));

  return (
    <div className="h-full min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-6xl space-y-5 px-4 py-4 md:px-6 md:py-5">
        <button type="button" onClick={onBack} className="inline-flex cursor-pointer items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <Icon name="ArrowLeft" className="size-4" />
          Все AIRD
        </button>
        <div>
          <h2 className="text-xl font-semibold">Модели и роли агентов</h2>
          <p className="text-sm text-muted-foreground">
            Провайдер, модель и effort для оркестраторов и каждой роли. По умолчанию — значения из твоих файлов: <code>~/.claude/agents</code>,{" "}
            <code>~/.codex/agents</code>, <code>~/.claude/settings.json</code>, <code>~/.codex/config.toml</code>. Переопределения хранятся в Software Factory и файлы не меняют.
          </p>
        </div>
        <ErrorText>{error}</ErrorText>
        {catalog === null ? (
          <EmptyState icon="Loading">Загружаю провайдеров и роли…</EmptyState>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>Провайдеры:</span>
              {catalog.providers.map((provider) => (
                <Chip key={provider.id}>
                  {provider.name} · {provider.models.length} моделей
                </Chip>
              ))}
            </div>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold">Оркестраторы</h3>
              <div className="@container">
                <div className="grid grid-cols-1 gap-3 @3xl:grid-cols-2">
                  {catalog.orchestrators.map((config) => (
                    <OrchestratorCard key={config.stage} config={config} catalog={catalog} onChanged={load} />
                  ))}
                </div>
              </div>
            </section>

            <section className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold">Роли агентов ({roles.length})</h3>
                <select value={stageFilter} onChange={(event) => setStageFilter(event.target.value as typeof stageFilter)} className="h-8 cursor-pointer rounded-md border border-input bg-transparent px-2 text-xs">
                  <option value="all">Все роли</option>
                  <option value="discovery">Роли discovery</option>
                  <option value="delivery">Роли delivery</option>
                </select>
              </div>
              <div className="@container">
                <div className="grid grid-cols-1 gap-3 @3xl:grid-cols-2">
                  {roles.map((role) => (
                    <RoleCard key={role.name} role={role} catalog={catalog} onChanged={load} />
                  ))}
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function OrchestratorCard({ config, catalog, onChanged }: { config: OrchestratorConfig; catalog: AgentsCatalog; onChanged: () => void }) {
  const rpc = useFactoryRpc();
  const [error, setError] = useState<string | null>(null);
  const provider = catalog.providers.find((p) => p.id === config.provider);
  const save = (next: { provider: string | null; model: string | null; effort: string | null }) => {
    setError(null);
    rpc.call("orchestrator_set", { stage: config.stage, ...next }).then(onChanged, (cause) => setError(errorText(cause)));
  };
  const overridden = config.overrideProvider !== null || config.overrideModel !== null || config.overrideEffort !== null;
  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Icon name="Workflow" fallback="Bot" className="size-4 text-muted-foreground" />
        <span className="font-mono text-sm font-bold">aird-{config.stage}-loop</span>
        <Pill tone={config.stage === "discovery" ? "accent" : "info"}>{config.stage}</Pill>
        {overridden ? (
          <button type="button" className="ml-auto cursor-pointer text-xs text-muted-foreground hover:text-foreground" onClick={() => save({ provider: null, model: null, effort: null })}>
            сбросить к умолчанию
          </button>
        ) : null}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)] gap-2">
        <label className="grid min-w-0 gap-1 text-xs">
          <span className="truncate text-muted-foreground">Провайдер</span>
          <select value={config.provider} onChange={(event) => save({ provider: event.target.value, model: null, effort: null })} className={selectClass}>
            {catalog.providers.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="grid min-w-0 gap-1 text-xs">
          <span className="truncate text-muted-foreground">Модель</span>
          <select value={config.overrideModel ?? ""} onChange={(event) => save({ provider: config.overrideProvider, model: event.target.value || null, effort: config.overrideEffort })} className={selectClass}>
            <option value="">{config.defaultModel ? `${modelLabel(provider, config.defaultModel)} (умолч.)` : "По умолчанию"}</option>
            {(provider?.models ?? []).map((model) => (
              <option key={model.id} value={model.id}>
                {model.label} ({model.id})
              </option>
            ))}
          </select>
        </label>
        <label className="grid min-w-0 gap-1 text-xs">
          <span className="truncate text-muted-foreground">Effort</span>
          <select value={config.overrideEffort ?? ""} onChange={(event) => save({ provider: config.overrideProvider, model: config.overrideModel, effort: event.target.value || null })} className={selectClass}>
            <option value="">{config.defaultEffort ? `${config.defaultEffort} (умолч.)` : "По умолчанию"}</option>
            {effortsFor(provider, config.overrideModel ?? config.defaultModel).map((effort) => (
              <option key={effort} value={effort}>
                {effort}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-muted-foreground">Запуск:</span>
        <Chip>{providerName(catalog, config.provider)}</Chip>
        <Chip mono>{config.effectiveModel ?? "модель по умолчанию"}</Chip>
        <Chip>effort: {config.effectiveEffort ?? "по умолчанию"}</Chip>
      </div>
      {config.defaultSource ? <p className="text-[11px] text-muted-foreground">Умолчания из {shortPath(config.defaultSource)}</p> : null}
      <ReserveControls value={config.reserve} catalog={catalog} onChanged={onChanged}
        save={(reserve) => rpc.call("orchestrator_set", { stage: config.stage, provider: config.overrideProvider, model: config.overrideModel, effort: config.overrideEffort, reserve })} />
      <ErrorText>{error}</ErrorText>
    </div>
  );
}

function RoleCard({ role, catalog, onChanged }: { role: AgentRole; catalog: AgentsCatalog; onChanged: () => void }) {
  const rpc = useFactoryRpc();
  const navigate = useBbNavigate();
  const [error, setError] = useState<string | null>(null);
  const save = (next: { provider: string | null; model: string | null; effort: string | null }) => {
    setError(null);
    rpc.call("agent_override_set", { role: role.name, ...next }).then(onChanged, (cause) => setError(errorText(cause)));
  };
  const effectiveProvider = catalog.providers.find((p) => p.id === role.effectiveProvider);
  const ownDefinition = role.definitions.find((d) => d.provider === (effectiveProvider?.family ?? role.effectiveProvider)) ?? null;
  const modelValue = role.overrideProvider || role.overrideModel ? `${role.overrideProvider ?? role.inheritProvider}::${role.overrideModel ?? ""}` : "";
  const overridden = role.overrideProvider !== null || role.overrideModel !== null || role.overrideEffort !== null;
  const inheritDef = role.definitions.find((d) => d.provider === catalog.providers.find((p) => p.id === role.inheritProvider)?.family);
  const openFile = (path: string) => {
    if (catalog.hostId) navigate.experimental_openFilePreview({ target: { kind: "host", hostId: catalog.hostId, path }, location: null });
  };

  return (
    <div className="space-y-3 rounded-xl border border-border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-sm font-bold">{role.name}</span>
        {role.stages.map((stage) => (
          <Pill key={stage} tone={stage === "discovery" ? "accent" : "info"}>
            {stage}
          </Pill>
        ))}
        {role.canWrite ? <Pill tone="warn">пишет файлы</Pill> : <Pill tone="neutral">только чтение</Pill>}
        {overridden ? (
          <button type="button" className="ml-auto cursor-pointer text-xs text-muted-foreground hover:text-foreground" onClick={() => save({ provider: null, model: null, effort: null })}>
            сбросить к умолчанию
          </button>
        ) : null}
      </div>
      {role.description ? <p className="line-clamp-2 text-xs text-muted-foreground">{role.description}</p> : null}

      <div className="space-y-1">
        {role.definitions.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">Файла роли нет ни у Claude Code, ни у Codex — запускается с моделью провайдера по умолчанию.</p>
        ) : (
          role.definitions.map((definition) => (
            <div key={definition.provider} className="flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="w-20 shrink-0 text-muted-foreground">{definition.provider === "codex" ? "Codex" : "Claude Code"}:</span>
              <Chip mono>{definition.model ?? "—"}</Chip>
              <Chip>effort: {definition.effort ?? "—"}</Chip>
              <button type="button" onClick={() => openFile(definition.path)} className="cursor-pointer font-mono text-muted-foreground hover:text-foreground hover:underline">
                {shortPath(definition.path)}
              </button>
            </div>
          ))
        )}
      </div>

      <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-2">
        <label className="grid min-w-0 gap-1 text-xs">
          <span className="truncate text-muted-foreground">Провайдер и модель</span>
          <select
            value={modelValue}
            onChange={(event) => {
              const value = event.target.value;
              if (!value) return save({ provider: null, model: null, effort: role.overrideEffort });
              const [provider, model] = value.split("::");
              save({ provider: provider || null, model: model || null, effort: null });
            }}
            className={selectClass}
          >
            <option value="">
              {role.name === "test-author" ? "Другой провайдер, чем у исполнителя" : "Как у оркестратора"} ({providerName(catalog, role.inheritProvider)}) — из роли: {inheritDef?.model ?? "по умолчанию"}
            </option>
            {catalog.providers.map((provider) => {
              const def = role.definitions.find((d) => d.provider === provider.family);
              return (
                <optgroup key={provider.id} label={provider.name}>
                  <option value={`${provider.id}::`}>
                    {provider.name}: модель из роли ({def?.model ?? "по умолчанию"})
                  </option>
                  {provider.models.map((model) => (
                    <option key={model.id} value={`${provider.id}::${model.id}`}>
                      {model.label} ({model.id})
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        </label>
        <label className="grid min-w-0 gap-1 text-xs">
          <span className="truncate text-muted-foreground">Effort</span>
          <select
            value={role.overrideEffort ?? ""}
            onChange={(event) => save({ provider: role.overrideProvider, model: role.overrideModel, effort: event.target.value || null })}
            className={selectClass}
          >
            <option value="">Из роли — {ownDefinition?.effort ?? "по умолчанию"}</option>
            {effortsFor(effectiveProvider, role.effectiveModel ?? ownDefinition?.model ?? null).map((effort) => (
              <option key={effort} value={effort}>
                {effort}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 text-xs">
        <span className="text-muted-foreground">Запуск:</span>
        <Chip>{providerName(catalog, role.effectiveProvider)}</Chip>
        <Chip mono>{role.effectiveModel ?? "модель по умолчанию"}</Chip>
        <Chip>effort: {role.effectiveEffort ?? "по умолчанию"}</Chip>
        {!role.overrideProvider ? (
          <span className="text-[11px] text-muted-foreground">
            {role.name === "test-author" ? "(по умолчанию — не тот провайдер, что пишет код)" : "(провайдер наследуется от оркестратора)"}
          </span>
        ) : null}
      </div>
      {role.skills.length > 0 ? (
        <div className={cn("flex flex-wrap items-center gap-1.5 text-xs")}>
          <span className="text-muted-foreground">Скиллы:</span>
          {role.skills.map((skill) => (
            <Chip key={skill} mono>
              /{skill}
            </Chip>
          ))}
        </div>
      ) : null}
      <ReserveControls value={role.reserve} catalog={catalog} onChanged={onChanged}
        save={(reserve) => rpc.call("agent_override_set", { role: role.name, provider: role.overrideProvider, model: role.overrideModel, effort: role.overrideEffort, reserve })} />
      <ErrorText>{error}</ErrorText>
    </div>
  );
}

function ReserveControls({ value, catalog, save, onChanged }: {
  value: ReserveModel | null;
  catalog: AgentsCatalog;
  save: (reserve: ReserveModel | null) => Promise<unknown>;
  onChanged: () => void;
}) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const provider = catalog.providers.find((item) => item.id === value?.provider);
  const selected = value ? `${value.provider}::${value.model}` : "";
  const offered = !value || provider?.models.some((model) => model.id === value.model);
  const change = async (next: ReserveModel | null) => {
    setSaving(true);
    setError(null);
    try { await save(next); onChanged(); }
    catch (cause) { setError(errorText(cause)); }
    finally { setSaving(false); }
  };
  return (
    <fieldset disabled={saving} aria-busy={saving} className="min-w-0 space-y-2 border-t border-border pt-3">
      <legend className="px-1 text-xs font-semibold">Запасная модель</legend>
      <div className="grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)] gap-2">
        <label className="grid min-w-0 gap-1 text-xs">
          <span className="text-muted-foreground">Провайдер и модель</span>
          <select value={selected} className={selectClass} onChange={(event) => {
            const [providerId, ...model] = event.target.value.split("::");
            void change(providerId ? { provider: providerId, model: model.join("::"), effort: null } : null);
          }}>
            <option value="">Выключена</option>
            {!offered && value ? <option value={selected}>{value.provider} / {value.model} — недоступна</option> : null}
            {catalog.providers.map((item) => <optgroup key={item.id} label={item.name}>
              {item.models.map((model) => <option key={model.id} value={`${item.id}::${model.id}`}>{model.label} ({model.id})</option>)}
            </optgroup>)}
          </select>
        </label>
        <label className="grid min-w-0 gap-1 text-xs">
          <span className="text-muted-foreground">Effort запасной</span>
          <select value={value?.effort ?? ""} disabled={!value || saving} className={selectClass}
            onChange={(event) => { if (value) void change({ ...value, effort: event.target.value || null }); }}>
            <option value="">По умолчанию</option>
            {value ? effortsFor(provider, value.model).map((effort) => <option key={effort} value={effort}>{effort}</option>) : null}
          </select>
        </label>
      </div>
      <p className="text-[11px] text-muted-foreground">
        {value ? "При лимите — переключение сразу; при временном сбое — после двух повторов. При общем лимите аккаунта поможет другой провайдер." : "Включи, чтобы агент продолжал задачу при лимите или недоступности основной модели."}
      </p>
      {saving ? <span role="status" className="text-xs text-muted-foreground">Сохраняю…</span> : null}
      <ErrorText>{error}</ErrorText>
    </fieldset>
  );
}
