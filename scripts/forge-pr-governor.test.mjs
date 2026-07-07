import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import vm from "node:vm";

const WORKFLOW = readFileSync(".github/workflows/forge-pr-governor.yml", "utf8");
const TEMPLATE = readFileSync(".github/pull_request_template.md", "utf8");

function extractConstFunction(name) {
  const marker = `const ${name} = `;
  const start = WORKFLOW.indexOf(marker);
  assert.notEqual(start, -1, `${name} not found in governor workflow`);
  const terminator = "\n            };";
  const end = WORKFLOW.indexOf(terminator, start);
  assert.notEqual(end, -1, `${name} terminator not found in governor workflow`);
  return WORKFLOW.slice(start, end + terminator.length).replace(/^ {12}/gm, "");
}

function governorHelpers() {
  const source = [
    extractConstFunction("isPlaceholderVerificationValue"),
    extractConstFunction("isPassingVerificationResult"),
    extractConstFunction("declaresRestrictedWork"),
    "this.helpers = { isPlaceholderVerificationValue, isPassingVerificationResult, declaresRestrictedWork };",
  ].join("\n");
  const context = {};
  vm.runInNewContext(source, context);
  return context.helpers;
}

describe("Forge PR governor workflow guards", () => {
  it("rejects failed, partial, placeholder, and zero-test verification evidence", () => {
    const { isPlaceholderVerificationValue, isPassingVerificationResult } = governorHelpers();

    assert.equal(isPlaceholderVerificationValue("not run"), true);
    assert.equal(isPlaceholderVerificationValue("n/a"), true);
    assert.equal(isPlaceholderVerificationValue("npm test"), false);

    assert.equal(isPassingVerificationResult("failed after 2/2 passing"), false);
    assert.equal(isPassingVerificationResult("2/2 passing, 1 failed"), false);
    assert.equal(isPassingVerificationResult("0 tests passed"), false);
    assert.equal(isPassingVerificationResult("no tests passed"), false);
    assert.equal(isPassingVerificationResult("passed, 0 failed"), true);
    assert.equal(isPassingVerificationResult("2/2 passing"), true);
  });

  it("does not treat negated restricted-work statements as declarations", () => {
    const { declaresRestrictedWork } = governorHelpers();
    const docsOnlyTerms = /\bdocs[- ]only\b/i;
    const manifestOnlyTerms = /\b(manifest[- ]only|dry[- ]run|proposal[- ]only)\b/i;

    assert.equal(declaresRestrictedWork("This PR is not docs-only.", docsOnlyTerms), false);
    assert.equal(declaresRestrictedWork("This change is not manifest-only.", manifestOnlyTerms), false);
    assert.equal(declaresRestrictedWork("This change is manifest-only.", manifestOnlyTerms), true);
  });

  it("keeps manifest-only template answers parseable", () => {
    assert.match(TEMPLATE, /Manifest-only or dry-run work\?\s+No/);
    assert.doesNotMatch(TEMPLATE, /Manifest-only or dry-run work\?.*approved label/i);
  });

  it("mirrors global review-debt failures to other open PR heads", () => {
    assert.match(WORKFLOW, /^\s+checks: write$/m);
    assert.match(WORKFLOW, /mirrorGlobalDebtToOpenPrChecks/);
    assert.match(WORKFLOW, /github\.rest\.checks\.create/);
    assert.match(WORKFLOW, /name:\s*'completion gate'/);
  });
});
