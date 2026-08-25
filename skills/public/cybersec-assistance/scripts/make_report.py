#!/usr/bin/env python3
"""
Generate a Markdown security report from findings JSON.

Input format: JSON produced by scripts/repo_audit.py (or compatible).
Output: Markdown report (default: SECURITY_REPORT.md)
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
from pathlib import Path
from typing import Any, Optional


def _today_iso() -> str:
    return dt.date.today().isoformat()


def _read_json(path: Path) -> dict[str, Any]:
    return json.loads(path.read_text(encoding="utf-8"))


def _load_template() -> str:
    script_dir = Path(__file__).resolve().parent
    template_path = (script_dir / ".." / "assets" / "report-template.md").resolve()
    if template_path.exists():
        return template_path.read_text(encoding="utf-8")
    return (
        "# Security Report\n\n"
        "- Date: {{DATE}}\n"
        "- Target: {{TARGET}}\n"
        "- Scope: {{SCOPE}}\n"
        "- Assessor: {{ASSESSOR}}\n\n"
        "## Executive Summary\n\n"
        "{{EXEC_SUMMARY}}\n\n"
        "## Findings\n\n"
        "{{FINDINGS_TABLE}}\n\n"
        "{{FINDINGS_DETAILS}}\n\n"
        "## Recommendations\n\n"
        "{{RECOMMENDATIONS}}\n\n"
        "## Appendix\n\n"
        "{{APPENDIX}}\n"
    )


def _md_escape(text: str) -> str:
    return text.replace("|", "\\|").replace("\n", " ").strip()


def _severity_order(sev: str) -> int:
    order = {"critical": 0, "high": 1, "medium": 2, "low": 3, "info": 4}
    return order.get(sev.lower().strip(), 5)


def _render_findings_table(findings: list[dict[str, Any]]) -> str:
    rows = []
    rows.append("| Severity | Title | Location | Confidence |")
    rows.append("|---|---|---|---|")
    for f in sorted(findings, key=lambda x: (_severity_order(str(x.get("severity", ""))), str(x.get("title", "")))):
        sev = _md_escape(str(f.get("severity", "info")).upper())
        title = _md_escape(str(f.get("title", "")))
        loc = _md_escape(f'{f.get("file", "")}:{f.get("line", "")}')
        conf = _md_escape(str(f.get("confidence", "")))
        rows.append(f"| {sev} | {title} | {loc} | {conf} |")
    return "\n".join(rows)


def _render_finding_details(findings: list[dict[str, Any]]) -> str:
    blocks: list[str] = []
    for i, f in enumerate(
        sorted(findings, key=lambda x: (_severity_order(str(x.get("severity", ""))), str(x.get("title", "")))),
        start=1,
    ):
        title = str(f.get("title", "")).strip() or "Finding"
        sev = str(f.get("severity", "info")).strip().upper()
        blocks.append(f"### F{i}. {title}\n")
        blocks.append(f"- Severity: {sev}\n")
        blocks.append(f'- Category: {str(f.get("category", "")).strip()}\n')
        blocks.append(f'- Confidence: {str(f.get("confidence", "")).strip()}\n')
        blocks.append(f'- Location: `{f.get("file", "")}:{f.get("line", "")}`\n')
        evidence = str(f.get("evidence", "")).strip()
        if evidence:
            blocks.append("\n**Evidence (redacted):**\n\n")
            blocks.append(f"```\n{evidence}\n```\n\n")
        rec = str(f.get("recommendation", "")).strip()
        if rec:
            blocks.append("**Recommendation:**\n\n")
            blocks.append(f"{rec}\n\n")
    return "".join(blocks).strip() + "\n"


def _render_recommendations(findings: list[dict[str, Any]]) -> str:
    recs: dict[str, list[str]] = {}
    for f in findings:
        sev = str(f.get("severity", "info")).lower().strip()
        rec = str(f.get("recommendation", "")).strip()
        if not rec:
            continue
        recs.setdefault(sev, [])
        if rec not in recs[sev]:
            recs[sev].append(rec)
    parts: list[str] = []
    for sev in ["critical", "high", "medium", "low", "info"]:
        if sev not in recs:
            continue
        parts.append(f"### {sev.upper()}\n")
        for item in recs[sev]:
            parts.append(f"- {item}\n")
        parts.append("\n")
    return "".join(parts).strip() + "\n"


def _fill(template: str, mapping: dict[str, str]) -> str:
    out = template
    for key, value in mapping.items():
        out = out.replace(f"{{{{{key}}}}}", value)
    return out


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


def main(argv: Optional[list[str]] = None) -> int:
    parser = argparse.ArgumentParser(description="Generate Markdown security report from findings JSON.")
    parser.add_argument(
        "--findings",
        action="append",
        required=True,
        help="Path to findings JSON (repeatable)",
    )
    parser.add_argument("--out", default="SECURITY_REPORT.md", help="Output Markdown path")
    parser.add_argument("--target", default="Repository", help="Target name (default: Repository)")
    parser.add_argument("--scope", default="Not specified", help="Scope summary")
    parser.add_argument("--assessor", default="Not specified", help="Assessor/team name")
    parser.add_argument(
        "--exec-summary",
        default="Automated offline review only. Add manual verification and impact analysis before sharing externally.",
        help="Executive summary text",
    )
    args = parser.parse_args(argv)

    findings_paths = [Path(p).resolve() for p in args.findings]
    out_path = Path(args.out).resolve()

    all_findings: list[dict[str, Any]] = []
    for path in findings_paths:
        data = _read_json(path)
        findings = data.get("findings", [])
        if not isinstance(findings, list):
            raise SystemExit(f"[ERROR] {path} does not contain a list under `findings`")
        all_findings.extend(findings)
    all_findings = _dedupe_findings(all_findings)

    template = _load_template()
    filled = _fill(
        template,
        {
            "DATE": _today_iso(),
            "TARGET": args.target,
            "SCOPE": args.scope,
            "ASSESSOR": args.assessor,
            "EXEC_SUMMARY": args.exec_summary,
            "FINDINGS_TABLE": _render_findings_table(all_findings),
            "FINDINGS_DETAILS": _render_finding_details(all_findings),
            "RECOMMENDATIONS": _render_recommendations(all_findings),
            "APPENDIX": "- Findings sources:\n"
            + "".join(f"  - `{p}`\n" for p in findings_paths)
            + "- Generator: `scripts/make_report.py`\n",
        },
    )

    out_path.write_text(filled.strip() + "\n", encoding="utf-8")
    print(f"[OK] Wrote report → {out_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
