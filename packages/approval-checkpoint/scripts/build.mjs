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

fs.writeFileSync(path.join(distDir, "run.d.ts"), `export declare const APPROVAL_CHECKPOINT_VERSION = 1;
export declare const TRANSPORT_AUTHORIZATION_SCHEMA_REF = "urn:forgeroot:transport-authorization:v1";
export declare const GITHUB_PR_CREATE_REQUEST_SCHEMA_REF = "urn:forgeroot:github-pr-create-request:v1";
export declare const APPROVAL_CHECKPOINT_CONTRACT: {
  readonly consumes: readonly string[];
  readonly produces: readonly string[];
  readonly validates: readonly string[];
  readonly decisions: readonly string[];
  readonly forbids: readonly string[];
  readonly githubAppOnly: true;
  readonly oneTaskOnePr: true;
  readonly checkpointOnly: true;
  readonly transportRequiresAuthorizationManifest: true;
};
export declare function runApprovalCheckpoint(input?: any): any;
export declare const evaluateApprovalCheckpoint: typeof runApprovalCheckpoint;
export declare const checkApprovalCheckpoint: typeof runApprovalCheckpoint;
export declare const authorizeGitHubPullRequestTransport: typeof runApprovalCheckpoint;
export declare const authorizeGithubPullRequestTransport: typeof runApprovalCheckpoint;
export declare const authorizePullRequestTransport: typeof runApprovalCheckpoint;
export declare const checkpointApproval: typeof runApprovalCheckpoint;
export declare const checkpointPullRequestTransport: typeof runApprovalCheckpoint;
export declare function validateGitHubPullRequestCreationRequestForApproval(value: any): any;
export declare const validateGitHubPRCreationRequestForApproval: typeof validateGitHubPullRequestCreationRequestForApproval;
export declare const validateGithubPullRequestCreationRequestForApproval: typeof validateGitHubPullRequestCreationRequestForApproval;
export declare const validateGithubPRCreationRequestForApproval: typeof validateGitHubPullRequestCreationRequestForApproval;
export declare function validateTransportAuthorization(value: any): any;
export declare const validateApprovalCheckpointAuthorization: typeof validateTransportAuthorization;
export declare const validateTrustedTransportAuthorization: typeof validateTransportAuthorization;
export declare const validatePullRequestTransportAuthorization: typeof validateTransportAuthorization;
export declare const validatePRTransportAuthorization: typeof validateTransportAuthorization;
`, "utf8");
fs.writeFileSync(path.join(distDir, "index.d.ts"), 'export * from "./run.js";\n', "utf8");
