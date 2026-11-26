#!/usr/bin/env python3
"""Back up/restore only this installation's labelled private application volumes.

The management worker must be stopped by the calling shell workflow. Uploaded
images/commands are never executed here: only a fixed trusted tar helper runs.
"""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import secrets
import signal
import subprocess
import sys
import tarfile
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parents[2]
DEFAULT_IMAGE = "node:22-bookworm"
DEFAULT_MAX_BYTES = 8 * 1024 * 1024 * 1024
PREFIX = "io.deployhub."
IDENTIFIER = re.compile(r"[A-Za-z0-9-]{1,128}\Z")
PROJECT = re.compile(r"[A-Za-z0-9-]{1,80}\Z")
DEPLOYMENT = re.compile(r"dpl-[a-z0-9-]{6,40}\Z")
ARCHIVE = re.compile(r"volume-[0-9]{4,6}\.tar\.gz\Z")
IMAGE = re.compile(r"[A-Za-z0-9][A-Za-z0-9._/:@-]{0,240}\Z")


def validate_installation(value: str) -> str:
    if not isinstance(value, str) or not IDENTIFIER.fullmatch(value):
        raise ValueError("A valid DeployHub installation ID is required")
    return value


def validate_volume_record(record: dict, installation_id: str) -> dict:
    installation_id = validate_installation(installation_id)
    if not isinstance(record, dict) or not isinstance(record.get("labels"), dict):
        raise ValueError("Invalid application-volume metadata")
    labels = record["labels"]
    if labels.get(PREFIX + "managed") != "1" or labels.get(PREFIX + "installation") != installation_id:
        raise ValueError("The application volume belongs to a different installation")
    project = labels.get(PREFIX + "project", "")
    environment = labels.get(PREFIX + "environment")
    if not isinstance(project, str) or not PROJECT.fullmatch(project):
        raise ValueError("Invalid application-volume project label")
    if environment == "production":
        expected = "deployhub-data-project-" + project.lower()
    elif environment == "preview":
        deployment = labels.get(PREFIX + "deployment", "")
        if not isinstance(deployment, str) or not DEPLOYMENT.fullmatch(deployment):
            raise ValueError("Invalid preview-volume deployment label")
        expected = "deployhub-data-preview-" + deployment
    else:
        raise ValueError("Invalid application-volume environment")
    if record.get("name") != expected:
        raise ValueError("The application-volume name does not match its ownership labels")
    if not isinstance(record.get("archive"), str) or not ARCHIVE.fullmatch(record["archive"]):
        raise ValueError("Unsafe application-volume archive name")
    if "sha256" in record and not re.fullmatch(r"[0-9a-f]{64}", str(record["sha256"])):
        raise ValueError("Invalid application-volume checksum")
    return record


def validate_archive(filename: str | Path, max_bytes: int = DEFAULT_MAX_BYTES) -> dict:
    if max_bytes <= 0:
        raise ValueError("The expanded-volume budget must be positive")
    count, size = 0, 0
    with tarfile.open(filename, "r:gz") as archive:
        for member in archive:
            count += 1
            name = member.name
            path = PurePosixPath(name)
            if (count > 1_000_000 or len(name) > 4096 or "\x00" in name or "\\" in name
                    or path.is_absolute() or ".." in path.parts):
                raise ValueError("Unsafe application-volume archive path or entry count")
            if not (member.isfile() or member.isdir()):
                raise ValueError("Application-volume archives may not contain links, devices or special files")
            if member.mode & 0o7000:
                raise ValueError("Application-volume archives may not restore special permission bits")
            if member.isdir() and (member.mode & 0o500) != 0o500:
                raise ValueError("Application-volume directories must be readable and traversable by their owner")
            if member.isfile():
                if not member.mode & 0o400:
                    raise ValueError("Application-volume files must be readable by their owner")
                size += member.size
                if size > max_bytes:
                    raise ValueError("Application-volume archive exceeds the expanded-data budget")
    return {"files": count, "totalBytes": size}


def helper_common(volume: str, image: str, restore: bool) -> list[str]:
    if not re.fullmatch(r"deployhub-data-(?:project|preview)-[a-z0-9-]{1,128}", volume):
        raise ValueError("Unsafe application-volume name")
    if not IMAGE.fullmatch(image):
        raise ValueError("Invalid trusted backup-helper image")
    return [os.environ.get("DOCKER_BIN", "docker"), "run", "--rm", *( ["--interactive"] if restore else [] ), "--pull=never", "--network", "none",
            "--read-only", "--user", "0:0" if restore else "1000:1000", "--cap-drop=ALL",
            *( ["--cap-add=CHOWN"] if restore else [] ), "--security-opt=no-new-privileges",
            "--memory", "256m", "--pids-limit", "32", "--cpus", "0.5",
            "--mount", "type=volume,src=" + volume + ",dst=/volume" + ("" if restore else ",readonly"),
            "--entrypoint", "sh" if restore else "tar", image]


