#!/usr/bin/env python3
"""Internal link-integrity checker for the meeseeks-wiki.

Walks every `.md` file under a wiki root, resolves each relative markdown
link against the filesystem, and reports any that don't point at a real
file. Skips `http(s)://` links and same-page `#anchor` links, since neither
resolves on disk. URL-encoded paths (e.g. `Claude%20Context.md`) are decoded
before resolution. Uses only stdlib.

This is the "verify link integrity" step from the wiki's Lint operation
(see wiki/CLAUDE.md) made repeatable instead of hand-rewritten each time.

Usage:
    python3 check-links.py [root]

`root` defaults to `../meeseeks-wiki` relative to this script's directory.
Exit code is 1 if any broken link is found, 0 otherwise.
"""

from __future__ import annotations

import argparse
import os
import re
import sys
import urllib.parse

LINK_RE = re.compile(r"\]\(([^)]+)\)")


def find_broken_links(root: str) -> list[tuple[str, str, str]]:
    broken: list[tuple[str, str, str]] = []
    for dirpath, _dirnames, filenames in os.walk(root):
        for name in filenames:
            if not name.endswith(".md"):
                continue
            path = os.path.join(dirpath, name)
            text = open(path, encoding="utf-8").read()
            for match in LINK_RE.finditer(text):
                link = match.group(1).strip()
                if link.startswith(("http://", "https://", "#", "mailto:")):
                    continue
                target_part = link.split("#", 1)[0]
                if not target_part:
                    continue
                target_part = urllib.parse.unquote(target_part)
                resolved = os.path.normpath(
                    os.path.join(os.path.dirname(path), target_part)
                )
                if not os.path.exists(resolved):
                    rel_path = os.path.relpath(path, root)
                    broken.append((rel_path, link, resolved))
    return broken


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    default_root = os.path.normpath(
        os.path.join(os.path.dirname(__file__), "..", "meeseeks-wiki")
    )
    parser.add_argument(
        "root", nargs="?", default=default_root, help="wiki root to scan"
    )
    args = parser.parse_args()

    broken = find_broken_links(args.root)
    if not broken:
        print(f"OK: no broken internal links under {args.root}")
        return 0

    print(f"BROKEN LINKS ({len(broken)}) under {args.root}:")
    for source_file, link, resolved in broken:
        print(f"  {source_file}: [{link}] -> {resolved}")
    return 1


if __name__ == "__main__":
    sys.exit(main())
