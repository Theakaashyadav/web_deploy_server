"""Pure backup safety tests; these tests never invoke Docker or a real VPS."""

import importlib.util
import io
import json
import pathlib
import sys
import tarfile
import tempfile
import unittest
from unittest import mock


ROOT = pathlib.Path(__file__).resolve().parents[1]
SPEC = importlib.util.spec_from_file_location(
    "deployhub_runtime_volumes", ROOT / "infrastructure" / "scripts" / "runtime-volumes.py"
)
HELPER = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = HELPER
SPEC.loader.exec_module(HELPER)
TEST_TMP_ROOT = ROOT / "data" / "runtime-volume-tests"
TEST_TMP_ROOT.mkdir(parents=True, exist_ok=True)


def production_record():
    return {
        "name": "deployhub-data-project-project123",
        "archive": "volume-0000.tar.gz",
        "sha256": "a" * 64,
        "labels": {
            "io.deployhub.managed": "1",
            "io.deployhub.installation": "installation-123",
            "io.deployhub.project": "project123",
            "io.deployhub.environment": "production",
        },
    }


def option_values(arguments, option):
    values = []
    for index, argument in enumerate(arguments):
        if argument == option and index + 1 < len(arguments):
            values.append(arguments[index + 1])
        elif argument.startswith(option + "="):
            values.append(argument.split("=", 1)[1])
    return values


