// Project secrets for agents. Values go to bb's project environment variables
// (encrypted, write-only); agents get the names and notes and use the values
// through the environment. The dialog never reads a value back.
import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { Secret } from "../contract";
import { parseSecretList } from "../project-secrets";
import { errorText, useFactoryRpc } from "./data";
import { ErrorText, TextArea, TextInput } from "./kit";

const NAME = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/u;
const hiddenFromCodex = (name: string) => /KEY|SECRET|TOKEN/iu.test(name);

const APP_ACCESS = [
  { name: "AIRD_APP_URL", label: "Адрес", placeholder: "http://localhost:3000", note: "адрес приложения для живых проверок", secret: false },
  { name: "AIRD_APP_LOGIN", label: "Логин", placeholder: "qa@example.com", note: "логин тестового пользователя приложения", secret: false },
  { name: "AIRD_APP_PASSWORD", label: "Пароль", placeholder: "пароль тестового пользователя", secret: true, note: "пароль тестового пользователя приложения" },
] as const;

/** One form row: a fixed label column, so inputs line up whatever the label says. */
function Row({ label, badge, children }: { label: string; badge?: string | null; children: ReactNode }) {
  return (
    <label className="grid grid-cols-1 items-center gap-1 @sm:grid-cols-[7.5rem_minmax(0,1fr)] @sm:gap-3">
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground">
        {label}
        {badge ? <span className="rounded bg-muted px-1 py-px text-[10px] font-medium leading-4 text-muted-foreground">{badge}</span> : null}
      </span>
      {children}
    </label>
  );
}