def build_export_args(volume: str, image: str = DEFAULT_IMAGE) -> list[str]:
    return helper_common(volume, image, False) + ["--create", "--gzip", "--file", "-", "--directory", "/volume", "."]


def build_restore_args(volume: str, image: str = DEFAULT_IMAGE) -> list[str]:
    # Fixed code only. Archive paths were checked before this container is created.
    # CHOWN is the sole added capability, confined to a newly created named volume.
    command = "umask 077; tar --extract --gzip --file=- --directory=/volume --no-same-owner --no-same-permissions; chmod 700 /volume; chown -R 1000:1000 /volume"
    return helper_common(volume, image, True) + ["-ec", command]


def run(args: list[str], *, source=None, destination=None, check: bool = True) -> str:
    result = subprocess.run(args, stdin=source, stdout=destination if destination is not None else subprocess.PIPE,
                            stderr=subprocess.PIPE, check=False)
    if check and result.returncode:
        raise RuntimeError("Backup operation failed: " + result.stderr.decode("utf-8", "replace").strip()[-2000:])
    return result.stdout.decode("utf-8", "replace").strip() if destination is None else ""


def docker(*args: str, **kwargs) -> str:
    return run([os.environ.get("DOCKER_BIN", "docker"), *args], **kwargs)


def installation_from_database() -> str | None:
    # Constant SQL is passed as a positional argument; environment values never enter shell text.
    query = 'SELECT "value" FROM "ApplicationSetting" WHERE "key" = \'runtime:installation-id\''
    value = run([os.environ.get("DOCKER_BIN", "docker"), "compose", "exec", "-T", "postgres", "sh", "-c",
                 'exec psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tA -c "$1"', "sh", query])
    return validate_installation(value) if value else None


def sha256(filename: Path) -> str:
    digest = hashlib.sha256()
    with filename.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def owned_volumes(installation_id: str) -> list[dict]:
    names = docker("volume", "ls", "--quiet", "--filter", "label=" + PREFIX + "managed=1",
                   "--filter", "label=" + PREFIX + "installation=" + installation_id).splitlines()
    records = []
    for index, name in enumerate(sorted(names)):
        description = json.loads(docker("volume", "inspect", name))[0]
        labels = {key: value for key, value in (description.get("Labels") or {}).items() if key.startswith(PREFIX)}
        record = {"name": name, "archive": f"volume-{index:04d}.tar.gz", "labels": labels}
        records.append(validate_volume_record(record, installation_id))
    return records


def running_writers(volumes: list[dict], installation_id: str) -> list[str]:
    containers = set()
    for volume in volumes:
        # A foreign writer must make the backup fail, not be silently missed by ownership filters.
        for identity in docker("ps", "--quiet", "--filter", "volume=" + volume["name"]).splitlines():
            if not re.fullmatch(r"[0-9a-f]{12,64}", identity):
                raise ValueError("Unexpected application-container identity")
            labels = json.loads(docker("inspect", "--format", "{{json .Config.Labels}}", identity))
            name = docker("inspect", "--format", "{{.Name}}", identity).lstrip("/")
            if (labels.get(PREFIX + "managed") != "1" or labels.get(PREFIX + "installation") != installation_id
                    or not name.startswith("deployhub-runtime-dpl-")):
                raise ValueError("Refusing to stop an application container with mismatched ownership")
            containers.add(identity)
    return sorted(containers)


def require_helper_image(image: str) -> None:
    if not IMAGE.fullmatch(image):
        raise ValueError("Invalid trusted backup-helper image")
    try:
        docker("image", "inspect", image)
    except RuntimeError as error:
        raise RuntimeError(f"Trusted backup image {image} is not cached. Run docker pull {image} before backing up/restoring application data.") from error


def backup(directory: Path, installation_id: str | None, image: str, max_bytes: int) -> None:
    directory.mkdir(parents=True, exist_ok=False, mode=0o700)
    records = owned_volumes(installation_id) if installation_id else []
    manifest = {"format": 1, "installationId": installation_id, "createdAt": datetime.now(timezone.utc).isoformat(), "volumes": records}
    if records:
        require_helper_image(image)  # Never download while an application is stopped.
    writers = running_writers(records, installation_id) if installation_id else []
    try:
        for identity in writers:
            docker("stop", "--time", "30", identity)
        for record in records:
            target = directory / record["archive"]
            partial = target.with_name(target.name + ".partial")
            with partial.open("xb") as destination:
                os.chmod(partial, 0o600)
                run(build_export_args(record["name"], image), destination=destination)
            summary = validate_archive(partial, max_bytes)
            partial.replace(target)
            record.update(summary)
            record["sha256"] = sha256(target)
        manifest_path = directory / "manifest.json"
        with manifest_path.open("x", encoding="utf-8") as output:
            json.dump(manifest, output, indent=2)
            output.write("\n")
        os.chmod(manifest_path, 0o600)
    finally:
        failures = []
        for identity in writers:
            try:
                docker("start", identity)
            except Exception as error:
                failures.append(str(error))
        if failures:
            raise RuntimeError("Some previously running application containers could not restart: " + "; ".join(failures))
    print(f"Captured {len(records)} private application-data volume(s); previously running application containers restarted.")


