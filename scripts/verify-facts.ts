/**
 * verify-facts.ts — Somnium Engine CI facts gate.
 *
 * Lightweight gate run after `npm run check` + `npm test` in CI. Verifies:
 *   (a) TypeScript compiles clean (`npx tsc --noEmit`)
 *   (b) The test suite passes (`npx vitest run`)
 *   (c) The PoC acceptance suite file exists
 *       (tests/acceptance/poc-acceptance.test.ts)
 *
 * Prints a PASS/FAIL summary and exits non-zero on any failure.
 *
 * Run: `npx tsx scripts/verify-facts.ts`
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const ACCEPTANCE_SUITE = join(REPO_ROOT, "tests", "acceptance", "poc-acceptance.test.ts");

function runCommand(name: string, command: string): CheckResult {
  try {
    execSync(command, { cwd: REPO_ROOT, stdio: "inherit", shell: true });
    return { name, ok: true, detail: "exit 0" };
  } catch (err) {
    const status = (err as { status?: number }).status;
    return { name, ok: false, detail: `exit ${status ?? "nonzero"}` };
  }
}

function runChecks(): CheckResult[] {
  const results: CheckResult[] = [];

  // (a) TypeScript compilation gate — equivalent to `npm run check`.
  results.push(runCommand("typecheck", "npx tsc --noEmit"));

  // (b) Test suite gate — equivalent to `npm test`.
  results.push(runCommand("tests", "npx vitest run"));

  // (c) Acceptance suite present — the executable contract must exist.
  const exists = existsSync(ACCEPTANCE_SUITE);
  results.push({
    name: "acceptance-suite-present",
    ok: exists,
    detail: exists ? ACCEPTANCE_SUITE : "missing tests/acceptance/poc-acceptance.test.ts",
  });

  return results;
}

function printSummary(results: CheckResult[]): void {
  const failures = results.filter((r) => !r.ok);
  const width = Math.max(...results.map((r) => r.name.length));
  console.log("\nverify-facts summary");
  console.log("-------------------");
  for (const r of results) {
    const label = r.ok ? "PASS" : "FAIL";
    console.log(`  [${label}] ${r.name.padEnd(width)}  ${r.detail}`);
  }
  console.log("-------------------");
  console.log(
    failures.length === 0
      ? `  ALL CHECKS PASSED (${results.length}/${results.length})`
      : `  FAILED: ${failures.length}/${results.length} check(s) failed`,
  );
}

const results = runChecks();
printSummary(results);

if (results.some((r) => !r.ok)) {
  process.exit(1);
}
process.exit(0);
