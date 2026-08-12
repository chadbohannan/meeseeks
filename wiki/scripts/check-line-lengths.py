#!/usr/bin/env python3
"""Line-length checker, chiefly for keeping log.md entries scannable.

log.md is a temporal index, not a content source (see wiki/CLAUDE.md's Log
section) — entries should stay under a soft character limit so the file
stays skimmable. This script reports any line over the threshold in a given
file (or files). Uses only stdlib.

Usage:
    python3 check-line-lengths.py log.md
    python3 check-line-lengths.py --limit 180 index.md
    python3 check-line-lengths.py log.md index.md
"""

from __future__ import annotations

import argparse
import sys


def find_long_lines(path: str, limit: int) -> list[tuple[int, int, str]]:
    long_lines: list[tuple[int, int, str]] = []
    with open(path, encoding="utf-8") as fh:
        for lineno, line in enumerate(fh, start=1):
            text = line.rstrip("\n")
            if len(text) > limit:
                long_lines.append((lineno, len(text), text))
    return long_lines


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("files", nargs="+", help="markdown files to check")
    parser.add_argument(
        "--limit",
        type=int,
        default=400,
        help="soft character limit per line (default: 400)",
    )
    args = parser.parse_args()

    any_over = False
    for path in args.files:
        long_lines = find_long_lines(path, args.limit)
        if not long_lines:
            print(f"OK: {path} has no lines over {args.limit} chars")
            continue
        any_over = True
        print(f"OVER LIMIT in {path} (limit {args.limit}):")
        for lineno, length, text in long_lines:
            preview = text if len(text) <= 100 else text[:97] + "..."
            print(f"  line {lineno} ({length} chars): {preview}")

    return 1 if any_over else 0


if __name__ == "__main__":
    sys.exit(main())
