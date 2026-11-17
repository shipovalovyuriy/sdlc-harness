import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join } from "node:path";

/**
 * Sections a workorder names in `docs_to_read` (`05-api-contracts.md#1. Панель`),
 * cut out of the package documents. A worker given these does not open whole
 * design documents: everything it reads stays in its context and is re-sent on
 * every later step.
 */
export interface BriefSection {
  ref: string;
  path: string;
  heading: string | null;
  from: number;
  to: number;
  text: string;
  truncated: boolean;
}

const normalize = (value: string) =>
  value.replace(/^#+\s*/u, "").replace(/[`*_]/gu, "").replace(/[\s:.]+$/u, "").replace(/\s+/gu, " ").trim().toLowerCase();

/** The section under a heading, up to the next heading of the same or higher level. */
export function extractSection(text: string, heading: string): { from: number; to: number; text: string } | null {
  const lines = text.split("\n");
  const wanted = normalize(heading);
  let start = -1;
  let level = 0;
  let inFence = false;
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i]!;
    if (/^\s*(```|~~~)/u.test(line)) inFence = !inFence;
    if (inFence) continue;
    const match = /^(#{1,6})\s+(.*)$/u.exec(line);
    if (!match) continue;
    if (start < 0) {
      if (normalize(match[2]!) === wanted) { start = i; level = match[1]!.length; }
    } else if (match[1]!.length <= level) {
      return { from: start + 1, to: i, text: lines.slice(start, i).join("\n").trimEnd() };
    }
  }
  return start < 0 ? null : { from: start + 1, to: lines.length, text: lines.slice(start).join("\n").trimEnd() };
}

/** Resolve the named sections for a brief, bounded so the brief itself stays small. */
export function briefSections(refs: string[], roots: string[], perSection = 16_000, total = 60_000): { sections: BriefSection[]; missing: string[] } {
  const sections: BriefSection[] = [];
  const missing: string[] = [];
  let used = 0;
  for (const raw of [...new Set(refs.map((ref) => ref.trim()).filter(Boolean))]) {
    const hash = raw.indexOf("#");
    const path = (hash >= 0 ? raw.slice(0, hash) : raw).trim().replace(/^\.\//u, "");
    const heading = hash >= 0 ? raw.slice(hash + 1).trim() : null;
    const file = isAbsolute(path) ? path : roots.map((root) => join(root, path)).find((candidate) => existsSync(candidate));
    if (!file || !existsSync(file)) { missing.push(raw); continue; }
    const text = readFileSync(file, "utf8");
    const found = heading ? extractSection(text, heading) : text.length <= perSection ? { from: 1, to: text.split("\n").length, text } : null;
    if (!found) { missing.push(raw); continue; }
    if (used >= total) { missing.push(raw); continue; }
    const room = Math.min(perSection, total - used);
    const truncated = found.text.length > room;
    const body = truncated ? found.text.slice(0, room) : found.text;
    used += body.length;
    sections.push({ ref: raw, path, heading, from: found.from, to: found.to, text: body, truncated });
  }
  return { sections, missing };
}

export function sectionsMarkdown(result: { sections: BriefSection[]; missing: string[] }): string {
  if (result.sections.length === 0 && result.missing.length === 0) return "";
  const out = [
    "## Разделы пакета из docs_to_read",
    "",
    "Factory уже вырезала их из документов. Целые документы пакета не открывай; если нужен другой раздел — `rg -n` по заголовку и `sed -n` окном.",
    "",
  ];
  for (const section of result.sections) {
    out.push(`### ${section.ref} (строки ${section.from}–${section.to}${section.truncated ? ", обрезано — дальше читай `sed -n` с места обрыва" : ""})`, "", "~~~~markdown", section.text, "~~~~", "");
  }
  if (result.missing.length) out.push(`Не найдены (прочитай сам, кусками): ${result.missing.map((ref) => `\`${ref}\``).join(", ")}`, "");
  return out.join("\n");
}
