export declare const AUDIT_RESULT_SCHEMA_REF = "urn:forgeroot:audit-result:v1";
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
