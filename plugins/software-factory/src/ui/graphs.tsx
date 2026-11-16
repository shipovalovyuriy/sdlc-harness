// SVG graphs: the stage track, the workorder dependency DAG and the
// risk → gate → DoD map. Neutral colors come from the host theme (Tailwind
// fill-/stroke- utilities); status colors are fixed mid-tones that read in
// both light and dark themes.
import { useMemo, useState } from "react";
import type { Fix, Gate, Risk, StageNode, Workorder } from "../contract";
import { GATE_STATUS, STAGE_TONES, TONE_COLORS, woStatusTone, type Activity } from "./data";

/** A small robot badge: blue and pulsing while agents run, grey when they finished. */
function AgentBadge({ x, y, activity }: { x: number; y: number; activity: Activity | undefined }) {
  if (!activity || activity.total === 0) return null;
  const running = activity.running > 0;
  const color = running ? TONE_COLORS.info : TONE_COLORS.neutral;
  const label = running ? `${activity.running}` : `${activity.total}`;
  const width = 20 + label.length * 6;
  return (
    <g transform={`translate(${x}, ${y})`}>
      <title>{running ? `Работают агенты: ${activity.running} (всего ${activity.total})` : `Агентов было: ${activity.total}`}</title>
      {running ? (
        <rect x={-2} y={-2} width={width + 4} height={18} rx={9} fill={color} opacity={0.3}>
          <animate attributeName="opacity" values="0.35;0;0.35" dur="1.6s" repeatCount="indefinite" />
        </rect>
      ) : null}
      <rect width={width} height={14} rx={7} fill={color} />
      <circle cx={7} cy={7} r={2.6} fill="white" />
      <text x={13} y={10.5} fontSize={9.5} fontWeight={700} fill="white">
        {label}
      </text>
    </g>
  );
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function wrapLabel(text: string, max = 14): string[] {
  const words = text.split(/\s+/u);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length > max && current) {
      lines.push(current);
      current = word;
    } else current = `${current} ${word}`.trim();
  }
  if (current) lines.push(current);
  return lines.slice(0, 2);
}

// ------------------------------------------------------------------ stages

const STEP = 104;
const PAD_X = 56;

/**
 * A snake-shaped track: discovery runs left to right on the top row, turns
 * at the right edge, and delivery runs right to left on the bottom row.
 */
