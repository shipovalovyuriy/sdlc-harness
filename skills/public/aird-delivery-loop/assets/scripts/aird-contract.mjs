#!/usr/bin/env node

import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  readFileSync,
  readdirSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const EXECUTABLE_KINDS = new Set(['implementation', 'spike']);
export const NON_IMPLEMENTATION_KINDS = new Set(['evidence', 'verification', 'review']);
export const WORKORDER_KINDS = new Set([...EXECUTABLE_KINDS, ...NON_IMPLEMENTATION_KINDS]);
export const WORKORDER_STATUSES = new Set(['draft', 'ready', 'in_progress', 'done', 'blocked', 'deferred']);
export const SURFACES = new Set(['backend', 'frontend', 'data', 'infra', 'mixed', 'docs', 'tooling']);
export const RUNTIME_PROFILES = new Set(['unit', 'service', 'database', 'migration', 'api', 'job', 'artifact', 'browser', 'external', 'none']);
export const WORK_CLASSES = new Set(['product', 'supporting', 'verification']);

function unquote(value) {
  const trimmed = value.trim();
  if ((trimmed.startsWith("'") && trimmed.endsWith("'"))
      || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseInlineList(value) {
  const body = value.trim().slice(1, -1).trim();
  if (!body) return [];
  return body.split(',').map((item) => unquote(item)).filter(Boolean);
}

export function parseFrontmatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return {};
  const parsed = {};
  let listKey = null;
  for (const rawLine of match[1].split(/\r?\n/)) {
    const listItem = rawLine.match(/^\s+-\s+(.+?)\s*$/);
    if (listItem && listKey) {
      parsed[listKey].push(unquote(listItem[1].replace(/\s+#.*$/, '')));
      continue;
    }
    const field = rawLine.match(/^([a-zA-Z0-9_-]+):\s*(.*?)\s*$/);
    if (!field) {
      listKey = null;
      continue;
    }
    const value = field[2].replace(/\s+#.*$/, '').trim();
    if (!value) {
      parsed[field[1]] = [];
      listKey = field[1];
    } else {
      parsed[field[1]] = value.startsWith('[') && value.endsWith(']')
        ? parseInlineList(value)
        : unquote(value);
      listKey = null;
    }
  }
  return parsed;
}

export function asList(value) {
  if (Array.isArray(value)) return value;
  if (value === undefined || value === null || value === '') return [];
  return [String(value)];
}

export function section(text, heading) {
  const pattern = new RegExp(`^#{1,6}\\s*${heading}\\s*$([\\s\\S]*?)(?=^#{1,6}\\s|\\s*$(?![\\s\\S]))`, 'im');
  return text.match(pattern)?.[1] ?? '';
}

export function countAtomicTasks(text) {
  const body = section(text, 'Task Breakdown');
  if (!body) return 0;
  return body.split(/\r?\n/).filter((line) => /^\s*\d+\.\s+\S/.test(line)).length;
}

// Frontmatter block lists whose entries are maps -- `existential_risks:` in
// 03-risk-register.md, `blockers:` in STATE.md, `wave_outcomes:` in 09-dod.md.
// The flat frontmatter parser cannot represent them, so they share this reader.
// Values may be scalars, inline `[a, b]` lists, or indented `- item` lists.
export function parseBlockList(text, key) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  if (!match) return [];
  const lines = match[1].split(/\r?\n/);
  const start = lines.findIndex((line) => new RegExp(`^${key}:\\s*$`).test(line));
  if (start < 0) return [];

  const assign = (target, field, rawValue) => {
    const value = String(rawValue ?? '').replace(/\s+#.*$/, '').trim();
    if (!value) {
      target[field] = [];
      return field;
    }
    target[field] = value.startsWith('[') && value.endsWith(']') ? parseInlineList(value) : unquote(value);
    return null;
  };

  const entries = [];
  let listKey = null;
  for (const line of lines.slice(start + 1)) {
    if (/^\S/.test(line)) break;
    if (!line.trim()) continue;
    const entryStart = line.match(/^\s+-\s+([a-z_]+):\s*(.*)$/);
    if (entryStart) {
      entries.push({});
      listKey = assign(entries[entries.length - 1], entryStart[1], entryStart[2]);
      continue;
    }
    const nested = line.match(/^\s+-\s+(.+?)\s*$/);
    const current = entries[entries.length - 1];
    if (nested && listKey && current && Array.isArray(current[listKey])) {
      current[listKey].push(unquote(nested[1].replace(/\s+#.*$/, '')));
      continue;
    }
    const field = line.match(/^\s+([a-z_]+):\s*(.*)$/);
    if (field && current) {
      listKey = assign(current, field[1], field[2]);
      continue;
    }
    listKey = null;
  }
  return entries;
}

export function parseExistentialRisks(riskText) {
  return parseBlockList(riskText, 'existential_risks');
}

// STATE.md blockers are contract data, not prose. A blocker that needs a user
// decision must stop readiness instead of sitting in a bullet list nobody reads.
export function parseStateBlockers(stateText) {
  return parseBlockList(stateText, 'blockers');
}

// Findings registered by the one final combined review. The orchestrator closes
// its own fixes, so each entry has to carry the criterion it will be judged
// against and a command that can actually be run -- otherwise batch closure is
// a rubber stamp with extra steps.
export function parseStateFindings(stateText) {
  return parseBlockList(stateText, 'findings');
}

// Does an allowed_write_paths entry cover a concrete path? Write scopes may be
// exact files or directory globs (`src/**`, `tests/`), so compare against the
// glob-stripped prefix rather than by string equality.
export function writeScopeCovers(writePaths, target) {
  const wanted = String(target ?? '').trim().replace(/^\.\//, '');
  if (!wanted) return true;
  return writePaths.some((raw) => {
    const scope = String(raw ?? '').trim().replace(/^\.\//, '').replace(/\/?\*+$/, '').replace(/\/$/, '');
    if (!scope) return true;
    return wanted === scope || wanted.startsWith(`${scope}/`);
  });
}

// 09-dod.md declares, per wave, who observes what. This is what makes the
// product-first gate about an outcome rather than a `work_class` label.
export function parseWaveOutcomes(dodText) {
  return parseBlockList(dodText, 'wave_outcomes');
}

// Markdown pipe tables: drop the separator rows and the header row, return the
// remaining rows as trimmed cell arrays.
export function parsePipeTable(body) {
  const rows = body
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|'))
    .map((line) => line.replace(/^\|/, '').replace(/\|$/, '').split('|').map((cell) => cell.trim()))
    .filter((cells) => !cells.every((cell) => cell === '' || /^:?-+:?$/.test(cell)));
  return rows.slice(1);
}

export const CONSUMES_KINDS = new Set(['file', 'artifact', 'config', 'data', 'code']);
export const CONSUMES_PRODUCERS = new Set(['exists-in-repo', 'release-binding', 'none']);

// A workorder's `## Consumes` table names every input it needs that the
// repository does not already contain, plus who produces it. Returns null when
// the section is absent (an unanswered question) and [] for an explicit none.
export function parseConsumes(text) {
  const body = section(text, 'Consumes');
  if (!body.trim()) return null;
  if (!body.includes('|')) return /\bnone\b/i.test(body) ? [] : null;
  return parsePipeTable(body)
    .map((cells) => ({
      input: (cells[0] ?? '').replace(/`/g, '').trim(),
      kind: (cells[1] ?? '').toLowerCase().trim(),
      producedBy: (cells[2] ?? '').replace(/`/g, '').trim(),
    }))
    .filter((row) => row.input && !/^none$/i.test(row.input));
}

// Negative cases are the honest measure of how much a workorder carries; the
// 1-3 atomic-task count is trivially satisfied by three sentences hiding six
// edits each.
export function countNegativeCases(text) {
  const body = section(text, 'Verification');
  if (!body) return 0;
  const lines = body.split(/\r?\n/);
  const index = lines.findIndex((line) => /^\s*[-*]\s*negative(\/edge)?\s+cases?\s*:/i.test(line));
  if (index < 0) return 0;
  const items = [];
  const push = (chunk) => {
    for (const part of String(chunk).split(/[;,]/)) {
      const trimmed = part.trim().replace(/\.$/, '');
      if (trimmed) items.push(trimmed);
    }
  };
  push(lines[index].replace(/^\s*[-*]\s*negative(\/edge)?\s+cases?\s*:/i, ''));
  for (const line of lines.slice(index + 1)) {
    if (/^\s{2,}[-*]\s+/.test(line)) { push(line.replace(/^\s*[-*]\s*/, '')); continue; }
    if (/^\s*[-*]\s+/.test(line) || /^\s*#{1,6}\s/.test(line)) break;
    if (!line.trim()) continue;
    push(line);
  }
  return items.length;
}

const TEST_PATH = /(^|\/)(tests?|__tests__|specs?|testdata|fixtures?)(\/|$)|[._-](test|spec)\.[a-z0-9]+$|(^|\/)(test|spec)_[^/]*$|(^|\/)conftest\.py$/i;

export function isTestPath(path) {
  return TEST_PATH.test(String(path).trim());
}

export function collectIds(text, pattern) {
  return [...new Set([...text.matchAll(pattern)].map((match) => match[0]))];
}

// Gate -> DoD coverage is a single authoritative table in 08-quality-gates.md.
// Rows are `| G-01 | DOD-01 | ... |`; a gate may protect several DoD items.
export function parseGateDodMapping(gatesText) {
  const body = section(gatesText, 'Gate\\s*(?:->|→)\\s*DoD Mapping');
  const mapping = new Map();
  for (const line of body.split(/\r?\n/)) {
    if (!line.trim().startsWith('|')) continue;
    const gateIds = collectIds(line, /G-\d+/g);
    const dodIds = collectIds(line, /DOD-\d+/g);
    if (!gateIds.length || !dodIds.length) continue;
    for (const gateId of gateIds) {
      mapping.set(gateId, [...new Set([...(mapping.get(gateId) ?? []), ...dodIds])]);
    }
  }
  return mapping;
}

// Dependency-graph health for every executable workorder, not only an accepted
// closure. Discovery needs this before a wave is ever accepted.
export function inspectDependencyGraph(workorders) {
  const issues = [];
  const executable = workorders.filter((workorder) => EXECUTABLE_KINDS.has(workorder.kind));
  const byId = new Map(executable.map((workorder) => [workorder.id, workorder]));
  const allById = new Map(workorders.map((workorder) => [workorder.id, workorder]));
  const state = new Map();

  const visit = (workorder, trail) => {
    const seen = state.get(workorder.id);
    if (seen === 'done') return;
    if (seen === 'visiting') {
      issues.push({ file: workorder.file, message: `dependency cycle: ${[...trail, workorder.id].join(' -> ')}` });
      return;
    }
    state.set(workorder.id, 'visiting');
    for (const dependencyId of workorder.dependsOn) {
      const dependency = byId.get(dependencyId);
      if (!dependency) {
        const other = allById.get(dependencyId);
        issues.push({
          file: workorder.file,
          message: other
            ? `depends on non-implementation ${dependencyId} (${other.kind || 'untyped'}); release evidence must be a gate, not a dependency`
            : `depends on missing ${dependencyId}`,
        });
        continue;
      }
      visit(dependency, [...trail, workorder.id]);
    }
    state.set(workorder.id, 'done');
  };

  for (const workorder of executable) visit(workorder, []);
  return issues;
}

export function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

export function sha256WorkorderContract(path) {
  const text = readFileSync(path, 'utf8');
  const canonical = text.replace(/^---\r?\n([\s\S]*?)\r?\n---/, (_match, rawFrontmatter) => {
    const stableFrontmatter = rawFrontmatter
      .split(/\r?\n/)
      .filter((line) => !/^status:\s*/.test(line))
      .join('\n');
    return `---\n${stableFrontmatter}\n---`;
  });
  return createHash('sha256').update(canonical).digest('hex');
}

export function loadWorkorders(packageDir) {
  const workordersDir = join(packageDir, 'workorders');
  if (!existsSync(workordersDir) || !statSync(workordersDir).isDirectory()) return [];
  return readdirSync(workordersDir)
    .filter((file) => file.endsWith('.md'))
    .sort()
    .map((file) => {
      const path = join(workordersDir, file);
      const text = readFileSync(path, 'utf8');
      const frontmatter = parseFrontmatter(text);
      return {
        file,
        path,
        text,
        frontmatter,
        id: frontmatter.id || file.replace(/\.md$/, ''),
        kind: frontmatter.kind || '',
        status: frontmatter.status || '',
        wave: frontmatter.wave || '',
        surface: frontmatter.surface || '',
        // work_class defaults to product: an unlabelled workorder is product
        // work, so the detour budget cannot be bypassed by omitting the field.
        workClass: frontmatter.work_class || 'product',
        runtimeProfiles: asList(frontmatter.runtime_profiles),
        dependsOn: asList(frontmatter.depends_on),
        riskIds: asList(frontmatter.risk_ids),
        gateIds: asList(frontmatter.gate_ids),
        dodIds: asList(frontmatter.dod_ids),
        allowedWritePaths: asList(frontmatter.allowed_write_paths),
        nonTestWritePaths: asList(frontmatter.allowed_write_paths).filter((writePath) => !isTestPath(writePath)),
        docsToRead: asList(frontmatter.docs_to_read),
        taskCount: countAtomicTasks(text),
        consumes: parseConsumes(text),
        negativeCaseCount: countNegativeCases(text),
        oversizeJustification: String(frontmatter.oversize_justification ?? '').trim(),
        contractSha256: sha256WorkorderContract(path),
      };
    });
}

function runGit(repositoryPath, args) {
  const result = spawnSync('git', ['-C', repositoryPath, ...args], { encoding: 'utf8' });
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || '').trim();
    throw new Error(`git ${args.join(' ')} failed${detail ? `: ${detail}` : ''}`);
  }
  return result.stdout.trim();
}

export function inspectGitBase(packageDir, baseRef) {
  if (!baseRef) throw new Error('target base ref is required');
  const repositoryRoot = runGit(packageDir, ['rev-parse', '--show-toplevel']);
  const baseSha = runGit(repositoryRoot, ['rev-parse', '--verify', `${baseRef}^{commit}`]);
  const headSha = runGit(repositoryRoot, ['rev-parse', '--verify', 'HEAD^{commit}']);
  const mergeBaseSha = runGit(repositoryRoot, ['merge-base', baseSha, headSha]);
  const counts = runGit(repositoryRoot, ['rev-list', '--left-right', '--count', `${baseSha}...${headSha}`])
    .split(/\s+/)
    .map(Number);
  const [behind, ahead] = counts;
  if (!Number.isInteger(behind) || !Number.isInteger(ahead)) {
    throw new Error('could not parse Git ahead/behind counts');
  }
  return {
    repository_root: repositoryRoot,
    ref: baseRef,
    sha: baseSha,
    head_sha: headSha,
    merge_base_sha: mergeBaseSha,
    behind,
    ahead,
  };
}

export function getWaveClosure(workorders, wave) {
  const byId = new Map(workorders.map((workorder) => [workorder.id, workorder]));
  const roots = workorders.filter((workorder) => EXECUTABLE_KINDS.has(workorder.kind) && workorder.wave === wave);
  if (!roots.length) throw new Error(`wave ${wave} has no implementation/spike workorders`);

  const closure = new Map();
  const visiting = new Set();
  const visit = (workorder) => {
    if (closure.has(workorder.id)) return;
    if (visiting.has(workorder.id)) throw new Error(`dependency cycle includes ${workorder.id}`);
    visiting.add(workorder.id);
    for (const dependencyId of workorder.dependsOn) {
      const dependency = byId.get(dependencyId);
      if (!dependency) throw new Error(`${workorder.id} depends on missing ${dependencyId}`);
      if (!EXECUTABLE_KINDS.has(dependency.kind)) {
        throw new Error(`${workorder.id} implementation readiness depends on non-implementation ${dependencyId} (${dependency.kind || 'untyped'})`);
      }
      visit(dependency);
    }
    visiting.delete(workorder.id);
    closure.set(workorder.id, workorder);
  };
  for (const root of roots) visit(root);
  return [...closure.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function loadReviewManifest(packageDir) {
  const path = join(packageDir, 'REVIEW-MANIFEST.json');
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`invalid REVIEW-MANIFEST.json: ${error.message}`);
  }
}

function writeReviewManifest(packageDir, manifest) {
  const path = join(packageDir, 'REVIEW-MANIFEST.json');
  const temporaryPath = `${path}.tmp-${process.pid}`;
  writeFileSync(temporaryPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  renameSync(temporaryPath, path);
}

export function acceptWave(packageDir, { wave, baseRef }) {
  const git = inspectGitBase(packageDir, baseRef);
  if (git.behind > 0 || git.merge_base_sha !== git.sha) {
    throw new Error(`branch is behind target base ${baseRef} by ${git.behind} commit(s); rebase/update before accepting ${wave}`);
  }

  const workorders = loadWorkorders(packageDir);
  const closure = getWaveClosure(workorders, wave);
  const unready = closure.filter((workorder) => !['ready', 'done'].includes(workorder.status));
  if (unready.length) {
    throw new Error(`wave ${wave} closure has non-ready workorders: ${unready.map((workorder) => `${workorder.id}:${workorder.status || 'untyped'}`).join(', ')}`);
  }
  const legacy = closure.filter((workorder) => workorder.frontmatter.aird_workorder_schema_version !== '4.0');
  if (legacy.length) {
    throw new Error(`wave ${wave} must be normalized to Workorder Frontmatter V4: ${legacy.map((workorder) => workorder.id).join(', ')}`);
  }
  for (const workorder of closure) {
    if (!WORKORDER_KINDS.has(workorder.kind)) throw new Error(`${workorder.id} has invalid kind: ${workorder.kind || '(missing)'}`);
    if (!WORKORDER_STATUSES.has(workorder.status)) throw new Error(`${workorder.id} has invalid status: ${workorder.status || '(missing)'}`);
    if (!/^W[1-9]\d*$/.test(workorder.wave)) throw new Error(`${workorder.id} has invalid implementation wave: ${workorder.wave || '(missing)'}`);
    if (!SURFACES.has(workorder.surface)) throw new Error(`${workorder.id} has invalid surface: ${workorder.surface || '(missing)'}`);
    if (!WORK_CLASSES.has(workorder.workClass)) throw new Error(`${workorder.id} has invalid work_class: ${workorder.frontmatter.work_class || '(missing)'}`);
    if (!workorder.runtimeProfiles.length || workorder.runtimeProfiles.some((profile) => !RUNTIME_PROFILES.has(profile))) {
      throw new Error(`${workorder.id} has invalid runtime_profiles: ${workorder.runtimeProfiles.join(', ') || '(missing)'}`);
    }
  }

  const statePath = join(packageDir, 'STATE.md');
  const state = existsSync(statePath) ? parseFrontmatter(readFileSync(statePath, 'utf8')) : {};
  const profile = state.discovery_profile;
  const activeCount = workorders.filter((workorder) =>
    workorder.frontmatter.aird_workorder_schema_version === '4.0'
    && EXECUTABLE_KINDS.has(workorder.kind)
    && workorder.status !== 'deferred'
  ).length;
  const limits = { lite: 5, standard: 12, deep: 25 };
  if (!limits[profile]) throw new Error(`STATE.md discovery_profile must be lite, standard, or deep before accepting a wave`);
  if (activeCount > limits[profile]) {
    throw new Error(`${profile} profile has ${activeCount} active implementation/spike workorders; limit is ${limits[profile]}`);
  }
  if (closure.length > 12) {
    throw new Error(`wave ${wave} dependency closure has ${closure.length} implementation/spike workorders; limit is 12`);
  }

  const existing = loadReviewManifest(packageDir);
  const sameBase = existing?.base?.ref === git.ref && existing?.base?.sha === git.sha;
  const waves = sameBase && existing?.waves && typeof existing.waves === 'object'
    ? existing.waves
    : {};
  const acceptedAt = new Date().toISOString();
  waves[wave] = {
    status: 'accepted',
    accepted_at: acceptedAt,
    workorders: Object.fromEntries(closure.map((workorder) => [workorder.file, {
      id: workorder.id,
      contract_sha256: workorder.contractSha256,
    }])),
  };
  const manifest = {
    schema_version: '1.0',
    base: {
      ref: git.ref,
      sha: git.sha,
      review_head_sha: git.head_sha,
      merge_base_sha: git.merge_base_sha,
      ahead: git.ahead,
      behind: git.behind,
      checked_at: acceptedAt,
    },
    waves,
  };
  writeReviewManifest(packageDir, manifest);
  return manifest;
}

function option(args, name) {
  const index = args.indexOf(name);
  return index >= 0 ? args[index + 1] : undefined;
}

function usage() {
  return 'Usage: node aird-contract.mjs accept-wave <package-dir> --wave W1 --base origin/main';
}

function main() {
  const args = process.argv.slice(2);
  const [command, rawPackageDir] = args;
  if (command !== 'accept-wave' || !rawPackageDir) {
    console.error(usage());
    process.exit(1);
  }
  const wave = option(args, '--wave');
  const baseRef = option(args, '--base');
  if (!wave || !baseRef) {
    console.error(usage());
    process.exit(1);
  }
  try {
    const packageDir = resolve(rawPackageDir);
    const manifest = acceptWave(packageDir, { wave, baseRef });
    console.log(`AIRD accepted ${wave} on ${manifest.base.ref}@${manifest.base.sha.slice(0, 12)}`);
    console.log(`  workorders: ${Object.keys(manifest.waves[wave].workorders).length}`);
    console.log(`  manifest: ${join(packageDir, 'REVIEW-MANIFEST.json')}`);
  } catch (error) {
    console.error(`FAIL: ${error.message}`);
    process.exit(1);
  }
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath === resolve(fileURLToPath(import.meta.url))) main();
