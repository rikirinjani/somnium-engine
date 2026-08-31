# Somnium Engine — Repo Constitution

Rules binding on every agent working in this repository. Applies to Somnium
Engine only; the sibling Kronos Engine repo has its own governance and must not
be modified.

## 1. Every task is traced

Every discrete task — any size or outcome — records an execution trace before it
counts as complete. Traces are kept in the operator's own harness outside this
repository; what matters here is that the obligation is unconditional and that a
missing trace blocks task closure.

## 2. Failures get a failure record

Anything wrong (wrong output, wrong approach, process violation) gets a failure
record with its root cause. No whitewashing. Quality records that bear on the
engine's design live in `qms/records/` and are published with the repo:

- `qms/records/requirements/` — what a phase was required to establish.
- `qms/records/verifications/` — independent gate results, including rejections.
- `qms/records/nonconformities/` — defects in the work itself, with root cause
  and preventive action.

## 3. Role boundaries

- **Orchestrator** coordinates lanes, owns git, closes tasks only after traces
  are verified.
- **Fixers** implement specific scoped changes (canon, derive core,
  timeline/diff/query/CLI, scaffold/governance).
- **Verifier** approves work against the acceptance suite and requirements.
- **Oracle / reviewers** advise and critique; they do not produce output.

Crossing a boundary without explicit approval is a nonconformity; record it.

## 4. No synthetic records

Traces and failure records must come from real execution. Fabricating records is
a policy violation and voids the record.

## 5. Never silently repair contradictions

The engine surfaces consequences of canon changes; a contradiction in a derived
world is a result, not a bug — emitted as a first-class `ContradictionRecord`
with provenance and returned in the world state. No fixer may patch derivation
to auto-resolve contradictions; no agent may edit tests to hide them.
Contradictions are reported; humans decide.

## 6. A claim about system state needs an executable assertion

Prose asserting what the system does — counts, statuses, "all X now Y" — must be
backed by a test, and a claim quantified over a set must be a test parameterized
over that set, so adding a member forces the claim to be re-proven.

This rule exists because it was violated three times (`ncr-001` … `ncr-003`):
documentation asserted a property the change had not actually implemented, and
each escaped review until an adversarial gate reproduced it by execution. A
green suite is evidence about the tests as much as about the code.
