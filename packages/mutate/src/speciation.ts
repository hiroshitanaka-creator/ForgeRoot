export const SPECIATION_VERSION = 1 as const;
export const SPECIATION_SCHEMA_REF = "urn:forgeroot:mutate-speciation:v1" as const;

export type SpeciationMode = "split" | "merge";
export type SpeciationStatus = "dry_run_valid" | "rejected";
export type SpeciationDecision = "speciation_proposal_ready" | "blocked_by_forbidden_target" | "invalid_speciation_input";
export type SpeciationSupportingMutationType = "prompt_patch" | "tool_routing";

export interface SpeciationParentTarget {
  readonly path: string;
  readonly species: string;
  readonly content: Readonly<Record<string, unknown>>;
}

export interface SpeciationChildDraft {
  readonly path: string;
  readonly species: string;
  readonly role_name: string;
  readonly title: string;
  readonly summary: string;
  readonly speciation_id: string;
  readonly rationale: string;
  readonly prompt_patch_ref?: string | null;
  readonly tool_routing_patch_ref?: string | null;
}

export interface SpeciationRationale {
  readonly summary: string;
  readonly expected_benefits: readonly string[];
  readonly risks: readonly string[];
}

export interface SpeciationApprovalMetadata {
  readonly requested_by: string;
  readonly approval_class: "C";
  readonly human_review_required_before_execution: true;
  readonly human_review_required_before_merge: true;
}

export interface SpeciationSupportingMutation {
  readonly type: SpeciationSupportingMutationType;
  readonly mutation_id: string;
  readonly target_path: string;
}

export interface SpeciationInput {
  readonly now?: string;
  readonly mode: SpeciationMode;
  readonly parents: readonly SpeciationParentTarget[];
  readonly children: readonly SpeciationChildDraft[];
  readonly rationale: SpeciationRationale;
  readonly approval: SpeciationApprovalMetadata;
  readonly supporting_mutations?: readonly SpeciationSupportingMutation[];
}

export interface SpeciationValidationIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export interface SpeciationParentSummary {
  readonly path: string;
  readonly species: string;
  readonly role_name: string;
  readonly speciation_id: string | null;
  readonly generation: number;
  readonly digest: string;
}

export interface SpeciationChildSummary {
  readonly path: string;
  readonly species: string;
  readonly role_name: string;
  readonly title: string;
  readonly summary: string;
  readonly speciation_id: string;
  readonly rationale: string;
  readonly prompt_patch_ref: string | null;
  readonly tool_routing_patch_ref: string | null;
}

export interface SpeciationLineageEvent {
  readonly type: "role_split_proposed" | "role_merge_proposed";
  readonly parent_species: readonly string[];
  readonly child_species: readonly string[];
  readonly parent_speciation_ids: readonly (string | null)[];
  readonly child_speciation_ids: readonly string[];
  readonly rationale: string;
  readonly supporting_mutation_ids: readonly string[];
  readonly approval_class: "C";
}

export interface SpeciationReviewGate {
  readonly risk: "high";
  readonly approval_class: "C";
  readonly escalation_required: true;
  readonly human_review_required_before_execution: true;
  readonly human_review_required_before_merge: true;
  readonly reasons: readonly string[];
}

export interface SpeciationMutationRecord {
  readonly mutation_id: string;
  readonly class: "speciation";
  readonly target_paths: readonly string[];
  readonly patch_format: "forgeroot-speciation-proposal-v1";
  readonly patch_ref: null;
  readonly decision: "proposed" | "rejected";
  readonly approval_class: "C";
}

export interface SpeciationProposalResult {
  readonly manifest_version: typeof SPECIATION_VERSION;
  readonly schema_ref: typeof SPECIATION_SCHEMA_REF;
  readonly proposal_id: string;
  readonly created_at: string;
  readonly status: SpeciationStatus;
  readonly decision: SpeciationDecision;
  readonly reasons: readonly string[];
  readonly mode: SpeciationMode | "";
  readonly parents: readonly SpeciationParentSummary[];
  readonly children: readonly SpeciationChildSummary[];
  readonly rationale: SpeciationRationale;
  readonly approval: SpeciationApprovalMetadata;
  readonly supporting_mutations: readonly SpeciationSupportingMutation[];
  readonly lineage_events: readonly [SpeciationLineageEvent] | readonly [];
  readonly proposal_digest: string;
  readonly review_gate: SpeciationReviewGate;
  readonly mutation_record: SpeciationMutationRecord;
  readonly dry_run: {
    readonly file_written: false;
    readonly child_genomes_written: false;
    readonly parent_genomes_replaced: false;
    readonly github_api_called: false;
    readonly auto_merged: false;
    readonly policy_or_workflow_targeted: false;
  };
  readonly issues?: readonly SpeciationValidationIssue[];
}

export interface SpeciationValidationResult {
  readonly ok: boolean;
  readonly issues: readonly SpeciationValidationIssue[];
}

export const SPECIATION_CONTRACT = {
  consumes: [
    "speciation_request",
    "canonical_agent_forge_document",
    "prompt_patch_dry_run_manifest",
    "tool_routing_dry_run_manifest",
  ],
  produces: ["speciation_proposal_manifest"],
  validates: [
    "canonical_parent_agent_identity",
    "child_species_identity",
    "split_merge_cardinality",
    "lineage_metadata",
    "class_c_approval_metadata",
  ],
  forbids: [
    "silent_replacement",
    "policy_document_target",
    "workflow_document_target",
    "live_agent_file_write",
    "github_api_call",
    "automatic_merge",
    "self_approval",
  ],
  deterministic: true,
  dryRunOnly: true,
} as const;

const DEFAULT_NOW = "2026-07-04T00:00:00Z";
const RFC3339_UTC = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?Z$/;
const AGENT_DOCUMENT_PATH = /^\.forge\/agents\/([a-z0-9][a-z0-9-]*\.[a-z0-9][a-z0-9-]*)\.forge$/;
const SPECIES = /^[a-z][a-z0-9-]*\.[a-z][a-z0-9-]*$/;
const ROLE_NAME = /^[a-z][a-z0-9-]*$/;
const SPECIATION_ID = /^sp_[a-z][a-z0-9_]*$/;
const MUTATION_ID = /^mut-[0-9a-f]{8}$/;