def load_manifest(directory: Path, installation_id: str | None, max_bytes: int) -> list[dict]:
    manifest_path = directory / "manifest.json"
    if manifest_path.is_symlink() or manifest_path.stat().st_size > 1048576:
        raise ValueError("Unsafe application-volume manifest")
    manifest = json.loads(manifest_path.read_text(encoding="utf-8"))
    if manifest.get("format") != 1 or not isinstance(manifest.get("volumes"), list) or len(manifest["volumes"]) > 5000:
        raise ValueError("Unsupported application-volume backup format")
    expected = manifest.get("installationId")
    if expected != installation_id:
        raise ValueError("The backup application volumes belong to a different DeployHub installation")
    if not expected and manifest["volumes"]:
        raise ValueError("Application-volume backup has no installation identity")
    names, archives = set(), set()
    for record in manifest["volumes"]:
        validate_volume_record(record, installation_id)
        if record["name"] in names or record["archive"] in archives:
            raise ValueError("Duplicate application-volume backup record")
        names.add(record["name"]); archives.add(record["archive"])
        archive = directory / record["archive"]
        if archive.is_symlink() or archive.resolve().parent != directory.resolve():
            raise ValueError("Unsafe application-volume archive location")
        if "sha256" not in record or sha256(archive) != record["sha256"]:
            raise ValueError("Application-volume archive checksum mismatch")
        validate_archive(archive, max_bytes)
    return manifest["volumes"]


def restore(directory: Path, installation_id: str | None, image: str, max_bytes: int) -> None:
    if not directory.exists():
        print("Legacy backup contains no application-volume snapshot; no runtime data was restored.")
        return
    records = load_manifest(directory, installation_id, max_bytes)
    if records:
        require_helper_image(image)
    existing = set(docker("volume", "ls", "--quiet").splitlines())
    if any(record["name"] in existing for record in records):
        raise ValueError("Runtime restore requires fresh volumes. Existing application volumes were not overwritten.")
    created = []
    transaction = secrets.token_hex(16)
    try:
        for record in records:
            arguments = ["volume", "create"]
            for key, value in record["labels"].items():
                if key.startswith(PREFIX):
                    arguments += ["--label", key + "=" + str(value)]
            arguments += ["--label", PREFIX + "restore-transaction=" + transaction]
            docker(*arguments, record["name"])
            labels = json.loads(docker("volume", "inspect", "--format", "{{json .Labels}}", record["name"]))
            if labels.get(PREFIX + "restore-transaction") != transaction:
                raise ValueError("A destination volume appeared during restore. It was not modified or selected for cleanup.")
            created.append(record["name"])
            if docker("ps", "--all", "--quiet", "--filter", "volume=" + record["name"]):
                raise ValueError("A destination volume was attached by another process during restore; refusing extraction.")
            with (directory / record["archive"]).open("rb") as source:
                run(build_restore_args(record["name"], image), source=source)
    except BaseException:
        # Only volumes created in this transaction are eligible; no --force removes attached data.
        for name in reversed(created):
            docker("volume", "rm", name, check=False)
        raise
    print(f"Restored {len(records)} private application-data volume(s); application images are recovered by the worker from retained artifacts.")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("operation", choices=["backup", "restore"])
    parser.add_argument("directory", type=Path)
    parser.add_argument("--installation-id")
    parser.add_argument("--image", default=DEFAULT_IMAGE)
    parser.add_argument("--max-bytes", type=int, default=int(os.environ.get("MAX_RUNTIME_VOLUME_BACKUP_BYTES", DEFAULT_MAX_BYTES)))
    args = parser.parse_args()
    os.chdir(ROOT)
    if args.max_bytes <= 0:
        raise ValueError("The volume backup budget must be positive")
    installation_id = validate_installation(args.installation_id) if args.installation_id else installation_from_database()
    operation = backup if args.operation == "backup" else restore
    operation(args.directory.resolve(), installation_id, args.image, args.max_bytes)
    return 0


def interrupted(signum, _frame):
    raise SystemExit(128 + signum)


if __name__ == "__main__":
    signal.signal(signal.SIGTERM, interrupted)
    try:
        raise SystemExit(main())
    except (OSError, ValueError, RuntimeError, tarfile.TarError) as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)
