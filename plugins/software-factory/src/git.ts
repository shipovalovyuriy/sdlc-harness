// Commits that belong to one AIRD, read with git on the server machine.
// The AIRD skills work on an `aird/<slug>` branch and merge it through a pull
// request, so the AIRD's commits are: the unmerged commits of that branch,
// plus the commits brought in by every merge whose message names the branch.
// Commits that touched the package directory are the fallback.
import { execFile, spawn } from "node:child_process";
import { lstatSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { Commit, CommitsResult } from "./contract";

const SEP = "\u001f";
const REC = "\u001e";
const FORMAT = ["%H", "%h", "%s", "%an", "%cI", "%b"].join(SEP) + REC;

function git(cwd: string, args: string[], timeoutMs = 15_000): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      "git",
      ["-C", cwd, ...args],
      { timeout: timeoutMs, maxBuffer: 8 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } },
      (error, stdout) => {
        if (error) reject(error);
        else resolve(stdout);
      },
    );
  });
}

async function tryGit(cwd: string, args: string[]): Promise<string | null> {
  try {
    return await git(cwd, args);
  } catch {
    return null;
  }
}

function parseLog(out: string | null): Commit[] {
  if (!out) return [];
  return out
    .split(REC)
    .map((record) => record.replace(/^\n/u, ""))
    .filter((record) => record.trim() !== "")
    .map((record) => {
      const [sha = "", short = "", subject = "", author = "", date = "", body = ""] = record.split(SEP);
      const refs = [
        ...new Set(`${subject}\n${body}`.match(/\b(WO-\d+[A-Za-z]?|F-\d{2,})\b/gu) ?? []),
      ];
      return { sha, short, subject, author, date, refs };
    });
}

async function revExists(cwd: string, rev: string): Promise<boolean> {
  return (await tryGit(cwd, ["rev-parse", "--verify", "--quiet", `${rev}^{commit}`])) !== null;
}

async function resolveBase(cwd: string, preferred: string | null): Promise<string | null> {
  const candidates = [
    preferred,
    preferred ? `origin/${preferred}` : null,
    "origin/HEAD",
    "main",
    "master",
    "origin/main",
    "origin/master",
  ].filter((value): value is string => Boolean(value));
  for (const candidate of candidates) {
    if (await revExists(cwd, candidate)) return candidate;
  }
  return null;
}

export async function airdCommits(
  folder: string,
  slug: string,
  /** History of this path is the fallback when the branch has no commits; null disables it. */
  packageRelPath: string | null,
  manifestBaseRef: string | null,
): Promise<CommitsResult> {
  const top = await tryGit(folder, ["rev-parse", "--show-toplevel"]);
  if (top === null) {
    return { branch: null, base: null, commits: [], error: "Папка не является git-репозиторием" };
  }
  const branchName = `aird/${slug}`;
  let branch: string | null = null;
  for (const candidate of [branchName, `origin/${branchName}`]) {
    if (await revExists(folder, candidate)) {
      branch = candidate;
      break;
    }
  }
  const base = await resolveBase(folder, manifestBaseRef);
  // A branch merged by fast-forward is an ancestor of the base and no merge
  // commit names it: count from the commit the branch was created at instead.
  let floor = base;
  if (branch !== null && base !== null && !branch.startsWith("origin/") && (await tryGit(folder, ["merge-base", "--is-ancestor", branch, base])) !== null) {
    const created = (await tryGit(folder, ["reflog", "show", "--format=%H", `refs/heads/${branch}`]))?.trim().split("\n").filter(Boolean).at(-1);
    const tip = (await tryGit(folder, ["rev-parse", branch]))?.trim();
    if (created && created !== tip) floor = created;
  }
  const byHash = new Map<string, Commit>();
  const add = (commits: Commit[]) => {
    for (const commit of commits) if (!byHash.has(commit.sha)) byHash.set(commit.sha, commit);
  };

  if (branch !== null) {
    const range = floor ? [branch, `^${floor}`] : [branch];
    add(parseLog(await tryGit(folder, ["log", "--no-merges", "-n", "300", `--format=${FORMAT}`, ...range])));
  }
  if (base !== null) {
    // Merged pull requests: "Merge pull request #23 from owner/aird/<slug>".
    const merges = await tryGit(folder, [
      "log",
      "--merges",
      "-n",
      "20",
      "--format=%H",
      `--grep=${branchName}`,
      "--fixed-strings",
      base,
    ]);
    for (const merge of (merges ?? "").split("\n").map((line) => line.trim()).filter(Boolean)) {
      add(
        parseLog(
          await tryGit(folder, ["log", "--no-merges", "-n", "300", `--format=${FORMAT}`, `${merge}^1..${merge}^2`]),
        ),
      );
    }
  }
  if (byHash.size === 0 && packageRelPath !== null) {
    add(
      parseLog(
        await tryGit(folder, ["log", "--all", "--no-merges", "-n", "100", `--format=${FORMAT}`, "--", packageRelPath]),
      ),
    );
  }
  const commits = [...byHash.values()].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return { branch, base, commits: commits.slice(0, 300), error: null };
}