export function createSpeciationProposal(input: unknown): SpeciationProposalResult {
  const envelope = normalizeInputEnvelope(input);
  const createdAt = resolveTimestamp(envelope.now, DEFAULT_NOW);
  if (createdAt === null) return invalidResult(DEFAULT_NOW, envelope.input, [{ path: "now", code: "now_must_be_rfc3339_utc", message: "now must be an RFC3339 UTC timestamp" }]);

  const issues = envelope.input === null ? envelope.issues : [...envelope.issues, ...validateInput(envelope.input)];
  if (issues.length > 0) {
    const decision: SpeciationDecision = issues.some((entry) => ["forbidden_document_path", "silent_replacement_forbidden"].includes(entry.code)) ? "blocked_by_forbidden_target" : "invalid_speciation_input";
    return { ...invalidResult(createdAt, envelope.input, issues), decision };
  }
  if (envelope.input === null) return invalidResult(createdAt, null, [{ path: "input", code: "input_must_be_object", message: "speciation input must be an object" }]);

  const validInput = envelope.input;
  const parents = summarizeParents(validInput.parents);
  const children = validInput.children.map(cloneChildSummary);
  const supportingMutations = (validInput.supporting_mutations ?? []).map(cloneSupportingMutation);
  const lineageEvent = createLineageEvent(validInput.mode, parents, children, validInput.rationale, supportingMutations);
  const fingerprint = canonicalStringify({ mode: validInput.mode, parents, children, rationale: validInput.rationale, approval: validInput.approval, supportingMutations });
  const proposalPayload = proposalDigestPayload(parents, children, validInput.rationale, validInput.approval, supportingMutations, lineageEvent);
  const targetPaths = unique([...parents.map((entry) => entry.path), ...children.map((entry) => entry.path)]);

  return {
    manifest_version: SPECIATION_VERSION,
    schema_ref: SPECIATION_SCHEMA_REF,
    proposal_id: stableId("speciation-proposal", [fingerprint]),
    created_at: createdAt,
    status: "dry_run_valid",
    decision: "speciation_proposal_ready",
    reasons: ["speciation_proposal_valid", "class_c_human_review_required", "silent_replacement_prevented"],
    mode: validInput.mode,
    parents,
    children,
    rationale: cloneRationale(validInput.rationale),
    approval: cloneApproval(validInput.approval),
    supporting_mutations: supportingMutations,
    lineage_events: [lineageEvent],
    proposal_digest: canonicalDigest(proposalPayload),
    review_gate: reviewGate(),
    mutation_record: mutationRecord(targetPaths, fingerprint, "proposed"),
    dry_run: dryRunFlags(),
  };
}

export function validateSpeciationProposal(result: SpeciationProposalResult): SpeciationValidationResult {
  const issues: SpeciationValidationIssue[] = [];
  if (result.manifest_version !== SPECIATION_VERSION) issue(issues, "manifest_version", "invalid_manifest_version", "manifest_version must be 1");
  if (result.schema_ref !== SPECIATION_SCHEMA_REF) issue(issues, "schema_ref", "invalid_schema_ref", "schema_ref must identify speciation v1");
  if (!isRfc3339Utc(result.created_at)) issue(issues, "created_at", "invalid_created_at", "created_at must be RFC3339 UTC");
  if (result.review_gate.approval_class !== "C" || result.review_gate.escalation_required !== true) issue(issues, "review_gate", "class_c_required", "speciation proposals must remain Class C review-gated");
  if (result.review_gate.human_review_required_before_execution !== true) issue(issues, "review_gate.human_review_required_before_execution", "human_review_before_execution_required", "speciation proposals must require human review before execution");
  if (result.review_gate.human_review_required_before_merge !== true) issue(issues, "review_gate.human_review_required_before_merge", "human_review_before_merge_required", "speciation proposals must require human review before merge");
  if (result.status === "dry_run_valid" && result.approval.approval_class !== "C") issue(issues, "approval.approval_class", "class_c_approval_required", "approval metadata must remain Class C");
  if (result.status === "dry_run_valid" && result.approval.human_review_required_before_execution !== true) issue(issues, "approval.human_review_required_before_execution", "approval_execution_gate_required", "approval metadata must require human review before execution");
  if (result.status === "dry_run_valid" && result.approval.human_review_required_before_merge !== true) issue(issues, "approval.human_review_required_before_merge", "approval_merge_gate_required", "approval metadata must require human review before merge");
  if (result.mutation_record.class !== "speciation" || result.mutation_record.approval_class !== "C") issue(issues, "mutation_record", "invalid_mutation_record", "mutation record must be Class C speciation");
  if (result.status === "dry_run_valid") validateAcceptedProposalShape(result, issues);
  if (result.dry_run.file_written !== false) issue(issues, "dry_run.file_written", "file_write_forbidden", "speciation dry-run must not write files");
  if (result.dry_run.child_genomes_written !== false) issue(issues, "dry_run.child_genomes_written", "child_genome_write_forbidden", "speciation dry-run must not write child genomes");
  if (result.dry_run.parent_genomes_replaced !== false) issue(issues, "dry_run.parent_genomes_replaced", "parent_replacement_forbidden", "speciation dry-run must not replace parent genomes");
  if (result.dry_run.github_api_called !== false) issue(issues, "dry_run.github_api_called", "github_api_forbidden", "speciation dry-run must not call GitHub APIs");
  if (result.dry_run.auto_merged !== false) issue(issues, "dry_run.auto_merged", "auto_merge_forbidden", "speciation dry-run must not auto-merge");
  if (result.dry_run.policy_or_workflow_targeted !== false) issue(issues, "dry_run.policy_or_workflow_targeted", "policy_or_workflow_target_forbidden", "speciation must not target policy or workflow paths");
  return { ok: issues.length === 0, issues };
}

