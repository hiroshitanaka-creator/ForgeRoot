import fs from "node:fs";
import path from "node:path";

const root = path.resolve(new URL("..", import.meta.url).pathname);
const srcDir = path.join(root, "src");
const distDir = path.join(root, "dist");
fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(distDir, { recursive: true });

for (const [src, dest] of [["run.ts", "run.js"], ["sarif.ts", "sarif.js"], ["index.ts", "index.js"]]) {
  fs.writeFileSync(path.join(distDir, dest), fs.readFileSync(path.join(srcDir, src), "utf8"), "utf8");
  fs.writeFileSync(path.join(distDir, `${dest}.map`), JSON.stringify({ version: 3, file: dest, sources: [`../src/${src}`], sourcesContent: [], names: [], mappings: "" }) + "\n", "utf8");
}

fs.writeFileSync(path.join(distDir, "run.d.ts"), `export declare const AUDIT_RESULT_SCHEMA_REF = "urn:forgeroot:audit-result:v1";
export declare const AUDITOR_RUNTIME_CONTRACT: {
  readonly consumes: readonly string[];
  readonly produces: readonly string[];
  readonly validates: readonly string[];
  readonly forbids: readonly string[];
  readonly oneTaskOnePr: true;
  readonly independentFromExecutor: true;
};
export declare function runAuditor(input: any): any;
export declare function validatePlanSpecForAudit(plan: any): any;
export declare function validateBranchWorktreePlanForAudit(value: any): any;
export declare function validateSandboxExecutionRequestForAudit(value: any): any;
export declare function validateAuditResult(report: any): any;
export declare const validateAuditReport: typeof validateAuditResult;
`, "utf8");

fs.writeFileSync(path.join(distDir, "sarif.d.ts"), `export declare const SARIF_BRIDGE_SCHEMA_REF = "urn:forgeroot:sarif-bridge:v1";
export declare const SARIF_BRIDGE_SARIF_VERSION = "2.1.0";
export declare const SARIF_BRIDGE_CONTRACT: {
  readonly consumes: readonly string[];
  readonly produces: readonly string[];
  readonly validates: readonly string[];
  readonly forbids: readonly string[];
  readonly manifestOnly: true;
  readonly deterministic: true;
};
export declare function convertAuditFindingsToSarif(input: any, options?: any): any;
export declare const createSarifBridgeArtifact: typeof convertAuditFindingsToSarif;
export declare const convertFindingsToSarif: typeof convertAuditFindingsToSarif;
export declare const normalizeFindingsToSarif: typeof convertAuditFindingsToSarif;
export declare const normalizeAuditFindingsToSarif: typeof convertAuditFindingsToSarif;
export declare function validateSarifBridgeInput(input: any, options?: any): any;
export declare function validateSarifLikeArtifact(artifact: any): any;
export declare const validateSarifBridgeArtifact: typeof validateSarifLikeArtifact;
export declare const validateSarifArtifact: typeof validateSarifLikeArtifact;
export declare const validateSarifFindingsArtifact: typeof validateSarifLikeArtifact;
export declare function normalizeSarifSeverity(value: any): any;
export declare function normalizeSarifPath(value: any, workspaceRoot?: any): any;
`, "utf8");

fs.writeFileSync(path.join(distDir, "index.d.ts"), 'export * from "./run.js";\nexport * from "./sarif.js";\n', "utf8");
