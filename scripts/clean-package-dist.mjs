import { existsSync, lstatSync, mkdirSync, realpathSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = realpathSync(path.resolve(fileURLToPath(new URL("..", import.meta.url))));
const packagesRoot = realpathSync(path.join(repoRoot, "packages"));
const packageRoot = realpathSync(process.cwd());
const packageRelativePath = path.relative(packagesRoot, packageRoot);

if (
  !packageRelativePath ||
  packageRelativePath.startsWith("..") ||
  path.isAbsolute(packageRelativePath) ||
  packageRelativePath.includes(path.sep)
) {
  throw new Error("clean-package-dist must run from a direct packages/* workspace");
}

const packageJsonPath = path.join(packageRoot, "package.json");
if (!existsSync(packageJsonPath) || !statSync(packageJsonPath).isFile()) {
  throw new Error("clean-package-dist requires a package.json in the workspace root");
}

const distDir = path.join(packageRoot, "dist");
const distRelativePath = path.relative(packageRoot, distDir);
if (distRelativePath !== "dist") {
  throw new Error("clean-package-dist can only remove the package-local dist directory");
}
if (existsSync(distDir) && lstatSync(distDir).isSymbolicLink()) {
  throw new Error("clean-package-dist refuses to remove symbolic dist links");
}

rmSync(distDir, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
mkdirSync(distDir, { recursive: true });