function validateAcceptedProposalShape(result: SpeciationProposalResult, issues: SpeciationValidationIssue[]): void {
  if (result.decision !== "speciation_proposal_ready") issue(issues, "decision", "invalid_accepted_decision", "accepted speciation proposals must use speciation_proposal_ready");
  if (result.mutation_record.decision !== "proposed") issue(issues, "mutation_record.decision", "invalid_accepted_mutation_record_decision", "accepted speciation mutation records must be proposed");
  if (result.mode !== "split" && result.mode !== "merge") issue(issues, "mode", "invalid_speciation_mode", "mode must be split or merge");
  if (result.mode === "split" && result.parents.length !== 1) issue(issues, "parents", "split_requires_one_parent", "split speciation requires exactly one parent");
  if (result.mode === "split" && result.children.length < 2) issue(issues, "children", "split_requires_multiple_children", "split speciation requires at least two children");
  if (result.mode === "merge" && result.parents.length < 2) issue(issues, "parents", "merge_requires_multiple_parents", "merge speciation requires at least two parents");
  if (result.mode === "merge" && result.children.length !== 1) issue(issues, "children", "merge_requires_one_child", "merge speciation requires exactly one child");
  validateAcceptedParentSummaries(result.parents, issues);
  validateAcceptedChildSummaries(result.children, issues);
  validateAcceptedTargetPaths(result, issues);
  validateAcceptedLineageEvent(result, issues);
  validateAcceptedProposalDigest(result, issues);
  validateAcceptedChildUniqueness(result.parents, result.children, issues);
  validateSupportingMutations(result.supporting_mutations, [...result.parents.map((entry) => entry.path), ...result.children.map((entry) => entry.path)], issues);
}

function validateAcceptedParentSummaries(parents: readonly SpeciationParentSummary[], issues: SpeciationValidationIssue[]): void {
  const seenPaths = new Set<string>();
  const seenSpecies = new Set<string>();
  for (const [index, parent] of parents.entries()) {
    const prefix = `parents[${index}]`;
    validateAgentPath(parent.path, parent.species, prefix, issues);
    if (seenPaths.has(parent.path)) issue(issues, `${prefix}.path`, "duplicate_parent_path", `${parent.path} is listed more than once`);
    seenPaths.add(parent.path);
    if (seenSpecies.has(parent.species)) issue(issues, `${prefix}.species`, "duplicate_parent_species", `${parent.species} is listed more than once`);
    seenSpecies.add(parent.species);
    if (typeof parent.role_name !== "string" || !ROLE_NAME.test(parent.role_name)) issue(issues, `${prefix}.role_name`, "invalid_parent_role_name", "parent role_name must be lowercase kebab-like ASCII");
    else if (parent.role_name !== parent.species.split(".")[0]) issue(issues, `${prefix}.role_name`, "parent_role_species_mismatch", "parent role_name must match the role segment of parent species");
    if (parent.speciation_id !== null && (typeof parent.speciation_id !== "string" || !SPECIATION_ID.test(parent.speciation_id))) issue(issues, `${prefix}.speciation_id`, "invalid_parent_speciation_id", "parent speciation_id must be null or match sp_<lowercase_snake>");
    if (!Number.isSafeInteger(parent.generation) || parent.generation < 0) issue(issues, `${prefix}.generation`, "invalid_parent_generation", "parent generation must be a non-negative safe integer");
    if (typeof parent.digest !== "string" || parent.digest.trim().length === 0) issue(issues, `${prefix}.digest`, "invalid_parent_digest", "parent digest must be a non-empty string");
  }
}

function validateAcceptedChildSummaries(children: readonly SpeciationChildSummary[], issues: SpeciationValidationIssue[]): void {
  for (const [index, child] of children.entries()) {
    const prefix = `children[${index}]`;
    validateAgentPath(child.path, child.species, prefix, issues);
    if (typeof child.role_name !== "string" || !ROLE_NAME.test(child.role_name)) issue(issues, `${prefix}.role_name`, "invalid_child_role_name", "child role_name must be lowercase kebab-like ASCII");
    else if (child.role_name !== child.species.split(".")[0]) issue(issues, `${prefix}.role_name`, "child_role_species_mismatch", "child role_name must match the role segment of child species");
    validateNonEmptyString(child.title, `${prefix}.title`, "missing_child_title", "child title is required", issues);
    validateNonEmptyString(child.summary, `${prefix}.summary`, "missing_child_summary", "child summary is required", issues);
    validateNonEmptyString(child.rationale, `${prefix}.rationale`, "missing_child_rationale", "child rationale is required", issues);
    if (typeof child.speciation_id !== "string" || !SPECIATION_ID.test(child.speciation_id)) issue(issues, `${prefix}.speciation_id`, "invalid_child_speciation_id", "child speciation_id must match sp_<lowercase_snake>");
    validateOptionalRef(child.prompt_patch_ref, `${prefix}.prompt_patch_ref`, issues);
    validateOptionalRef(child.tool_routing_patch_ref, `${prefix}.tool_routing_patch_ref`, issues);
  }
}

function validateAcceptedTargetPaths(result: SpeciationProposalResult, issues: SpeciationValidationIssue[]): void {
  const expectedTargetPaths = unique([...result.parents.map((entry) => entry.path), ...result.children.map((entry) => entry.path)]);
  for (const [index, targetPath] of result.mutation_record.target_paths.entries()) {
    if (AGENT_DOCUMENT_PATH.exec(targetPath) === null) issue(issues, `mutation_record.target_paths[${index}]`, "forbidden_document_path", "mutation_record target_paths must contain only canonical .forge/agents/<species>.forge documents");
  }
  if (!arraysEqual(result.mutation_record.target_paths, expectedTargetPaths)) issue(issues, "mutation_record.target_paths", "mutation_record_target_paths_mismatch", "mutation_record target_paths must match parent and child agent paths");
}

