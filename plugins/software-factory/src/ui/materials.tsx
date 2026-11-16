// Materials the user attaches to an AIRD: screenshots, mockups, documents.
// The create dialog collects them before the AIRD exists (MaterialsPicker);
// the AIRD overview shows and extends them (MaterialsSection). Files go to the
// package's inputs/ and from there to the orchestrator and the agents.
import { useEffect, useRef, useState } from "react";
import type { ClipboardEvent, DragEvent, ReactNode } from "react";
import { useBbNavigate } from "@get-bb/plugin-sdk/app";
import { Checkbox } from "@/components/ui/checkbox";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { AirdDetail, InputFile } from "../contract";
import { errorText, useFactoryRpc } from "./data";
import { ErrorText } from "./kit";

export const MAX_FILE_BYTES = 25 * 1024 * 1024;
const IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error(`Не удалось прочитать ${file.name}`));
    reader.onload = () => {
      const url = String(reader.result ?? "");
      resolve(url.slice(url.indexOf(",") + 1));
    };
    reader.readAsDataURL(file);
  });
}

/** A pasted screenshot arrives as "image.png"; give it a readable, distinct name. */
function namedFile(file: File, index: number): File {
  if (file.name && file.name !== "image.png") return file;
  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:]/gu, "").replace("T", "-");
  const ext = file.type.split("/")[1]?.replace("jpeg", "jpg") ?? "png";
  return new File([file], `screenshot-${stamp}${index > 0 ? `-${index + 1}` : ""}.${ext}`, { type: file.type });
}

/** Uploads one file at a time (RPC payloads stay bounded); returns the stored names. */
export async function uploadMaterials(
  rpc: ReturnType<typeof useFactoryRpc>,
  id: string,
  files: File[],
  onProgress?: (done: number) => void,
): Promise<string[]> {
  const names: string[] = [];
  for (const [index, file] of files.entries()) {
    const saved = await rpc.call("aird_attach", { id, name: file.name, dataBase64: await readBase64(file) });
    names.push(saved.name);
    onProgress?.(index + 1);
  }
  return names;
}

/** Drop zone + file picker + paste; reports accepted files and rejects oversized ones. */
function DropZone({ onFiles, compact = false, children }: { onFiles: (files: File[]) => void; compact?: boolean; children?: ReactNode }) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const take = (list: FileList | File[] | null) => {
    const files = Array.from(list ?? []).map(namedFile);
    if (files.length > 0) onFiles(files);
  };
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => input.current?.click()}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          input.current?.click();
        }
      }}
      onDragOver={(event: DragEvent) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event: DragEvent) => {
        event.preventDefault();
        setOver(false);
        take(event.dataTransfer.files);
      }}
      onPaste={(event: ClipboardEvent) => {
        if (event.clipboardData.files.length > 0) {
          event.preventDefault();
          event.stopPropagation();
          take(event.clipboardData.files);
        }
      }}
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-border text-sm text-muted-foreground transition-colors hover:bg-state-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        compact ? "px-3 py-2" : "px-3 py-3",
        over && "border-primary bg-state-active text-foreground",
      )}
    >
      <Icon name="Paperclip" fallback="Plus" className="size-4 shrink-0" />
      <span className="min-w-0 flex-1">
        {children ?? (
          <>
            Перетащи файлы, вставь скриншот <kbd className="rounded border border-border px-1 text-[11px]">⌘V</kbd> или нажми, чтобы выбрать
          </>
        )}
      </span>
      <input
        ref={input}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          take(event.target.files);
          event.target.value = "";
        }}
      />
    </div>
  );
}

function Thumb({ src, name, image }: { src: string | null; name: string; image: boolean }) {
  return (
    <div className="flex size-10 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border bg-muted">
      {image && src ? (
        <img src={src} alt={name} className="size-full object-cover" />
      ) : (
        <Icon name={image ? "Image" : "FileText"} fallback="FileText" className="size-4 text-muted-foreground" />
      )}
    </div>
  );
}

