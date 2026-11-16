// Home: projects on the left, the selected project's AIRDs on the right,
// plus the Create AIRD / Add project / project folders dialogs.
import { useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { AirdSummary, ProjectSummary } from "../contract";
import {
  errorText,
  relativeTime,
  shortPath,
  slugify,
  statusLabel,
  statusTone,
  useFactoryRpc,
  useOverview,
} from "./data";
import { Dot, EmptyState, ErrorText, Field, Pill, ProgressBar, Select, Tabs, TextArea, TextInput } from "./kit";
import { MAX_FILE_BYTES, MaterialsPicker, uploadMaterials, usePasteFiles } from "./materials";
import { HomeQuestions, useQuestions } from "./questions";
import { SecretsDialog } from "./secrets-dialog";

type Filter = "active" | "done" | "archived";
const ALL = "__all__";

function readStoredProject(): string {
  try {
    return localStorage.getItem("sf.project") ?? ALL;
  } catch {
    return ALL;
  }
}

export function HomeView({
  onOpen,
  onAgents,
  onMetrics,
  onQuestions,
  onOpenQuestion,
}: {
  onOpen: (id: string) => void;
  onAgents: () => void;
  onMetrics: () => void;
  onQuestions: () => void;
  onOpenQuestion: (airdId: string) => void;
}) {
  const { data, error, loading, refetch } = useOverview();
  const [projectId, setProjectId] = useState<string>(readStoredProject);
  const [filter, setFilter] = useState<Filter>("active");
  const [query, setQuery] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [addProjectOpen, setAddProjectOpen] = useState(false);
  const [foldersOpen, setFoldersOpen] = useState(false);
  const [secretsOpen, setSecretsOpen] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem("sf.project", projectId);
    } catch {
      /* storage unavailable */
    }
  }, [projectId]);

  const projects = data?.projects ?? [];
  const project = projects.find((candidate) => candidate.id === projectId) ?? null;
  useEffect(() => {
    if (data && projectId !== ALL && !project) setProjectId(ALL);
  }, [data, projectId, project]);

  const inProject = (data?.airds ?? []).filter((aird) => projectId === ALL || aird.projectId === projectId);
  const counts = {
    active: inProject.filter((a) => !a.done && !a.archived).length,
    done: inProject.filter((a) => a.done && !a.archived).length,
    archived: inProject.filter((a) => a.archived).length,
  };
  const needle = query.trim().toLowerCase();
  const visible = inProject
    .filter((aird) =>
      filter === "archived" ? aird.archived : filter === "done" ? aird.done && !aird.archived : !aird.done && !aird.archived,
    )
    .filter((aird) => !needle || `${aird.title} ${aird.slug} ${aird.status}`.toLowerCase().includes(needle));
  const projectName = new Map(projects.map((p) => [p.id, p.name]));

  return (
    <div className="flex h-full min-h-0 flex-1">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-border md:flex">
        <div className="flex items-center justify-between px-4 pb-2 pt-4">
          <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Проекты</span>
          <Button variant="ghost" size="icon" className="size-7" aria-label="Добавить проект" onClick={() => setAddProjectOpen(true)}>
            <Icon name="Plus" className="size-4" />
          </Button>
        </div>
        <nav className="min-h-0 flex-1 space-y-0.5 overflow-y-auto px-2 pb-3">
          <ProjectRow
            active={projectId === ALL}
            name="Все проекты"
            sub={`${projects.length} проектов`}
            count={(data?.airds ?? []).filter((a) => !a.done && !a.archived).length}
            onClick={() => setProjectId(ALL)}
            icon="GridView"
          />
          {projects.map((p) => (
            <ProjectRow
              key={p.id}
              active={projectId === p.id}
              name={p.name}
              sub={p.local ? shortPath(p.rootPath ?? "") : "удалённая машина"}
              count={p.activeCount}
              muted={!p.local}
              onClick={() => setProjectId(p.id)}
              icon="FolderGit"
            />
          ))}
        </nav>
        <div className="space-y-0.5 border-t border-border p-2">
          <QuestionsLink onClick={onQuestions} />
          <button
            type="button"
            onClick={onMetrics}
            className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm text-muted-foreground hover:bg-state-hover hover:text-foreground"
          >
            <Icon name="ChartColumn" fallback="Target" className="size-4" />
            Самоулучшение AIRD
          </button>
          <button
            type="button"
            onClick={onAgents}
            className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm text-muted-foreground hover:bg-state-hover hover:text-foreground"
          >
            <Icon name="Bot" fallback="UserRound" className="size-4" />
            Роли агентов
          </button>
        </div>
      </aside>

      <section className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-7xl space-y-4 px-4 py-4 md:px-6 md:py-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="md:hidden">
                <Select value={projectId} onChange={(event) => setProjectId(event.target.value)} className="mb-2">
                  <option value={ALL}>Все проекты</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </Select>
              </div>
              <h2 className="truncate text-xl font-semibold">{project ? project.name : "Все проекты"}</h2>
              <p className="truncate text-sm text-muted-foreground">
                {project
                  ? `${shortPath(project.rootPath ?? "")} · ${project.folders.length} папок с AIRD`
                  : "AIRD-пакеты (.agent/aird) во всех проектах bb"}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" aria-label="Обновить" onClick={refetch} disabled={loading}>
                <Icon name="ArrowReloadHorizontal" className={cn("size-4", loading && "animate-spin")} />
              </Button>
              {project ? (
                <>
                  <Button variant="outline" size="sm" onClick={() => setFoldersOpen(true)}>
                    <Icon name="Folder02" fallback="Folder" className="size-4" />
                    Папки
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setSecretsOpen(true)}>
                    <Icon name="Lock" fallback="Settings" className="size-4" />
                    Секреты
                  </Button>
                </>
              ) : null}
              <Button variant="outline" size="sm" className="md:hidden" onClick={() => setAddProjectOpen(true)}>
                <Icon name="Plus" className="size-4" />
                Проект
              </Button>
              <Button size="sm" onClick={() => setCreateOpen(true)} disabled={projects.length === 0}>
                <Icon name="Plus" fallback="Plus" className="size-4" />
                Создать AIRD
              </Button>
            </div>
          </div>

          <HomeQuestions onAll={onQuestions} onOpenAird={onOpenQuestion} />

          <div className="flex flex-wrap items-end justify-between gap-3">
            <Tabs<Filter>
              value={filter}
              onChange={setFilter}
              className="flex-1"
              items={[
                { value: "active", label: "В работе", count: counts.active, icon: "Target" },
                { value: "done", label: "Завершённые", count: counts.done, icon: "CircleCheck" },
                { value: "archived", label: "Архив", count: counts.archived, icon: "Archive" },
              ]}
            />
            <TextInput value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Поиск AIRD…" className="h-8 w-56" />
          </div>

          <ErrorText>{error}</ErrorText>

          {data === null ? (
            <EmptyState icon="Loading">Читаю AIRD-пакеты…</EmptyState>
          ) : projects.length === 0 ? (
            <EmptyState icon="FolderPlus">
              Проектов пока нет.
              <Button size="sm" onClick={() => setAddProjectOpen(true)}>
                Добавить проект
              </Button>
            </EmptyState>
          ) : visible.length === 0 ? (
            <EmptyState icon="Workflow">
              {filter === "active" ? "Нет AIRD в работе." : filter === "done" ? "Завершённых AIRD нет." : "Архив пуст."}
              {filter === "active" ? (
                <Button size="sm" onClick={() => setCreateOpen(true)}>
                  Создать AIRD
                </Button>
              ) : null}
            </EmptyState>
          ) : (
            <AirdList airds={visible} projectName={projectId === ALL ? projectName : null} onOpen={onOpen} />
          )}
        </div>
      </section>

      <CreateAirdDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        projects={projects.filter((p) => p.local)}
        defaultProjectId={project?.local ? project.id : (projects.find((p) => p.local)?.id ?? "")}
        onCreated={(id) => {
          setCreateOpen(false);
          refetch();
          onOpen(id);
        }}
      />
      <AddProjectDialog
        open={addProjectOpen}
        onOpenChange={setAddProjectOpen}
        onCreated={(id) => {
          setAddProjectOpen(false);
          setProjectId(id);
          refetch();
        }}
      />
      {project ? <FoldersDialog open={foldersOpen} onOpenChange={setFoldersOpen} project={project} onSaved={refetch} /> : null}
      {project ? <SecretsDialog open={secretsOpen} onOpenChange={setSecretsOpen} projectId={project.id} projectName={project.name} /> : null}
    </div>
  );
}