function validateAcceptedLineageEvent(result: SpeciationProposalResult, issues: SpeciationValidationIssue[]): void {
  if (result.lineage_events.length !== 1) {
    issue(issues, "lineage_events", "lineage_event_required", "accepted speciation proposals must include one lineage event");
    return;
  }
  const lineageEvent = result.lineage_events[0];
  const expectedType = result.mode === "split" ? "role_split_proposed" : "role_merge_proposed";
  if (lineageEvent.type !== expectedType) issue(issues, "lineage_events[0].type", "lineage_event_type_mismatch", "lineage event type must match speciation mode");
  if (!arraysEqual(lineageEvent.parent_species, result.parents.map((entry) => entry.species))) issue(issues, "lineage_events[0].parent_species", "lineage_parent_species_mismatch", "lineage parent_species must match proposal parents");
  if (!arraysEqual(lineageEvent.child_species, result.children.map((entry) => entry.species))) issue(issues, "lineage_events[0].child_species", "lineage_child_species_mismatch", "lineage child_species must match proposal children");
  if (!arraysEqual(lineageEvent.parent_speciation_ids, result.parents.map((entry) => entry.speciation_id))) issue(issues, "lineage_events[0].parent_speciation_ids", "lineage_parent_speciation_ids_mismatch", "lineage parent_speciation_ids must match proposal parents");
  if (!arraysEqual(lineageEvent.child_speciation_ids, result.children.map((entry) => entry.speciation_id))) issue(issues, "lineage_events[0].child_speciation_ids", "lineage_child_speciation_ids_mismatch", "lineage child_speciation_ids must match proposal children");
  if (lineageEvent.rationale !== result.rationale.summary) issue(issues, "lineage_events[0].rationale", "lineage_rationale_mismatch", "lineage rationale must match proposal rationale summary");
  if (!arraysEqual(lineageEvent.supporting_mutation_ids, result.supporting_mutations.map((entry) => entry.mutation_id))) issue(issues, "lineage_events[0].supporting_mutation_ids", "lineage_supporting_mutation_ids_mismatch", "lineage supporting mutation IDs must match supporting mutations");
  if (lineageEvent.approval_class !== "C") issue(issues, "lineage_events[0].approval_class", "lineage_class_c_required", "lineage event must remain Class C");
}

function validateAcceptedProposalDigest(result: SpeciationProposalResult, issues: SpeciationValidationIssue[]): void {
  if (result.lineage_events.length !== 1) return;
  const expectedDigest = canonicalDigest(proposalDigestPayload(result.parents, result.children, result.rationale, result.approval, result.supporting_mutations, result.lineage_events[0]));
  if (result.proposal_digest !== expectedDigest) issue(issues, "proposal_digest", "proposal_digest_mismatch", "proposal_digest must cover parents, children, rationale, approval, supporting mutations, and lineage event");
}

function validateAcceptedChildUniqueness(parents: readonly SpeciationParentSummary[], children: readonly SpeciationChildSummary[], issues: SpeciationValidationIssue[]): void {
  const parentPaths = new Set(parents.map((entry) => entry.path));
  const parentSpecies = new Set(parents.map((entry) => entry.species));
  const parentSpeciationIds = new Set(parents.map((entry) => entry.speciation_id).filter((entry): entry is string => entry !== null));
  const seenPaths = new Set<string>();
  const seenSpecies = new Set<string>();
  const seenSpeciationIds = new Set<string>();
  for (const [index, child] of children.entries()) {
    const prefix = `children[${index}]`;
    if (seenPaths.has(child.path)) issue(issues, `${prefix}.path`, "duplicate_child_path", `${child.path} is listed more than once`);
    seenPaths.add(child.path);
    if (seenSpecies.has(child.species)) issue(issues, `${prefix}.species`, "duplicate_child_species", `${child.species} is listed more than once`);
    seenSpecies.add(child.species);
    if (seenSpeciationIds.has(child.speciation_id)) issue(issues, `${prefix}.speciation_id`, "duplicate_child_speciation_id", `${child.speciation_id} is listed more than once`);
    seenSpeciationIds.add(child.speciation_id);
    if (parentPaths.has(child.path) || parentSpecies.has(child.species) || parentSpeciationIds.has(child.speciation_id)) issue(issues, prefix, "silent_replacement_forbidden", "child path/species/speciation_id must not silently replace a parent agent");
  }
}

function validateInput(input: SpeciationInput): SpeciationValidationIssue[] {
  const issues: SpeciationValidationIssue[] = [];
  if (input.mode !== "split" && input.mode !== "merge") issue(issues, "mode", "invalid_speciation_mode", "mode must be split or merge");
  if (input.mode === "split" && input.parents.length !== 1) issue(issues, "parents", "split_requires_one_parent", "split speciation requires exactly one parent");
  if (input.mode === "split" && input.children.length < 2) issue(issues, "children", "split_requires_multiple_children", "split speciation requires at least two children");
  if (input.mode === "merge" && input.parents.length < 2) issue(issues, "parents", "merge_requires_multiple_parents", "merge speciation requires at least two parents");
  if (input.mode === "merge" && input.children.length !== 1) issue(issues, "children", "merge_requires_one_child", "merge speciation requires exactly one child");
  validateParents(input.parents, issues);
  validateChildren(input.children, input.parents, issues);
  validateLineageCycles(input.parents, input.children, issues);
  validateRationale(input.rationale, issues);
  validateApproval(input.approval, issues);
  validateSupportingMutations(input.supporting_mutations ?? [], [...input.parents.map((entry) => entry.path), ...input.children.map((entry) => entry.path)], issues);
  return issues;
}

function validateParents(parents: readonly SpeciationParentTarget[], issues: SpeciationValidationIssue[]): void {
  if (parents.length === 0) issue(issues, "parents", "missing_parents", "speciation requires at least one parent");
  const seenPaths = new Set<string>();
  const seenSpecies = new Set<string>();
  for (const [index, parent] of parents.entries()) {
    const prefix = `parents[${index}]`;
    validateAgentPath(parent.path, parent.species, prefix, issues);
    if (seenPaths.has(parent.path)) issue(issues, `${prefix}.path`, "duplicate_parent_path", `${parent.path} is listed more than once`);
    seenPaths.add(parent.path);
    if (seenSpecies.has(parent.species)) issue(issues, `${prefix}.species`, "duplicate_parent_species", `${parent.species} is listed more than once`);
    seenSpecies.add(parent.species);
    validateCanonicalParentContent(parent, prefix, issues);
  }
}

