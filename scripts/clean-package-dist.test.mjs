import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const packagesRoot = path.join(repoRoot, "packages");
const scriptPath = path.join(repoRoot, "scripts", "clean-package-dist.mjs");

describe("clean-package-dist", () => {
  it("recreates only the current package dist directory", () => {
    const fixtureDir = mkdtempSync(path.join(packagesRoot, ".clean-dist-test-"));
    const distDir = path.join(fixtureDir, "dist");
    const distFile = path.join(distDir, "stale.js");

    try {
      writeFileSync(path.join(fixtureDir, "package.json"), "{\"private\":true}\n", "utf8");
      mkdirSync(distDir, { recursive: true });
      writeFileSync(distFile, "stale\n", "utf8");

      const result = spawnSync(process.execPath, [scriptPath], {
        cwd: fixtureDir,
        encoding: "utf8",
      });

      assert.equal(result.status, 0, result.stderr);
      assert.equal(existsSync(path.join(fixtureDir, "package.json")), true);
      assert.equal(existsSync(distDir), true);
      assert.equal(existsSync(distFile), false);
    } finally {
      rmSync(fixtureDir, { recursive: true, force: true });
    }
  });

  it("refuses to run outside a direct packages workspace", () => {
    const outsideDir = mkdtempSync(path.join(tmpdir(), "clean-dist-outside-"));

    try {
      writeFileSync(path.join(outsideDir, "package.json"), "{\"private\":true}\n", "utf8");

      const result = spawnSync(process.execPath, [scriptPath], {
        cwd: outsideDir,
        encoding: "utf8",
      });

      assert.notEqual(result.status, 0);
      assert.match(result.stderr, /direct packages\/\* workspace/);
    } finally {
      rmSync(outsideDir, { recursive: true, force: true });
    }
  });
});
