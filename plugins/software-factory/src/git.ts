// Commits that belong to one AIRD, read with git on the server machine.
// The AIRD skills work on an `aird/<slug>` branch and merge it through a pull
// request, so the AIRD's commits are: the unmerged commits of that branch,
// plus the commits brought in by every merge whose message names the branch.
// Commits that touched the package directory are the fallback.
import { execFile } from "node:child_process";
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
  const byHash = new Map<string, Commit>();
  const add = (commits: Commit[]) => {
    for (const commit of commits) if (!byHash.has(commit.sha)) byHash.set(commit.sha, commit);
  };

  if (branch !== null) {
    const range = base ? [branch, `^${base}`] : [branch];
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
