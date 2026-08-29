# Somnium Engine — Repo Constitution

Rules binding on every agent working in this repository. Applies to Somnium
Engine only; the sibling Kronos Engine repo has its own governance and must not
be modified.

## 1. Every task writes a PM-1 trace

Every discrete task — any size or outcome — writes a PM-1 trace to
`C:\Users\think\self-harness\traces\` via the `pm1-trace` CLI before the task
counts as complete.

## 2. Failures get a failure record

Anything wrong (wrong output, wrong approach, process violation) gets a failure
record with root cause at `C:\Users\think\self-harness\failures\`. No
whitewashing.

## 3. Role boundaries

- **Orchestrator** coordinates lanes, owns git, closes tasks only after traces
  are verified.
- **Fixers** implement specific scoped changes (canon, derive core,
  timeline/diff/query/CLI, scaffold/governance).
- **Verifier** approves work against the acceptance suite and requirements.
- **Oracle / reviewers** advise and critique; they do not produce output.
  Crossing a boundary without explicit approval is a nonconformity; record it.

## 4. No synthetic records

Traces and failure records must come from real execution. Fabricating records
is a policy violation and voids the record.

## 5. Never silently repair contradictions

The engine surfaces consequences of canon changes; a contradiction in a derived
world is a result, not a bug — emitted as a first-class `ContradictionRecord`
with provenance and returned in the world state. No fixer may patch derivation
to auto-resolve contradictions; no agent may edit tests to hide them.
Contradictions are reported; humans decide.
