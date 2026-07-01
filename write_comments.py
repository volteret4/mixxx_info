#!/usr/bin/env python3
"""
Write custom_tags from library.json back into audio file metadata AND Mixxx DB.

Usage:
    python write_comments.py [--dry-run] [--input library.json]
    python write_comments.py --mixxx-only   # skip files, only fix Mixxx DB
    python write_comments.py --dry-run      # preview all changes

⚠  Close Mixxx before running this script.
"""
import json
import sqlite3
from pathlib import Path

import click
from mutagen import File as MutagenFile
from mutagen.id3 import COMM

MIXXX_DB = Path.home() / ".mixxx/mixxxdb.sqlite"


def _update_files(data: list[dict], dry_run: bool) -> tuple[int, int, int, int]:
    ok = cleared = errors = skipped = 0
    for entry in data:
        path = Path(entry["file_path"])
        comment_value = " ".join(entry.get("custom_tags") or [])

        if not path.exists():
            skipped += 1
            continue
        try:
            audio = MutagenFile(path)
            if audio is None or audio.tags is None:
                skipped += 1
                continue

            suffix = path.suffix.lower()

            if suffix in (".flac", ".ogg", ".opus"):
                current = (audio.tags.get("comment") or [""])[0]
                if current == comment_value:
                    skipped += 1
                    continue
                action = "write" if comment_value else "clear"
                display = comment_value if comment_value else "(deleted)"
                prefix = "DRY " if dry_run else "OK  "
                click.echo(f"  {prefix}{action:5}  {path.name}: {current!r} → {display!r}")
                if not dry_run:
                    if comment_value:
                        audio.tags["comment"] = [comment_value]
                    else:
                        for k in [k for k in audio.tags.keys() if k.lower() == "comment"]:
                            del audio.tags[k]
                    audio.save()

            elif suffix in (".mp3", ".aiff", ".aif"):
                frames = audio.tags.getall("COMM") if hasattr(audio.tags, "getall") else []
                current = frames[0].text[0] if frames else ""
                if current == comment_value:
                    skipped += 1
                    continue
                action = "write" if comment_value else "clear"
                display = comment_value if comment_value else "(deleted)"
                prefix = "DRY " if dry_run else "OK  "
                click.echo(f"  {prefix}{action:5}  {path.name}: {current!r} → {display!r}")
                if not dry_run:
                    audio.tags.delall("COMM")
                    if comment_value:
                        audio.tags.add(COMM(encoding=3, lang="eng", desc="", text=[comment_value]))
                    audio.save()
            else:
                skipped += 1
                continue

            if comment_value:
                ok += 1
            else:
                cleared += 1

        except Exception as e:
            click.echo(f"  ERR  {path.name}: {e}")
            errors += 1

    return ok, cleared, skipped, errors


def _update_mixxx(data: list[dict], dry_run: bool) -> tuple[int, int, int]:
    if not MIXXX_DB.exists():
        click.echo(f"  Mixxx DB not found at {MIXXX_DB}")
        return 0, 0, 0

    conn = sqlite3.connect(str(MIXXX_DB))
    conn.row_factory = sqlite3.Row

    # Build lookup: absolute path → comment_value
    path_to_comment: dict[str, str] = {
        entry["file_path"]: " ".join(entry.get("custom_tags") or [])
        for entry in data
    }

    rows = conn.execute(
        "SELECT l.id, l.comment, tl.location "
        "FROM library l JOIN track_locations tl ON l.location = tl.id "
        "WHERE l.mixxx_deleted = 0"
    ).fetchall()

    updated = cleared = skipped = 0
    for row in rows:
        file_path = row["location"]
        if file_path not in path_to_comment:
            continue  # file not in our library.json
        new_comment = path_to_comment[file_path]
        old_comment = row["comment"] or ""
        if old_comment == new_comment:
            skipped += 1
            continue

        action = "write" if new_comment else "clear"
        display = new_comment if new_comment else "(deleted)"
        prefix = "DRY " if dry_run else "DB  "
        click.echo(f"  {prefix}{action:5}  {Path(file_path).name}: {old_comment!r} → {display!r}")
        if not dry_run:
            conn.execute(
                "UPDATE library SET comment = ? WHERE id = ?",
                (new_comment, row["id"])
            )
        if new_comment:
            updated += 1
        else:
            cleared += 1

    if not dry_run:
        conn.commit()
    conn.close()
    return updated, cleared, skipped


@click.command()
@click.option("--input", "input_file", default="library.json", show_default=True)
@click.option("--dry-run", is_flag=True, help="Preview changes without writing.")
@click.option("--mixxx-only", is_flag=True, help="Skip audio files, only update Mixxx DB.")
def main(input_file, dry_run, mixxx_only):
    data = json.loads(Path(input_file).read_text(encoding="utf-8"))
    click.echo(f"{len(data)} entries in {input_file}")

    if not mixxx_only:
        click.echo("\n── Audio files ──────────────────────────────")
        f_ok, f_cleared, f_skipped, f_errors = _update_files(data, dry_run)
        verb = "Would" if dry_run else "Done"
        click.echo(f"{verb}: written={f_ok}  cleared={f_cleared}  unchanged={f_skipped}  errors={f_errors}")

    click.echo("\n── Mixxx DB ─────────────────────────────────")
    if not dry_run:
        click.echo("⚠  Make sure Mixxx is closed!")
    m_updated, m_cleared, m_skipped = _update_mixxx(data, dry_run)
    verb = "Would" if dry_run else "Done"
    click.echo(f"{verb}: written={m_updated}  cleared={m_cleared}  unchanged={m_skipped}")


if __name__ == "__main__":
    main()
