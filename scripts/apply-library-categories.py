#!/usr/bin/env python3
"""Write each free book's category from scripts/library-categories.json into its manifest.json.

Usage: python3 -I scripts/apply-library-categories.py

Fails when a book has no category or a category list names a book that does not exist.
"""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CATEGORIES = json.loads((ROOT / "scripts" / "library-categories.json").read_text(encoding="utf8"))


def main() -> None:
    problems: list[str] = []
    for lang, groups in CATEGORIES.items():
        wanted = {slug: cat for cat, slugs in groups.items() for slug in slugs}
        library = ROOT / "languages" / lang / "content" / "library"
        shipped = {p.parent.name for p in library.glob("*/manifest.json")}
        problems += [f"{lang}/{s}: no category" for s in sorted(shipped - wanted.keys())]
        problems += [f"{lang}/{s}: no such book" for s in sorted(wanted.keys() - shipped)]
        for slug, category in wanted.items():
            path = library / slug / "manifest.json"
            if not path.exists():
                continue
            manifest = json.loads(path.read_text(encoding="utf8"))
            ordered: dict = {}
            for key, value in manifest.items():
                if key == "category":
                    continue
                ordered[key] = value
                if key == "level":
                    ordered["category"] = category
            path.write_text(json.dumps(ordered, ensure_ascii=False, indent=2) + "\n", encoding="utf8")
    if problems:
        raise SystemExit("\n".join(problems))
    print("ok")


if __name__ == "__main__":
    main()