function QuestionsLink({ onClick }: { onClick: () => void }) {
  const { questions } = useQuestions(null, false);
  const open = (questions ?? []).filter((question) => question.status === "open").length;
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-2 text-sm text-muted-foreground hover:bg-state-hover hover:text-foreground"
    >
      <Icon name="MessageQuestion" fallback="CircleQuestion" className="size-4" />
      Вопросы агентов
      {open > 0 ? <Pill tone="warn" className="ml-auto">{open}</Pill> : null}
    </button>
  );
}

function ProjectRow({
  active,
  name,
  sub,
  count,
  onClick,
  icon,
  muted = false,
}: {
  active: boolean;
  name: string;
  sub: string;
  count: number;
  onClick: () => void;
  icon: string;
  muted?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={cn(
        "flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-left",
        active ? "bg-state-active text-foreground" : "text-muted-foreground hover:bg-state-hover hover:text-foreground",
        muted && "opacity-60",
      )}
    >
      <Icon name={icon} fallback="Folder" className="size-4 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-foreground">{name}</span>
        <span className="block truncate text-[11px]">{sub}</span>
      </span>
      {count > 0 ? <span className="rounded-full bg-muted px-1.5 text-[11px] font-semibold tabular-nums">{count}</span> : null}
    </button>
  );
}

