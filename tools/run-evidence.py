#!/usr/bin/env python3
"""
Capture revision-bound command evidence. Requires POSIX, Python 3.10+, and Git.

See EVIDENCE-SCHEMA.md for the trust boundary, schema, and acceptance rules.
The evidence directory must be outside the worktree and Git metadata directory.
"""
import argparse
import fcntl
import hashlib
import json
import math
import os
import platform
import re
import signal
import stat
import subprocess
import sys
import tempfile
from datetime import datetime, timezone
from pathlib import Path

SCHEMA_VERSION = 1
ID_RE = re.compile(r"[A-Za-z0-9][A-Za-z0-9._-]{0,127}\Z")
SHA_RE = re.compile(r"(?:[0-9a-f]{40}|[0-9a-f]{64})\Z")
ENV_RE = re.compile(r"[A-Za-z_][A-Za-z0-9_]*\Z")
SEED_NAMES = {
    "SEED", "TEST_SEED", "RANDOM_SEED", "PYTHONHASHSEED", "HYPOTHESIS_SEED"
}
ENV_NAMES = {
    "PATH", "LANG", "LC_ALL", "LC_CTYPE", "TZ", "CI",
    "VIRTUAL_ENV", "CONDA_PREFIX",
}
MAX_RECORD_BYTES = 32 * 1024 * 1024


class EvidenceError(Exception):
    pass


def require(condition, message):
    if not condition:
        raise EvidenceError(message)


def canonical(value):
    return (
        json.dumps(
            value, sort_keys=True, separators=(",", ":"),
            ensure_ascii=True, allow_nan=False,
        ) + "\n"
    ).encode("ascii")


def digest(data):
    return hashlib.sha256(data).hexdigest()


def now():
    return datetime.now(timezone.utc).isoformat(timespec="microseconds")


def utf8(data):
    try:
        return data.decode("utf-8", errors="strict")
    except UnicodeDecodeError as exc:
        raise EvidenceError("Git paths and metadata must be valid UTF-8") from exc


def within(path, parent):
    return path == parent or parent in path.parents