function MaterialRow({
  thumb,
  name,
  meta,
  onOpen,
  onRemove,
}: {
  thumb: ReactNode;
  name: string;
  meta: string;
  onOpen?: () => void;
  onRemove?: () => void;
}) {
  return (
    <div className="group flex min-w-0 items-center gap-2 rounded-lg border border-border bg-card p-1.5 pr-2">
      {thumb}
      <button type="button" onClick={onOpen} disabled={!onOpen} className="min-w-0 flex-1 cursor-pointer text-left disabled:cursor-default">
        <div className="truncate text-xs font-medium">{name}</div>
        <div className="truncate text-[11px] text-muted-foreground">{meta}</div>
      </button>
      {onRemove ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Убрать ${name}`}
          className="cursor-pointer rounded p-1 text-muted-foreground opacity-60 hover:bg-state-hover hover:text-foreground group-hover:opacity-100"
        >
          <Icon name="X" fallback="ClosePluginPane" className="size-3.5" />
        </button>
      ) : null}
    </div>
  );
}

/** Create dialog: files kept in memory until the AIRD exists. */
export function MaterialsPicker({ files, onChange }: { files: File[]; onChange: (files: File[]) => void }) {
  const [error, setError] = useState<string | null>(null);
  const [urls, setUrls] = useState<Map<File, string>>(new Map());
  useEffect(() => {
    const next = new Map<File, string>();
    for (const file of files) if (IMAGE_TYPES.has(file.type)) next.set(file, URL.createObjectURL(file));
    setUrls(next);
    return () => next.forEach((url) => URL.revokeObjectURL(url));
  }, [files]);
  const add = (incoming: File[]) => {
    const big = incoming.filter((file) => file.size > MAX_FILE_BYTES);
    setError(big.length ? `Больше 25 МБ: ${big.map((file) => file.name).join(", ")}` : null);
    onChange([...files, ...incoming.filter((file) => file.size <= MAX_FILE_BYTES)]);
  };
  return (
    <div className="grid gap-2">
      <DropZone onFiles={add} />
      {files.length > 0 ? (
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {files.map((file, index) => (
            <MaterialRow
              key={`${file.name}-${index}`}
              thumb={<Thumb src={urls.get(file) ?? null} name={file.name} image={IMAGE_TYPES.has(file.type)} />}
              name={file.name}
              meta={formatSize(file.size)}
              onRemove={() => onChange(files.filter((_, i) => i !== index))}
            />
          ))}
        </div>
      ) : null}
      <ErrorText>{error}</ErrorText>
    </div>
  );
}

function StoredThumb({ id, file }: { id: string; file: InputFile }) {
  const rpc = useFactoryRpc();
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!file.image || file.sizeBytes > 10 * 1024 * 1024) return;
    let live = true;
    rpc.call("aird_input_data", { id, name: file.name }).then(
      (result) => live && setSrc(result.dataUrl),
      () => undefined,
    );
    return () => {
      live = false;
    };
  }, [rpc, id, file.name, file.image, file.sizeBytes, file.addedAt]);
  return <Thumb src={src} name={file.name} image={file.image} />;
}

/** AIRD overview: what the agents were given, plus adding more. */
export function MaterialsSection({ data, id }: { data: AirdDetail; id: string }) {
  const rpc = useFactoryRpc();
  const navigate = useBbNavigate();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const hasOrchestrator = data.threads.some((thread) => thread.kind === "orchestrator");
  const [announce, setAnnounce] = useState(true);

  const add = async (files: File[]) => {
    const fitting = files.filter((file) => file.size <= MAX_FILE_BYTES);
    const big = files.filter((file) => file.size > MAX_FILE_BYTES);
    setError(big.length ? `Больше 25 МБ: ${big.map((file) => file.name).join(", ")}` : null);
    setNotice(null);
    if (fitting.length === 0) return;
    try {
      setBusy(`Загружаю 0/${fitting.length}…`);
      const names = await uploadMaterials(rpc, id, fitting, (done) => setBusy(`Загружаю ${done}/${fitting.length}…`));
      if (hasOrchestrator && announce) {
        const result = await rpc.call("aird_inputs_announce", { id, names });
        setNotice(result.threadId ? "Оркестратор получил новые материалы." : "Сохранено; оркестратору отправить не удалось — он увидит их при следующем запуске.");
      } else {
        setNotice("Сохранено — агенты получат файлы при следующем запуске.");
      }
    } catch (cause) {
      setError(errorText(cause));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (name: string) => {
    try {
      await rpc.call("aird_input_remove", { id, name });
    } catch (cause) {
      setError(errorText(cause));
    }
  };

  const open = (file: InputFile) => {
    if (data.hostId) navigate.experimental_openFilePreview({ target: { kind: "host", hostId: data.hostId, path: file.path }, location: null });
  };

  return (
    <div className="grid gap-2">
      {data.inputs.length === 0 ? (
        <p className="text-sm text-muted-foreground">Скриншоты, макеты и документы к задаче. Оркестратор получает их в первом сообщении, агент — те, что названы в его брифе.</p>
      ) : (
        <div className="grid grid-cols-1 gap-1.5 @md:grid-cols-2">
          {data.inputs.map((file) => (
            <MaterialRow
              key={file.name}
              thumb={<StoredThumb id={id} file={file} />}
              name={file.name}
              meta={formatSize(file.sizeBytes)}
              onOpen={data.hostId ? () => open(file) : undefined}
              onRemove={() => void remove(file.name)}
            />
          ))}
        </div>
      )}
      <DropZone onFiles={(files) => void add(files)} compact>
        {busy ?? "Добавить: перетащи, вставь ⌘V или выбери файлы"}
      </DropZone>
      {hasOrchestrator ? (
        <label className="flex cursor-pointer items-center gap-2 text-xs text-muted-foreground">
          <Checkbox checked={announce} onCheckedChange={(value) => setAnnounce(value === true)} />
          Сразу отправить новые файлы оркестратору
        </label>
      ) : null}
      {notice ? <p className="text-xs text-muted-foreground">{notice}</p> : null}
      <ErrorText>{error}</ErrorText>
    </div>
  );
}

/** Wraps a dialog body so a pasted screenshot lands in the picker from anywhere in the form. */
export function usePasteFiles(onFiles: (files: File[]) => void) {
  return (event: ClipboardEvent) => {
    const files = Array.from(event.clipboardData.files);
    if (files.length === 0) return;
    event.preventDefault();
    onFiles(files.map(namedFile));
  };
}

