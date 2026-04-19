import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const srcDir = path.join(root, "src");
const distDir = path.join(root, "dist");
fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(distDir, { recursive: true });

for (const [src, dest] of [["run.ts", "run.js"], ["index.ts", "index.js"]]) {
  fs.writeFileSync(path.join(distDir, dest), fs.readFileSync(path.join(srcDir, src), "utf8"), "utf8");
  fs.writeFileSync(path.join(distDir, `${dest}.map`), JSON.stringify({ version: 3, file: dest, sources: [`../src/${src}`], sourcesContent: [], names: [], mappings: "" }) + "\n", "utf8");
}

fs.writeFileSync(path.join(distDir, "run.d.ts"), `export declare const GITHUB_PR_ADAPTER_VERSION = 1;
export declare const GITHUB_PR_CREATE_REQUEST_SCHEMA_REF = "urn:forgeroot:github-pr-create-request:v1";
export declare const GITHUB_PR_ADAPTER_CONTRACT: {
  readonly consumes: readonly string[];
  readonly produces: readonly string[];
  readonly validates: readonly string[];
  readonly forbids: readonly string[];
  readonly githubAppOnly: true;
  readonly dryRunSupported: true;
  readonly oneTaskOnePr: true;
  readonly adapterOnly: true;
};
export declare function prepareGitHubPullRequest(input?: any): any;
export declare const prepareGithubPullRequest: typeof prepareGitHubPullRequest;
export declare const prepareGitHubPR: typeof prepareGitHubPullRequest;
export declare const prepareGithubPR: typeof prepareGitHubPullRequest;
export declare function validateGitHubPullRequestCreationRequest(value: any): any;
export declare const validateGithubPullRequestCreationRequest: typeof validateGitHubPullRequestCreationRequest;
export declare const validateGitHubPRCreationRequest: typeof validateGitHubPullRequestCreationRequest;
export declare const validateGithubPRCreationRequest: typeof validateGitHubPullRequestCreationRequest;
`, "utf8");
fs.writeFileSync(path.join(distDir, "index.d.ts"), 'export * from "./run.js";\n', "utf8");