export function StageGraph({
  stages,
  selectedId = null,
  onSelect,
  activity = {},
}: {
  stages: StageNode[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
  activity?: Record<string, Activity>;
}) {
  const discovery = stages.filter((s) => s.lane === "discovery");
  const delivery = stages.filter((s) => s.lane === "delivery");
  const columns = Math.max(discovery.length, delivery.length);
  const width = PAD_X * 2 + (columns - 1) * STEP + 40;
  const rowY = [58, 178];
  const height = 250;
  const rightX = PAD_X + (columns - 1) * STEP;

  const points = new Map<string, { x: number; y: number }>();
  discovery.forEach((stage, index) => points.set(stage.id, { x: PAD_X + index * STEP, y: rowY[0]! }));
  delivery.forEach((stage, index) => points.set(stage.id, { x: rightX - index * STEP, y: rowY[1]! }));

  const ordered = [...discovery, ...delivery];
  const segments = ordered.slice(1).map((stage, index) => {
    const from = ordered[index]!;
    const a = points.get(from.id)!;
    const b = points.get(stage.id)!;
    const reached = from.state === "done" && stage.state !== "todo";
    let d: string;
    if (a.y !== b.y) {
      // The turn: from the last discovery node around the right edge.
      const turnX = Math.max(a.x, b.x) + 46;
      d = `M ${a.x + 14} ${a.y} L ${turnX - 30} ${a.y} Q ${turnX} ${a.y} ${turnX} ${a.y + 30} L ${turnX} ${b.y - 30} Q ${turnX} ${b.y} ${turnX - 30} ${b.y} L ${b.x + 14} ${b.y}`;
    } else if (b.x > a.x) d = `M ${a.x + 14} ${a.y} L ${b.x - 14} ${b.y}`;
    else d = `M ${a.x - 14} ${a.y} L ${b.x + 14} ${b.y}`;
    return { key: `${from.id}-${stage.id}`, d, reached };
  });

  return (
    <div className="w-full overflow-x-auto">
      <svg
        viewBox={`0 0 ${width + 30} ${height}`}
        className="block h-auto w-full min-w-[720px]"
        role="img"
        aria-label="Стадии AIRD"
      >
        <defs>
          <marker id="sf-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" className="fill-muted-foreground" opacity={0.6} />
          </marker>
          <marker id="sf-arrow-done" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill={TONE_COLORS.good} />
          </marker>
        </defs>
        <text x={8} y={rowY[0]! - 34} className="fill-muted-foreground" fontSize={11} fontWeight={600} letterSpacing={1}>
          DISCOVERY
        </text>
        <text x={8} y={rowY[1]! - 34} className="fill-muted-foreground" fontSize={11} fontWeight={600} letterSpacing={1}>
          DELIVERY
        </text>
        {segments.map((segment) => (
          <path
            key={segment.key}
            d={segment.d}
            fill="none"
            strokeWidth={segment.reached ? 2.5 : 1.5}
            strokeDasharray={segment.reached ? undefined : "4 4"}
            stroke={segment.reached ? TONE_COLORS.good : undefined}
            className={segment.reached ? undefined : "stroke-border"}
            markerEnd={segment.reached ? "url(#sf-arrow-done)" : "url(#sf-arrow)"}
          />
        ))}
        {ordered.map((stage) => {
          const point = points.get(stage.id)!;
          const color = TONE_COLORS[STAGE_TONES[stage.state]];
          const lines = wrapLabel(stage.label);
          const active = stage.state === "current" || stage.state === "blocked";
          return (
            <g
              key={stage.id}
              className={onSelect ? "cursor-pointer" : undefined}
              onClick={onSelect ? () => onSelect(stage.id) : undefined}
            >
              <title>{`${stage.label}${stage.detail ? ` — ${stage.detail}` : ""}`}</title>
              <rect x={point.x - 46} y={point.y - 22} width={92} height={74} rx={10} fill="transparent" />
              {stage.id === selectedId ? (
                <circle cx={point.x} cy={point.y} r={19} fill="none" stroke={TONE_COLORS.info} strokeWidth={2} />
              ) : null}
              {active ? (
                <circle cx={point.x} cy={point.y} r={14} fill={color} opacity={0.25}>
                  <animate attributeName="r" values="14;22;14" dur="2s" repeatCount="indefinite" />
                  <animate attributeName="opacity" values="0.35;0;0.35" dur="2s" repeatCount="indefinite" />
                </circle>
              ) : null}
              <circle
                cx={point.x}
                cy={point.y}
                r={13}
                fill={stage.state === "todo" ? undefined : color}
                className={stage.state === "todo" ? "fill-card stroke-border" : undefined}
                stroke={stage.state === "todo" ? undefined : color}
                strokeWidth={2}
              />
              {stage.state === "done" ? (
                <path d={`M ${point.x - 5} ${point.y} l 3.5 3.5 l 6.5 -7`} fill="none" stroke="white" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" />
              ) : stage.state === "blocked" ? (
                <text x={point.x} y={point.y + 4.5} textAnchor="middle" fontSize={13} fontWeight={700} fill="white">!</text>
              ) : stage.state === "current" ? (
                <circle cx={point.x} cy={point.y} r={4.5} fill="white" />
              ) : null}
              {lines.map((line, index) => (
                <text
                  key={line}
                  x={point.x}
                  y={point.y + 30 + index * 13}
                  textAnchor="middle"
                  fontSize={11}
                  fontWeight={active ? 700 : 500}
                  className={stage.state === "todo" ? "fill-muted-foreground" : "fill-foreground"}
                >
                  {line}
                </text>
              ))}
              {stage.detail ? (
                <text x={point.x} y={point.y + 30 + lines.length * 13} textAnchor="middle" fontSize={9.5} className="fill-muted-foreground">
                  {truncate(stage.detail, 18)}
                </text>
              ) : null}
              <AgentBadge x={point.x + 9} y={point.y - 27} activity={activity[stage.id]} />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// ------------------------------------------------------------- workorders

const NODE_W = 184;
const NODE_H = 42;
const COL_GAP = 58;
const ROW_GAP = 12;
const BAND_PAD = 14;
const HEADER_H = 30;

interface GraphNode {
  id: string;
  title: string;
  status: string;
  label: "bug" | "task";
  kind: "wo" | "fix";
  x: number;
  y: number;
  group: string;
}

export function WorkorderGraph({
  workorders,
  fixes,
  showFixes,
  selectedId,
  onSelect,
  activity = {},
}: {
  workorders: Workorder[];
  fixes: Fix[];
  showFixes: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  activity?: Record<string, Activity>;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const layout = useMemo(() => {
    const byId = new Map(workorders.map((wo) => [wo.id, wo]));
    const waveOrder = [...new Set(workorders.map((wo) => wo.wave))].sort((a, b) => {
      const an = /^W(\d+)/u.exec(a);
      const bn = /^W(\d+)/u.exec(b);
      if (an && bn) return Number(an[1]) - Number(bn[1]);
      if (an) return -1;
      if (bn) return 1;
      return a.localeCompare(b);
    });
    // Depth inside a wave: longest chain of same-wave dependencies.
    const depthMemo = new Map<string, number>();
    const depth = (id: string, seen: Set<string>): number => {
      if (depthMemo.has(id)) return depthMemo.get(id)!;
      const wo = byId.get(id);
      if (!wo || seen.has(id)) return 0;
      seen.add(id);
      const sameWave = wo.dependsOn.filter((dep) => byId.get(dep)?.wave === wo.wave);
      const value = sameWave.length === 0 ? 0 : 1 + Math.max(...sameWave.map((dep) => depth(dep, seen)));
      seen.delete(id);
      depthMemo.set(id, value);
      return value;
    };
    const nodes: GraphNode[] = [];
    const bands: { label: string; x: number; width: number; height: number }[] = [];
    let x = BAND_PAD;
    let maxHeight = 0;
    for (const wave of waveOrder) {
      const items = workorders.filter((wo) => wo.wave === wave);
      const columns = new Map<number, Workorder[]>();
      for (const wo of items) {
        const d = depth(wo.id, new Set());
        columns.set(d, [...(columns.get(d) ?? []), wo]);
      }
      const colCount = Math.max(...columns.keys()) + 1;
      const bandX = x - BAND_PAD;
      let bandHeight = 0;
      for (let c = 0; c < colCount; c += 1) {
        const column = columns.get(c) ?? [];
        column.forEach((wo, row) => {
          const y = HEADER_H + BAND_PAD + row * (NODE_H + ROW_GAP);
          nodes.push({ id: wo.id, title: wo.title, status: wo.status, label: wo.label, kind: "wo", x, y, group: wave });
          bandHeight = Math.max(bandHeight, y + NODE_H + BAND_PAD);
        });
        x += NODE_W + COL_GAP;
      }
      const bandWidth = x - COL_GAP + BAND_PAD - bandX;
      bands.push({
        label: /^W\d+/u.test(wave) ? `Волна ${wave}` : "Вне волн",
        x: bandX,
        width: bandWidth,
        height: bandHeight,
      });
      maxHeight = Math.max(maxHeight, bandHeight);
      x += BAND_PAD * 2;
    }
    if (showFixes && fixes.length > 0) {
      const bandX = x - BAND_PAD;
      fixes.forEach((fix, row) => {
        const y = HEADER_H + BAND_PAD + row * (NODE_H + ROW_GAP);
        nodes.push({
          id: fix.id,
          title: fix.title,
          status: fix.closed === true ? "done" : fix.closed === false ? "in_progress" : "unknown",
          label: fix.label,
          kind: "fix",
          x,
          y,
          group: "fixes",
        });
        maxHeight = Math.max(maxHeight, y + NODE_H + BAND_PAD);
      });
      bands.push({ label: "Фиксы / находки", x: bandX, width: NODE_W + BAND_PAD * 2, height: maxHeight });
      x += NODE_W + COL_GAP;
    }
    const pos = new Map(nodes.map((node) => [node.id, node]));
    const edges: { from: string; to: string; kind: "dep" | "fix" }[] = [];
    for (const wo of workorders) {
      for (const dep of wo.dependsOn) if (pos.has(dep)) edges.push({ from: dep, to: wo.id, kind: "dep" });
    }
    if (showFixes) {
      for (const fix of fixes) {
        const origins = (fix.originalWorkorder ?? "").match(/WO-\d+[A-Za-z]?/gu) ?? [];
        for (const origin of new Set(origins)) if (pos.has(origin)) edges.push({ from: origin, to: fix.id, kind: "fix" });
      }
    }
    return { nodes, edges, bands, width: Math.max(x, 400), height: Math.max(maxHeight, 120), pos };
  }, [workorders, fixes, showFixes]);

  const focus = hovered ?? selectedId;
  const related = useMemo(() => {
    if (!focus) return null;
    const set = new Set<string>([focus]);
    for (const edge of layout.edges) {
      if (edge.from === focus) set.add(edge.to);
      if (edge.to === focus) set.add(edge.from);
    }
    return set;
  }, [focus, layout.edges]);

  if (layout.nodes.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">Воркордеров пока нет.</p>;
  }

  return (
    <div className="w-full overflow-x-auto rounded-lg border border-border bg-card/40">
      <svg width={layout.width} height={layout.height} className="block" role="img" aria-label="Граф воркордеров">
        <defs>
          <marker id="sf-dep" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" className="fill-muted-foreground" />
          </marker>
          <marker id="sf-fix" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto">
            <path d="M 0 0 L 10 5 L 0 10 z" fill={TONE_COLORS.bad} />
          </marker>
        </defs>
        {layout.bands.map((band) => (
          <g key={band.label + band.x}>
            <rect x={band.x} y={4} width={band.width} height={band.height - 4} rx={10} className="fill-muted/30 stroke-border" strokeDasharray="3 4" />
            <text x={band.x + 12} y={22} fontSize={11} fontWeight={700} letterSpacing={0.5} className="fill-muted-foreground">
              {band.label.toUpperCase()}
            </text>
          </g>
        ))}
        {layout.edges.map((edge) => {
          const a = layout.pos.get(edge.from)!;
          const b = layout.pos.get(edge.to)!;
          const x1 = a.x + NODE_W;
          const y1 = a.y + NODE_H / 2;
          const x2 = b.x - 2;
          const y2 = b.y + NODE_H / 2;
          const backwards = x2 <= x1;
          const dx = Math.max(30, Math.abs(x2 - x1) / 2);
          const d = backwards
            ? `M ${a.x + NODE_W / 2} ${a.y + NODE_H} C ${a.x + NODE_W / 2} ${a.y + NODE_H + 30}, ${b.x + NODE_W / 2} ${b.y - 30}, ${b.x + NODE_W / 2} ${b.y}`
            : `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
          const lit = related ? related.has(edge.from) && related.has(edge.to) && (edge.from === focus || edge.to === focus) : false;
          return (
            <path
              key={`${edge.from}->${edge.to}`}
              d={d}
              fill="none"
              stroke={edge.kind === "fix" ? TONE_COLORS.bad : lit ? TONE_COLORS.info : undefined}
              className={edge.kind === "fix" || lit ? undefined : "stroke-muted-foreground"}
              strokeOpacity={related && !lit ? 0.15 : lit ? 1 : 0.45}
              strokeWidth={lit ? 2.2 : 1.3}
              strokeDasharray={edge.kind === "fix" ? "5 4" : undefined}
              markerEnd={edge.kind === "fix" ? "url(#sf-fix)" : "url(#sf-dep)"}
            />
          );
        })}
        {layout.nodes.map((node) => {
          const tone = TONE_COLORS[woStatusTone(node.status)];
          const dim = related !== null && !related.has(node.id);
          const selected = node.id === selectedId;
          return (
            <g
              key={node.id}
              transform={`translate(${node.x}, ${node.y})`}
              opacity={dim ? 0.35 : 1}
              className="cursor-pointer"
              onMouseEnter={() => setHovered(node.id)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => onSelect(node.id)}
            >
              <title>{`${node.id} — ${node.title}`}</title>
              <rect
                width={NODE_W}
                height={NODE_H}
                rx={8}
                className={selected ? "fill-card" : "fill-card stroke-border"}
                stroke={selected ? TONE_COLORS.info : undefined}
                strokeWidth={selected ? 2 : 1}
              />
              <rect width={5} height={NODE_H} rx={2.5} fill={tone} />
              <text x={14} y={17} fontSize={11.5} fontWeight={700} className="fill-foreground">
                {node.id}
              </text>
              <circle cx={NODE_W - 14} cy={13} r={4.5} fill={tone} />
              {node.label === "bug" ? (
                <g transform={`translate(${NODE_W - 38}, 5)`}>
                  <rect width={18} height={16} rx={4} fill={TONE_COLORS.bad} opacity={0.15} />
                  <text x={9} y={12} textAnchor="middle" fontSize={10} fontWeight={700} fill={TONE_COLORS.bad}>
                    B
                  </text>
                </g>
              ) : null}
              <text x={14} y={33} fontSize={10.5} className="fill-muted-foreground">
                {truncate(node.title, 28)}
              </text>
              <AgentBadge x={NODE_W - 30} y={-8} activity={activity[node.id]} />
            </g>
          );
        })}
      </svg>
    </div>
  );
}

// --------------------------------------------------------------- mind map

const MM_ROW = 34;
const MM_COLS = [0, 220, 390, 640];
const MM_W = [200, 150, 230, 220];

interface MindNode {
  key: string;
  level: number;
  kind: "root" | "wave" | "wo" | "fix";
  id: string | null;
  title: string;
  status: string;
  label: "bug" | "task" | null;
  done: number;
  total: number;
  children: MindNode[];
  x: number;
  y: number;
}

/**
 * The AIRD as a mind map: AIRD → waves → workorders → the fixes found on
 * them. Click a wave to fold it; click a workorder or fix for details.
 */
export function WorkorderMindMap({
  title,
  workorders,
  fixes,
  showFixes,
  selectedId,
  onSelect,
  activity = {},
}: {
  title: string;
  workorders: Workorder[];
  fixes: Fix[];
  showFixes: boolean;
  selectedId: string | null;
  onSelect: (id: string) => void;
  activity?: Record<string, Activity>;
}) {
  const [folded, setFolded] = useState<Set<string>>(new Set());
  const tree = useMemo(() => {
    const waves = [...new Set(workorders.map((wo) => wo.wave))].sort((a, b) => {
      const an = /^W(\d+)/u.exec(a);
      const bn = /^W(\d+)/u.exec(b);
      if (an && bn) return Number(an[1]) - Number(bn[1]);
      return an ? -1 : bn ? 1 : a.localeCompare(b);
    });
    const fixesByWo = new Map<string, Fix[]>();
    const loose: Fix[] = [];
    if (showFixes) {
      for (const fix of fixes) {
        const origin = (fix.originalWorkorder ?? "").match(/WO-\d+[A-Za-z]?/u)?.[0];
        if (origin && workorders.some((wo) => wo.id === origin)) fixesByWo.set(origin, [...(fixesByWo.get(origin) ?? []), fix]);
        else loose.push(fix);
      }
    }
    const fixNode = (fix: Fix): MindNode => ({
      key: `fix:${fix.id}`,
      level: 3,
      kind: "fix",
      id: fix.id,
      title: fix.title,
      status: fix.closed === true ? "done" : fix.closed === false ? "blocked" : "unknown",
      label: fix.label,
      done: 0,
      total: 0,
      children: [],
      x: 0,
      y: 0,
    });
    const waveNodes: MindNode[] = waves.map((wave) => {
      const items = workorders.filter((wo) => wo.wave === wave);
      return {
        key: `wave:${wave}`,
        level: 1,
        kind: "wave",
        id: null,
        title: /^W\d+/u.test(wave) ? `Волна ${wave}` : "Вне волн",
        status: items.every((wo) => wo.status === "done") ? "done" : items.some((wo) => wo.status === "in_progress") ? "in_progress" : "ready",
        label: null,
        done: items.filter((wo) => wo.status === "done").length,
        total: items.length,
        children: folded.has(`wave:${wave}`)
          ? []
          : items.map((wo) => ({
              key: `wo:${wo.id}`,
              level: 2,
              kind: "wo" as const,
              id: wo.id,
              title: wo.title,
              status: wo.status,
              label: wo.label,
              done: 0,
              total: 0,
              children: (fixesByWo.get(wo.id) ?? []).map(fixNode),
              x: 0,
              y: 0,
            })),
        x: 0,
        y: 0,
      };
    });
    if (loose.length > 0) {
      waveNodes.push({
        key: "wave:fixes",
        level: 1,
        kind: "wave",
        id: null,
        title: "Фиксы без WO",
        status: loose.every((fix) => fix.closed === true) ? "done" : "blocked",
        label: null,
        done: loose.filter((fix) => fix.closed === true).length,
        total: loose.length,
        children: folded.has("wave:fixes") ? [] : loose.map((fix) => ({ ...fixNode(fix), level: 2 })),
        x: 0,
        y: 0,
      });
    }
    const root: MindNode = {
      key: "root",
      level: 0,
      kind: "root",
      id: null,
      title,
      status: "ready",
      label: null,
      done: workorders.filter((wo) => wo.status === "done").length,
      total: workorders.length,
      children: waveNodes,
      x: 0,
      y: 0,
    };
    // Leaves get consecutive rows; parents sit in the middle of their children.
    let row = 0;
    const place = (node: MindNode): void => {
      node.x = MM_COLS[node.level]!;
      if (node.children.length === 0) {
        node.y = row * MM_ROW;
        row += 1;
        return;
      }
      node.children.forEach(place);
      node.y = (node.children[0]!.y + node.children[node.children.length - 1]!.y) / 2;
    };
    place(root);
    const all: MindNode[] = [];
    const walk = (node: MindNode) => {
      all.push(node);
      node.children.forEach(walk);
    };
    walk(root);
    return { root, all, rows: Math.max(row, 1) };
  }, [title, workorders, fixes, showFixes, folded]);

  if (workorders.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">Воркордеров пока нет.</p>;

  const pad = 20;
  const height = tree.rows * MM_ROW + pad * 2;
  const maxLevel = Math.max(...tree.all.map((node) => node.level));
  const width = MM_COLS[maxLevel]! + MM_W[maxLevel]! + pad * 2 + 20;
  const nodeH = 26;
  const toggle = (key: string) =>
    setFolded((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <div className="w-full overflow-x-auto rounded-lg border border-border bg-card/40">
      <svg width={width} height={height} className="block" role="img" aria-label="Майндмап воркордеров">
        <g transform={`translate(${pad}, ${pad})`}>
          {tree.all.flatMap((node) =>
            node.children.map((child) => {
              const x1 = node.x + MM_W[node.level]!;
              const y1 = node.y + nodeH / 2;
              const x2 = child.x;
              const y2 = child.y + nodeH / 2;
              const mid = (x1 + x2) / 2;
              const tone = child.kind === "fix" ? TONE_COLORS.bad : TONE_COLORS[woStatusTone(child.status)];
              return (
                <path
                  key={`${node.key}->${child.key}`}
                  d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`}
                  fill="none"
                  stroke={tone}
                  strokeOpacity={0.55}
                  strokeWidth={child.kind === "wave" ? 2.2 : 1.4}
                  strokeDasharray={child.kind === "fix" ? "4 3" : undefined}
                />
              );
            }),
          )}
          {tree.all.map((node) => {
            const w = MM_W[node.level]!;
            const tone =
              node.kind === "fix"
                ? node.status === "done"
                  ? TONE_COLORS.good
                  : TONE_COLORS.bad
                : TONE_COLORS[woStatusTone(node.status)];
            const selected = node.id !== null && node.id === selectedId;
            const clickable = node.kind === "wo" || node.kind === "fix" || node.kind === "wave";
            return (
              <g
                key={node.key}
                transform={`translate(${node.x}, ${node.y})`}
                className={clickable ? "cursor-pointer" : undefined}
                onClick={() => {
                  if (node.kind === "wave") toggle(node.key);
                  else if (node.id) onSelect(node.id);
                }}
              >
                <title>{node.id ? `${node.id} — ${node.title}` : node.title}</title>
                {node.kind === "root" ? (
                  <>
                    <rect width={w} height={nodeH + 6} y={-3} rx={14} className="fill-foreground" />
                    <text x={14} y={nodeH / 2 + 4} fontSize={12} fontWeight={700} className="fill-background">
                      {truncate(node.title, 24)}
                    </text>
                  </>
                ) : node.kind === "wave" ? (
                  <>
                    <rect width={w} height={nodeH} rx={13} fill={tone} fillOpacity={0.16} stroke={tone} />
                    <text x={12} y={nodeH / 2 + 4} fontSize={11.5} fontWeight={700} className="fill-foreground">
                      {node.title}
                    </text>
                    <text x={w - 34} y={nodeH / 2 + 4} fontSize={10} className="fill-muted-foreground">
                      {node.done}/{node.total}
                    </text>
                    <text x={w - 12} y={nodeH / 2 + 4} fontSize={12} fontWeight={700} textAnchor="middle" className="fill-muted-foreground">
                      {folded.has(node.key) ? "+" : "−"}
                    </text>
                  </>
                ) : (
                  <>
                    <rect
                      width={w}
                      height={nodeH}
                      rx={7}
                      className={selected ? "fill-card" : "fill-card stroke-border"}
                      stroke={selected ? TONE_COLORS.info : undefined}
                      strokeWidth={selected ? 2 : 1}
                    />
                    <rect width={4} height={nodeH} rx={2} fill={tone} />
                    <text x={11} y={nodeH / 2 + 4} fontSize={10.5} className="fill-foreground">
                      <tspan fontWeight={700}>{node.id}</tspan>
                      <tspan className="fill-muted-foreground"> {truncate(node.title, node.kind === "fix" ? 24 : 26)}</tspan>
                    </text>
                    {node.label === "bug" && node.kind === "wo" ? (
                      <text x={w - 10} y={nodeH / 2 + 4} fontSize={10} fontWeight={700} textAnchor="middle" fill={TONE_COLORS.bad}>
                        B
                      </text>
                    ) : null}
                    {node.id ? <AgentBadge x={w - 26} y={-9} activity={activity[node.id]} /> : null}
                  </>
                )}
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

// ---------------------------------------------------------------- gates

const GATE_ROW = 30;

export function GateGraph({
  gates,
  risks,
  selectedId,
  onSelect,
}: {
  gates: Gate[];
  risks: Risk[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const [hovered, setHovered] = useState<string | null>(null);
  const riskIds = [...new Set(gates.flatMap((gate) => gate.riskIds))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const dodIds = [...new Set(gates.flatMap((gate) => gate.dodIds))].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  const riskTitle = new Map(risks.map((risk) => [risk.id, risk.title]));
  const rows = Math.max(gates.length, riskIds.length, dodIds.length, 1);
  const height = rows * GATE_ROW + 50;
  const colRisk = 10;
  const colGate = 300;
  const colDod = 640;
  const riskW = 210;
  const gateW = 250;
  const dodW = 110;
  const width = colDod + dodW + 10;
  const offset = (count: number) => 40 + ((rows - count) * GATE_ROW) / 2;
  const riskY = new Map(riskIds.map((id, index) => [id, offset(riskIds.length) + index * GATE_ROW]));
  const gateY = new Map(gates.map((gate, index) => [gate.id, offset(gates.length) + index * GATE_ROW]));
  const dodY = new Map(dodIds.map((id, index) => [id, offset(dodIds.length) + index * GATE_ROW]));
  const focus = hovered ?? selectedId;
  const focusGate = gates.find((gate) => gate.id === focus) ?? null;
  const isLit = (gateId: string, otherId: string) =>
    focus === gateId || focus === otherId || (focusGate !== null && focusGate.id === gateId);

  if (gates.length === 0) {
    return <p className="py-6 text-center text-sm text-muted-foreground">В 08-quality-gates.md гейты не найдены.</p>;
  }

  return (
    <div className="w-full overflow-x-auto rounded-lg border border-border bg-card/40">
      <svg width={width} height={height} className="block" role="img" aria-label="Риски, гейты и DoD">
        {[
          { x: colRisk, label: "РИСКИ" },
          { x: colGate, label: "ГЕЙТЫ" },
          { x: colDod, label: "DoD" },
        ].map((col) => (
          <text key={col.label} x={col.x} y={20} fontSize={11} fontWeight={700} letterSpacing={0.5} className="fill-muted-foreground">
            {col.label}
          </text>
        ))}
        {gates.flatMap((gate) => [
          ...gate.riskIds.map((risk) => {
            const y1 = (riskY.get(risk) ?? 0) + 12;
            const y2 = (gateY.get(gate.id) ?? 0) + 12;
            const lit = focus !== null && isLit(gate.id, risk);
            return (
              <path
                key={`${risk}-${gate.id}`}
                d={`M ${colRisk + riskW} ${y1} C ${colRisk + riskW + 45} ${y1}, ${colGate - 45} ${y2}, ${colGate} ${y2}`}
                fill="none"
                stroke={lit ? TONE_COLORS.warn : undefined}
                className={lit ? undefined : "stroke-muted-foreground"}
                strokeOpacity={focus && !lit ? 0.12 : lit ? 1 : 0.35}
                strokeWidth={lit ? 2 : 1.2}
              />
            );
          }),
          ...gate.dodIds.map((dod) => {
            const y1 = (gateY.get(gate.id) ?? 0) + 12;
            const y2 = (dodY.get(dod) ?? 0) + 12;
            const lit = focus !== null && isLit(gate.id, dod);
            return (
              <path
                key={`${gate.id}-${dod}`}
                d={`M ${colGate + gateW} ${y1} C ${colGate + gateW + 40} ${y1}, ${colDod - 40} ${y2}, ${colDod} ${y2}`}
                fill="none"
                stroke={lit ? TONE_COLORS.good : undefined}
                className={lit ? undefined : "stroke-muted-foreground"}
                strokeOpacity={focus && !lit ? 0.12 : lit ? 1 : 0.35}
                strokeWidth={lit ? 2 : 1.2}
              />
            );
          }),
        ])}
        {riskIds.map((id) => (
          <g
            key={id}
            transform={`translate(${colRisk}, ${riskY.get(id)})`}
            className="cursor-pointer"
            onMouseEnter={() => setHovered(id)}
            onMouseLeave={() => setHovered(null)}
            onClick={() => onSelect(id)}
          >
            <title>{`${id} — ${riskTitle.get(id) ?? ""}`}</title>
            <rect
              width={riskW}
              height={24}
              rx={12}
              className={id === selectedId ? "fill-card" : "fill-card stroke-border"}
              stroke={id === selectedId ? TONE_COLORS.warn : undefined}
              strokeWidth={id === selectedId ? 2 : 1}
            />
            <circle cx={12} cy={12} r={4} fill={TONE_COLORS.warn} />
            <text x={22} y={16} fontSize={11} className="fill-foreground">
              <tspan fontWeight={700}>{id}</tspan> {truncate(riskTitle.get(id) ?? "", 26)}
            </text>
          </g>
        ))}
        {gates.map((gate) => {
          const tone = TONE_COLORS[GATE_STATUS[gate.status].tone];
          const selected = gate.id === selectedId;
          return (
            <g
              key={gate.id}
              transform={`translate(${colGate}, ${gateY.get(gate.id)})`}
              className="cursor-pointer"
              onMouseEnter={() => setHovered(gate.id)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => onSelect(gate.id)}
            >
              <title>{`${gate.id} — ${gate.title} (${GATE_STATUS[gate.status].label})`}</title>
              <rect
                width={gateW}
                height={24}
                rx={6}
                fill={tone}
                fillOpacity={0.14}
                stroke={tone}
                strokeWidth={selected ? 2.2 : 1}
              />
              <text x={10} y={16} fontSize={11} className="fill-foreground">
                <tspan fontWeight={700}>{gate.id}</tspan> {truncate(gate.title, 30)}
              </text>
            </g>
          );
        })}
        {dodIds.map((id) => (
          <g
            key={id}
            transform={`translate(${colDod}, ${dodY.get(id)})`}
            className="cursor-pointer"
            onMouseEnter={() => setHovered(id)}
            onMouseLeave={() => setHovered(null)}
            onClick={() => onSelect(id)}
          >
            <rect
              width={dodW}
              height={24}
              rx={12}
              className={id === selectedId ? "fill-card" : "fill-card stroke-border"}
              stroke={id === selectedId ? TONE_COLORS.good : undefined}
              strokeWidth={id === selectedId ? 2 : 1}
            />
            <circle cx={12} cy={12} r={4} fill={TONE_COLORS.good} />
            <text x={22} y={16} fontSize={11} fontWeight={600} className="fill-foreground">
              {id}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}