function validateChildren(children: readonly SpeciationChildDraft[], parents: readonly SpeciationParentTarget[], issues: SpeciationValidationIssue[]): void {
  if (children.length === 0) issue(issues, "children", "missing_children", "speciation requires at least one child draft");
  const parentPaths = new Set(parents.map((entry) => entry.path));
  const parentSpecies = new Set(parents.map((entry) => entry.species));
  const parentSpeciationIds = new Set(parents.map((entry) => readSpeciationId(entry.content)).filter((entry): entry is string => entry !== null));
  const seenPaths = new Set<string>();
  const seenSpecies = new Set<string>();
  const seenSpeciationIds = new Set<string>();
  for (const [index, child] of children.entries()) {
    const prefix = `children[${index}]`;
    validateAgentPath(child.path, child.species, prefix, issues);
    if (seenPaths.has(child.path)) issue(issues, `${prefix}.path`, "duplicate_child_path", `${child.path} is listed more than once`);
    seenPaths.add(child.path);
    if (seenSpecies.has(child.species)) issue(issues, `${prefix}.species`, "duplicate_child_species", `${child.species} is listed more than once`);
    seenSpecies.add(child.species);
    if (parentPaths.has(child.path) || parentSpecies.has(child.species)) issue(issues, prefix, "silent_replacement_forbidden", "child path/species must not silently replace a parent agent");
    if (typeof child.role_name !== "string" || !ROLE_NAME.test(child.role_name)) issue(issues, `${prefix}.role_name`, "invalid_child_role_name", "child role_name must be lowercase kebab-like ASCII");
    else if (child.role_name !== child.species.split(".")[0]) issue(issues, `${prefix}.role_name`, "child_role_species_mismatch", "child role_name must match the role segment of child species");
    validateNonEmptyString(child.title, `${prefix}.title`, "missing_child_title", "child title is required", issues);
    validateNonEmptyString(child.summary, `${prefix}.summary`, "missing_child_summary", "child summary is required", issues);
    validateNonEmptyString(child.rationale, `${prefix}.rationale`, "missing_child_rationale", "child rationale is required", issues);
    if (typeof child.speciation_id !== "string" || !SPECIATION_ID.test(child.speciation_id)) issue(issues, `${prefix}.speciation_id`, "invalid_child_speciation_id", "child speciation_id must match sp_<lowercase_snake>");
    else {
      if (seenSpeciationIds.has(child.speciation_id)) issue(issues, `${prefix}.speciation_id`, "duplicate_child_speciation_id", `${child.speciation_id} is listed more than once`);
      if (parentSpeciationIds.has(child.speciation_id)) issue(issues, `${prefix}.speciation_id`, "silent_replacement_forbidden", "child speciation_id must not silently reuse a parent speciation id");
      seenSpeciationIds.add(child.speciation_id);
    }
    validateOptionalRef(child.prompt_patch_ref, `${prefix}.prompt_patch_ref`, issues);
    validateOptionalRef(child.tool_routing_patch_ref, `${prefix}.tool_routing_patch_ref`, issues);
  }
}

function validateCanonicalParentContent(parent: SpeciationParentTarget, prefix: string, issues: SpeciationValidationIssue[]): void {
  const content = parent.content;
  const expectedId = `forge://hiroshitanaka-creator/ForgeRoot/agent/${parent.species}`;
  const expectedRoleName = parent.species.split(".")[0];
  if (content.kind !== "agent") issue(issues, `${prefix}.content.kind`, "target_content_kind_must_be_agent", "parent content kind must be agent");
  if (content.id !== expectedId) issue(issues, `${prefix}.content.id`, "target_content_id_mismatch", "parent content id must match the canonical agent id for parent species");
  if (!isRecord(content.identity)) {
    issue(issues, `${prefix}.content.identity`, "target_content_identity_must_be_object", "parent content identity must be an object");
  } else {
    if (content.identity.species !== parent.species) issue(issues, `${prefix}.content.identity.species`, "target_content_species_mismatch", "parent identity species must match parent species");
    if (content.identity.role_name !== expectedRoleName) issue(issues, `${prefix}.content.identity.role_name`, "target_content_role_name_mismatch", "parent identity role_name must match the role segment of parent species");
  }
  if (!isRecord(content.evolution)) {
    issue(issues, `${prefix}.content.evolution`, "target_content_evolution_must_be_object", "parent content evolution must be an object");
    return;
  }
  const generation = numberValue(content.evolution.generation);
  if (!Number.isSafeInteger(generation) || generation < 0) issue(issues, `${prefix}.content.evolution.generation`, "invalid_parent_generation", "parent evolution.generation must be a non-negative safe integer");
  if (typeof content.evolution.speciation_id !== "string" || !SPECIATION_ID.test(content.evolution.speciation_id)) issue(issues, `${prefix}.content.evolution.speciation_id`, "invalid_parent_speciation_id", "parent evolution.speciation_id must match sp_<lowercase_snake>");
}

function validateLineageCycles(parents: readonly SpeciationParentTarget[], children: readonly SpeciationChildDraft[], issues: SpeciationValidationIssue[]): void {
  const parentAncestryIds = new Set<string>();
  for (const parent of parents) {
    if (!isRecord(parent.content.evolution)) continue;
    collectSpeciationIds(parent.content.evolution.parents, parentAncestryIds);
  }
  for (const [index, child] of children.entries()) {
    if (parentAncestryIds.has(child.speciation_id)) issue(issues, `children[${index}].speciation_id`, "lineage_cycle_forbidden", "child speciation_id must not already appear in parent ancestry");
  }
}

function collectSpeciationIds(value: unknown, output: Set<string>): void {
  if (typeof value === "string") {
    if (SPECIATION_ID.test(value)) output.add(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) collectSpeciationIds(entry, output);
    return;
  }
  if (!isRecord(value)) return;
  if (typeof value.speciation_id === "string" && SPECIATION_ID.test(value.speciation_id)) output.add(value.speciation_id);
  for (const nested of Object.values(value)) collectSpeciationIds(nested, output);
}

