#!/usr/bin/env python3
"""Validate local Markdown links and reference routing for this skill."""

from __future__ import annotations

import re
import sys
from pathlib import Path
from urllib.parse import unquote, urlparse


ROOT = Path(__file__).resolve().parents[1]
MARKDOWN_LINK = re.compile(
    r"!?\[[^\]]*\]\((?P<target><[^>]+>|[^)\s]+)(?:\s+['\"][^'\"]*['\"])?\)"
)


def local_target(raw_target: str) -> str | None:
    target = raw_target.strip("<>")
    parsed = urlparse(target)
    if parsed.scheme or target.startswith("#"):
        return None
    return unquote(target.split("#", 1)[0])


def main() -> int:
    errors: list[str] = []
    markdown_files = [ROOT / "SKILL.md", *sorted((ROOT / "references").glob("*.md"))]

    for markdown_file in markdown_files:
        content = markdown_file.read_text(encoding="utf-8")
        if "/references/" in content:
            errors.append(
                f"{markdown_file.relative_to(ROOT)}: use skill-relative 'references/...', not '/references/...'"
            )

        for line_number, line in enumerate(content.splitlines(), start=1):
            for match in MARKDOWN_LINK.finditer(line):
                target = local_target(match.group("target"))
                if not target:
                    continue
                if target.startswith("/"):
                    errors.append(
                        f"{markdown_file.relative_to(ROOT)}:{line_number}: absolute local link '{target}'"
                    )
                    continue

                resolved = (markdown_file.parent / target).resolve()
                if resolved != ROOT and ROOT not in resolved.parents:
                    errors.append(
                        f"{markdown_file.relative_to(ROOT)}:{line_number}: link escapes skill root: '{target}'"
                    )
                elif not resolved.exists():
                    errors.append(
                        f"{markdown_file.relative_to(ROOT)}:{line_number}: missing local target '{target}'"
                    )

    skill_text = (ROOT / "SKILL.md").read_text(encoding="utf-8")
    for reference in sorted((ROOT / "references").glob("*.md")):
        routed_path = f"references/{reference.name}"
        if routed_path not in skill_text:
            errors.append(f"SKILL.md: reference is not routed: '{routed_path}'")

    reference_text = "\n".join(
        reference.read_text(encoding="utf-8")
        for reference in sorted((ROOT / "references").glob("*.md"))
    )
    assets_root = ROOT / "assets"
    if assets_root.exists():
        for image in sorted(assets_root.rglob("*.png")):
            expected_link = f"../{image.relative_to(ROOT).as_posix()}"
            if expected_link not in reference_text:
                errors.append(f"asset is not linked from a reference: '{expected_link}'")

    if errors:
        print("Local link validation failed:")
        for error in errors:
            print(f"- {error}")
        return 1

    print(
        f"Local links are valid: {len(markdown_files)} Markdown files, "
        f"{len(list((ROOT / 'references').glob('*.md')))} routed references."
    )
    return 0


if __name__ == "__main__":
    sys.exit(main())
