// Materials the user attaches to an AIRD: screenshots, mockups, documents.
// They live in the package's `inputs/`, so every agent of the AIRD — and every
// later session — can open them by path. Orchestrators also receive them as
// native attachments of their first message; an agent receives the ones its
// brief names.
import { mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";

export const INPUTS_DIR = "inputs";
export const MAX_INPUT_BYTES = 25 * 1024 * 1024;
export const MAX_INPUTS = 40;
/** Native attachments per message; the rest are listed by path only. */
const MAX_NATIVE = 12;
const MAX_NATIVE_BYTES = 10 * 1024 * 1024;

const MIME: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".pdf": "application/pdf",
  ".md": "text/markdown",
  ".txt": "text/plain",
  ".csv": "text/csv",
  ".json": "application/json",
  ".html": "text/html",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
};
/** Formats models read as images; SVG is text and goes as a file. */
const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp"]);

export interface InputFile {
  name: string;
  path: string;
  sizeBytes: number;
  mimeType: string;
  image: boolean;
  addedAt: number;
}

export type InputPart =
  | { type: "localImage"; path: string; hostId?: string }
  | { type: "localFile"; path: string; name: string; mimeType: string; sizeBytes: number; hostId?: string };

export function mimeOf(name: string): string {
  return MIME[extname(name).toLowerCase()] ?? "application/octet-stream";
}

/** A file name safe for shells and briefs: letters (any script), digits, `.`, `_`, `-`. */
export function safeInputName(raw: string): string {
  const base = basename(raw.replace(/\\/gu, "/")).normalize("NFC");
  const rawExt = extname(base);
  const ext = rawExt.toLowerCase().replace(/[^.a-z0-9]/gu, "").slice(0, 10);
  const stem =
    base
      .slice(0, base.length - rawExt.length)
      .replace(/[^\p{L}\p{N}._-]+/gu, "-")
      .replace(/-{2,}/gu, "-")
      .replace(/^[-.]+|[-.]+$/gu, "")
      .slice(0, 80) || "file";
  return `${stem}${ext === "." ? "" : ext}`;
}

export function inputsDir(packageDir: string): string {
  return join(packageDir, INPUTS_DIR);
}

export function listInputs(packageDir: string): InputFile[] {
  const dir = inputsDir(packageDir);
  let names: string[];
  try {
    names = readdirSync(dir);
  } catch {
    return [];
  }
  const files: InputFile[] = [];
  for (const name of names) {
    if (name.startsWith(".")) continue;
    const path = join(dir, name);
    try {
      const stat = statSync(path);
      if (!stat.isFile()) continue;
      files.push({ name, path, sizeBytes: stat.size, mimeType: mimeOf(name), image: IMAGE_EXT.has(extname(name).toLowerCase()), addedAt: stat.mtimeMs });
    } catch {
      // vanished between readdir and stat
    }
  }
  return files.sort((a, b) => a.addedAt - b.addedAt || a.name.localeCompare(b.name));
}

function uniqueName(name: string, taken: Set<string>): string {
  if (!taken.has(name)) return name;
  const ext = extname(name);
  const stem = name.slice(0, name.length - ext.length);
  for (let n = 2; ; n += 1) {
    const candidate = `${stem}-${n}${ext}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export function saveInput(packageDir: string, rawName: string, bytes: Uint8Array): InputFile {
  if (bytes.length === 0) throw new Error(`Файл «${rawName}» пустой`);
  if (bytes.length > MAX_INPUT_BYTES) throw new Error(`Файл «${rawName}» больше ${MAX_INPUT_BYTES / 1024 / 1024} МБ`);
  const existing = listInputs(packageDir);
  if (existing.length >= MAX_INPUTS) throw new Error(`У AIRD уже ${MAX_INPUTS} материалов — удали лишние`);
  const dir = inputsDir(packageDir);
  mkdirSync(dir, { recursive: true });
  const name = uniqueName(safeInputName(rawName), new Set(readdirSync(dir)));
  const path = join(dir, name);
  writeFileSync(path, bytes, { flag: "wx" });
  return { name, path, sizeBytes: bytes.length, mimeType: mimeOf(name), image: IMAGE_EXT.has(extname(name).toLowerCase()), addedAt: Date.now() };
}

export function removeInput(packageDir: string, name: string): void {
  if (safeInputName(name) !== name) throw new Error("Недопустимое имя файла");
  rmSync(join(inputsDir(packageDir), name), { force: true });
}

function sizeText(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} КБ`;
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`;
}

/** One line per material, with the path agents use (relative to their working folder). */
export function inputLines(inputs: InputFile[], packageRel: string): string[] {
  return inputs.map((file) => `- \`${packageRel}${INPUTS_DIR}/${file.name}\` — ${file.image ? "картинка" : file.mimeType}, ${sizeText(file.sizeBytes)}`);
}

/** Native thread attachments: images and small files, capped so one message stays reasonable. */
export function inputParts(inputs: InputFile[], hostId: string | null): InputPart[] {
  const host = hostId ? { hostId } : {};
  return inputs
    .filter((file) => file.sizeBytes <= MAX_NATIVE_BYTES)
    .slice(0, MAX_NATIVE)
    .map((file) =>
      file.image
        ? { type: "localImage" as const, path: file.path, ...host }
        : { type: "localFile" as const, path: file.path, name: file.name, mimeType: file.mimeType, sizeBytes: file.sizeBytes, ...host },
    );
}

/** The materials a brief names, by file name or `inputs/<name>`. */
export function inputsNamedIn(text: string, inputs: InputFile[]): InputFile[] {
  return inputs.filter((file) => text.includes(file.name));
}