function validateAgentPath(path: string, species: string, prefix: string, issues: SpeciationValidationIssue[]): void {
  const match = AGENT_DOCUMENT_PATH.exec(path);
  if (match === null) {
    issue(issues, `${prefix}.path`, "forbidden_document_path", "speciation targets must be canonical .forge/agents/<species>.forge documents");
  } else if (match[1] !== species) {
    issue(issues, `${prefix}.species`, "species_path_mismatch", "species must match the document path species segment");
  }
  if (typeof species !== "string" || !SPECIES.test(species)) issue(issues, `${prefix}.species`, "invalid_species", "species must be role.variant lowercase ASCII");
}

function validateRationale(rationale: SpeciationRationale, issues: SpeciationValidationIssue[]): void {
  validateNonEmptyString(rationale.summary, "rationale.summary", "missing_rationale_summary", "rationale summary is required", issues);
  validateNonEmptyStringArray(rationale.expected_benefits, "rationale.expected_benefits", "missing_expected_benefits", "expected_benefits must contain at least one non-empty string", issues);
  validateNonEmptyStringArray(rationale.risks, "rationale.risks", "missing_risks", "risks must contain at least one non-empty string", issues);
}

function validateApproval(approval: SpeciationApprovalMetadata, issues: SpeciationValidationIssue[]): void {
  validateNonEmptyString(approval.requested_by, "approval.requested_by", "missing_requested_by", "approval requested_by is required", issues);
  if (approval.approval_class !== "C") issue(issues, "approval.approval_class", "class_c_approval_required", "speciation requires Class C approval metadata");
  if (approval.human_review_required_before_execution !== true) issue(issues, "approval.human_review_required_before_execution", "approval_execution_gate_required", "speciation requires human review before execution");
  if (approval.human_review_required_before_merge !== true) issue(issues, "approval.human_review_required_before_merge", "approval_merge_gate_required", "speciation requires human review before merge");
}

function validateSupportingMutations(supportingMutations: readonly SpeciationSupportingMutation[], allowedPaths: readonly string[], issues: SpeciationValidationIssue[]): void {
  const allowedPathSet = new Set(allowedPaths);
  const seen = new Set<string>();
  for (const [index, mutation] of supportingMutations.entries()) {
    const prefix = `supporting_mutations[${index}]`;
    if (mutation.type !== "prompt_patch" && mutation.type !== "tool_routing") issue(issues, `${prefix}.type`, "invalid_supporting_mutation_type", "supporting mutation type must be prompt_patch or tool_routing");
    if (typeof mutation.mutation_id !== "string" || !MUTATION_ID.test(mutation.mutation_id)) issue(issues, `${prefix}.mutation_id`, "invalid_supporting_mutation_id", "supporting mutation_id must match mut-<8 hex chars>");
    else if (seen.has(mutation.mutation_id)) issue(issues, `${prefix}.mutation_id`, "duplicate_supporting_mutation_id", `${mutation.mutation_id} is listed more than once`);
    seen.add(mutation.mutation_id);
    if (!allowedPathSet.has(mutation.target_path)) issue(issues, `${prefix}.target_path`, "supporting_mutation_target_out_of_scope", "supporting mutation target_path must be one of the parent or child agent paths");
  }
}

function normalizeInputEnvelope(input: unknown): {
  readonly input: SpeciationInput | null;
  readonly now?: string;
  readonly issues: readonly SpeciationValidationIssue[];
} {
  const issues: SpeciationValidationIssue[] = [];
  if (!isRecord(input)) {
    issue(issues, "input", "input_must_be_object", "speciation input must be an object");
    return { input: null, issues };
  }

  let now: string | undefined;
  if (input.now !== undefined) {
    if (typeof input.now === "string") now = input.now;
    else issue(issues, "now", "now_must_be_string", "now must be a string when provided");
  }

  return {
    input: {
      now,
      mode: typeof input.mode === "string" ? input.mode as SpeciationMode : "" as SpeciationMode,
      parents: normalizeParents(input.parents, issues),
      children: normalizeChildren(input.children, issues),
      rationale: normalizeRationale(input.rationale, issues),
      approval: normalizeApproval(input.approval, issues),
      supporting_mutations: normalizeSupportingMutations(input.supporting_mutations, issues),
    },
    now,
    issues,
  };
}

function normalizeParents(value: unknown, issues: SpeciationValidationIssue[]): readonly SpeciationParentTarget[] {
  if (!Array.isArray(value)) {
    issue(issues, "parents", "parents_must_be_array", "parents must be an array");
    return [];
  }
  return value.map((entry, index) => {
    const prefix = `parents[${index}]`;
    if (!isRecord(entry)) {
      issue(issues, prefix, "parent_must_be_object", "each parent must be an object");
      return { path: "", species: "", content: {} };
    }
    return {
      path: typeof entry.path === "string" ? entry.path : "",
      species: typeof entry.species === "string" ? entry.species : "",
      content: isRecord(entry.content) ? entry.content : {},
    };
  });
}

function normalizeChildren(value: unknown, issues: SpeciationValidationIssue[]): readonly SpeciationChildDraft[] {
  if (!Array.isArray(value)) {
    issue(issues, "children", "children_must_be_array", "children must be an array");
    return [];
  }
  return value.map((entry, index) => {
    const prefix = `children[${index}]`;
    if (!isRecord(entry)) {
      issue(issues, prefix, "child_must_be_object", "each child must be an object");
      return emptyChild();
    }
    return {
      path: typeof entry.path === "string" ? entry.path : "",
      species: typeof entry.species === "string" ? entry.species : "",
      role_name: typeof entry.role_name === "string" ? entry.role_name : "",
      title: typeof entry.title === "string" ? entry.title : "",
      summary: typeof entry.summary === "string" ? entry.summary : "",
      speciation_id: typeof entry.speciation_id === "string" ? entry.speciation_id : "",
      rationale: typeof entry.rationale === "string" ? entry.rationale : "",
      prompt_patch_ref: entry.prompt_patch_ref === undefined ? null : entry.prompt_patch_ref as string | null,
      tool_routing_patch_ref: entry.tool_routing_patch_ref === undefined ? null : entry.tool_routing_patch_ref as string | null,
    };
  });
}

