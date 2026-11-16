// One git worktree per AIRD. Discovery, delivery and every agent thread of an
// AIRD run inside it, on the branch the AIRD skills use (`aird/<slug>`), so
// AIRDs never share a checkout. Worktrees live under a plugin-chosen root and
// are not removed when threads are archived: the AIRD package is the loop's
// memory, and an uncommitted STATE.md must survive.
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, readlinkSync, realpathSync, renameSync, rmSync, symlinkSync, unlinkSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join, relative, resolve } from "node:path";
import { AIRD_DIR, isDirectory } from "./aird";

function git(cwd: string, args: string[]): Promise<string> {
  return new Promise((resolvePromise, reject) => {
    execFile(
      "git",
      ["-C", cwd, ...args],
      { timeout: 60_000, maxBuffer: 4 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } },
      (error, stdout, stderr) => {
        if (error) reject(new Error(`git ${args.join(" ")}: ${(stderr || error.message).trim()}`));
        else resolvePromise(stdout);
      },
    );
  });
}

/** git with the working copy as cwd; rejects with stderr on failure. */
export const gitText = (cwd: string, args: string[]) => git(cwd, args);

async function tryGit(cwd: string, args: string[]): Promise<string | null> {
  try {
    return await git(cwd, args);
  } catch {
    return null;
  }
}

export interface WorktreeInfo {
  /** Worktree root, or null when the folder is not in a git repository. */
  worktree: string | null;
  /** Where threads run: the AIRD folder's counterpart inside the worktree. */
  workFolder: string;
  branch: string | null;
  base: string | null;
  created: boolean;
  note: string | null;
}

export function expandHome(path: string): string {
  return resolve(path.replace(/^~(?=$|\/)/u, homedir()));
}

const SKIP_DIRS = new Set(["node_modules", ".git", "vendor", "dist", "build", ".cache", ".next", "target"]);

/** Git repositories nested in a folder that is not itself in git (a polyrepo workspace), relative paths. */
export function nestedRepos(root: string, maxDepth = 3): string[] {
  const found: string[] = [];
  const walk = (rel: string, depth: number) => {
    let entries: string[];
    try {
      entries = readdirSync(join(root, rel));
    } catch {
      return;
    }
    for (const name of entries) {
      if (SKIP_DIRS.has(name)) continue;
      const child = rel ? `${rel}/${name}` : name;
      if (!isDirectory(join(root, child))) continue;
      try {
        lstatSync(join(root, child, ".git"));
        found.push(child);
        continue;
      } catch {
        // not a repository root
      }
      if (depth < maxDepth) walk(child, depth + 1);
    }
  };
  walk("", 1);
  return found.sort();
}

function isEmptyDir(path: string): boolean {
  try {
    return readdirSync(path).length === 0;
  } catch {
    return true;
  }
}

async function defaultBase(top: string): Promise<string> {
  const remoteHead = (await tryGit(top, ["symbolic-ref", "--quiet", "--short", "refs/remotes/origin/HEAD"]))?.trim();
  if (remoteHead) return remoteHead;
  for (const candidate of ["main", "master"]) {
    if (await tryGit(top, ["rev-parse", "--verify", "--quiet", `refs/heads/${candidate}^{commit}`])) return candidate;
  }
  return (await tryGit(top, ["rev-parse", "--abbrev-ref", "HEAD"]))?.trim() || "HEAD";
}

function parseWorktreeList(text: string): { worktree: string; branch: string | null }[] {
  return text
    .split(/\n\n+/u)
    .map((block) => {
      const worktree = /^worktree (.+)$/mu.exec(block)?.[1] ?? null;
      const branch = /^branch (.+)$/mu.exec(block)?.[1] ?? null;
      return worktree ? { worktree, branch } : null;
    })
    .filter((item): item is { worktree: string; branch: string | null } => item !== null);
}

/**
 * Finds or creates the AIRD's worktree. `folder` is the project folder the
 * AIRD belongs to (possibly a subfolder of the repository).
 */
