#!/usr/bin/env python3
"""Build Dust & Blood website JSON from source/rules.txt.

Supports [PAGE], metadata fields, and raw HTML blocks delimited by
[HTML] and [END HTML]. Raw HTML is intentionally preserved because the
current rulebook pages use HTML tables, callouts, lists, and headings.
"""
from pathlib import Path
import json
import re
import shutil
import sys

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "source"
WEBSITE_DATA = ROOT / "website" / "data"


def fail(message):
    print(f"ERROR: {message}", file=sys.stderr)
    raise SystemExit(1)


def parse_rules(path):
    if not path.exists():
        fail(f"Rules source not found: {path}\nCreate source/rules.txt first.")
    lines = path.read_text(encoding="utf-8").splitlines()
    pages = []
    current = None
    in_html = False
    html_lines = []

    for number, line in enumerate(lines, start=1):
        stripped = line.strip()
        if in_html:
            if stripped == "[END HTML]":
                current.setdefault("blocks", []).append({"type": "html", "html": "\n".join(html_lines)})
                html_lines = []
                in_html = False
            else:
                html_lines.append(line)
            continue

        if stripped == "[PAGE]":
            if current is not None:
                fail(f"Line {number}: new [PAGE] before prior [END PAGE].")
            current = {"id": "", "title": "", "category": "Rules", "summary": "", "blocks": []}
            continue
        if stripped == "[END PAGE]":
            if current is None:
                fail(f"Line {number}: [END PAGE] without [PAGE].")
            if not current["id"] or not current["title"]:
                fail(f"Page near line {number} must have both id and title.")
            body = "\n".join(block.get("html", "") for block in current["blocks"] if block.get("type") == "html")
            page = {"id": current["id"], "title": current["title"], "category": current["category"]}
            if current["summary"]:
                page["summary"] = current["summary"]
            # Existing articles are stored as one HTML block to preserve formatting.
            if body:
                page["body"] = body
            pages.append(page)
            current = None
            continue
        if stripped == "[HTML]":
            if current is None:
                fail(f"Line {number}: [HTML] must be inside a [PAGE].")
            in_html = True
            html_lines = []
            continue
        if current is None or not stripped or stripped.startswith("#"):
            continue
        if ":" in line:
            key, value = line.split(":", 1)
            key = key.strip().lower()
            value = value.strip()
            if key in {"id", "title", "category", "summary"}:
                current[key] = value
            else:
                fail(f"Line {number}: unknown page field {key!r}.")

    if in_html:
        fail("File ended before [END HTML].")
    if current is not None:
        fail("File ended before [END PAGE].")
    if not pages:
        fail("No pages found in rules source.")
    ids = [page["id"] for page in pages]
    if len(ids) != len(set(ids)):
        fail("Duplicate page IDs found in rules.txt.")
    return {"pages": pages}


def load_json(path, default):
    if not path.exists():
        return default
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        fail(f"Invalid JSON in {path}: {exc}")


def parse_changes(path):
    if not path.exists():
        return {"changes": []}
    lines = path.read_text(encoding="utf-8").splitlines()
    changes, current = [], None
    for number, line in enumerate(lines, start=1):
        stripped = line.strip()
        if stripped == "[CHANGE]":
            if current is not None:
                fail(f"{path}:{number}: nested [CHANGE].")
            current = {"edition": "", "date": "", "section": "", "title": "", "description": ""}
        elif stripped == "[END CHANGE]":
            if current is None:
                fail(f"{path}:{number}: [END CHANGE] without [CHANGE].")
            if current["title"]:
                changes.append(current)
            current = None
        elif current is not None and ":" in line:
            key, value = line.split(":", 1)
            key = key.strip().lower()
            if key in current:
                current[key] = value.strip()
    if current is not None:
        fail(f"{path}: missing [END CHANGE].")
    return {"changes": sorted(changes, key=lambda item: item.get("date", ""), reverse=True)}


def main():
    WEBSITE_DATA.mkdir(parents=True, exist_ok=True)
    rules = parse_rules(SOURCE / "rules.txt")
    metadata = load_json(SOURCE / "metadata.json", {
        "game": "Dust & Blood", "currentEdition": "1st Edition",
        "publicationStatus": "Playtest", "lastUpdated": "2026-10-16",
        "publisher": "Blobfish"
    })
    changes = parse_changes(SOURCE / "changes.txt")

    outputs = {
        "rules.json": rules,
        "metadata.json": metadata,
        "changelog.json": changes,
    }
    for filename, data in outputs.items():
        target = WEBSITE_DATA / filename
        target.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Wrote {target.relative_to(ROOT)}")
    print(f"Done: {len(rules['pages'])} rulebook pages parsed.")


if __name__ == "__main__":
    main()
