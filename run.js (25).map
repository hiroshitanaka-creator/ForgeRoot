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
fs.writeFileSync(path.join(distDir, "index.d.ts"), 'export * from "./run.js";\n', "utf8");