export async function ensureWorktree(
  folder: string,
  slug: string,
  root: string,
  options: { branch?: string; dirName?: string; base?: string | null; copyPackage?: boolean; path?: string } = {},
): Promise<WorktreeInfo> {
  const top = (await tryGit(folder, ["rev-parse", "--show-toplevel"]))?.trim();
  if (!top) {
    const repos = nestedRepos(folder).filter((rel) => rel !== ".agent");
    return {
      worktree: null,
      workFolder: folder,
      branch: null,
      base: null,
      created: false,
      note: repos.length > 0
        ? `Папка — рабочее пространство из ${repos.length} git-репозиториев, сама не в git. Discovery работает прямо в ней: код он не меняет, пишет только пакет. Изменения кода делай только на ветке aird/${slug} в нужном репозитории.`
        : "Папка не в git-репозитории — отдельную worktree создать нельзя, работа идёт прямо в папке.",
    };
  }
  // Compare real paths: git reports /private/tmp for /tmp on macOS.
  const real = (path: string) => {
    try {
      return realpathSync(path);
    } catch {
      return resolve(path);
    }
  };
  const rel = relative(real(top), real(folder));
  if (rel.startsWith("..")) throw new Error(`Папка ${folder} вне репозитория ${top}`);
  const branch = options.branch ?? `aird/${slug}`;
  const baseDir = join(expandHome(root), basename(top));
  const dirName = options.dirName ?? slug;
  const known = options.path ?? join(baseDir, dirName);
  // An AIRD working copy that already exists on the branch is reused as is
  // (a clone, or a legacy worktree that checkLayout reports and migrates).
  if (isDirectory(known) && (await tryGit(known, ["rev-parse", "--abbrev-ref", "HEAD"]))?.trim() === branch) {
    return { worktree: known, workFolder: join(known, rel), branch, base: null, created: false, note: null };
  }
  if (!options.path) {
    const list = parseWorktreeList((await tryGit(top, ["worktree", "list", "--porcelain"])) ?? "");
    const legacy = list.slice(1).find((item) => item.branch === `refs/heads/${branch}` && isDirectory(item.worktree));
    if (legacy) return { worktree: legacy.worktree, workFolder: join(legacy.worktree, rel), branch, base: null, created: false, note: null };
  }

  let path = known;
  if (options.path) {
    if (isDirectory(path) && !isEmptyDir(path)) throw new Error(`Папка ${path} уже занята — не могу создать в ней рабочую копию`);
  } else {
    for (let n = 2; isDirectory(path) && !isEmptyDir(path); n += 1) path = join(baseDir, `${dirName}-${n}`);
  }
  mkdirSync(dirname(path), { recursive: true });

  // The start commit is resolved in the user's repository, where every ref lives.
  let base: string | null = null;
  let start: string;
  if (await tryGit(top, ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}^{commit}`])) {
    start = (await git(top, ["rev-parse", `refs/heads/${branch}^{commit}`])).trim();
  } else if (await tryGit(top, ["rev-parse", "--verify", "--quiet", `refs/remotes/origin/${branch}^{commit}`])) {
    base = `origin/${branch}`;
    start = (await git(top, ["rev-parse", `${base}^{commit}`])).trim();
  } else {
    const wanted = options.base && (await tryGit(top, ["rev-parse", "--verify", "--quiet", `${options.base}^{commit}`])) ? options.base : null;
    base = wanted ?? (await defaultBase(top));
    start = (await git(top, ["rev-parse", `${base}^{commit}`])).trim();
  }
  // An own clone, not a worktree: a worktree keeps its git data (index, refs,
  // objects) in the user's repository, outside the folder a sandboxed agent
  // may write to, so it could not commit. A local clone hardlinks the objects
  // and keeps everything else inside the working copy. Factory pushes the
  // branch back to the user's repository (pushBranch).
  await git(top, ["clone", "--local", "--no-checkout", "--quiet", top, path]);
  await git(path, ["checkout", "--quiet", "-b", branch, start]);

  // A package that exists only as untracked files in the main checkout would
  // be missing from the worktree; carry it over once.
  let note: string | null = null;
  const source = join(folder, AIRD_DIR, slug);
  const target = join(path, rel, AIRD_DIR, slug);
  if (options.copyPackage !== false && isDirectory(source) && !isDirectory(target)) {
    mkdirSync(dirname(target), { recursive: true });
    cpSync(source, target, { recursive: true });
    note = `Пакет не был в git — скопирован из ${source} в worktree.`;
  }
  return { worktree: path, workFolder: join(path, rel), branch, base, created: true, note };
}

/** Pushes the AIRD branch of a working copy back to the repository it was cloned from. */
export async function pushBranch(path: string, branch: string): Promise<string | null> {
  if (!isDirectory(path) || isLinkedWorktree(path)) return null;
  const origin = (await tryGit(path, ["remote", "get-url", "origin"]))?.trim();
  if (!origin) return null;
  try {
    await git(path, ["push", "--quiet", "origin", `refs/heads/${branch}:refs/heads/${branch}`]);
    return null;
  } catch (error) {
    return `Ветку ${branch} не удалось отправить в ${origin}: ${String(error).slice(0, 300)}`;
  }
}

/** A legacy worktree: its `.git` is a file pointing into another repository. */
export function isLinkedWorktree(path: string): boolean {
  try {
    return lstatSync(join(path, ".git")).isFile();
  } catch {
    return false;
  }
}

export async function gitDirs(path: string): Promise<{ gitDir: string; commonDir: string } | null> {
  const gitDir = (await tryGit(path, ["rev-parse", "--absolute-git-dir"]))?.trim();
  const common = (await tryGit(path, ["rev-parse", "--git-common-dir"]))?.trim();
  if (!gitDir || !common) return null;
  return { gitDir, commonDir: resolve(path, common) };
}

/**
 * Replaces a clean legacy worktree with an own clone at the same path, on the
 * same branch. Installed dependencies are kept. Refuses when anything would be
 * lost: modified tracked files or untracked files that are not ignored.
 */
export async function migrateWorktreeToClone(path: string, branch: string, artifacts: RegExp | null = null): Promise<void> {
  if (!isLinkedWorktree(path)) return;
  // Run artifacts (an acceptance suite's results.json) are rewritten by every run: restore, do not refuse.
  if (artifacts) {
    const touched = (await git(path, ["status", "--porcelain"])).split("\n").map((line) => line.slice(3).trim()).filter((file) => file && artifacts.test(file));
    if (touched.length) await git(path, ["checkout", "--", ...touched]);
  }
  const dirty = (await git(path, ["status", "--porcelain"])).trim();
  if (dirty) throw new Error(`В worktree ${path} есть незакоммиченные изменения — закоммить их, затем Factory переведёт её в клон`);
  const dirs = await gitDirs(path);
  if (!dirs) throw new Error(`${path}: не удалось прочитать git-данные`);
  const top = dirname(dirs.commonDir);
  // Carry over only what git ignores (installed dependencies, local env); tracked files come with the clone.
  const keep: string[] = [];
  for (const name of ["node_modules", ".env", ".env.local"]) {
    if (!existsSync(join(path, name)) || lstatSync(join(path, name)).isSymbolicLink()) continue;
    if ((await tryGit(path, ["check-ignore", "-q", name])) !== null) keep.push(name);
  }
  const stash = mkdtempSync(join(dirname(path), ".aird-migrate-"));
  for (const name of keep) renameSync(join(path, name), join(stash, name));
  try {
    await git(top, ["worktree", "remove", path]);
    await git(top, ["clone", "--local", "--no-checkout", "--quiet", top, path]);
    await git(path, ["checkout", "--quiet", "-b", branch, (await git(top, ["rev-parse", `refs/heads/${branch}^{commit}`])).trim()]);
  } finally {
    for (const name of keep) if (existsSync(join(stash, name)) && !existsSync(join(path, name))) renameSync(join(stash, name), join(path, name));
    rmSync(stash, { recursive: true, force: true });
  }
}

// ------------------------------------------------------- polyrepo workspaces

export interface WorkspaceRepo {
  /** Repository path relative to the workspace, e.g. `front/app`. */
  rel: string;
  /** The user's own checkout. */
  main: string;
  /** Where the AIRD works on it: a worktree, or a link to an existing checkout of the branch. */
  path: string;
  branch: string;
  base: string | null;
  /** The repository that only holds the AIRD package (no code of the AIRD). */
  package?: boolean;
}

/** The nested repository a workspace-relative path belongs to (deepest match). */
export function repoOfPath(path: string, repos: string[]): string | null {
  const clean = path.replace(/^\.\//u, "").replace(/[*?[{].*$/u, "").replace(/\/+$/u, "");
  return repos.filter((rel) => clean === rel || clean.startsWith(`${rel}/`)).sort((a, b) => b.length - a.length)[0] ?? null;
}

function isLink(path: string): boolean {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return false;
  }
}

/**
 * A folder that is not itself in git but holds many repositories (a polyrepo
 * workspace) gets an AIRD checkout of the same shape: the repositories the
 * AIRD changes are worktrees on `aird/<slug>`, everything else — including the
 * package repository `.agent` — is a symlink to the user's workspace. Paths in
 * the package (`front/app/src/...`) therefore resolve unchanged, and the user's
 * own checkouts and their branches are never touched. Idempotent: a repository
 * that becomes a target later replaces its symlink with a worktree.
 */
export async function ensureWorkspaceCheckout(
  workspace: string,
  slug: string,
  root: string,
  targets: string[],
  base: string | null,
  packageRel: string | null = null,
): Promise<{ folder: string; repos: WorkspaceRepo[]; note: string }> {
  const folder = join(expandHome(root), basename(resolve(workspace)), slug);
  const wanted = [...new Set(targets)].sort();
  const codeTargets = new Set(wanted);
  // The package must physically live inside the AIRD folder too, so agents
  // can write state and evidence. A package tracked in its repository travels
  // with that repository's clone; an untracked one (the common case for a
  // workspace-level `.agent`) is moved here and the old path becomes a link.
  const repos = nestedRepos(workspace);
  const packageRepo = packageRel ? repoOfPath(packageRel, repos) : null;
  const tracked = packageRel && packageRepo
    ? ((await tryGit(join(workspace, packageRepo), ["ls-files", "--", relative(packageRepo, packageRel)])) ?? "").trim() !== ""
    : false;
  if (packageRepo && tracked && !wanted.includes(packageRepo)) wanted.push(packageRepo);
  const ownedPackage = packageRel && !tracked ? packageRel : null;
  const keepReal = (rel: string) => wanted.includes(rel) || rel === ownedPackage;
  const populate = (dirRel: string) => {
    const overlayDir = join(folder, dirRel);
    if (isLink(overlayDir)) unlinkSync(overlayDir);
    mkdirSync(overlayDir, { recursive: true });
    for (const name of readdirSync(join(workspace, dirRel))) {
      const rel = dirRel ? `${dirRel}/${name}` : name;
      if (keepReal(rel)) continue;
      if ([...wanted, ownedPackage].some((target) => target && target.startsWith(`${rel}/`))) {
        populate(rel);
        continue;
      }
      const link = join(folder, rel);
      if (!existsSync(link) && !isLink(link)) symlinkSync(join(workspace, rel), link);
    }
  };
  if (ownedPackage) mkdirSync(dirname(join(workspace, ownedPackage)), { recursive: true });
  populate("");
  if (ownedPackage) {
    const here = join(folder, ownedPackage);
    const there = join(workspace, ownedPackage);
    mkdirSync(dirname(here), { recursive: true });
    if (isLink(here)) unlinkSync(here);
    if (!existsSync(here)) {
      if (isDirectory(there) && !isLink(there)) renameSync(there, here);
      else mkdirSync(here, { recursive: true });
    }
    if (!isLink(there) && !existsSync(there)) symlinkSync(here, there);
  }

  const checkouts: WorkspaceRepo[] = [];
  const missing: string[] = [];
  for (const rel of wanted.sort()) {
    const main = join(workspace, rel);
    const path = join(folder, rel);
    // A target that used to be a plain link becomes the AIRD's own clone.
    if (isLink(path)) unlinkSync(path);
    const branch = `aird/${slug}`;
    const info = await ensureWorktree(main, slug, root, { path, base, copyPackage: false });
    // A tracked package may carry edits the user's checkout has not committed yet.
    if (info.created && packageRel && rel === packageRepo && isDirectory(join(workspace, packageRel))) {
      cpSync(join(workspace, packageRel), join(folder, packageRel), { recursive: true });
    }
    checkouts.push({ rel, main, path, branch, base: info.base, ...(codeTargets.has(rel) ? {} : { package: true }) });
    for (const local of ["node_modules", ".env", ".env.local"]) {
      if (existsSync(join(main, local)) && !existsSync(join(path, local))) missing.push(`${rel}/${local}`);
    }
  }
  const note = [
    `Рабочее пространство AIRD: репозитории ${checkouts.map((repo) => repo.rel).join(", ")} — свои клоны на ветке aird/${slug}; остальные папки — ссылки на ${workspace}.`,
    missing.length ? `Неотслеживаемые файлы не перенесены: ${missing.join(", ")} — установи зависимости и подготовь окружение в клоне перед проверками.` : "",
  ].filter(Boolean).join(" ");
  return { folder, repos: checkouts, note };
}

/**
 * The blind-acceptance worktree of an AIRD: branch `aird/<slug>-acceptance`
 * cut from the base the AIRD started from, so the test author sees the
 * pre-change code and none of the implementation. Outside git it is a plain
 * directory next to the other worktrees — still not inside the code folder.
 */
export async function ensureAcceptanceWorktree(folder: string, slug: string, root: string, base: string | null): Promise<WorktreeInfo> {
  const info = await ensureWorktree(folder, slug, root, {
    branch: `aird/${slug}-acceptance`,
    dirName: `${slug}-acceptance`,
    base,
    copyPackage: false,
  });
  if (info.worktree !== null) return info;
  const plain = join(expandHome(root), basename(resolve(folder)), `${slug}-acceptance`);
  mkdirSync(plain, { recursive: true });
  return { worktree: null, workFolder: plain, branch: null, base: null, created: true, note: "Папка вне git: приёмочные тесты лежат в отдельной папке без ветки." };
}

/** Capture once at wave pre-flight. Package bookkeeping is allowed to be uncommitted. */
export async function acceptanceBase(folder: string): Promise<string> {
  const head = (await tryGit(folder, ["rev-parse", "HEAD"]))?.trim();
  if (!head) throw new Error("Для независимой базы нужен git commit до первого среза волны");
  const changed = (await git(folder, ["diff", "--name-only", "HEAD"])).trim().split("\n");
  const untracked = (await git(folder, ["ls-files", "--others", "--exclude-standard"])).trim().split("\n");
  const source = [...changed, ...untracked].filter((path) => path && !/(^|\/)\.agent\/aird\//u.test(path));
  if (source.length) throw new Error("База приёмки не зафиксирована: вне AIRD-пакета есть незакоммиченные файлы. Подготовь чистый pre-flight до реализации волны.");
  return head;
}

/** Only called for a new wave, never while implementing or retrying its suite. */
export async function refreshAcceptanceWorktree(folder: string, base: string, source?: string): Promise<void> {
  // Separate clones do not share objects: bring the base commit from the code copy.
  if (source && (await tryGit(folder, ["cat-file", "-e", `${base}^{commit}`])) === null) {
    await git(folder, ["fetch", "--quiet", source, "HEAD"]);
  }
  const changed = (await git(folder, ["diff", "--name-only", "HEAD"])).trim().split("\n")
    .filter((path) => path && !/(^|\/)acceptance\/[^/]+\/results\.json$/u.test(path));
  if (changed.length) {
    throw new Error("В worktree приёмки есть незакоммиченные изменения; заверши test-author перед новой волной");
  }
  // is-ancestor succeeds with empty stdout; null means it failed.
  if (await tryGit(folder, ["merge-base", "--is-ancestor", base, "HEAD"]) === null) {
    await git(folder, ["merge", "--no-edit", base]);
  }
}

/** Bind red-first evidence to the exact committed suite, including new files. */
export async function acceptanceSuiteRevision(folder: string, slug: string): Promise<string> {
  const suite = `acceptance/${slug}`;
  const tracked = await tryGit(folder, ["ls-files", "--error-unmatch", `${suite}/run.sh`]);
  if (tracked === null) throw new Error("test-author должен закоммитить набор до прогона приёмки");
  const changed = (await git(folder, ["diff", "--name-only", "HEAD", "--", suite])).trim().split("\n")
    .filter((path) => path && !path.endsWith(`/${suite}/results.json`) && path !== `${suite}/results.json`);
  const untracked = (await git(folder, ["ls-files", "--others", "--exclude-standard", "--", suite])).trim().split("\n")
    .filter((path) => path && !path.endsWith(`/${suite}/results.json`) && path !== `${suite}/results.json`);
  if (changed.length || untracked.length) throw new Error("Набор изменён после commit: test-author должен зафиксировать изменения и повторить Red-first");
  return (await git(folder, ["rev-parse", "HEAD"])).trim();
}

/** Include uncommitted source, but exclude the AIRD bookkeeping updated by verification. */
export async function deliveryRevision(folder: string): Promise<string> {
  const top = (await git(folder, ["rev-parse", "--show-toplevel"])).trim();
  const hash = createHash("sha256").update(await git(top, ["rev-parse", "HEAD"]));
  hash.update(await git(top, ["diff", "--binary", "HEAD", "--", ".", ":(glob,exclude).agent/aird/**", ":(glob,exclude)**/.agent/aird/**"]));
  const untracked = (await git(top, ["ls-files", "-z", "--others", "--exclude-standard"])).split("\0").filter(Boolean).sort();
  for (const path of untracked) {
    if (/(^|\/)\.agent\/aird\//u.test(path)) continue;
    const absolute = join(top, path), stat = lstatSync(absolute);
    hash.update(path).update("\0").update(String(stat.mode)).update("\0");
    hash.update(stat.isSymbolicLink() ? readlinkSync(absolute) : readFileSync(absolute));
  }
  return hash.digest("hex");
}

/** Run on the recorded commit even if the delivery branch has advanced meanwhile. */
export async function withBaselineCheckout<T>(folder: string, base: string, run: (target: string) => Promise<T>): Promise<T> {
  const top = (await git(folder, ["rev-parse", "--show-toplevel"])).trim();
  const rel = relative(realpathSync(top), realpathSync(folder));
  const temp = mkdtempSync(join(tmpdir(), "aird-baseline-"));
  const checkout = join(temp, "checkout");
  try {
    await git(top, ["worktree", "add", "--detach", checkout, base]);
    // A fresh checkout has no installed dependencies, so a suite that runs the
    // project's own test runner cannot start. Borrow them: the user's main
    // checkout represents the base best, the AIRD worktree is the fallback.
    const main = parseWorktreeList((await tryGit(top, ["worktree", "list", "--porcelain"])) ?? "")[0]?.worktree ?? top;
    for (const dir of new Set([rel, ""])) {
      for (const name of ["node_modules"]) {
        const target = join(checkout, dir, name);
        if (existsSync(target)) continue;
        const source = [join(main, dir, name), join(top, dir, name)].find((path) => isDirectory(path));
        if (source) symlinkSync(source, target);
      }
    }
    return await run(join(checkout, rel));
  } finally {
    try { await git(top, ["worktree", "remove", "--force", checkout]); }
    finally { rmSync(temp, { recursive: true, force: true }); }
  }
}
