#!/usr/bin/env python3
"""
Offline repository security audit (safe-by-default).

What it does:
- Enumerates files (prefers `git ls-files` when available)
- Scans for high-signal secret patterns and risky configuration/code patterns
- Outputs redacted JSON findings suitable for reporting

What it does NOT do:
- No network calls
- No exploitation or active scanning
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import subprocess
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Iterator, Optional


DEFAULT_EXCLUDES = {
    ".git",
    ".hg",
    ".svn",
    "node_modules",
    "vendor",
    "dist",
    "build",
    "target",
    ".next",
    ".nuxt",
    ".cache",
    "__pycache__",
    ".pytest_cache",
}


@dataclass(frozen=True)
class Rule:
    rule_id: str
    title: str
    severity: str  # critical/high/medium/low/info
    category: str
    confidence: str  # high/medium/low
    pattern: re.Pattern[str]
    recommendation: str


def _utc_now_iso() -> str:
    return dt.datetime.now(tz=dt.timezone.utc).replace(microsecond=0).isoformat()


def _redact_value(value: str, *, keep_start: int = 4, keep_end: int = 4) -> str:
    value = value.strip()
    if len(value) <= keep_start + keep_end + 3:
        return "<redacted>"
    return f"{value[:keep_start]}…{value[-keep_end:]}"


def _redact_line(line: str) -> str:
    if len(line) > 500:
        return line[:240] + "…<truncated>…" + line[-240:]
    return line


def _is_probably_binary(chunk: bytes) -> bool:
    if b"\x00" in chunk:
        return True
    # Heuristic: lots of non-text bytes → binary.
    text_bytes = sum(1 for b in chunk if b in b"\n\r\t\f\b" or 32 <= b <= 126)
    return (text_bytes / max(len(chunk), 1)) < 0.75


def _safe_read_text(path: Path, *, max_bytes: int) -> Optional[str]:
    try:
        size = path.stat().st_size
    except OSError:
        return None
    if size > max_bytes:
        return None

    try:
        with path.open("rb") as f:
            chunk = f.read(min(max_bytes, 8192))
            if _is_probably_binary(chunk):
                return None
            rest = f.read(max_bytes - len(chunk))
        data = chunk + rest
        return data.decode("utf-8", errors="replace")
    except OSError:
        return None


def _git_ls_files(repo: Path) -> Optional[list[Path]]:
    if not (repo / ".git").exists():
        return None
    try:
        result = subprocess.run(
            ["git", "-C", str(repo), "ls-files", "-z"],
            check=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
        )
    except Exception:
        return None
    raw = result.stdout.split(b"\x00")
    paths: list[Path] = []
    for item in raw:
        if not item:
            continue
        rel = item.decode("utf-8", errors="replace")
        paths.append(repo / rel)
    return paths


def _walk_files(repo: Path, excludes: set[str]) -> Iterator[Path]:
    for root, dirs, files in os.walk(repo):
        root_path = Path(root)
        dirs[:] = [d for d in dirs if d not in excludes]
        for file_name in files:
            yield root_path / file_name


def _iter_files(repo: Path, excludes: set[str]) -> Iterator[Path]:
    git_files = _git_ls_files(repo)
    if git_files is not None:
        for path in git_files:
            yield path
        return
    yield from _walk_files(repo, excludes)


def _load_rules() -> list[Rule]:
    def p(expr: str) -> re.Pattern[str]:
        return re.compile(expr, re.IGNORECASE)

    return [
        Rule(
            rule_id="secret.aws_access_key_id",
            title="Potential secret: AWS Access Key ID",
            severity="critical",
            category="secrets",
            confidence="high",
            pattern=p(r"\bAKIA[0-9A-Z]{16}\b"),
            recommendation="Remove from repo, rotate the key immediately, and use a secret manager/env vars.",
        ),
        Rule(
            rule_id="secret.github_pat",
            title="Potential secret: GitHub token",
            severity="critical",
            category="secrets",
            confidence="high",
            pattern=p(r"\bgh[pousr]_[A-Za-z0-9]{20,}\b"),
            recommendation="Remove from repo, revoke the token, and replace with short-lived credentials.",
        ),
        Rule(
            rule_id="secret.slack_token",
            title="Potential secret: Slack token",
            severity="critical",
            category="secrets",
            confidence="high",
            pattern=p(r"\bxox[baprs]-[A-Za-z0-9-]{10,}\b"),
            recommendation="Remove from repo, revoke the token, and move secrets to a secret manager.",
        ),
        Rule(
            rule_id="secret.private_key_block",
            title="Private key material committed",
            severity="critical",
            category="secrets",
            confidence="high",
            pattern=p(r"-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----"),
            recommendation="Remove immediately, rotate associated credentials, and add secret scanning in CI.",
        ),
        Rule(
            rule_id="tls.node_reject_unauthorized",
            title="TLS verification disabled (Node.js)",
            severity="high",
            category="crypto",
            confidence="high",
            pattern=p(r"\bNODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['\"]?0\b"),
            recommendation="Do not disable TLS verification; fix cert trust or pin a CA bundle for test env only.",
        ),
        Rule(
            rule_id="tls.requests_verify_false",
            title="TLS verification disabled (Python requests)",
            severity="high",
            category="crypto",
            confidence="high",
            pattern=p(r"\bverify\s*=\s*False\b"),
            recommendation="Avoid `verify=False`; fix certificate validation and use proper CA configuration.",
        ),
        Rule(
            rule_id="tls.insecure_skip_verify",
            title="TLS verification disabled (Go)",
            severity="high",
            category="crypto",
            confidence="high",
            pattern=p(r"\bInsecureSkipVerify\s*:\s*true\b"),
            recommendation="Remove `InsecureSkipVerify`; validate certificates or use a test-only transport guarded by build tags.",
        ),
        Rule(
            rule_id="shell.curl_insecure",
            title="TLS verification disabled (curl -k/--insecure)",
            severity="medium",
            category="crypto",
            confidence="high",
            pattern=p(r"\bcurl\b[^\n]*\s(?:-k\b|--insecure\b)"),
            recommendation="Remove `-k/--insecure`; fix trust chain or use a dev CA.",
        ),
        Rule(
            rule_id="code.eval_js",
            title="Use of eval() (JS/TS)",
            severity="medium",
            category="code-smell",
            confidence="medium",
            pattern=p(r"\beval\s*\("),
            recommendation="Avoid `eval`; use safe parsing/interpretation and strict input validation.",
        ),
        Rule(
            rule_id="code.child_process_exec",
            title="OS command execution (Node.js child_process)",
            severity="medium",
            category="injection",
            confidence="medium",
            pattern=p(r"\bchild_process\.(?:exec|execSync|spawn|spawnSync)\b"),
            recommendation="Validate/escape inputs, prefer parameterized APIs, and avoid passing user input to shells.",
        ),
        Rule(
            rule_id="code.yaml_unsafe_load",
            title="Potential unsafe YAML load (Python)",
            severity="medium",
            category="deserialization",
            confidence="medium",
            pattern=p(r"\byaml\.load\s*\("),
            recommendation="Use `yaml.safe_load` unless you fully control the input and the loader.",
        ),
        Rule(
            rule_id="dockerfile.from_latest",
            title="Docker image tag not pinned (FROM ...:latest)",
            severity="low",
            category="supply-chain",
            confidence="medium",
            pattern=p(r"^\s*FROM\s+\S+:latest\b"),
            recommendation="Pin images to a specific tag/digest to improve reproducibility and reduce supply-chain risk.",
        ),
        Rule(
            rule_id="dockerfile.add_remote",
            title="Dockerfile uses ADD with remote URL",
            severity="low",
            category="supply-chain",
            confidence="medium",
            pattern=p(r"^\s*ADD\s+https?://"),
            recommendation="Prefer `curl`/`wget` with checksum verification; avoid `ADD` remote URLs.",
        ),
    ]


def _normalize_path(repo: Path, path: Path) -> str:
    try:
        return str(path.relative_to(repo))
    except Exception:
        return str(path)


def _scan_text(
    *,
    repo: Path,
    path: Path,
    text: str,
    rules: list[Rule],
    max_findings_per_file: int,
) -> list[dict]:
    findings: list[dict] = []
    lines = text.splitlines()
    for index, line in enumerate(lines, start=1):
        for rule in rules:
            match = rule.pattern.search(line)
            if not match:
                continue
            raw_match = match.group(0)
            redacted_match = (
                "<redacted>" if "PRIVATE KEY" in raw_match.upper() else _redact_value(raw_match)
            )
            evidence_line = line
            if raw_match and raw_match in evidence_line and redacted_match:
                evidence_line = evidence_line.replace(raw_match, redacted_match)
            findings.append(
                {
                    "id": rule.rule_id,
                    "title": rule.title,
                    "severity": rule.severity,
                    "category": rule.category,
                    "confidence": rule.confidence,
                    "file": _normalize_path(repo, path),
                    "line": index,
                    "match": redacted_match,
                    "evidence": _redact_line(evidence_line.strip()),
                    "recommendation": rule.recommendation,
                }
            )
            if len(findings) >= max_findings_per_file:
                return findings
    return findings


def _severity_rank(severity: str) -> int:
    order = {"critical": 4, "high": 3, "medium": 2, "low": 1, "info": 0}
    return order.get(severity.lower().strip(), 0)


def _dedupe(findings: Iterable[dict]) -> list[dict]:
    seen: set[tuple] = set()
    out: list[dict] = []
    for f in findings:
        key = (f.get("id"), f.get("file"), f.get("line"), f.get("evidence"))
        if key in seen:
            continue
        seen.add(key)
        out.append(f)
    out.sort(key=lambda x: (_severity_rank(x.get("severity", "info")) * -1, x.get("file", "")))
    return out


def _build_summary(findings: list[dict]) -> dict:
    counts = {"critical": 0, "high": 0, "medium": 0, "low": 0, "info": 0}
    by_category: dict[str, int] = {}
    for f in findings:
        sev = str(f.get("severity", "info")).lower()
        if sev in counts:
            counts[sev] += 1
        cat = str(f.get("category", "uncategorized"))
        by_category[cat] = by_category.get(cat, 0) + 1
    return {"by_severity": counts, "by_category": dict(sorted(by_category.items()))}


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Offline repo security audit → redacted JSON findings.")
    parser.add_argument("--repo", default=".", help="Path to repository (default: .)")
    parser.add_argument(
        "--out",
        default=None,
        help="Output JSON path (default: ./security-artifacts/repo-audit.json)",
    )
    parser.add_argument(
        "--max-bytes",
        type=int,
        default=1_000_000,
        help="Max file size to scan in bytes (default: 1000000)",
    )
    parser.add_argument(
        "--max-findings-per-file",
        type=int,
        default=25,
        help="Cap findings per file (default: 25)",
    )
    parser.add_argument(
        "--exclude",
        action="append",
        default=[],
        help=f"Directory name to exclude (repeatable). Defaults include: {', '.join(sorted(DEFAULT_EXCLUDES))}",
    )
    args = parser.parse_args(argv)

    repo = Path(args.repo).resolve()
    if not repo.exists():
        print(f"[ERROR] Repo path does not exist: {repo}", file=sys.stderr)
        return 2

    out_path = Path(args.out) if args.out else (Path.cwd() / "security-artifacts" / "repo-audit.json")
    out_path = out_path.resolve()
    out_path.parent.mkdir(parents=True, exist_ok=True)

    excludes = set(DEFAULT_EXCLUDES) | set(args.exclude)
    rules = _load_rules()

    all_findings: list[dict] = []
    files_scanned = 0
    files_skipped = 0
    for path in _iter_files(repo, excludes):
        # Skip excluded dirs when using git ls-files by checking any path part.
        if any(part in excludes for part in path.parts):
            files_skipped += 1
            continue
        text = _safe_read_text(path, max_bytes=args.max_bytes)
        if text is None:
            files_skipped += 1
            continue
        files_scanned += 1
        all_findings.extend(
            _scan_text(
                repo=repo,
                path=path,
                text=text,
                rules=rules,
                max_findings_per_file=args.max_findings_per_file,
            )
        )

    deduped = _dedupe(all_findings)
    payload = {
        "tool": "repo_audit",
        "version": "0.1",
        "generated_at": _utc_now_iso(),
        "repo": str(repo),
        "stats": {
            "files_scanned": files_scanned,
            "files_skipped": files_skipped,
            "rules": len(rules),
        },
        "summary": _build_summary(deduped),
        "findings": deduped,
    }

    out_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"[OK] Wrote {len(deduped)} findings → {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
