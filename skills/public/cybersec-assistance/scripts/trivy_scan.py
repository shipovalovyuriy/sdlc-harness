#!/usr/bin/env python3
"""
Trivy wrapper that produces a *small*, report-friendly JSON file (plus optional raw Trivy JSON).

Goals:
- Use Trivy if installed
- Default to offline-friendly flags (no DB/check updates)
- Avoid leaking secrets in the summarized output
- Emit findings in a common schema compatible with scripts/make_report.py
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any, Optional


DEFAULT_SKIP_DIRS = [
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
]

SEVERITY_ORDER = ["CRITICAL", "HIGH", "MEDIUM", "LOW", "UNKNOWN"]


def _utc_now_iso() -> str:
    return dt.datetime.now(tz=dt.timezone.utc).replace(microsecond=0).isoformat()


def _normalize_trivy_severity(value: str) -> str:
    v = (value or "").strip().upper()
    return v if v in {"CRITICAL", "HIGH", "MEDIUM", "LOW", "UNKNOWN"} else "UNKNOWN"


def _to_common_severity(value: str) -> str:
    v = _normalize_trivy_severity(value)
    return {
        "CRITICAL": "critical",
        "HIGH": "high",
        "MEDIUM": "medium",
        "LOW": "low",
        "UNKNOWN": "info",
    }[v]


def _highest_common_severity(counts: dict[str, int]) -> str:
    for sev in ["CRITICAL", "HIGH", "MEDIUM", "LOW", "UNKNOWN"]:
        if counts.get(sev, 0) > 0:
            return _to_common_severity(sev)
    return "info"


def _run(cmd: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, text=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)


def _get_trivy_version() -> Optional[str]:
    if not shutil.which("trivy"):
        return None
    proc = _run(["trivy", "--version"])
    if proc.returncode != 0:
        return None
    for line in proc.stdout.splitlines():
        if line.startswith("Version:"):
            return line.split(":", 1)[1].strip()
    return None


def _read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _severity_sort_key(value: str) -> int:
    v = _normalize_trivy_severity(value)
    try:
        return SEVERITY_ORDER.index(v)
    except ValueError:
        return len(SEVERITY_ORDER)


def _dedupe_findings(findings: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[tuple] = set()
    out: list[dict[str, Any]] = []
    for f in findings:
        key = (f.get("id"), f.get("file"), f.get("line"), f.get("evidence"))
        if key in seen:
            continue
        seen.add(key)
        out.append(f)
    return out


def _collect_trivy_items(data: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    vulns: list[dict[str, Any]] = []
    misconfigs: list[dict[str, Any]] = []
    for result in data.get("Results", []) or []:
        target = str(result.get("Target", "") or "")
        for v in result.get("Vulnerabilities", []) or []:
            vulns.append(
                {
                    "target": target,
                    "id": str(v.get("VulnerabilityID", "") or ""),
                    "severity": _normalize_trivy_severity(str(v.get("Severity", "") or "")),
                    "pkg": str(v.get("PkgName", "") or ""),
                    "installed": str(v.get("InstalledVersion", "") or ""),
                    "fixed": str(v.get("FixedVersion", "") or ""),
                    "title": str(v.get("Title", "") or ""),
                    "primary_url": str(v.get("PrimaryURL", "") or ""),
                }
            )
        for m in result.get("Misconfigurations", []) or []:
            cause = m.get("CauseMetadata", {}) or {}
            start_line = cause.get("StartLine")
            misconfigs.append(
                {
                    "target": target,
                    "id": str(m.get("ID", "") or ""),
                    "severity": _normalize_trivy_severity(str(m.get("Severity", "") or "")),
                    "title": str(m.get("Title", "") or ""),
                    "message": str(m.get("Message", "") or ""),
                    "primary_url": str(m.get("PrimaryURL", "") or ""),
                    "resolution": str(m.get("Resolution", "") or ""),
                    "start_line": int(start_line) if isinstance(start_line, int) else None,
                }
            )
    return vulns, misconfigs


def _count_by_severity(items: list[dict[str, Any]]) -> dict[str, int]:
    counts = {k: 0 for k in SEVERITY_ORDER}
    for item in items:
        sev = _normalize_trivy_severity(str(item.get("severity", "") or ""))
        counts[sev] = counts.get(sev, 0) + 1
    return counts


def _top_vulns(vulns: list[dict[str, Any]], limit: int) -> list[dict[str, Any]]:
    dedup: dict[tuple, dict[str, Any]] = {}
    for v in vulns:
        key = (v.get("id"), v.get("pkg"), v.get("installed"), v.get("target"))
        dedup.setdefault(key, v)
    items = list(dedup.values())
    items.sort(key=lambda x: (_severity_sort_key(str(x.get("severity", ""))), str(x.get("id", ""))))
    return items[:limit]


def _top_misconfigs(misconfigs: list[dict[str, Any]], limit: int) -> list[dict[str, Any]]:
    dedup: dict[tuple, dict[str, Any]] = {}
    for m in misconfigs:
        key = (m.get("id"), m.get("target"))
        dedup.setdefault(key, m)
    items = list(dedup.values())
    items.sort(key=lambda x: (_severity_sort_key(str(x.get("severity", ""))), str(x.get("id", ""))))
    return items[:limit]


def _make_summary_finding(
    *,
    mode: str,
    target: str,
    raw_out: Path,
    vuln_counts: dict[str, int],
    misconfig_counts: dict[str, int],
) -> dict[str, Any]:
    evidence_lines = [
        f"Vulnerabilities by severity: {json.dumps(vuln_counts, ensure_ascii=False)}",
        f"Misconfigurations by severity: {json.dumps(misconfig_counts, ensure_ascii=False)}",
        f"Raw Trivy JSON: {raw_out}",
    ]
    return {
        "id": f"trivy.{mode}.summary",
        "title": f"Trivy scan summary ({mode})",
        "severity": _highest_common_severity(
            {k: vuln_counts.get(k, 0) + misconfig_counts.get(k, 0) for k in SEVERITY_ORDER}
        ),
        "category": "trivy-summary",
        "confidence": "high",
        "file": target,
        "line": None,
        "match": "",
        "evidence": "\n".join(evidence_lines),
        "recommendation": "Review top findings, prioritize CRITICAL/HIGH, upgrade affected packages/base images, and fix misconfigurations.",
    }


def _make_vuln_finding(*, scan_target: str, v: dict[str, Any]) -> dict[str, Any]:
    vid = str(v.get("id", "") or "")
    pkg = str(v.get("pkg", "") or "")
    installed = str(v.get("installed", "") or "")
    fixed = str(v.get("fixed", "") or "")
    title = str(v.get("title", "") or "")
    primary_url = str(v.get("primary_url", "") or "")
    location = str(v.get("target", "") or scan_target)

    evidence_lines = [
        f"Target: {location}",
        f"Package: {pkg} ({installed})",
        f"Fixed version: {fixed or 'N/A'}",
    ]
    if title:
        evidence_lines.append(f"Title: {title}")
    if primary_url:
        evidence_lines.append(f"URL: {primary_url}")

    return {
        "id": f"trivy.vuln.{vid}",
        "title": f"{vid} in {pkg}",
        "severity": _to_common_severity(str(v.get("severity", "") or "")),
        "category": "dependency-vuln",
        "confidence": "high",
        "file": scan_target,
        "line": None,
        "match": vid,
        "evidence": "\n".join(evidence_lines),
        "recommendation": "Upgrade to a fixed version if available; otherwise assess exploitability and apply compensating controls.",
    }


def _make_misconfig_finding(*, scan_target: str, m: dict[str, Any]) -> dict[str, Any]:
    mid = str(m.get("id", "") or "")
    title = str(m.get("title", "") or "")
    message = str(m.get("message", "") or "")
    resolution = str(m.get("resolution", "") or "")
    primary_url = str(m.get("primary_url", "") or "")
    location = str(m.get("target", "") or scan_target)
    line = m.get("start_line")

    evidence_lines = [f"Target: {location}"]
    if message:
        evidence_lines.append(f"Message: {message}")
    if resolution:
        evidence_lines.append(f"Resolution: {resolution}")
    if primary_url:
        evidence_lines.append(f"URL: {primary_url}")

    return {
        "id": f"trivy.misconfig.{mid}",
        "title": f"{mid}: {title}" if title else mid,
        "severity": _to_common_severity(str(m.get("severity", "") or "")),
        "category": "misconfig",
        "confidence": "high",
        "file": scan_target,
        "line": line,
        "match": mid,
        "evidence": "\n".join(evidence_lines),
        "recommendation": "Apply the recommended configuration change and verify the scanner no longer reports the issue.",
    }


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Run Trivy and emit summarized findings JSON.")
    parser.add_argument("--mode", choices=["fs", "image"], required=True, help="Scan mode: fs or image")
    parser.add_argument(
        "--target",
        default=".",
        help="Filesystem path (fs) or image reference (image). Default: .",
    )
    parser.add_argument(
        "--out",
        default=None,
        help="Output summary JSON (default: ./security-artifacts/trivy-<mode>-summary.json)",
    )
    parser.add_argument(
        "--raw-out",
        default=None,
        help="Output raw Trivy JSON (default: ./security-artifacts/trivy-<mode>-raw.json)",
    )
    parser.add_argument(
        "--scanners",
        default="vuln,misconfig",
        help="Trivy scanners to run (default: vuln,misconfig). Avoid secret scanner by default.",
    )
    parser.add_argument(
        "--severity",
        default="CRITICAL,HIGH,MEDIUM",
        help="Filter severities (default: CRITICAL,HIGH,MEDIUM)",
    )
    parser.add_argument("--ignore-unfixed", action="store_true", help="Only report fixed vulnerabilities")
    parser.add_argument(
        "--online",
        action="store_true",
        help="Allow DB/check updates (may require network access)",
    )
    parser.add_argument(
        "--skip-dir",
        action="append",
        default=[],
        help="Extra directory to skip (fs mode, repeatable)",
    )
    parser.add_argument(
        "--max-top",
        type=int,
        default=20,
        help="Max top vulns and misconfigs to include as individual findings (default: 20)",
    )
    args = parser.parse_args(argv)

    trivy_path = shutil.which("trivy")
    if not trivy_path:
        print("[ERROR] trivy not found in PATH. Install Trivy or adjust PATH.", file=sys.stderr)
        return 127

    offline = not args.online
    mode = args.mode
    target = args.target
    notes: list[str] = []

    cwd = Path.cwd()
    out_path = (
        Path(args.out).resolve()
        if args.out
        else (cwd / "security-artifacts" / f"trivy-{mode}-summary.json").resolve()
    )
    raw_out = (
        Path(args.raw_out).resolve()
        if args.raw_out
        else (cwd / "security-artifacts" / f"trivy-{mode}-raw.json").resolve()
    )
    out_path.parent.mkdir(parents=True, exist_ok=True)
    raw_out.parent.mkdir(parents=True, exist_ok=True)

    cmd: list[str] = ["trivy", mode]
    cmd += ["--format", "json", "--output", str(raw_out), "--no-progress"]
    cmd += ["--severity", args.severity]
    cmd += ["--scanners", args.scanners]
    if args.ignore_unfixed:
        cmd.append("--ignore-unfixed")
    if offline:
        cmd += [
            "--skip-db-update",
            "--skip-java-db-update",
            "--skip-check-update",
            "--offline-scan",
            "--skip-version-check",
        ]

    if mode == "fs":
        for d in DEFAULT_SKIP_DIRS + list(args.skip_dir):
            cmd += ["--skip-dirs", d]
        cmd.append(target)
    else:
        # Ensure image config misconfig scanning is enabled when requested.
        scanners_set = {s.strip() for s in args.scanners.split(",") if s.strip()}
        if "misconfig" in scanners_set:
            cmd += ["--image-config-scanners", "misconfig"]
        cmd.append(target)

    proc = _run(cmd)
    if proc.returncode != 0:
        # Common offline failure mode: misconfig scanning needs checks bundle. Try vuln-only as fallback.
        scanners_set = {s.strip() for s in args.scanners.split(",") if s.strip()}
        can_fallback = offline and "misconfig" in scanners_set and "vuln" in scanners_set
        if can_fallback:
            fallback_cmd = list(cmd)
            try:
                idx = fallback_cmd.index("--scanners")
                fallback_cmd[idx + 1] = "vuln"
            except ValueError:
                fallback_cmd = []
            if fallback_cmd:
                if "--image-config-scanners" in fallback_cmd:
                    j = fallback_cmd.index("--image-config-scanners")
                    del fallback_cmd[j : j + 2]
                proc2 = _run(fallback_cmd)
                if proc2.returncode == 0:
                    cmd = fallback_cmd
                    proc = proc2
                    notes.append(
                        "Initial Trivy scan failed; reran with `--scanners vuln` only (misconfig scan skipped)."
                    )
                else:
                    proc = proc2  # report the second failure

        if proc.returncode != 0:
            print("[ERROR] Trivy scan failed.", file=sys.stderr)
            if proc.stderr.strip():
                print(proc.stderr.strip(), file=sys.stderr)
            if offline:
                print(
                    "\nHint: this run used offline flags. If Trivy DB/checks are not downloaded yet, "
                    "rerun with `--online` (may require network access) or run Trivy once with DB/check updates enabled.",
                    file=sys.stderr,
                )
            return proc.returncode

    data = _read_json(raw_out)
    vulns, misconfigs = _collect_trivy_items(data)

    vuln_counts = _count_by_severity(vulns)
    misconfig_counts = _count_by_severity(misconfigs)

    findings: list[dict[str, Any]] = []
    findings.append(
        _make_summary_finding(
            mode=mode,
            target=target,
            raw_out=raw_out,
            vuln_counts=vuln_counts,
            misconfig_counts=misconfig_counts,
        )
    )

    for v in _top_vulns(vulns, args.max_top):
        findings.append(_make_vuln_finding(scan_target=target, v=v))
    for m in _top_misconfigs(misconfigs, args.max_top):
        findings.append(_make_misconfig_finding(scan_target=target, m=m))

    payload = {
        "tool": "trivy_scan",
        "version": "0.1",
        "generated_at": _utc_now_iso(),
        "trivy_version": _get_trivy_version(),
        "mode": mode,
        "target": target,
        "offline": offline,
        "notes": notes,
        "command": cmd,
        "raw_output": str(raw_out),
        "summary": {
            "vulnerabilities": vuln_counts,
            "misconfigurations": misconfig_counts,
        },
        "findings": _dedupe_findings(findings),
    }

    out_path.write_text(json.dumps(payload, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"[OK] Trivy summary → {out_path}")
    print(f"[OK] Trivy raw JSON → {raw_out}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