class RuntimeVolumeSafetyTests(unittest.TestCase):
    def archive(self, directory, members):
        target = pathlib.Path(directory) / "fixture.tar.gz"
        with tarfile.open(target, "w:gz") as archive:
            for name, payload, kind, mode, link in members:
                entry = tarfile.TarInfo(name)
                entry.type = kind
                entry.mode = mode
                entry.linkname = link
                if kind == tarfile.REGTYPE:
                    entry.size = len(payload)
                    archive.addfile(entry, io.BytesIO(payload))
                else:
                    archive.addfile(entry)
        return target

    def test_installation_identifier_is_bounded_and_cannot_inject_docker_filters(self):
        self.assertEqual(HELPER.validate_installation("installation-123"), "installation-123")
        for value in ("", "../other", "id,label=foreign", "id\nforeign", "x" * 129, "id/name"):
            with self.subTest(value=value), self.assertRaises(Exception):
                HELPER.validate_installation(value)

    def test_volume_manifest_belongs_to_exact_installation_and_project_namespace(self):
        record = production_record()
        self.assertEqual(HELPER.validate_volume_record(record, "installation-123")["name"], record["name"])
        for field, value in (
            ("io.deployhub.managed", "false"),
            ("io.deployhub.installation", "foreign-installation"),
            ("io.deployhub.project", "../foreign"),
            ("io.deployhub.environment", "unknown"),
        ):
            changed = production_record()
            changed["labels"][field] = value
            with self.subTest(field=field), self.assertRaises(Exception):
                HELPER.validate_volume_record(changed, "installation-123")
        for field, value in (("name", "postgres-data"), ("archive", "../outside.tar.gz"), ("sha256", "not-a-checksum")):
            changed = production_record()
            changed[field] = value
            with self.subTest(field=field), self.assertRaises(Exception):
                HELPER.validate_volume_record(changed, "installation-123")

    def test_preview_volume_requires_matching_deployment_label(self):
        record = production_record()
        record["name"] = "deployhub-data-preview-dpl-123456abcdef"
        record["labels"]["io.deployhub.environment"] = "preview"
        record["labels"]["io.deployhub.deployment"] = "dpl-123456abcdef"
        self.assertEqual(HELPER.validate_volume_record(record, "installation-123")["name"], record["name"])
        del record["labels"]["io.deployhub.deployment"]
        with self.assertRaises(Exception):
            HELPER.validate_volume_record(record, "installation-123")

    def test_regular_sqlite_and_application_files_are_validated_without_extraction(self):
        with tempfile.TemporaryDirectory(prefix="deployhub-backup-test-", dir=TEST_TMP_ROOT) as directory:
            archive = self.archive(directory, [
                (".", b"", tarfile.DIRTYPE, 0o700, ""),
                ("./site.db", b"SQLite format 3\0", tarfile.REGTYPE, 0o600, ""),
                ("./site.db-wal", b"wal", tarfile.REGTYPE, 0o600, ""),
                ("./uploads", b"", tarfile.DIRTYPE, 0o700, ""),
                ("./uploads/photo.bin", b"application data", tarfile.REGTYPE, 0o600, ""),
            ])
            result = HELPER.validate_archive(archive)
            self.assertGreaterEqual(result["files"], 3)
            self.assertEqual(result["totalBytes"], len(b"SQLite format 3\0walapplication data"))
            self.assertEqual(sorted(item.name for item in pathlib.Path(directory).iterdir()), ["fixture.tar.gz"])

    def test_archive_paths_cannot_escape_restored_volume(self):
        for name in ("../outside", "/etc/passwd", "safe/../../outside", "safe\\..\\outside", "a" * 4097):
            with self.subTest(name=name[:50]), tempfile.TemporaryDirectory(prefix="deployhub-backup-test-", dir=TEST_TMP_ROOT) as directory:
                archive = self.archive(directory, [(name, b"bad", tarfile.REGTYPE, 0o600, "")])
                with self.assertRaises(Exception):
                    HELPER.validate_archive(archive)

    def test_archive_links_devices_and_fifos_are_rejected(self):
        for kind, link in ((tarfile.SYMTYPE, "/etc/passwd"), (tarfile.LNKTYPE, "site.db"), (tarfile.CHRTYPE, ""), (tarfile.BLKTYPE, ""), (tarfile.FIFOTYPE, "")):
            with self.subTest(kind=kind), tempfile.TemporaryDirectory(prefix="deployhub-backup-test-", dir=TEST_TMP_ROOT) as directory:
                archive = self.archive(directory, [("unsafe", b"", kind, 0o600, link)])
                with self.assertRaises(Exception):
                    HELPER.validate_archive(archive)

    def test_archive_budget_counts_uncompressed_bytes_and_rejects_special_permissions(self):
        with tempfile.TemporaryDirectory(prefix="deployhub-backup-test-", dir=TEST_TMP_ROOT) as directory:
            archive = self.archive(directory, [("site.db", b"\0" * 2048, tarfile.REGTYPE, 0o600, "")])
            with self.assertRaises(Exception):
                HELPER.validate_archive(archive, max_bytes=1024)
        for kind, mode in ((tarfile.REGTYPE, 0o4755), (tarfile.REGTYPE, 0o000), (tarfile.DIRTYPE, 0o000)):
            with self.subTest(kind=kind, mode=oct(mode)), tempfile.TemporaryDirectory(prefix="deployhub-backup-test-", dir=TEST_TMP_ROOT) as directory:
                archive = self.archive(directory, [("unsafe", b"data" if kind == tarfile.REGTYPE else b"", kind, mode, "")])
                with self.assertRaises(Exception):
                    HELPER.validate_archive(archive)

    def test_export_container_is_read_only_non_root_and_has_no_network_or_socket(self):
        arguments = HELPER.build_export_args("deployhub-data-project-project123", "node:22-bookworm")
        self.assertIn("run", arguments)
        self.assertIn("node:22-bookworm", arguments)
        self.assertEqual(option_values(arguments, "--user"), ["1000:1000"])
        self.assertEqual(option_values(arguments, "--network"), ["none"])
        self.assertEqual(option_values(arguments, "--cap-drop"), ["ALL"])
        self.assertIn("--read-only", arguments)
        mounts = option_values(arguments, "--mount")
        self.assertEqual(len(mounts), 1)
        self.assertIn("type=volume", mounts[0])
        self.assertIn("src=deployhub-data-project-project123", mounts[0])
        self.assertIn("readonly", mounts[0])
        self.assertNotIn("--privileged", arguments)
        self.assertFalse(any("docker.sock" in argument for argument in arguments))

    def test_restore_container_is_confined_to_fresh_volume_with_only_chown_capability(self):
        arguments = HELPER.build_restore_args("deployhub-data-project-project123", "node:22-bookworm")
        self.assertIn("run", arguments)
        self.assertEqual(option_values(arguments, "--user"), ["0:0"])
        self.assertEqual(option_values(arguments, "--network"), ["none"])
        self.assertEqual(option_values(arguments, "--cap-drop"), ["ALL"])
        self.assertEqual(option_values(arguments, "--cap-add"), ["CHOWN"])
        self.assertIn("--read-only", arguments)
        self.assertIn("--interactive", arguments, "Docker must receive the streamed archive on stdin")
        mounts = option_values(arguments, "--mount")
        self.assertEqual(len(mounts), 1)
        self.assertIn("type=volume", mounts[0])
        self.assertIn("src=deployhub-data-project-project123", mounts[0])
        self.assertNotIn("readonly", mounts[0])
        self.assertIn("chown", " ".join(arguments))
        self.assertNotIn("--privileged", arguments)
        self.assertFalse(any("docker.sock" in argument for argument in arguments))

    def test_existing_destination_volume_is_refused_before_any_write(self):
        record = production_record()
        with tempfile.TemporaryDirectory(prefix="deployhub-backup-test-", dir=TEST_TMP_ROOT) as directory:
            with mock.patch.object(HELPER, "load_manifest", return_value=[record]), \
                    mock.patch.object(HELPER, "require_helper_image"), \
                    mock.patch.object(HELPER, "docker", return_value=record["name"] + "\nforeign-volume") as docker, \
                    mock.patch.object(HELPER, "run") as run:
                with self.assertRaisesRegex(ValueError, "fresh volumes"):
                    HELPER.restore(pathlib.Path(directory), "installation-123", "node:22-bookworm", 1024)
                docker.assert_called_once_with("volume", "ls", "--quiet")
                run.assert_not_called()

    def test_failed_export_restarts_exactly_the_previously_running_owned_writers(self):
        writers = ["abcdef012345", "fedcba543210"]
        with tempfile.TemporaryDirectory(prefix="deployhub-backup-test-", dir=TEST_TMP_ROOT) as directory:
            target = pathlib.Path(directory) / "snapshot"
            with mock.patch.object(HELPER, "owned_volumes", return_value=[production_record()]), \
                    mock.patch.object(HELPER, "require_helper_image"), \
                    mock.patch.object(HELPER, "running_writers", return_value=writers), \
                    mock.patch.object(HELPER, "docker") as docker, \
                    mock.patch.object(HELPER, "run", side_effect=RuntimeError("fixture export failure")):
                with self.assertRaisesRegex(RuntimeError, "fixture export failure"):
                    HELPER.backup(target, "installation-123", "node:22-bookworm", 1024)
                self.assertEqual(docker.mock_calls, [
                    mock.call("stop", "--time", "30", writers[0]),
                    mock.call("stop", "--time", "30", writers[1]),
                    mock.call("start", writers[0]),
                    mock.call("start", writers[1]),
                ])

    def test_missing_trusted_helper_image_does_not_stop_applications(self):
        with tempfile.TemporaryDirectory(prefix="deployhub-backup-test-", dir=TEST_TMP_ROOT) as directory:
            with mock.patch.object(HELPER, "owned_volumes", return_value=[production_record()]), \
                    mock.patch.object(HELPER, "require_helper_image", side_effect=RuntimeError("image not cached")), \
                    mock.patch.object(HELPER, "docker") as docker:
                with self.assertRaisesRegex(RuntimeError, "image not cached"):
                    HELPER.backup(pathlib.Path(directory) / "snapshot", "installation-123", "node:22-bookworm", 1024)
                docker.assert_not_called()

    def test_foreign_writer_on_an_owned_volume_causes_refusal_without_stopping_it(self):
        identity = "abcdef012345"
        foreign_labels = {
            "io.deployhub.managed": "1",
            "io.deployhub.installation": "another-installation",
        }

        def fake_docker(*arguments):
            if arguments[0] == "ps":
                filters = [arguments[index + 1] for index, value in enumerate(arguments) if value == "--filter"]
                for condition in filters:
                    if condition.startswith("label="):
                        label, value = condition[len("label="):].split("=", 1)
                        if foreign_labels.get(label) != value:
                            return ""  # Model Docker excluding a foreign writer when filtered too early.
                return identity
            if arguments[:3] == ("inspect", "--format", "{{json .Config.Labels}}"):
                return json.dumps(foreign_labels)
            if arguments[:3] == ("inspect", "--format", "{{.Name}}"):
                return "/deployhub-runtime-dpl-123456abcdef"
            raise AssertionError("Unexpected Docker operation in read-only writer discovery: " + repr(arguments))

        with mock.patch.object(HELPER, "docker", side_effect=fake_docker):
            with self.assertRaisesRegex(ValueError, "ownership"):
                HELPER.running_writers([production_record()], "installation-123")


if __name__ == "__main__":
    unittest.main()