export interface CommitDetail {
  sha: string;
  short: string;
  subject: string;
  body: string;
  author: string;
  date: string;
  refs: string[];
  files: { path: string; additions: number | null; deletions: number | null }[];
  patch: string;
  truncated: boolean;
  error: string | null;
}

const MAX_PATCH = 250_000;

export async function commitDetail(folder: string, sha: string): Promise<CommitDetail> {
  const empty: CommitDetail = {
    sha,
    short: sha.slice(0, 8),
    subject: "",
    body: "",
    author: "",
    date: "",
    refs: [],
    files: [],
    patch: "",
    truncated: false,
    error: null,
  };
  if (!/^[0-9a-f]{4,40}$/iu.test(sha)) return { ...empty, error: "Некорректный sha" };
  const head = await tryGit(folder, ["show", "-s", `--format=${FORMAT}`, sha]);
  const [commit] = parseLog(head);
  if (!commit) return { ...empty, error: "Коммит не найден" };
  const body = (head ?? "").split(SEP)[5]?.replace(REC, "").trim() ?? "";
  const numstat = (await tryGit(folder, ["show", "--format=", "--numstat", "-M", sha])) ?? "";
  const files = numstat
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [add, del, ...path] = line.split("\t");
      return {
        path: path.join("\t"),
        additions: add === "-" ? null : Number(add),
        deletions: del === "-" ? null : Number(del),
      };
    })
    .slice(0, 500);
  const patch = (await tryGit(folder, ["show", "--format=", "--patch", "-M", "--no-color", sha])) ?? "";
  return {
    ...commit,
    body,
    files,
    patch: patch.length > MAX_PATCH ? patch.slice(0, MAX_PATCH) : patch,
    truncated: patch.length > MAX_PATCH,
    error: null,
  };
}

export async function isGitFolder(folder: string): Promise<boolean> {
  return (await tryGit(folder, ["rev-parse", "--show-toplevel"])) !== null;
}

/**
 * One folder per real repository. Linked worktrees (`.worktrees/feature-x`)
 * share refs with their main checkout, so they would list the same commits
 * again; the main checkout represents them. Reads `.git` only, no git calls.
 */
export function uniqueRepositories(root: string, rels: string[]): { rel: string; path: string }[] {
  const byRepo = new Map<string, { rel: string; path: string; main: boolean }>();
  for (const rel of rels) {
    const path = join(root, rel);
    const dotGit = join(path, ".git");
    let common: string;
    let main = false;
    try {
      if (lstatSync(dotGit).isDirectory()) {
        common = dotGit;
        main = true;
      } else {
        const gitdir = /^gitdir:\s*(.+)$/mu.exec(readFileSync(dotGit, "utf8"))?.[1]?.trim();
        if (!gitdir) continue;
        const absolute = resolve(path, gitdir);
        common = /[/\\]worktrees[/\\][^/\\]+[/\\]?$/u.test(absolute) ? dirname(dirname(absolute)) : absolute;
      }
    } catch {
      continue;
    }
    let key = common;
    try {
      key = realpathSync(common);
    } catch {
      // keep the unresolved path
    }
    const previous = byRepo.get(key);
    if (!previous || (main && !previous.main)) byRepo.set(key, { rel, path, main });
  }
  return [...byRepo.values()].map(({ rel, path }) => ({ rel, path })).sort((a, b) => a.rel.localeCompare(b.rel));
}

async function inPool<T>(items: T[], size: number, run: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) await run(items[next++]!);
    }),
  );
}

/**
 * Commits of `aird/<slug>` in a folder that is not itself a repository but
 * holds repositories (a polyrepo workspace): every real repository where the
 * branch exists, or where a merge names it (branches are often deleted after
 * the pull request), contributes its commits, labelled with its folder.
 */