export function useProjectSecrets(projectId: string | null, open = true) {
  const rpc = useFactoryRpc();
  const [secrets, setSecrets] = useState<Secret[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const reload = useCallback(() => {
    if (!projectId) return;
    rpc.call("project_secrets", { projectId }).then(
      (result) => {
        setSecrets(result.secrets);
        setError(null);
      },
      (cause) => setError(errorText(cause)),
    );
  }, [rpc, projectId]);
  useEffect(() => {
    if (open) reload();
  }, [open, reload]);
  return { secrets, error, reload };
}

function SecretRow({ secret, onReplace, onRemove }: { secret: Secret; onReplace: () => void; onRemove: () => void }) {
  return (
    <div className="flex min-w-0 items-center gap-2 rounded-lg border border-border px-2.5 py-1.5">
      <Icon name="Lock" fallback="Check" className="size-3.5 shrink-0 text-muted-foreground" />
      <div className="min-w-0 flex-1">
        <div className="truncate font-mono text-xs font-medium">{secret.name}</div>
        <div className="truncate text-[11px] text-muted-foreground">
          {secret.note ?? "без описания"}
          {hiddenFromCodex(secret.name) ? " · Codex по умолчанию не видит имена с KEY/SECRET/TOKEN" : ""}
        </div>
      </div>
      <Button type="button" variant="ghost" size="sm" onClick={onReplace}>
        Заменить
      </Button>
      <Button type="button" variant="ghost" size="icon" className="size-7" aria-label={`Удалить ${secret.name}`} onClick={onRemove}>
        <Icon name="Trash2" fallback="X" className="size-3.5" />
      </Button>
    </div>
  );
}

export function SecretsDialog({
  open,
  onOpenChange,
  projectId,
  projectName,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  /** Null when only the id is known (opened from an AIRD). */
  projectName: string | null;
}) {
  const rpc = useFactoryRpc();
  const { secrets, error: loadError, reload } = useProjectSecrets(projectId, open);
  const [access, setAccess] = useState<Record<string, string>>({});
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [bulk, setBulk] = useState("");
  const [showBulk, setShowBulk] = useState(false);
  const parsed = useMemo(() => parseSecretList(bulk), [bulk]);

  useEffect(() => {
    if (!open) return;
    setBulk("");
    setShowBulk(false);
    setAccess({});
    setName("");
    setValue("");
    setNote("");
    setError(null);
    setSaved(null);
  }, [open]);

  const own = (secrets ?? []).filter((secret) => !secret.inherited);
  const inherited = (secrets ?? []).filter((secret) => secret.inherited && !own.some((item) => item.name === secret.name));
  const has = (key: string) => own.some((secret) => secret.name === key);

  const run = async (action: () => Promise<void>, done: string) => {
    setPending(true);
    setError(null);
    setSaved(null);
    try {
      await action();
      setSaved(done);
      reload();
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setPending(false);
    }
  };

  const saveAccess = (event: FormEvent) => {
    event.preventDefault();
    const rows = APP_ACCESS.filter((row) => (access[row.name] ?? "").length > 0);
    if (rows.length === 0) return;
    void run(async () => {
      for (const row of rows) await rpc.call("project_secret_set", { projectId, name: row.name, value: access[row.name]!, note: row.note });
      setAccess({});
    }, `Сохранено: ${rows.map((row) => row.name).join(", ")}`);
  };

  const saveCustom = (event: FormEvent) => {
    event.preventDefault();
    const key = name.trim();
    if (!NAME.test(key)) {
      setError("Имя: латиница, цифры и _, не с цифры");
      return;
    }
    if (!value) return;
    void run(async () => {
      await rpc.call("project_secret_set", { projectId, name: key, value, ...(note.trim() ? { note: note.trim() } : {}) });
      setName("");
      setValue("");
      setNote("");
    }, `Сохранено: ${key}`);
  };

  /** One RPC per key, in order; stops at the first failure and says what was saved. */
  const saveBulk = (event: FormEvent) => {
    event.preventDefault();
    const entries = parsed.entries;
    if (entries.length === 0) return;
    const done: string[] = [];
    void run(async () => {
      try {
        for (const entry of entries) {
          await rpc.call("project_secret_set", { projectId, name: entry.name, value: entry.value, ...(entry.note ? { note: entry.note } : {}) });
          done.push(entry.name);
        }
      } catch (cause) {
        throw new Error(`${done.length ? `Сохранены: ${done.join(", ")}. ` : ""}Остановился на ${entries[done.length]?.name}: ${errorText(cause)}`);
      }
      setBulk("");
    }, `Сохранено ${entries.length}: ${entries.map((entry) => entry.name).join(", ")}`);
  };

  const replace = (secret: Secret) => {
    setName(secret.name);
    setNote(secret.note ?? "");
    setValue("");
    setSaved(null);
  };

  const remove = (secret: Secret) => void run(() => rpc.call("project_secret_unset", { projectId, name: secret.name }).then(() => undefined), `Удалено: ${secret.name}`);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{projectName ? `Секреты проекта «${projectName}»` : "Секреты проекта"}</DialogTitle>
          <DialogDescription>
            Агенты этого проекта получают их как переменные окружения и знают только имена и описание. bb хранит значения зашифрованными и не показывает их; применяются со следующего хода агентов.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4">
          <form onSubmit={saveBulk} className="grid gap-2 rounded-xl border border-border p-3">
            <div className="flex items-center gap-2">
              <div className="text-sm font-semibold">Вставить списком</div>
              <span className="text-xs text-muted-foreground">каждая переменная с новой строки</span>
              <button type="button" onClick={() => setShowBulk((value) => !value)} className="ml-auto cursor-pointer text-xs text-muted-foreground hover:text-foreground">
                {showBulk ? "скрыть значения" : "показать значения"}
              </button>
            </div>
            <TextArea
              value={bulk}
              onChange={(event) => setBulk(event.target.value)}
              rows={5}
              spellCheck={false}
              autoComplete="off"
              className="font-mono text-xs"
              style={showBulk ? undefined : ({ WebkitTextSecurity: "disc" } as React.CSSProperties)}
              placeholder={"# адрес приложения — комментарий над ключом станет описанием\nAIRD_APP_URL=http://localhost:3000\nAIRD_APP_LOGIN=qa@example.com\nAIRD_APP_PASSWORD: \"пароль\""}
            />
            <p className="text-[11px] text-muted-foreground">
              Подходит .env (<code>KEY=value</code>, <code>export KEY=value</code>) и YAML (<code>KEY: value</code>), значения в кавычках — тоже.
            </p>
            {parsed.entries.length > 0 || parsed.errors.length > 0 ? (
              <div className="grid gap-1 text-xs">
                {parsed.entries.map((entry) => (
                  <div key={entry.name} className="flex min-w-0 items-center gap-2">
                    <span className={cn("rounded px-1 py-px text-[10px] font-medium", has(entry.name) ? "bg-amber-500/15 text-amber-600 dark:text-amber-400" : "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400")}>
                      {has(entry.name) ? "заменит" : "новый"}
                    </span>
                    <span className="font-mono">{entry.name}</span>
                    <span className="text-muted-foreground">{entry.value.length} симв.</span>
                    {entry.note ? <span className="min-w-0 truncate text-muted-foreground">— {entry.note}</span> : null}
                  </div>
                ))}
                {parsed.errors.map((problem) => (
                  <div key={`${problem.line}-${problem.message}`} className="text-destructive">
                    строка {problem.line}: {problem.message}
                  </div>
                ))}
              </div>
            ) : null}
            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={pending || parsed.entries.length === 0}>
                {parsed.entries.length > 0 ? `Сохранить ${parsed.entries.length}` : "Сохранить"}
              </Button>
            </div>
          </form>

          {own.length > 0 ? (
            <div className="grid gap-1.5">
              {own.map((secret) => (
                <SecretRow key={secret.name} secret={secret} onReplace={() => replace(secret)} onRemove={() => remove(secret)} />
              ))}
            </div>
          ) : secrets ? (
            <p className="text-sm text-muted-foreground">Секретов пока нет.</p>
          ) : null}
          {inherited.length > 0 ? (
            <p className="text-xs text-muted-foreground">
              Глобальные переменные bb (тоже видны агентам): {inherited.map((secret) => secret.name).join(", ")}
            </p>
          ) : null}

          <form onSubmit={saveAccess} className="@container grid gap-2.5 rounded-xl border border-border p-3">
            <div>
              <div className="text-sm font-semibold">Вход в приложение для живых проверок</div>
              <p className="text-xs text-muted-foreground">Для QA, test-author и браузерных гейтов: агенты входят скриптом, который читает эти переменные.</p>
            </div>
            {APP_ACCESS.map((row) => (
              <Row key={row.name} label={row.label} badge={has(row.name) ? "задан" : null}>
                <TextInput
                  type={row.secret ? "password" : "text"}
                  autoComplete="off"
                  value={access[row.name] ?? ""}
                  onChange={(event) => setAccess((current) => ({ ...current, [row.name]: event.target.value }))}
                  placeholder={has(row.name) ? "задан — оставь пустым, чтобы не менять" : row.placeholder}
                />
              </Row>
            ))}
            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={pending || APP_ACCESS.every((row) => !(access[row.name] ?? ""))}>
                Сохранить доступ
              </Button>
            </div>
          </form>

          <form onSubmit={saveCustom} className="@container grid gap-2.5 rounded-xl border border-border p-3">
            <div className="text-sm font-semibold">{own.some((secret) => secret.name === name.trim()) ? `Заменить ${name.trim()}` : "Другая переменная"}</div>
            <Row label="Имя">
              <TextInput value={name} onChange={(event) => setName(event.target.value.toUpperCase())} placeholder="STAGING_API_URL" className="font-mono" autoComplete="off" />
            </Row>
            <Row label="Значение">
              <TextInput type="password" value={value} onChange={(event) => setValue(event.target.value)} placeholder="не показывается после сохранения" autoComplete="off" />
            </Row>
            <Row label="Для чего">
              <TextInput value={note} onChange={(event) => setNote(event.target.value)} placeholder="видят агенты: адрес стейджинга для проверок API" />
            </Row>
            {name && hiddenFromCodex(name) ? (
              <p className="text-xs text-muted-foreground">Агенты на Codex по умолчанию не видят переменные с KEY, SECRET или TOKEN в имени — назови иначе или разреши в shell_environment_policy.</p>
            ) : null}
            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={pending || !name.trim() || !value}>
                Сохранить
              </Button>
            </div>
          </form>
          {saved ? <p className="text-xs text-muted-foreground">{saved}</p> : null}
          <ErrorText>{error ?? loadError}</ErrorText>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Готово
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