const RED = "#e5484d";
const AMBER = "#e0a019";

/** One line per AIRD: status, title, stage with progress, counters, agents, last update. */
function AirdList({
  airds,
  projectName,
  onOpen,
}: {
  airds: AirdSummary[];
  projectName: Map<string, string> | null;
  onOpen: (id: string) => void;
}) {
  // Columns follow the list's own width (container queries), not the window:
  // the bb sidebar and the details panel both take space from it.
  const columns = cn(
    "grid items-center gap-x-2.5",
    projectName
      ? "grid-cols-[minmax(0,1fr)_88px] @2xl:grid-cols-[minmax(0,1fr)_88px_150px] @3xl:grid-cols-[minmax(0,1fr)_88px_140px_44px_52px_64px_36px_44px] @5xl:grid-cols-[minmax(0,1fr)_110px_88px_160px_48px_56px_68px_40px_48px_84px]"
      : "grid-cols-[minmax(0,1fr)_88px] @2xl:grid-cols-[minmax(0,1fr)_88px_150px] @3xl:grid-cols-[minmax(0,1fr)_88px_140px_44px_52px_64px_36px_44px] @5xl:grid-cols-[minmax(0,1fr)_88px_160px_48px_56px_68px_40px_48px_84px]",
  );
  const cell = "hidden @3xl:block text-right tabular-nums";
  return (
    <div className="@container overflow-hidden rounded-xl border border-border bg-card">
      <div className={cn(columns, "border-b border-border bg-muted/40 px-3 py-2 text-[11px] font-medium uppercase tracking-wide text-muted-foreground")}>
        <span>AIRD</span>
        {projectName ? <span className="hidden @5xl:block">Проект</span> : null}
        <span>Статус</span>
        <span className="hidden @2xl:block">Стадия</span>
        <span className={cell}>WO</span>
        <span className={cell}>Баги</span>
        <span className={cell}>Гейты</span>
        <span className={cell}>Блок</span>
        <span className={cell}>Агент</span>
        <span className="hidden text-right @5xl:block">Обновлён</span>
      </div>
      <ul className="divide-y divide-border">
        {airds.map((aird) => {
          const warnGates = aird.gates.failed + aird.gates.blocked;
          return (
            <li key={aird.id}>
              <button
                type="button"
                onClick={() => onOpen(aird.id)}
                title={aird.nextAction ? `Следующее действие: ${aird.nextAction}` : undefined}
                className={cn(columns, "w-full cursor-pointer px-3 py-2 text-left text-sm transition-colors hover:bg-state-hover")}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <Dot tone={statusTone(aird.status)} pulse={aird.threads.running > 0} />
                  <span className="min-w-0 truncate font-medium">{aird.title}</span>
                  <span className="hidden min-w-0 shrink-[2] truncate font-mono text-[11px] text-muted-foreground @xl:inline">{aird.slug}</span>
                </span>
                {projectName ? <span className="hidden truncate text-xs text-muted-foreground @5xl:block">{projectName.get(aird.projectId) ?? "—"}</span> : null}
                <span className="min-w-0">
                  <Pill tone={statusTone(aird.status)} className="max-w-full truncate">
                    {statusLabel(aird.status)}
                  </Pill>
                </span>
                <span className="hidden min-w-0 items-center gap-2 @2xl:flex">
                  <span className="min-w-0 flex-1 truncate text-xs">
                    {aird.stageLabel}
                    {aird.activeWave && !aird.stageLabel.includes(aird.activeWave) ? <span className="text-muted-foreground"> · {aird.activeWave}</span> : null}
                  </span>
                  <span className="w-12 shrink-0">
                    <ProgressBar value={aird.progress} tone={aird.paused ? "warn" : aird.done ? "good" : "info"} />
                  </span>
                  <span className="w-8 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">{aird.progress}%</span>
                </span>
                <span className={cn(cell, "text-xs")}>
                  {aird.workorders.done}/{aird.workorders.total}
                </span>
                <span className={cn(cell, "text-xs")} style={aird.fixes.open > 0 ? { color: RED } : undefined}>
                  {aird.fixes.open}
                  <span className="text-muted-foreground">/{aird.fixes.total}</span>
                </span>
                <span className={cn(cell, "text-xs")}>
                  {aird.gates.passed}/{aird.gates.total}
                  {warnGates > 0 ? <span style={{ color: AMBER }}> ⚠{warnGates}</span> : null}
                </span>
                <span className={cn(cell, "text-xs")} style={aird.blockersOpen > 0 ? { color: AMBER } : undefined}>
                  {aird.blockersOpen || "—"}
                </span>
                <span className={cn(cell, "text-xs")}>
                  {aird.threads.running > 0 ? (
                    <span className="inline-flex items-center justify-end gap-1">
                      <Dot tone="info" pulse />
                      {aird.threads.running}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">{aird.threads.total || "—"}</span>
                  )}
                </span>
                <span className="hidden truncate text-right text-[11px] text-muted-foreground @5xl:block">{relativeTime(aird.updatedAt ?? aird.createdAt)}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------- dialogs

function CreateAirdDialog({
  open,
  onOpenChange,
  projects,
  defaultProjectId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projects: ProjectSummary[];
  defaultProjectId: string;
  onCreated: (id: string) => void;
}) {
  const rpc = useFactoryRpc();
  const [projectId, setProjectId] = useState(defaultProjectId);
  const [folder, setFolder] = useState("");
  const [customFolder, setCustomFolder] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [request, setRequest] = useState("");
  const [start, setStart] = useState(true);
  const [materials, setMaterials] = useState<File[]>([]);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const pasteFiles = usePasteFiles((files) => {
    const big = files.filter((file) => file.size > MAX_FILE_BYTES);
    setError(big.length ? `Больше 25 МБ: ${big.map((file) => file.name).join(", ")}` : null);
    setMaterials((current) => [...current, ...files.filter((file) => file.size <= MAX_FILE_BYTES)]);
  });

  useEffect(() => {
    if (open) {
      setProjectId(defaultProjectId);
      setMaterials([]);
      setTitle("");
      setSlug("");
      setSlugTouched(false);
      setRequest("");
      setError(null);
      setStart(true);
    }
  }, [open, defaultProjectId]);

  const project = projects.find((p) => p.id === projectId) ?? null;
  useEffect(() => {
    if (!open || !project) return;
    setFolder(project.rootPath ?? project.folders[0] ?? "");
    setCustomFolder("");
    rpc.call("folder_suggestions", { projectId: project.id }).then(
      (result) => setSuggestions(result.folders),
      () => setSuggestions([]),
    );
  }, [open, project?.id, rpc]); // eslint-disable-line react-hooks/exhaustive-deps

  const folderOptions = useMemo(
    () => [...new Set([...(project?.folders ?? []), ...suggestions])].sort(),
    [project, suggestions],
  );
  const effectiveFolder = folder === "__custom__" ? customFolder.trim() : folder;
  const effectiveSlug = slugTouched ? slug : slugify(title);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!project || pending) return;
    setPending("Создаю…");
    setError(null);
    let createdId: string | null = null;
    try {
      // Materials must be in the package before discovery starts, so the
      // orchestrator gets them in its first message: create, upload, start.
      const result = await rpc.call("aird_create", {
        projectId: project.id,
        folder: effectiveFolder,
        title: title.trim(),
        slug: effectiveSlug,
        request: request.trim(),
        start: start && materials.length === 0,
      });
      createdId = result.id;
      if (materials.length > 0) {
        setPending(`Загружаю материалы 0/${materials.length}…`);
        await uploadMaterials(rpc, result.id, materials, (done) => setPending(`Загружаю материалы ${done}/${materials.length}…`));
        if (start) {
          setPending("Запускаю discovery…");
          await rpc.call("aird_start", { id: result.id, stage: "discovery" });
        }
      }
      onCreated(result.id);
    } catch (cause) {
      // The AIRD exists already: open it so the user can retry from its page.
      if (createdId) onCreated(createdId);
      setError(errorText(cause));
    } finally {
      setPending(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Новый AIRD</DialogTitle>
          <DialogDescription>
            Software Factory создаст для AIRD отдельную git worktree и запустит в ней тред <code>aird-discovery-loop</code>; агенты скилла — отдельными тредами в той же worktree.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} onPaste={pasteFiles} className="grid gap-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Проект">
              <Select value={projectId} onChange={(event) => setProjectId(event.target.value)}>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Папка, где идёт работа">
              <Select value={folder} onChange={(event) => setFolder(event.target.value)}>
                {folderOptions.map((option) => (
                  <option key={option} value={option}>
                    {shortPath(option)}
                  </option>
                ))}
                <option value="__custom__">Другая папка…</option>
              </Select>
            </Field>
          </div>
          {folder === "__custom__" ? (
            <Field label="Путь к папке">
              <TextInput value={customFolder} onChange={(event) => setCustomFolder(event.target.value)} placeholder="/Users/…/repo/service" />
            </Field>
          ) : null}
          <Field label="Название">
            <TextInput value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Например, группы контрагентов" autoFocus />
          </Field>
          <Field
            label="Slug пакета"
            hint={
              <>
                Отдельная git worktree на ветке <code>aird/{effectiveSlug || "…"}</code> (в <code>~/.aird-worktrees/…</code>), пакет <code>.agent/aird/{effectiveSlug || "…"}</code> внутри неё.
              </>
            }
          >
            <TextInput
              value={effectiveSlug}
              onChange={(event) => {
                setSlugTouched(true);
                setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9-]/gu, "-"));
              }}
              className="font-mono"
            />
          </Field>
          <Field label="Запрос" hint="Что нужно сделать и зачем. Discovery задаст уточняющие вопросы в треде.">
            <TextArea value={request} onChange={(event) => setRequest(event.target.value)} placeholder="Опиши фичу, рефакторинг или идею…" rows={6} />
          </Field>
          <Field label="Материалы" hint="Скриншоты, макеты, документы. Лягут в inputs/ пакета; оркестратор получит их в первом сообщении, агенты — те, что названы в их брифе.">
            <MaterialsPicker files={materials} onChange={setMaterials} />
          </Field>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox checked={start} onCheckedChange={(value) => setStart(value === true)} />
            Сразу запустить discovery
          </label>
          <ErrorText>{error}</ErrorText>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={pending !== null || !project || !title.trim() || !request.trim() || effectiveSlug.length < 2 || !effectiveFolder}>
              {pending ?? (start ? "Создать и запустить" : "Создать")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function AddProjectDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const rpc = useFactoryRpc();
  const [name, setName] = useState("");
  const [path, setPath] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (open) {
      setName("");
      setPath("");
      setError(null);
    }
  }, [open]);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const result = await rpc.call("project_add", { name: name.trim(), path: path.trim() });
      onCreated(result.projectId);
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setPending(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Новый проект</DialogTitle>
          <DialogDescription>Создаёт проект bb с этой папкой; его треды появятся в боковой панели bb.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid gap-4">
          <Field label="Папка репозитория">
            <TextInput
              value={path}
              onChange={(event) => {
                setPath(event.target.value);
                if (!name) setName(event.target.value.split("/").filter(Boolean).pop() ?? "");
              }}
              placeholder="/Users/…/go/src/my-service"
              autoFocus
            />
          </Field>
          <Field label="Название">
            <TextInput value={name} onChange={(event) => setName(event.target.value)} />
          </Field>
          <ErrorText>{error}</ErrorText>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Отмена
            </Button>
            <Button type="submit" disabled={pending || !name.trim() || !path.trim()}>
              {pending ? "Создаю…" : "Добавить проект"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function FoldersDialog({
  open,
  onOpenChange,
  project,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  project: ProjectSummary;
  onSaved: () => void;
}) {
  const rpc = useFactoryRpc();
  const [text, setText] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const root = project.rootPath ?? "";
  useEffect(() => {
    if (!open) return;
    setText(project.folders.filter((folder) => folder !== root).join("\n"));
    setError(null);
    rpc.call("folder_suggestions", { projectId: project.id }).then(
      (result) => setSuggestions(result.folders.filter((folder) => folder !== root)),
      () => setSuggestions([]),
    );
  }, [open, project, root, rpc]);
  const lines = text.split("\n").map((line) => line.trim()).filter(Boolean);
  const save = async () => {
    setError(null);
    try {
      await rpc.call("project_folders_set", { projectId: project.id, folders: lines });
      onSaved();
      onOpenChange(false);
    } catch (cause) {
      setError(errorText(cause));
    }
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Папки проекта «{project.name}»</DialogTitle>
          <DialogDescription>
            Корень <code>{shortPath(root)}</code> сканируется всегда. Добавь подпапки (монорепо, сервисы), где лежат свои <code>.agent/aird</code>.
          </DialogDescription>
        </DialogHeader>
        <TextArea value={text} onChange={(event) => setText(event.target.value)} rows={6} className="font-mono text-xs" placeholder="/Users/…/repo/controlplane" />
        {suggestions.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {suggestions
              .filter((folder) => !lines.includes(folder))
              .slice(0, 24)
              .map((folder) => (
                <button
                  key={folder}
                  type="button"
                  onClick={() => setText((current) => `${current.trim()}\n${folder}`.trim())}
                  className="cursor-pointer rounded-md border border-border px-2 py-0.5 font-mono text-[11px] text-muted-foreground hover:text-foreground"
                >
                  + {folder.startsWith(root) ? folder.slice(root.length + 1) : shortPath(folder)}
                </button>
              ))}
          </div>
        ) : null}
        <ErrorText>{error}</ErrorText>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Отмена
          </Button>
          <Button onClick={save}>Сохранить</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