function normalizeRationale(value: unknown, issues: SpeciationValidationIssue[]): SpeciationRationale {
  if (!isRecord(value)) {
    issue(issues, "rationale", "rationale_must_be_object", "rationale must be an object");
    return { summary: "", expected_benefits: [], risks: [] };
  }
  return {
    summary: typeof value.summary === "string" ? value.summary : "",
    expected_benefits: normalizeStringArray(value.expected_benefits, "rationale.expected_benefits", issues),
    risks: normalizeStringArray(value.risks, "rationale.risks", issues),
  };
}

function normalizeApproval(value: unknown, issues: SpeciationValidationIssue[]): SpeciationApprovalMetadata {
  if (!isRecord(value)) {
    issue(issues, "approval", "approval_must_be_object", "approval must be an object");
    return emptyApproval();
  }
  return {
    requested_by: typeof value.requested_by === "string" ? value.requested_by : "",
    approval_class: value.approval_class as "C",
    human_review_required_before_execution: value.human_review_required_before_execution as true,
    human_review_required_before_merge: value.human_review_required_before_merge as true,
  };
}

function normalizeSupportingMutations(value: unknown, issues: SpeciationValidationIssue[]): readonly SpeciationSupportingMutation[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    issue(issues, "supporting_mutations", "supporting_mutations_must_be_array", "supporting_mutations must be an array when provided");
    return [];
  }
  return value.map((entry, index) => {
    const prefix = `supporting_mutations[${index}]`;
    if (!isRecord(entry)) {
      issue(issues, prefix, "supporting_mutation_must_be_object", "each supporting mutation must be an object");
      return { type: "" as SpeciationSupportingMutationType, mutation_id: "", target_path: "" };
    }
    return {
      type: typeof entry.type === "string" ? entry.type as SpeciationSupportingMutationType : "" as SpeciationSupportingMutationType,
      mutation_id: typeof entry.mutation_id === "string" ? entry.mutation_id : "",
      target_path: typeof entry.target_path === "string" ? entry.target_path : "",
    };
  });
}

function normalizeStringArray(value: unknown, path: string, issues: SpeciationValidationIssue[]): readonly string[] {
  if (!Array.isArray(value)) {
    issue(issues, path, "string_array_required", `${path} must be an array`);
    return [];
  }
  return value.map((entry) => typeof entry === "string" ? entry : "");
}

function invalidResult(createdAt: string, input: SpeciationInput | null, issues: readonly SpeciationValidationIssue[]): SpeciationProposalResult {
  const parents = input === null ? [] : summarizeParents(input.parents);
  const children = input === null ? [] : input.children.map(cloneChildSummary);
  const rationale = input === null ? { summary: "", expected_benefits: [], risks: [] } : cloneRationale(input.rationale);
  const approval = input === null ? emptyApproval() : cloneApproval(input.approval);
  const supportingMutations = input === null ? [] : (input.supporting_mutations ?? []).map(cloneSupportingMutation);
  const fingerprint = canonicalStringify({ mode: input?.mode ?? "", parents, children, rationale, approval, supportingMutations, issues });
  const targetPaths = unique([...parents.map((entry) => entry.path), ...children.map((entry) => entry.path)]).filter((entry) => entry !== "");
  return {
    manifest_version: SPECIATION_VERSION,
    schema_ref: SPECIATION_SCHEMA_REF,
    proposal_id: stableId("speciation-proposal", [fingerprint]),
    created_at: createdAt,
    status: "rejected",
    decision: "invalid_speciation_input",
    reasons: unique(issues.map((entry) => entry.code)),
    mode: input?.mode ?? "",
    parents,
    children,
    rationale,
    approval,
    supporting_mutations: supportingMutations,
    lineage_events: [],
    proposal_digest: canonicalDigest(null),
    review_gate: reviewGate(),
    mutation_record: mutationRecord(targetPaths, fingerprint, "rejected"),
    dry_run: dryRunFlags(),
    issues,
  };
}

function summarizeParents(parents: readonly SpeciationParentTarget[]): readonly SpeciationParentSummary[] {
  return parents.map((parent) => {
    const identity = isRecord(parent.content.identity) ? parent.content.identity : {};
    return {
      path: parent.path,
      species: parent.species,
      role_name: stringValue(identity.role_name) ?? "",
      speciation_id: readSpeciationId(parent.content),
      generation: readGeneration(parent.content),
      digest: canonicalDigest(parent.content),
    };
  });
}

function createLineageEvent(mode: SpeciationMode, parents: readonly SpeciationParentSummary[], children: readonly SpeciationChildSummary[], rationale: SpeciationRationale, supportingMutations: readonly SpeciationSupportingMutation[]): SpeciationLineageEvent {
  return {
    type: mode === "split" ? "role_split_proposed" : "role_merge_proposed",
    parent_species: parents.map((entry) => entry.species),
    child_species: children.map((entry) => entry.species),
    parent_speciation_ids: parents.map((entry) => entry.speciation_id),
    child_speciation_ids: children.map((entry) => entry.speciation_id),
    rationale: rationale.summary,
    supporting_mutation_ids: supportingMutations.map((entry) => entry.mutation_id),
    approval_class: "C",
  };
}

function proposalDigestPayload(parents: readonly SpeciationParentSummary[], children: readonly SpeciationChildSummary[], rationale: SpeciationRationale, approval: SpeciationApprovalMetadata, supportingMutations: readonly SpeciationSupportingMutation[], lineageEvent: SpeciationLineageEvent): Readonly<Record<string, unknown>> {
  return { parents, children, rationale, approval, supportingMutations, lineageEvent };
}

function reviewGate(): SpeciationReviewGate {
  return {
    risk: "high",
    approval_class: "C",
    escalation_required: true,
    human_review_required_before_execution: true,
    human_review_required_before_merge: true,
    reasons: ["speciation_requires_class_c_review", "silent_replacement_forbidden"],
  };
}