def fsync_dir(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def plain_file(path):
    st = path.lstat()
    require(stat.S_ISREG(st.st_mode), f"Not a regular, non-symlink file: {path}")
    return st


def file_signature(st):
    return (st.st_dev, st.st_ino, st.st_size, st.st_mtime_ns, st.st_ctime_ns)


def hash_file(path):
    before = plain_file(path)
    h = hashlib.sha256()
    count = 0
    with path.open("rb") as stream:
        require(
            file_signature(os.fstat(stream.fileno())) == file_signature(before),
            f"File changed before reading: {path}",
        )
        while chunk := stream.read(1024 * 1024):
            h.update(chunk)
            count += len(chunk)
        after = os.fstat(stream.fileno())
    require(
        file_signature(before) == file_signature(after)
        == file_signature(plain_file(path)),
        f"File changed while reading: {path}",
    )
    require(count == before.st_size, f"Short read: {path}")
    return h.hexdigest(), count


def make_directory(path):
    path.mkdir(mode=0o700, parents=True, exist_ok=True)
    require(
        stat.S_ISDIR(path.lstat().st_mode),
        f"Not a real directory: {path}",
    )


def publish_file(source, destination):
    """Atomic, no-overwrite publication on one filesystem."""
    os.link(source, destination)
    fsync_dir(destination.parent)


def store_object(source, object_dir):
    """Snapshot a file into a SHA-256-addressed, retained raw artifact."""
    before = plain_file(source)
    fd, temporary = tempfile.mkstemp(prefix=".object-", dir=object_dir)
    temporary = Path(temporary)
    try:
        h = hashlib.sha256()
        size = 0
        with source.open("rb") as reader, os.fdopen(fd, "wb") as writer:
            require(
                file_signature(os.fstat(reader.fileno())) == file_signature(before),
                f"Artifact changed before capture: {source}",
            )
            while chunk := reader.read(1024 * 1024):
                h.update(chunk)
                size += len(chunk)
                writer.write(chunk)
            after = os.fstat(reader.fileno())
            writer.flush()
            os.fsync(writer.fileno())
        require(
            file_signature(before) == file_signature(after)
            == file_signature(plain_file(source)),
            f"Artifact changed during capture: {source}",
        )
        require(size == before.st_size, f"Short artifact read: {source}")
        sha = h.hexdigest()
        destination = object_dir / sha
        try:
            publish_file(temporary, destination)
        except FileExistsError:
            require(
                hash_file(destination) == (sha, size),
                f"Corrupt existing artifact: {destination}",
            )
        return {
            "sha256": sha,
            "bytes": size,
            "object": f"objects/sha256/{sha}",
        }
    finally:
        temporary.unlink(missing_ok=True)


class Git:
    def __init__(self, root, env):
        self.root = root
        self.env = env

    def __call__(self, *args, input_data=None):
        result = subprocess.run(
            [
                "git", "--no-optional-locks",
                "-c", "core.fsmonitor=false",
                "-c", "core.untrackedCache=false",
                "-C", str(self.root), *args,
            ],
            input=input_data, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
            env=self.env, check=False,
        )
        require(
            result.returncode == 0,
            f"Git failed ({' '.join(args)}): "
            f"{result.stderr.decode('utf-8', errors='replace').strip()}",
        )
        return result.stdout

    def commit(self, revision):
        value = utf8(self(
            "rev-parse", "--verify", "--end-of-options", revision + "^{commit}"
        )).strip()
        require(SHA_RE.fullmatch(value), "Git returned an invalid commit ID")
        return value

    def clean(self):
        status = self(
            "status", "--porcelain=v1", "-z", "--untracked-files=all",
            "--ignore-submodules=none",
        )
        require(
            not status,
            "Worktree/index is dirty or has non-ignored untracked files",
        )

    def tree(self, revision):
        result = {}
        for entry in self("ls-tree", "-r", "-z", "--full-tree", revision).split(b"\0"):
            if not entry:
                continue
            metadata, path = entry.split(b"\t", 1)
            mode, kind, oid = utf8(metadata).split()
            require(kind == "blob", "Submodules/gitlinks are not supported")
            require(SHA_RE.fullmatch(oid), "Invalid tree object ID")
            name = utf8(path)
            require(name not in result, "Duplicate tree path")
            result[name] = {"mode": mode, "blob": oid}
        return result

    def changes(self, base, head):
        old_tree, new_tree = self.tree(base), self.tree(head)
        raw = self(
            "diff", "--no-ext-diff", "--no-textconv",
            "--name-status", "-z", "--find-renames=50%",
            base, head, "--",
        )
        fields = raw.split(b"\0")
        require(fields[-1] == b"", "Malformed Git diff output")
        fields.pop()
        changes = []
        verified = set()

        def side(tree, path):
            if path is None:
                return None
            require(path in tree, f"Diff path missing from tree: {path}")
            item = tree[path]
            oid = item["blob"]
            if oid not in verified:
                content = self("cat-file", "blob", oid)
                observed = utf8(self(
                    "hash-object", "--stdin", input_data=content
                )).strip()
                require(observed == oid, f"Blob verification failed: {oid}")
                verified.add(oid)
            return {"path": path, "mode": item["mode"], "blob": oid}

        index = 0
        while index < len(fields):
            status_code = utf8(fields[index])
            index += 1
            require(
                re.fullmatch(r"(?:[ADMT]|R[0-9]{1,3})", status_code),
                f"Unsupported diff status: {status_code}",
            )
            needed = 2 if status_code.startswith("R") else 1
            require(index + needed <= len(fields), "Truncated Git diff output")
            names = [utf8(x) for x in fields[index:index + needed]]
            index += needed
            if status_code.startswith("R"):
                old_path, new_path = names
            elif status_code == "A":
                old_path, new_path = None, names[0]
            elif status_code == "D":
                old_path, new_path = names[0], None
            else:
                old_path = new_path = names[0]
            changes.append({
                "status": status_code,
                "old": side(old_tree, old_path),
                "new": side(new_tree, new_path),
            })
        changes.sort(key=lambda item: (
            item["new"]["path"] if item["new"] else item["old"]["path"],
            item["status"],
        ))
        return changes


def output_fingerprint(record):
    return digest(canonical({
        "exit_code": record["execution"]["exit_code"],
        "timed_out": record["execution"]["timed_out"],
        "outputs": record["outputs"],
    }))


def strict_json(data):
    def pairs(items):
        value = {}
        for key, item in items:
            require(key not in value, f"Duplicate JSON key: {key}")
            value[key] = item
        return value

    def bad_constant(value):
        raise EvidenceError(f"Non-finite JSON number: {value}")

    return json.loads(data, object_pairs_hook=pairs, parse_constant=bad_constant)


def validate_prior(path, repository_id, head, evidence_dir):
    plain_file(path)
    require(path.stat().st_size <= MAX_RECORD_BYTES, f"Oversized record: {path}")
    raw = path.read_bytes()
    record = strict_json(raw)
    require(canonical(record) == raw, f"Noncanonical record: {path}")
    require(record["schema_version"] == SCHEMA_VERSION, f"Unknown schema: {path}")
    require(record["repository"]["id"] == repository_id, f"Wrong repository: {path}")
    require(record["revision"]["head"] == head, f"Wrong revision: {path}")
    require(
        path.name == record["assertions"]["run_id"] + ".json",
        f"Run ID/filename mismatch: {path}",
    )
    require(
        record["output_fingerprint_sha256"] == output_fingerprint(record),
        f"Invalid output fingerprint: {path}",
    )
    outputs = record["outputs"]
    artifacts = [outputs["stdout"], outputs["stderr"]]
    artifacts.extend(item["artifact"] for item in outputs["log_artifacts"])
    for artifact in artifacts:
        sha = artifact["sha256"]
        require(re.fullmatch(r"[0-9a-f]{64}", sha), f"Invalid artifact hash: {path}")
        require(
            artifact["object"] == f"objects/sha256/{sha}",
            f"Invalid artifact location: {path}",
        )
        require(
            hash_file(evidence_dir / artifact["object"])
            == (sha, artifact["bytes"]),
            f"Missing or corrupt retained artifact referenced by {path}",
        )
    return record


def write_record(record, evidence_dir):
    repository_id = record["repository"]["id"]
    head = record["revision"]["head"]
    directory = evidence_dir / "records" / repository_id / head
    make_directory(directory)
    lock_path = directory / ".lock"
    fd = os.open(lock_path, os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
    with os.fdopen(fd, "r+b") as lock:
        require(stat.S_ISREG(os.fstat(lock.fileno()).st_mode), "Invalid lock file")
        fcntl.flock(lock, fcntl.LOCK_EX)
        destination = directory / (record["assertions"]["run_id"] + ".json")
        for prior_path in sorted(directory.iterdir()):
            if prior_path.name == ".lock":
                continue
            require(
                prior_path.suffix == ".json",
                f"Unexpected evidence-store entry; manual inspection required: {prior_path}",
            )
            prior = validate_prior(prior_path, repository_id, head, evidence_dir)
            require(
                prior["output_fingerprint_sha256"]
                == record["output_fingerprint_sha256"],
                "Tamper check refused publication: this repository/head already "
                "has different output, log artifacts, exit code, or timeout status",
            )
        require(not destination.exists(), f"Run ID already recorded: {destination}")
        data = canonical(record)
        require(len(data) <= MAX_RECORD_BYTES, "Evidence record exceeds size limit")
        # Place staging files outside the record namespace. A crash cannot leave
        # an apparently valid partial JSON record.
        fd, temporary = tempfile.mkstemp(prefix=".record-", dir=evidence_dir)
        temporary = Path(temporary)
        try:
            with os.fdopen(fd, "wb") as stream:
                stream.write(data)
                stream.flush()
                os.fsync(stream.fileno())
            publish_file(temporary, destination)
        finally:
            temporary.unlink(missing_ok=True)
        return destination, digest(data)


def execute(command, shell, root, env, stdout_path, stderr_path, timeout):
    with stdout_path.open("xb") as stdout, stderr_path.open("xb") as stderr:
        started = now()
        process = subprocess.Popen(
            [str(shell), "-c", command],
            cwd=root, env=env, stdin=subprocess.DEVNULL,
            stdout=stdout, stderr=stderr, start_new_session=True,
        )
        timed_out = False
        try:
            try:
                code = process.wait(timeout=timeout)
            except subprocess.TimeoutExpired:
                timed_out = True
                os.killpg(process.pid, signal.SIGKILL)
                code = process.wait()
        finally:
            # Background children in the original process group must not keep
            # appending to the captured logs after the command has finished.
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            if process.poll() is None:
                process.wait()
        ended = now()
        stdout.flush()
        stderr.flush()
        os.fsync(stdout.fileno())
        os.fsync(stderr.fileno())
    return {
        "command": command,
        "shell": str(shell),
        "argv": [str(shell), "-c", command],
        "cwd": str(root),
        "stdin": "DEVNULL",
        "start_timestamp": started,
        "end_timestamp": ended,
        "exit_code": code,
        "timed_out": timed_out,
        "timeout_seconds": timeout,
    }


def parse_args():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repo", required=True, type=Path, help="Worktree root")
    parser.add_argument("--base", required=True, help="Base commit/revision")
    parser.add_argument("--evidence-dir", required=True, type=Path)
    parser.add_argument("--task-id", required=True)
    parser.add_argument("--run-id", required=True, help="Unique, filesystem-safe ID")
    parser.add_argument("--parent-task-id")
    parser.add_argument("--agent-id", required=True)
    parser.add_argument("--model-id", required=True)
    parser.add_argument("--governance-config-version", required=True)
    parser.add_argument("--governance-config", required=True, type=Path)
    parser.add_argument("--command", required=True, help="Exact shell command string")
    parser.add_argument("--shell", type=Path, default=Path("/bin/sh"))
    parser.add_argument("--timeout", type=float, default=3600.0)
    parser.add_argument(
        "--env", action="append", default=[], metavar="NAME",
        help="Additional environment variable to record; may expose secrets",
    )
    parser.add_argument(
        "--seed-env", action="append", default=[], metavar="NAME",
        help="Additional seed environment variable to record",
    )
    parser.add_argument(
        "--log-artifact", action="append", default=[], type=Path,
        help="New log file produced by the command; relative to worktree root",
    )
    return parser.parse_args()


def run(args):
    os.umask(0o077)
    require(ID_RE.fullmatch(args.run_id), "Invalid --run-id")
    for name in ("task_id", "agent_id", "model_id", "governance_config_version"):
        require(bool(getattr(args, name).strip()), f"Empty --{name.replace('_', '-')}")
    if args.parent_task_id is not None:
        require(bool(args.parent_task_id.strip()), "Empty --parent-task-id")
    require(bool(args.command.strip()), "Empty command")
    require(math.isfinite(args.timeout) and args.timeout > 0, "Invalid timeout")
    for name in args.env + args.seed_env:
        require(ENV_RE.fullmatch(name), f"Invalid environment variable name: {name}")

    # The command and metadata queries use the same ordinary inherited
    # environment, except Git redirection/config injection variables are removed.
    removed_git_vars = sorted(name for name in os.environ if name.startswith("GIT_"))
    env = {key: value for key, value in os.environ.items() if not key.startswith("GIT_")}
    env["GIT_NO_REPLACE_OBJECTS"] = "1"

    root = args.repo.resolve(strict=True)
    require(root.is_dir(), "Repository path is not a directory")
    git = Git(root, env)
    observed_root = Path(utf8(git("rev-parse", "--show-toplevel")).strip()).resolve()
    require(root == observed_root, "--repo must be the worktree root")
    require(
        utf8(git("rev-parse", "--is-bare-repository")).strip() == "false",
        "A non-bare worktree is required",
    )
    common_raw = Path(utf8(git("rev-parse", "--git-common-dir")).strip())
    common = (root / common_raw).resolve()
    git_dir = Path(utf8(git("rev-parse", "--absolute-git-dir")).strip()).resolve()
    evidence_dir = args.evidence_dir.resolve()
    for protected in (root, common, git_dir):
        require(
            not within(evidence_dir, protected),
            f"Evidence directory must be outside {protected}",
        )
    make_directory(evidence_dir)
    objects = evidence_dir / "objects" / "sha256"
    make_directory(objects)

    shell = args.shell.resolve(strict=True)
    require(shell.is_file() and os.access(shell, os.X_OK), "Shell is not executable")
    config = args.governance_config.resolve(strict=True)
    config_hash = hash_file(config)
    wrapper = Path(__file__).resolve(strict=True)
    wrapper_hash = hash_file(wrapper)

    head = git.commit("HEAD")
    base = git.commit(args.base)
    git("merge-base", "--is-ancestor", base, head)
    git.clean()
    changed_files = git.changes(base, head)

    repository_id = digest(canonical({
        "identity_scheme": "local-git-common-dir-v1",
        "git_common_dir": str(common),
    }))
    repository = {
        "id": repository_id,
        "identity_scheme": "local-git-common-dir-v1",
        "repository_path": str(common),
        "worktree_path": str(root),
        "git_dir": str(git_dir),
        "object_format": utf8(git("rev-parse", "--show-object-format")).strip(),
    }

    artifact_paths = []
    for requested in args.log_artifact:
        path = (root / requested).resolve()
        require(not os.path.lexists(path), f"Log artifact already exists: {path}")
        require(
            not within(path, evidence_dir),
            "Command-produced artifacts must not be inside the evidence store",
        )
        artifact_paths.append(path)
    require(len(set(artifact_paths)) == len(artifact_paths), "Duplicate log artifact")

    selected_names = sorted(
        ENV_NAMES | SEED_NAMES | set(args.env) | set(args.seed_env)
        | {"GIT_NO_REPLACE_OBJECTS"}
    )
    seed_names = sorted(SEED_NAMES | set(args.seed_env))
    environment = {
        "variables": {name: env.get(name) for name in selected_names},
        "seed_variables": {name: env.get(name) for name in seed_names},
        "removed_inherited_git_variables": removed_git_vars,
        "platform": platform.platform(),
        "python_version": platform.python_version(),
        "git_version": utf8(git("--version")).strip(),
    }

    with tempfile.TemporaryDirectory(prefix=".capture-", dir=evidence_dir) as scratch:
        stdout_path = Path(scratch) / "stdout"
        stderr_path = Path(scratch) / "stderr"
        execution = execute(
            args.command, shell, root, env,
            stdout_path, stderr_path, args.timeout,
        )
        require(git.commit("HEAD") == head, "HEAD changed during execution")
        git.clean()
        require(hash_file(config) == config_hash, "Governance config changed")
        require(hash_file(wrapper) == wrapper_hash, "Evidence wrapper changed")
        require(
            git.changes(base, head) == changed_files,
            "Revision contents changed during execution",
        )
        outputs = {
            "stdout": store_object(stdout_path, objects),
            "stderr": store_object(stderr_path, objects),
            "log_artifacts": [
                {"path": str(path), "artifact": store_object(path, objects)}
                for path in sorted(artifact_paths)
            ],
        }
        # Recheck after artifact capture, before publication.
        require(git.commit("HEAD") == head, "HEAD changed during artifact capture")
        git.clean()
        require(hash_file(config) == config_hash, "Governance config changed")
        require(hash_file(wrapper) == wrapper_hash, "Evidence wrapper changed")

        record = {
            "schema_version": SCHEMA_VERSION,
            "record_type": "revision-command-evidence",
            "assertions": {
                "task_id": args.task_id,
                "run_id": args.run_id,
                "parent_task_id": args.parent_task_id,
                "agent_id": args.agent_id,
                "model_id": args.model_id,
                "governance_config_version": args.governance_config_version,
            },
            "capture": {
                "recorded_at": now(),
                "wrapper_sha256": wrapper_hash[0],
                "wrapper_bytes": wrapper_hash[1],
            },
            "governance_config": {
                "path": str(config),
                "sha256": config_hash[0],
                "bytes": config_hash[1],
            },
            "repository": repository,
            "revision": {
                "base": base,
                "head": head,
                "base_is_ancestor": True,
                "worktree_clean_before": True,
                "worktree_clean_after": True,
                "changed_files": changed_files,
            },
            "execution": execution,
            "environment": environment,
            "outputs": outputs,
        }
        record["output_fingerprint_sha256"] = output_fingerprint(record)
        destination, record_hash = write_record(record, evidence_dir)

    print(json.dumps({
        "evidence_record": str(destination),
        "record_sha256": record_hash,
        "command_exit_code": execution["exit_code"],
        "timed_out": execution["timed_out"],
    }, sort_keys=True))
    if execution["timed_out"]:
        return 124
    code = execution["exit_code"]
    return code if 0 <= code <= 255 else min(255, 128 + abs(code))


def main():
    args = parse_args()
    try:
        return run(args)
    except KeyboardInterrupt:
        print("evidence-error: interrupted; no successful publication claimed", file=sys.stderr)
        return 130
    except Exception as exc:
        print(f"evidence-error: {type(exc).__name__}: {exc}", file=sys.stderr)
        return 125


if __name__ == "__main__":
    sys.exit(main())
