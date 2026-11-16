// Small plugin-owned UI pieces on top of the vendored shadcn components.
import type { ComponentProps, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { Markdown } from "@get-bb/plugin-sdk/app";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { TONE_COLORS, type Tone } from "./data";

export function Pill({
  tone = "neutral",
  children,
  className,
  title,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
  title?: string;
}) {
  const color = TONE_COLORS[tone];
  return (
    <span
      title={title}
      className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium leading-4", className)}
      style={{ color, backgroundColor: `${color}1f`, boxShadow: `inset 0 0 0 1px ${color}40` }}
    >
      {children}
    </span>
  );
}

export function Dot({ tone, pulse = false }: { tone: Tone; pulse?: boolean }) {
  const color = TONE_COLORS[tone];
  return (
    <span className="relative inline-flex size-2 shrink-0">
      {pulse ? <span className="absolute inline-flex size-full animate-ping rounded-full opacity-60" style={{ backgroundColor: color }} /> : null}
      <span className="relative inline-flex size-2 rounded-full" style={{ backgroundColor: color }} />
    </span>
  );
}

export function Chip({ children, mono = false, title }: { children: ReactNode; mono?: boolean; title?: string }) {
  return (
    <span
      title={title}
      className={cn(
        "inline-flex items-center rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[11px] leading-4 text-muted-foreground",
        mono && "font-mono",
      )}
    >
      {children}
    </span>
  );
}

export function Tabs<T extends string>({
  value,
  onChange,
  items,
  className,
}: {
  value: T;
  onChange: (value: T) => void;
  items: { value: T; label: string; count?: number; icon?: string }[];
  className?: string;
}) {
  return (
    <div role="tablist" className={cn("flex items-center gap-0.5 overflow-x-auto border-b border-border [scrollbar-width:thin]", className)}>
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(item.value)}
            className={cn(
              "-mb-px inline-flex shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap border-b-2 px-2.5 py-2 text-sm transition-colors",
              active ? "border-foreground font-medium text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
            )}
          >
            {item.icon ? <Icon name={item.icon} fallback="Circle" className="size-3.5" /> : null}
            {item.label}
            {item.count !== undefined ? (
              <span className="rounded-full bg-muted px-1.5 text-[10px] font-semibold text-muted-foreground">{item.count}</span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function Segmented<T extends string>({
  value,
  onChange,
  items,
  size = "sm",
}: {
  value: T;
  onChange: (value: T) => void;
  items: { value: T; label: string; tone?: Tone }[];
  size?: "sm" | "xs";
}) {
  return (
    <div className="inline-flex shrink-0 items-center whitespace-nowrap rounded-md border border-border bg-muted/30 p-0.5">
      {items.map((item) => {
        const active = item.value === value;
        const color = item.tone ? TONE_COLORS[item.tone] : undefined;
        return (
          <button
            key={item.value}
            type="button"
            aria-pressed={active}
            onClick={(event) => {
              event.stopPropagation();
              onChange(item.value);
            }}
            className={cn(
              "cursor-pointer whitespace-nowrap rounded px-2 transition-colors",
              size === "xs" ? "py-0 text-[11px] leading-5" : "py-0.5 text-xs",
              active ? "bg-background font-medium text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
            style={active && color ? { color } : undefined}
          >
            {item.label}
          </button>
        );
      })}
    </div>
  );
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className={cn(
        "h-9 w-full cursor-pointer rounded-md border border-input bg-transparent px-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        className,
      )}
    />
  );
}

/** Placeholders a step dimmer than typed text, so an example never reads as a filled-in value. */
const PLACEHOLDER = "placeholder:text-muted-foreground/45";

export function TextInput({ className, ...props }: ComponentProps<typeof Input>) {
  return <Input {...props} className={cn(PLACEHOLDER, className)} />;
}

export function TextArea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={cn(
        "min-h-28 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground/45 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        className,
      )}
    />
  );
}

export function Field({ label, hint, children }: { label: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="font-medium">{label}</span>
      {children}
      {hint ? <span className="text-xs text-muted-foreground">{hint}</span> : null}
    </label>
  );
}

export function Stat({ label, value, tone, sub }: { label: string; value: ReactNode; tone?: Tone; sub?: ReactNode }) {
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2.5">
      <div className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums" style={tone ? { color: TONE_COLORS[tone] } : undefined}>
        {value}
      </div>
      {sub ? <div className="text-xs text-muted-foreground">{sub}</div> : null}
    </div>
  );
}

export function ProgressBar({ value, tone = "info" }: { value: number; tone?: Tone }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div className="h-full rounded-full transition-all" style={{ width: `${Math.max(0, Math.min(100, value))}%`, backgroundColor: TONE_COLORS[tone] }} />
    </div>
  );
}

/** Stacked bar of parts of one whole (done / in progress / blocked / rest). */
export function SplitBar({ parts }: { parts: { value: number; tone: Tone; label: string }[] }) {
  const total = parts.reduce((sum, part) => sum + part.value, 0);
  if (total === 0) return <div className="h-1.5 w-full rounded-full bg-muted" />;
  return (
    <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-muted">
      {parts
        .filter((part) => part.value > 0)
        .map((part) => (
          <div
            key={part.label}
            title={`${part.label}: ${part.value}`}
            style={{ width: `${(part.value / total) * 100}%`, backgroundColor: TONE_COLORS[part.tone] }}
          />
        ))}
    </div>
  );
}

export function EmptyState({ children, icon }: { children: ReactNode; icon?: string }) {
  return (
    <div role="status" className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
      {icon ? <Icon name={icon} fallback="FolderOpen" className="size-6 opacity-60" /> : null}
      {children}
    </div>
  );
}

export function ErrorText({ children }: { children: ReactNode }) {
  if (!children) return null;
  return (
    <p role="alert" className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {children}
    </p>
  );
}

// bb's Markdown is styled for the chat column: tables bleed past the text with
// negative margins. Inside plugin cards and the details panel they must stay
// within the block, scroll horizontally, and let long inline code wrap.
const MARKDOWN_CSS = `
.sf-md { min-width: 0; max-width: 100%; overflow-wrap: break-word; }
.sf-md div:has(> table), .sf-md div:has(> div > table) { margin-left: 0 !important; margin-right: 0 !important; max-width: 100% !important; }
.sf-md table { display: block; width: max-content; max-width: 100%; overflow-x: auto; }
.sf-md th { white-space: nowrap; vertical-align: top; }
.sf-md td { overflow-wrap: break-word; vertical-align: top; min-width: 3.5rem; }
.sf-md td code, .sf-md th code { white-space: normal; word-break: break-all; }
.sf-md li code, .sf-md p code { white-space: normal; overflow-wrap: anywhere; }
.sf-md pre { max-width: 100%; overflow-x: auto; }
.sf-md img { max-width: 100%; height: auto; }
`;

export function MarkdownView({ content, className }: { content: string; className?: string }) {
  return (
    <div className={cn("sf-md text-sm", className)}>
      <style>{MARKDOWN_CSS}</style>
      <Markdown content={content} />
    </div>
  );
}