function mutationRecord(targetPaths: readonly string[], fingerprint: string, decision: "proposed" | "rejected"): SpeciationMutationRecord {
  return {
    mutation_id: stableId("mut", [fingerprint]),
    class: "speciation",
    target_paths: [...targetPaths],
    patch_format: "forgeroot-speciation-proposal-v1",
    patch_ref: null,
    decision,
    approval_class: "C",
  };
}

function dryRunFlags(): SpeciationProposalResult["dry_run"] {
  return {
    file_written: false,
    child_genomes_written: false,
    parent_genomes_replaced: false,
    github_api_called: false,
    auto_merged: false,
    policy_or_workflow_targeted: false,
  };
}

function cloneChildSummary(child: SpeciationChildDraft): SpeciationChildSummary {
  return {
    path: child.path,
    species: child.species,
    role_name: child.role_name,
    title: child.title,
    summary: child.summary,
    speciation_id: child.speciation_id,
    rationale: child.rationale,
    prompt_patch_ref: child.prompt_patch_ref ?? null,
    tool_routing_patch_ref: child.tool_routing_patch_ref ?? null,
  };
}

function cloneRationale(rationale: SpeciationRationale): SpeciationRationale {
  return {
    summary: rationale.summary,
    expected_benefits: [...rationale.expected_benefits],
    risks: [...rationale.risks],
  };
}

function cloneApproval(approval: SpeciationApprovalMetadata): SpeciationApprovalMetadata {
  return {
    requested_by: approval.requested_by,
    approval_class: approval.approval_class,
    human_review_required_before_execution: approval.human_review_required_before_execution,
    human_review_required_before_merge: approval.human_review_required_before_merge,
  };
}

function cloneSupportingMutation(mutation: SpeciationSupportingMutation): SpeciationSupportingMutation {
  return { type: mutation.type, mutation_id: mutation.mutation_id, target_path: mutation.target_path };
}

function emptyChild(): SpeciationChildDraft {
  return { path: "", species: "", role_name: "", title: "", summary: "", speciation_id: "", rationale: "", prompt_patch_ref: null, tool_routing_patch_ref: null };
}

function emptyApproval(): SpeciationApprovalMetadata {
  return { requested_by: "", approval_class: "" as "C", human_review_required_before_execution: false as true, human_review_required_before_merge: false as true };
}

function readSpeciationId(content: Readonly<Record<string, unknown>>): string | null {
  if (!isRecord(content.evolution)) return null;
  return typeof content.evolution.speciation_id === "string" ? content.evolution.speciation_id : null;
}

function readGeneration(content: Readonly<Record<string, unknown>>): number {
  if (!isRecord(content.evolution)) return 0;
  const generation = numberValue(content.evolution.generation);
  return Number.isSafeInteger(generation) && generation >= 0 ? generation : 0;
}

function validateNonEmptyString(value: unknown, path: string, code: string, message: string, issues: SpeciationValidationIssue[]): void {
  if (typeof value !== "string" || value.trim().length === 0) issue(issues, path, code, message);
}

function validateNonEmptyStringArray(value: readonly string[], path: string, code: string, message: string, issues: SpeciationValidationIssue[]): void {
  if (!Array.isArray(value) || value.length === 0 || value.some((entry) => typeof entry !== "string" || entry.trim().length === 0)) issue(issues, path, code, message);
}

function validateOptionalRef(value: string | null | undefined, path: string, issues: SpeciationValidationIssue[]): void {
  if (value === undefined || value === null) return;
  if (typeof value !== "string" || value.trim().length === 0) issue(issues, path, "invalid_manifest_ref", "manifest refs must be non-empty strings or null");
}

function canonicalDigest(value: unknown): string { return `sha-fnv1a-${fnv1a(canonicalStringify(value)).toString(16).padStart(8, "0")}`; }

function canonicalStringify(value: unknown): string {
  if (value === undefined) return "undefined";
  if (typeof value === "number" && Number.isNaN(value)) return "NaN";
  if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const keys = Object.keys(value as Record<string, unknown>).sort();
    return `{${keys.map((key) => `${JSON.stringify(key)}:${canonicalStringify((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function issue(issues: SpeciationValidationIssue[], path: string, code: string, message: string): void { issues.push({ path, code, message }); }
function resolveTimestamp(value: string | undefined, fallback: string): string | null { return value === undefined ? fallback : isRfc3339Utc(value) ? value : null; }
function isRfc3339Utc(value: string): boolean {
  const match = RFC3339_UTC.exec(value);
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const millisecond = match[7] === undefined ? 0 : Number(match[7]);
  const date = new Date(Date.UTC(year, month - 1, day, hour, minute, second, millisecond));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
    && date.getUTCHours() === hour
    && date.getUTCMinutes() === minute
    && date.getUTCSeconds() === second
    && date.getUTCMilliseconds() === millisecond;
}
function isRecord(value: unknown): value is Record<string, unknown> { return value !== null && typeof value === "object" && !Array.isArray(value); }
function stringValue(value: unknown): string | null { return typeof value === "string" ? value : null; }
function numberValue(value: unknown): number { return typeof value === "number" ? value : Number.NaN; }
function unique(values: readonly string[]): string[] { return [...new Set(values)]; }
function arraysEqual<T>(left: readonly T[], right: readonly T[]): boolean {
  if (left.length !== right.length) return false;
  return left.every((entry, index) => entry === right[index]);
}
function stableId(prefix: string, parts: readonly string[]): string { return `${prefix}-${fnv1a(parts.join("\u001f")).toString(16).padStart(8, "0")}`; }
function fnv1a(value: string): number { let hash = 0x811c9dc5; for (let index = 0; index < value.length; index += 1) { hash ^= value.charCodeAt(index); hash = Math.imul(hash, 0x01000193) >>> 0; } return hash >>> 0; }

export const runSpeciationProposal = createSpeciationProposal;
export const runT048SpeciationProposal = createSpeciationProposal;
export const validateT048SpeciationProposal = validateSpeciationProposal;