export async function workspaceCommits(
  root: string,
  slug: string,
  rels: string[],
  manifestBaseRef: string | null,
  referenced: string[] = [],
  since: number | null = null,
): Promise<CommitsResult & { sources: { rel: string; path: string }[] }> {
  const branch = `aird/${slug}`;
  const repos = uniqueRepositories(root, rels);
  const found: { rel: string; path: string }[] = [];
  const recorded = new Map<string, Commit[]>();
  await inPool(repos, 8, async (repo) => {
    // Commits the package records, wherever they live.
    const hits = await commitsByHash(repo.path, referenced, since);
    if (hits.length) recorded.set(repo.rel, hits);
    const refs = await tryGit(repo.path, ["for-each-ref", "--count=1", "--format=%(refname)", `refs/heads/${branch}`, `refs/remotes/origin/${branch}`]);
    let hit = Boolean(refs?.trim());
    if (!hit) {
      const merge = await tryGit(repo.path, ["log", "--all", "--merges", "-n", "1", "--format=%H", "--fixed-strings", `--grep=${branch}`]);
      hit = Boolean(merge?.trim());
    }
    if (hit) found.push(repo);
  });
  found.sort((a, b) => a.rel.localeCompare(b.rel));
  const parts = await Promise.all(found.map(async (repo) => ({ repo, result: await airdCommits(repo.path, slug, null, manifestBaseRef) })));
  const byHash = new Map<string, Commit>();
  for (const { repo, result } of parts) for (const commit of result.commits) if (!byHash.has(commit.sha)) byHash.set(commit.sha, { ...commit, repo: repo.rel });
  for (const [rel, commits] of recorded) for (const commit of commits) if (!byHash.has(commit.sha)) byHash.set(commit.sha, { ...commit, repo: rel });
  const withRecorded = repos.filter((repo) => recorded.has(repo.rel) && !found.some((item) => item.rel === repo.rel));
  found.push(...withRecorded);
  found.sort((a, b) => a.rel.localeCompare(b.rel));
  const commits = [...byHash.values()].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, 300);
  return {
    branch: parts.length ? branch : null,
    base: parts.find((part) => part.result.base)?.result.base ?? null,
    commits,
    error: null,
    repos: found.map((repo) => repo.rel),
    sources: found,
  };
}

/**
 * Commit hashes an AIRD package records (STATE.md, reports, workorders,
 * evidence): delivery writes the commits of each slice there. Lines about a
 * base are skipped so the base commit is not taken for the AIRD's own.
 */
export function packageCommitRefs(packageDir: string, limit = 600): string[] {
  const found = new Set<string>();
  const visit = (dir: string, depth: number) => {
    let names: string[];
    try {
      names = readdirSync(dir);
    } catch {
      return;
    }
    for (const name of names) {
      if (found.size >= limit || name.startsWith(".") || name === "node_modules" || name === "prototype" || name === "inputs") continue;
      const path = join(dir, name);
      let stat;
      try {
        stat = statSync(path);
      } catch {
        continue;
      }
      if (stat.isDirectory()) {
        if (depth < 3) visit(path, depth + 1);
        continue;
      }
      if (!/\.(md|json|jsonl|txt|log|ya?ml)$/iu.test(name) || stat.size > 2_000_000) continue;
      let text: string;
      try {
        text = readFileSync(path, "utf8");
      } catch {
        continue;
      }
      for (const line of text.split("\n")) {
        if (/(^|[^a-z])base|merge-base|база|базов|origin\//iu.test(line)) continue;
        for (const match of line.matchAll(/(?<![0-9a-zA-Z_-])[0-9a-f]{7,40}(?![0-9a-zA-Z_-])/gu)) {
          // `A..B`: A is where a diff starts, not a commit of the AIRD.
          if (line.slice((match.index ?? 0) + match[0].length).startsWith("..")) continue;
          if (/[a-f]/u.test(match[0]) && /[0-9]/u.test(match[0])) found.add(match[0]);
        }
      }
    }
  };
  visit(packageDir, 0);
  return [...found].slice(0, limit);
}

/** Which of the given names are commits in this repository: one `git cat-file --batch-check`. */
function resolveCommits(cwd: string, names: string[]): Promise<string[]> {
  return new Promise((resolvePromise) => {
    if (names.length === 0) return resolvePromise([]);
    const child = spawn("git", ["-C", cwd, "cat-file", "--batch-check=%(objectname) %(objecttype)"], { stdio: ["pipe", "pipe", "ignore"] });
    let out = "";
    const timer = setTimeout(() => child.kill("SIGKILL"), 15_000);
    child.stdout.on("data", (chunk: Buffer) => (out += chunk.toString("utf8")));
    child.on("error", () => resolvePromise([]));
    child.on("close", () => {
      clearTimeout(timer);
      resolvePromise([...new Set(out.split("\n").filter((line) => line.endsWith(" commit")).map((line) => line.split(" ")[0]!))]);
    });
    child.stdin.end(`${names.join("\n")}\n`);
  });
}

/**
 * The recorded commits that are commits of this repository. With `since`,
 * only those made after the AIRD began: a package also mentions the base it
 * started from and the state of a repository at probe time.
 */
export async function commitsByHash(cwd: string, names: string[], since: number | null = null): Promise<Commit[]> {
  const shas = await resolveCommits(cwd, names);
  if (shas.length === 0) return [];
  const commits = parseLog(await tryGit(cwd, ["log", "--no-walk=unsorted", `--format=${FORMAT}`, ...shas.slice(0, 300)]));
  return since === null ? commits : commits.filter((commit) => Date.parse(commit.date) >= since);
}
