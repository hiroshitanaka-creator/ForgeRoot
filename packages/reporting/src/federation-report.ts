export const FEDERATION_REPORT_VERSION = 1 as const;
export const FEDERATION_REPORT_SCHEMA_REF = "urn:forgeroot:federation-report:v1" as const;

export type FederationPeerStatus = "active" | "suspended" | "quarantined" | "deprecated" | "revoked" | "unknown";
export type FederationTreatyStatus = "active" | "suspended" | "revoked" | "missing";
export type FederationReputationAction = "observe" | "downrank" | "quarantine" | "revocation_review";
export type FederationLineageDirection = "import" | "export";
export type FederationLineageStatus = "exported" | "candidate_registered" | "blocked" | "quarantined" | "rejected";
export type FederationBoundaryStatus = "allowed" | "rejected" | "quarantined" | "invalid";
export type FederationReportStatus = "federation_report_ready" | "invalid";
export type FederationReportDecision = "federation_report_ready" | "invalid_federation_report_input";

export interface FederationReportIssue {
  readonly path: string;
  readonly code: string;
  readonly message: string;
}

export interface FederationSourceRefsInput {
  readonly peer_registry_ref: string;
  readonly reputation_ref: string;
  readonly boundary_policy_ref: string;
  readonly treaty_refs: readonly string[];
  readonly lineage_refs: readonly string[];
}

export interface FederationPeerInput {
  readonly peer_id: string;
  readonly repository_full_name: string;
  readonly status: FederationPeerStatus;
  readonly treaty: {
    readonly treaty_id: string;
    readonly status: FederationTreatyStatus;
    readonly allowed_actions: readonly string[];
    readonly expires_at?: string | null;
  };
  readonly reputation: {
    readonly score: number;
    readonly recommended_action: FederationReputationAction;
  };
  readonly last_interaction_at?: string | null;
}

export interface FederationLineageExchangeInput {
  readonly exchange_id: string;
  readonly peer_id: string;
  readonly direction: FederationLineageDirection;
  readonly lineage_ref: string;
  readonly pack_id: string;
  readonly status: FederationLineageStatus;
  readonly boundary_decision_id?: string | null;
  readonly adoption_performed?: boolean;
  readonly occurred_at: string;
}

export interface FederationBoundaryDecisionInput {
  readonly boundary_decision_id: string;
  readonly peer_id: string;
  readonly status: FederationBoundaryStatus;
  readonly decision: string;
  readonly action: string;
  readonly reasons: readonly string[];
}

export interface FederationReportInput {
  readonly now?: string;
  readonly report_id: string;
  readonly source_refs: FederationSourceRefsInput;
  readonly peers: readonly FederationPeerInput[];
  readonly lineage_exchanges: readonly FederationLineageExchangeInput[];
  readonly boundary_decisions: readonly FederationBoundaryDecisionInput[];
}

export interface FederationPeerReport {
  readonly peer_id: string;
  readonly repository_full_name: string;
  readonly status: FederationPeerStatus;
  readonly treaty_id: string;
  readonly treaty_status: FederationTreatyStatus;
  readonly reputation_score: number;
  readonly reputation_action: FederationReputationAction;
  readonly lineage_import_count: number;
  readonly lineage_export_count: number;
  readonly boundary_statuses: readonly FederationBoundaryStatus[];
  readonly visible_risk_flags: readonly string[];
}

export interface FederationReportResult {
  readonly manifest_version: typeof FEDERATION_REPORT_VERSION;
  readonly schema_ref: typeof FEDERATION_REPORT_SCHEMA_REF;
  readonly federation_report_id: string;
  readonly report_id: string;
  readonly generated_at: string;
  readonly status: FederationReportStatus;
  readonly decision: FederationReportDecision;
  readonly reasons: readonly string[];
  readonly inputs: {
    readonly source_refs: Required<FederationSourceRefsInput>;
    readonly peers: readonly Required<FederationPeerInput>[];
    readonly lineage_exchanges: readonly Required<FederationLineageExchangeInput>[];
    readonly boundary_decisions: readonly FederationBoundaryDecisionInput[];
  };
  readonly report_context: {
    readonly derived_artifact: true;
    readonly source_of_truth: false;
    readonly treaty_replacement: false;
    readonly authoritative_peer_state: false;
    readonly authoritative_reputation: false;
  };
  readonly summary: {
    readonly peer_count: number;
    readonly peers_by_status: Record<FederationPeerStatus, number>;
    readonly treaties_by_status: Record<FederationTreatyStatus, number>;
    readonly reputation: {
      readonly average_score: number;
      readonly quarantine_recommended: number;
      readonly revocation_review_recommended: number;
    };
    readonly lineage: {
      readonly import_count: number;
      readonly export_count: number;
      readonly candidate_count: number;
      readonly blocked_count: number;
      readonly adopted_count: number;
    };
    readonly boundary: Record<FederationBoundaryStatus, number>;
    readonly quarantine_revocation: {
      readonly quarantined_peers: readonly string[];
      readonly revoked_peers: readonly string[];
      readonly reputation_quarantine_peers: readonly string[];
      readonly reputation_revocation_review_peers: readonly string[];
    };
  };
  readonly peer_reports: readonly FederationPeerReport[];
  readonly json_report: {
    readonly schema_ref: typeof FEDERATION_REPORT_SCHEMA_REF;
    readonly report_id: string;
    readonly generated_at: string;
    readonly report_context: FederationReportResult["report_context"];
    readonly source_refs: Required<FederationSourceRefsInput>;
    readonly summary: FederationReportResult["summary"];
    readonly peers: readonly FederationPeerReport[];
    readonly lineage_exchanges: readonly Required<FederationLineageExchangeInput>[];
    readonly boundary_decisions: readonly FederationBoundaryDecisionInput[];
  };
  readonly markdown_report: string;
  readonly guards: {
    readonly derived_artifact_only: true;
    readonly source_refs_required: true;
    readonly revoked_and_quarantined_visible: true;
    readonly lineage_exchange_traceable: true;
    readonly no_treaty_replacement: true;
    readonly no_authoritative_reputation_write: true;
    readonly no_network_transport: true;
    readonly no_dashboard_hosting: true;
    readonly no_automatic_treaty_change: true;
  };
  readonly dry_run: {
    readonly network_transport_performed: false;
    readonly dashboard_hosted: false;
    readonly treaty_changed: false;
    readonly reputation_written: false;
    readonly github_api_called: false;
  };
  readonly federation_report_digest: string;
  readonly issues?: readonly FederationReportIssue[];
}

export interface FederationReportValidation {
  readonly ok: boolean;
  readonly issues: readonly FederationReportIssue[];
}

export const FEDERATION_REPORT_CONTRACT = {
  consumes: ["peer_registry_snapshot", "treaty_summary", "lineage_exchange_summary", "peer_reputation_summary", "network_boundary_decisions"],
  produces: ["federation_observability_markdown_report", "federation_observability_json_report"],
  validates: ["peer_status_visibility", "treaty_status_visibility", "lineage_traceability", "quarantine_revocation_visibility", "derived_artifact_boundary"],
  forbids: ["source_of_truth_replacement", "treaty_replacement", "live_dashboard_hosting", "network_transport", "automatic_treaty_change", "authoritative_reputation_write"],
  deterministic: true,
  manifestOnly: true,
  reportOnly: true,
} as const;

const DEFAULT_NOW = "2026-07-07T00:00:00Z";
const RFC3339_UTC = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{3}))?Z$/;
const ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*-[0-9a-f]{8}$/;
const KEBAB_ID = /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/;
const REPOSITORY = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const SAFE_REF = /^[A-Za-z0-9:/.?=_-]+$/;
const PEER_STATUSES: readonly FederationPeerStatus[] = ["active", "suspended", "quarantined", "deprecated", "revoked", "unknown"];
const TREATY_STATUSES: readonly FederationTreatyStatus[] = ["active", "suspended", "revoked", "missing"];
const REPUTATION_ACTIONS = new Set(["observe", "downrank", "quarantine", "revocation_review"]);
const LINEAGE_DIRECTIONS = new Set(["import", "export"]);
const LINEAGE_STATUSES = new Set(["exported", "candidate_registered", "blocked", "quarantined", "rejected"]);
const BOUNDARY_STATUSES: readonly FederationBoundaryStatus[] = ["allowed", "rejected", "quarantined", "invalid"];
const REPORT_KEYS = new Set(["manifest_version", "schema_ref", "federation_report_id", "report_id", "generated_at", "status", "decision", "reasons", "inputs", "report_context", "summary", "peer_reports", "json_report", "markdown_report", "guards", "dry_run", "federation_report_digest", "issues"]);
const INPUT_KEYS = new Set(["source_refs", "peers", "lineage_exchanges", "boundary_decisions"]);
const SOURCE_REF_KEYS = new Set(["peer_registry_ref", "reputation_ref", "boundary_policy_ref", "treaty_refs", "lineage_refs"]);
const PEER_KEYS = new Set(["peer_id", "repository_full_name", "status", "treaty", "reputation", "last_interaction_at"]);
const TREATY_KEYS = new Set(["treaty_id", "status", "allowed_actions", "expires_at"]);
const REPUTATION_KEYS = new Set(["score", "recommended_action"]);
const LINEAGE_KEYS = new Set(["exchange_id", "peer_id", "direction", "lineage_ref", "pack_id", "status", "boundary_decision_id", "adoption_performed", "occurred_at"]);
const BOUNDARY_KEYS = new Set(["boundary_decision_id", "peer_id", "status", "decision", "action", "reasons"]);
const ISSUE_KEYS = new Set(["path", "code", "message"]);

interface NormalizedInput {
  readonly input: FederationReportInput | null;
  readonly now?: string;
  readonly issues: readonly FederationReportIssue[];
}

interface ComputedReport {
  readonly summary: FederationReportResult["summary"];
  readonly peerReports: readonly FederationPeerReport[];
  readonly jsonReport: FederationReportResult["json_report"];
  readonly markdownReport: string;
}

export function renderFederationReport(input: unknown): FederationReportResult {
  const normalized = normalizeInput(input);
  const generatedAt = resolveTimestamp(normalized.now, DEFAULT_NOW);
  const issues = [
    ...(generatedAt === null ? [makeIssue("now", "invalid_timestamp", "now must be an RFC3339 UTC timestamp")] : []),
    ...normalized.issues,
  ];
  if (issues.length > 0 || normalized.input === null) return invalidResult(generatedAt ?? DEFAULT_NOW, issues.length > 0 ? issues : [makeIssue("input", "input_must_be_object", "federation report input must be an object")]);

  const result = resultFor(generatedAt ?? DEFAULT_NOW, normalized.input);
  const validation = validateFederationReport(result);
  if (!validation.ok) return invalidResult(generatedAt ?? DEFAULT_NOW, validation.issues);
  return result;
}

export function validateFederationReport(value: unknown): FederationReportValidation {
  const issues: FederationReportIssue[] = [];
  if (!isRecord(value)) return { ok: false, issues: [makeIssue("result", "result_must_be_object", "federation report result must be an object")] };
  validateKnownKeys(value, REPORT_KEYS, "result", issues);
  validateTopLevel(value, issues);
  const inputs = validateInputs(value.inputs, "inputs", issues);
  validateReportContext(value.report_context, issues);
  validateSummaryShape(value.summary, "summary", issues);
  validatePeerReports(value.peer_reports, "peer_reports", issues);
  if (typeof value.markdown_report !== "string" || value.markdown_report.length === 0) issue(issues, "markdown_report", "markdown_report_required", "markdown report must be non-empty");
  validateGuards(value.guards, issues);
  validateDryRun(value.dry_run, issues);
  validateTerminal(value, issues);
  validateNoSecretMaterial(value, "result", issues);

  if (issues.length === 0 && value.status !== "invalid" && inputs !== null) {
    const computed = computeReport(value.generated_at as string, value.report_id as string, inputs);
    if (canonicalStringify(value.summary) !== canonicalStringify(computed.summary)) issue(issues, "summary", "summary_mismatch", "summary must be recomputed from inputs");
    if (canonicalStringify(value.peer_reports) !== canonicalStringify(computed.peerReports)) issue(issues, "peer_reports", "peer_reports_mismatch", "peer reports must be recomputed from inputs");
    if (canonicalStringify(value.json_report) !== canonicalStringify(computed.jsonReport)) issue(issues, "json_report", "json_report_mismatch", "json report must be recomputed from inputs");
    if (value.markdown_report !== computed.markdownReport) issue(issues, "markdown_report", "markdown_report_mismatch", "markdown report must be recomputed from inputs");
  }

  const expectedDigest = canonicalDigest(reportDigestPayload(value as unknown as FederationReportResult));
  if (typeof value.federation_report_digest !== "string" || value.federation_report_digest !== expectedDigest) issue(issues, "federation_report_digest", "digest_mismatch", "federation_report_digest must cover the report payload");
  if (typeof value.federation_report_id !== "string" || value.federation_report_id !== stableId("federation-report", [expectedDigest])) issue(issues, "federation_report_id", "id_mismatch", "federation_report_id must match federation_report_digest");
  return { ok: issues.length === 0, issues };
}

function normalizeInput(input: unknown): NormalizedInput {
  const issues: FederationReportIssue[] = [];
  if (!isRecord(input)) return { input: null, issues: [makeIssue("input", "input_must_be_object", "federation report input must be an object")] };
  validateKnownKeys(input, new Set(["now", "report_id", "source_refs", "peers", "lineage_exchanges", "boundary_decisions"]), "input", issues);
  validateNoSecretMaterial(input, "input", issues);
  const reportId = stringField(input.report_id, "report_id", issues);
  if (reportId.length > 0 && !KEBAB_ID.test(reportId)) issue(issues, "report_id", "invalid_report_id", "report_id must be lowercase kebab-case");
  const now = optionalString(input.now, "now", issues);
  const normalized = {
    report_id: reportId,
    source_refs: normalizeSourceRefs(input.source_refs, "source_refs", issues, false),
    peers: normalizePeers(input.peers, "peers", issues, false),
    lineage_exchanges: normalizeLineageExchanges(input.lineage_exchanges, "lineage_exchanges", issues, false),
    boundary_decisions: normalizeBoundaryDecisions(input.boundary_decisions, "boundary_decisions", issues, false),
    ...(now === undefined ? {} : { now }),
  };
  validateCrossRefs(normalized, issues);
  return { input: normalized, now, issues };
}

function resultFor(generatedAt: string, input: FederationReportInput): FederationReportResult {
  const inputs = {
    source_refs: normalizeSourceRefs(input.source_refs, "source_refs", [], true),
    peers: normalizePeers(input.peers, "peers", [], true),
    lineage_exchanges: normalizeLineageExchanges(input.lineage_exchanges, "lineage_exchanges", [], true),
    boundary_decisions: normalizeBoundaryDecisions(input.boundary_decisions, "boundary_decisions", [], true),
  };
  const computed = computeReport(generatedAt, input.report_id, inputs);
  const draft: Omit<FederationReportResult, "federation_report_id" | "federation_report_digest"> = {
    manifest_version: FEDERATION_REPORT_VERSION,
    schema_ref: FEDERATION_REPORT_SCHEMA_REF,
    report_id: input.report_id,
    generated_at: generatedAt,
    status: "federation_report_ready",
    decision: "federation_report_ready",
    reasons: ["federation_report_ready", "derived_artifact_not_source_of_truth"],
    inputs,
    report_context: reportContext(),
    summary: computed.summary,
    peer_reports: computed.peerReports,
    json_report: computed.jsonReport,
    markdown_report: computed.markdownReport,
    guards: guards(),
    dry_run: dryRun(),
  };
  const digest = canonicalDigest(reportDigestPayload(draft));
  return { ...draft, federation_report_id: stableId("federation-report", [digest]), federation_report_digest: digest };
}

function invalidResult(generatedAt: string, issues: readonly FederationReportIssue[]): FederationReportResult {
  const safe = emptyInput();
  const inputs = {
    source_refs: normalizeSourceRefs(safe.source_refs, "source_refs", [], true),
    peers: normalizePeers(safe.peers, "peers", [], true),
    lineage_exchanges: normalizeLineageExchanges(safe.lineage_exchanges, "lineage_exchanges", [], true),
    boundary_decisions: normalizeBoundaryDecisions(safe.boundary_decisions, "boundary_decisions", [], true),
  };
  const computed = computeReport(generatedAt, safe.report_id, inputs);
  const draft: Omit<FederationReportResult, "federation_report_id" | "federation_report_digest"> = {
    manifest_version: FEDERATION_REPORT_VERSION,
    schema_ref: FEDERATION_REPORT_SCHEMA_REF,
    report_id: safe.report_id,
    generated_at: generatedAt,
    status: "invalid",
    decision: "invalid_federation_report_input",
    reasons: uniqueStrings(["invalid_federation_report_input", ...issues.map((entry) => entry.code)]),
    inputs,
    report_context: reportContext(),
    summary: computed.summary,
    peer_reports: computed.peerReports,
    json_report: computed.jsonReport,
    markdown_report: computed.markdownReport,
    guards: guards(),
    dry_run: dryRun(),
    issues,
  };
  const digest = canonicalDigest(reportDigestPayload(draft));
  return { ...draft, federation_report_id: stableId("federation-report", [digest]), federation_report_digest: digest };
}

function computeReport(generatedAt: string, reportId: string, inputs: FederationReportResult["inputs"]): ComputedReport {
  const summary = summarize(inputs);
  const peerReports = inputs.peers.map((peer) => peerReport(peer, inputs.lineage_exchanges, inputs.boundary_decisions));
  const jsonReport = {
    schema_ref: FEDERATION_REPORT_SCHEMA_REF,
    report_id: reportId,
    generated_at: generatedAt,
    report_context: reportContext(),
    source_refs: inputs.source_refs,
    summary,
    peers: peerReports,
    lineage_exchanges: inputs.lineage_exchanges,
    boundary_decisions: inputs.boundary_decisions,
  };
  return { summary, peerReports, jsonReport, markdownReport: renderMarkdown(generatedAt, reportId, summary, peerReports, inputs.lineage_exchanges, inputs.boundary_decisions) };
}

function summarize(inputs: FederationReportResult["inputs"]): FederationReportResult["summary"] {
  const peersByStatus = countBy(PEER_STATUSES, inputs.peers.map((peer) => peer.status));
  const treatiesByStatus = countBy(TREATY_STATUSES, inputs.peers.map((peer) => peer.treaty.status));
  const boundary = countBy(BOUNDARY_STATUSES, inputs.boundary_decisions.map((entry) => entry.status));
  const totalScore = inputs.peers.reduce((sum, peer) => sum + peer.reputation.score, 0);
  const averageScore = inputs.peers.length === 0 ? 0 : Math.round((totalScore / inputs.peers.length) * 100) / 100;
  return {
    peer_count: inputs.peers.length,
    peers_by_status: peersByStatus,
    treaties_by_status: treatiesByStatus,
    reputation: {
      average_score: averageScore,
      quarantine_recommended: inputs.peers.filter((peer) => peer.reputation.recommended_action === "quarantine").length,
      revocation_review_recommended: inputs.peers.filter((peer) => peer.reputation.recommended_action === "revocation_review").length,
    },
    lineage: {
      import_count: inputs.lineage_exchanges.filter((entry) => entry.direction === "import").length,
      export_count: inputs.lineage_exchanges.filter((entry) => entry.direction === "export").length,
      candidate_count: inputs.lineage_exchanges.filter((entry) => entry.status === "candidate_registered").length,
      blocked_count: inputs.lineage_exchanges.filter((entry) => entry.status === "blocked" || entry.status === "quarantined" || entry.status === "rejected").length,
      adopted_count: inputs.lineage_exchanges.filter((entry) => entry.adoption_performed === true).length,
    },
    boundary,
    quarantine_revocation: {
      quarantined_peers: sortedIds(inputs.peers.filter((peer) => peer.status === "quarantined").map((peer) => peer.peer_id)),
      revoked_peers: sortedIds(inputs.peers.filter((peer) => peer.status === "revoked").map((peer) => peer.peer_id)),
      reputation_quarantine_peers: sortedIds(inputs.peers.filter((peer) => peer.reputation.recommended_action === "quarantine").map((peer) => peer.peer_id)),
      reputation_revocation_review_peers: sortedIds(inputs.peers.filter((peer) => peer.reputation.recommended_action === "revocation_review").map((peer) => peer.peer_id)),
    },
  };
}

function peerReport(peer: Required<FederationPeerInput>, exchanges: readonly Required<FederationLineageExchangeInput>[], boundaries: readonly FederationBoundaryDecisionInput[]): FederationPeerReport {
  const peerExchanges = exchanges.filter((entry) => entry.peer_id === peer.peer_id);
  const peerBoundaries = boundaries.filter((entry) => entry.peer_id === peer.peer_id);
  const flags: string[] = [];
  if (peer.status === "quarantined") flags.push("peer_quarantined");
  if (peer.status === "revoked") flags.push("peer_revoked");
  if (peer.treaty.status !== "active") flags.push("treaty_not_active");
  if (peer.reputation.recommended_action === "quarantine") flags.push("reputation_quarantine");
  if (peer.reputation.recommended_action === "revocation_review") flags.push("reputation_revocation_review");
  if (peerBoundaries.some((entry) => entry.status === "quarantined")) flags.push("boundary_quarantined");
  if (peerBoundaries.some((entry) => entry.status === "rejected")) flags.push("boundary_rejected");
  return {
    peer_id: peer.peer_id,
    repository_full_name: peer.repository_full_name,
    status: peer.status,
    treaty_id: peer.treaty.treaty_id,
    treaty_status: peer.treaty.status,
    reputation_score: peer.reputation.score,
    reputation_action: peer.reputation.recommended_action,
    lineage_import_count: peerExchanges.filter((entry) => entry.direction === "import").length,
    lineage_export_count: peerExchanges.filter((entry) => entry.direction === "export").length,
    boundary_statuses: sortBoundaryStatuses(uniqueStrings(peerBoundaries.map((entry) => entry.status)) as FederationBoundaryStatus[]),
    visible_risk_flags: [...uniqueStrings(flags)].sort(),
  };
}

function renderMarkdown(generatedAt: string, reportId: string, summary: FederationReportResult["summary"], peers: readonly FederationPeerReport[], exchanges: readonly Required<FederationLineageExchangeInput>[], boundaries: readonly FederationBoundaryDecisionInput[]): string {
  const lines = [
    "# Federation Observability Report",
    "",
    `Report: ${reportId}`,
    `Generated: ${generatedAt}`,
    "Derived artifact: yes",
    "Source of truth: no",
    "Treaty replacement: no",
    "",
    "## Summary",
    "",
    `- Peers: ${summary.peer_count}`,
    `- Active: ${summary.peers_by_status.active}`,
    `- Quarantined: ${summary.peers_by_status.quarantined}`,
    `- Revoked: ${summary.peers_by_status.revoked}`,
    `- Lineage imports: ${summary.lineage.import_count}`,
    `- Lineage exports: ${summary.lineage.export_count}`,
    `- Boundary quarantined: ${summary.boundary.quarantined}`,
    "",
    "## Peers",
    "",
    "| Peer | Repository | Status | Treaty | Reputation | Lineage | Risk |",
    "|---|---|---:|---|---:|---:|---|",
    ...peers.map((peer) => `| ${peer.peer_id} | ${peer.repository_full_name} | ${peer.status} | ${peer.treaty_id} (${peer.treaty_status}) | ${peer.reputation_score} / ${peer.reputation_action} | I:${peer.lineage_import_count} E:${peer.lineage_export_count} | ${peer.visible_risk_flags.join(", ") || "none"} |`),
    "",
    "## Lineage Exchanges",
    "",
    "| Exchange | Peer | Direction | Status | Pack | Boundary | Adopted |",
    "|---|---|---:|---:|---|---|---:|",
    ...exchanges.map((entry) => `| ${entry.exchange_id} | ${entry.peer_id} | ${entry.direction} | ${entry.status} | ${entry.pack_id} | ${entry.boundary_decision_id ?? "none"} | ${entry.adoption_performed ? "yes" : "no"} |`),
    "",
    "## Boundary Decisions",
    "",
    "| Decision | Peer | Action | Status | Reasons |",
    "|---|---|---|---:|---|",
    ...boundaries.map((entry) => `| ${entry.boundary_decision_id} | ${entry.peer_id} | ${entry.action} | ${entry.status} | ${entry.reasons.join(", ")} |`),
  ];
  return `${lines.join("\n")}\n`;
}

function validateInputs(value: unknown, path: string, issues: FederationReportIssue[]): FederationReportResult["inputs"] | null {
  if (!isRecord(value)) {
    issue(issues, path, "inputs_required", "inputs must be present");
    return null;
  }
  validateKnownKeys(value, INPUT_KEYS, path, issues);
  const start = issues.length;
  const inputs = {
    source_refs: normalizeSourceRefs(value.source_refs, `${path}.source_refs`, issues, true),
    peers: normalizePeers(value.peers, `${path}.peers`, issues, true),
    lineage_exchanges: normalizeLineageExchanges(value.lineage_exchanges, `${path}.lineage_exchanges`, issues, true),
    boundary_decisions: normalizeBoundaryDecisions(value.boundary_decisions, `${path}.boundary_decisions`, issues, true),
  };
  validateCrossRefs(inputs, issues);
  return issues.length === start ? inputs : null;
}

function normalizeSourceRefs(value: unknown, path: string, issues: FederationReportIssue[], requireSorted: boolean): Required<FederationSourceRefsInput> {
  if (!isRecord(value)) {
    issue(issues, path, "source_refs_must_be_object", "source refs must be an object");
    return emptyInput().source_refs;
  }
  validateKnownKeys(value, SOURCE_REF_KEYS, path, issues);
  return {
    peer_registry_ref: safeRefField(value.peer_registry_ref, `${path}.peer_registry_ref`, issues),
    reputation_ref: safeRefField(value.reputation_ref, `${path}.reputation_ref`, issues),
    boundary_policy_ref: safeRefField(value.boundary_policy_ref, `${path}.boundary_policy_ref`, issues),
    treaty_refs: normalizeStringArray(value.treaty_refs, `${path}.treaty_refs`, issues, requireSorted),
    lineage_refs: normalizeStringArray(value.lineage_refs, `${path}.lineage_refs`, issues, requireSorted),
  };
}

function normalizePeers(value: unknown, path: string, issues: FederationReportIssue[], requireSorted: boolean): readonly Required<FederationPeerInput>[] {
  if (!Array.isArray(value)) {
    issue(issues, path, "peers_must_be_array", "peers must be an array");
    return [];
  }
  const peers = value.map((entry, index) => normalizePeer(entry, `${path}.${index}`, issues));
  validateSortedUnique(peers.map((peer) => peer.peer_id), path, issues, requireSorted);
  return [...peers].sort((left, right) => compare(left.peer_id, right.peer_id));
}

function normalizePeer(value: unknown, path: string, issues: FederationReportIssue[]): Required<FederationPeerInput> {
  if (!isRecord(value)) {
    issue(issues, path, "peer_must_be_object", "peer must be an object");
    return emptyPeer();
  }
  validateKnownKeys(value, PEER_KEYS, path, issues);
  const peerId = stringField(value.peer_id, `${path}.peer_id`, issues);
  const repository = stringField(value.repository_full_name, `${path}.repository_full_name`, issues);
  const status = enumField(value.status, new Set(PEER_STATUSES), `${path}.status`, "invalid_peer_status", issues, "unknown") as FederationPeerStatus;
  const treaty = normalizeTreaty(value.treaty, `${path}.treaty`, issues);
  const reputation = normalizeReputation(value.reputation, `${path}.reputation`, issues);
  const lastInteraction = nullableTimestamp(value.last_interaction_at, `${path}.last_interaction_at`, issues);
  if (peerId.length > 0 && !KEBAB_ID.test(peerId)) issue(issues, `${path}.peer_id`, "invalid_peer_id", "peer id must be lowercase kebab-case");
  if (repository.length > 0 && !REPOSITORY.test(repository)) issue(issues, `${path}.repository_full_name`, "invalid_repository", "repository must be owner/repo");
  return { peer_id: peerId, repository_full_name: repository, status, treaty, reputation, last_interaction_at: lastInteraction };
}

function normalizeTreaty(value: unknown, path: string, issues: FederationReportIssue[]): Required<FederationPeerInput>["treaty"] {
  if (!isRecord(value)) {
    issue(issues, path, "treaty_must_be_object", "treaty must be an object");
    return emptyPeer().treaty;
  }
  validateKnownKeys(value, TREATY_KEYS, path, issues);
  const treatyId = stringField(value.treaty_id, `${path}.treaty_id`, issues);
  const status = enumField(value.status, new Set(TREATY_STATUSES), `${path}.status`, "invalid_treaty_status", issues, "missing") as FederationTreatyStatus;
  const actions = normalizeStringArray(value.allowed_actions, `${path}.allowed_actions`, issues, true);
  const expiresAt = nullableTimestamp(value.expires_at, `${path}.expires_at`, issues);
  if (treatyId.length > 0 && !KEBAB_ID.test(treatyId)) issue(issues, `${path}.treaty_id`, "invalid_treaty_id", "treaty id must be lowercase kebab-case");
  return { treaty_id: treatyId, status, allowed_actions: actions, expires_at: expiresAt };
}

function normalizeReputation(value: unknown, path: string, issues: FederationReportIssue[]): Required<FederationPeerInput>["reputation"] {
  if (!isRecord(value)) {
    issue(issues, path, "reputation_must_be_object", "reputation must be an object");
    return emptyPeer().reputation;
  }
  validateKnownKeys(value, REPUTATION_KEYS, path, issues);
  return {
    score: numberField(value.score, `${path}.score`, issues, 0, 100, 0),
    recommended_action: enumField(value.recommended_action, REPUTATION_ACTIONS, `${path}.recommended_action`, "invalid_reputation_action", issues, "revocation_review") as FederationReputationAction,
  };
}

function normalizeLineageExchanges(value: unknown, path: string, issues: FederationReportIssue[], requireSorted: boolean): readonly Required<FederationLineageExchangeInput>[] {
  if (!Array.isArray(value)) {
    issue(issues, path, "lineage_exchanges_must_be_array", "lineage exchanges must be an array");
    return [];
  }
  const exchanges = value.map((entry, index) => normalizeLineageExchange(entry, `${path}.${index}`, issues));
  validateSortedUnique(exchanges.map((entry) => entry.exchange_id), path, issues, requireSorted);
  return [...exchanges].sort((left, right) => compare(left.exchange_id, right.exchange_id));
}

function normalizeLineageExchange(value: unknown, path: string, issues: FederationReportIssue[]): Required<FederationLineageExchangeInput> {
  if (!isRecord(value)) {
    issue(issues, path, "lineage_exchange_must_be_object", "lineage exchange must be an object");
    return emptyLineageExchange();
  }
  validateKnownKeys(value, LINEAGE_KEYS, path, issues);
  const exchangeId = stringField(value.exchange_id, `${path}.exchange_id`, issues);
  const peerId = stringField(value.peer_id, `${path}.peer_id`, issues);
  const direction = enumField(value.direction, LINEAGE_DIRECTIONS, `${path}.direction`, "invalid_lineage_direction", issues, "import") as FederationLineageDirection;
  const lineageRef = safeRefField(value.lineage_ref, `${path}.lineage_ref`, issues);
  const packId = safeRefField(value.pack_id, `${path}.pack_id`, issues);
  const status = enumField(value.status, LINEAGE_STATUSES, `${path}.status`, "invalid_lineage_status", issues, "blocked") as FederationLineageStatus;
  const boundaryDecisionId = nullableSafeRef(value.boundary_decision_id, `${path}.boundary_decision_id`, issues);
  const adoptionPerformed = optionalBoolean(value.adoption_performed, `${path}.adoption_performed`, issues, false, true);
  const occurredAt = timestampField(value.occurred_at, `${path}.occurred_at`, issues);
  if (exchangeId.length > 0 && !KEBAB_ID.test(exchangeId)) issue(issues, `${path}.exchange_id`, "invalid_exchange_id", "exchange id must be lowercase kebab-case");
  if (peerId.length > 0 && !KEBAB_ID.test(peerId)) issue(issues, `${path}.peer_id`, "invalid_peer_id", "peer id must be lowercase kebab-case");
  if (adoptionPerformed) issue(issues, `${path}.adoption_performed`, "adoption_authority_forbidden", "federation reports must not claim lineage adoption authority");
  return { exchange_id: exchangeId, peer_id: peerId, direction, lineage_ref: lineageRef, pack_id: packId, status, boundary_decision_id: boundaryDecisionId, adoption_performed: adoptionPerformed, occurred_at: occurredAt };
}

function normalizeBoundaryDecisions(value: unknown, path: string, issues: FederationReportIssue[], requireSorted: boolean): readonly FederationBoundaryDecisionInput[] {
  if (!Array.isArray(value)) {
    issue(issues, path, "boundary_decisions_must_be_array", "boundary decisions must be an array");
    return [];
  }
  const decisions = value.map((entry, index) => normalizeBoundaryDecision(entry, `${path}.${index}`, issues));
  validateSortedUnique(decisions.map((entry) => entry.boundary_decision_id), path, issues, requireSorted);
  return [...decisions].sort((left, right) => compare(left.boundary_decision_id, right.boundary_decision_id));
}

function normalizeBoundaryDecision(value: unknown, path: string, issues: FederationReportIssue[]): FederationBoundaryDecisionInput {
  if (!isRecord(value)) {
    issue(issues, path, "boundary_decision_must_be_object", "boundary decision must be an object");
    return emptyBoundaryDecision();
  }
  validateKnownKeys(value, BOUNDARY_KEYS, path, issues);
  const boundaryDecisionId = stringField(value.boundary_decision_id, `${path}.boundary_decision_id`, issues);
  const peerId = stringField(value.peer_id, `${path}.peer_id`, issues);
  const status = enumField(value.status, new Set(BOUNDARY_STATUSES), `${path}.status`, "invalid_boundary_status", issues, "invalid") as FederationBoundaryStatus;
  const decision = stringField(value.decision, `${path}.decision`, issues);
  const action = stringField(value.action, `${path}.action`, issues);
  const reasons = normalizeStringArray(value.reasons, `${path}.reasons`, issues, false);
  if (boundaryDecisionId.length > 0 && !ID.test(boundaryDecisionId)) issue(issues, `${path}.boundary_decision_id`, "invalid_boundary_decision_id", "boundary decision id must be deterministic");
  if (peerId.length > 0 && !KEBAB_ID.test(peerId)) issue(issues, `${path}.peer_id`, "invalid_peer_id", "peer id must be lowercase kebab-case");
  return { boundary_decision_id: boundaryDecisionId, peer_id: peerId, status, decision, action, reasons };
}

function validateCrossRefs(input: { peers: readonly Required<FederationPeerInput>[]; lineage_exchanges: readonly Required<FederationLineageExchangeInput>[]; boundary_decisions: readonly FederationBoundaryDecisionInput[] }, issues: FederationReportIssue[]): void {
  const peers = new Set(input.peers.map((peer) => peer.peer_id));
  const boundaryIds = new Set(input.boundary_decisions.map((entry) => entry.boundary_decision_id));
  input.lineage_exchanges.forEach((entry) => {
    if (!peers.has(entry.peer_id)) issue(issues, `lineage_exchanges.${entry.exchange_id}.peer_id`, "unknown_peer_ref", "lineage exchange must reference a reported peer");
    if (entry.boundary_decision_id !== null && !boundaryIds.has(entry.boundary_decision_id)) issue(issues, `lineage_exchanges.${entry.exchange_id}.boundary_decision_id`, "unknown_boundary_ref", "lineage exchange boundary decision must be reported");
  });
  input.boundary_decisions.forEach((entry) => {
    if (!peers.has(entry.peer_id)) issue(issues, `boundary_decisions.${entry.boundary_decision_id}.peer_id`, "unknown_peer_ref", "boundary decision must reference a reported peer");
  });
}

function validateTopLevel(value: Record<string, unknown>, issues: FederationReportIssue[]): void {
  if (value.manifest_version !== FEDERATION_REPORT_VERSION) issue(issues, "manifest_version", "invalid_manifest_version", "manifest_version must be 1");
  if (value.schema_ref !== FEDERATION_REPORT_SCHEMA_REF) issue(issues, "schema_ref", "invalid_schema_ref", "schema_ref must identify T068 federation report v1");
  if (typeof value.federation_report_id !== "string" || !ID.test(value.federation_report_id)) issue(issues, "federation_report_id", "invalid_federation_report_id", "federation_report_id must be deterministic");
  if (typeof value.report_id !== "string" || !KEBAB_ID.test(value.report_id)) issue(issues, "report_id", "invalid_report_id", "report_id must be lowercase kebab-case");
  if (typeof value.generated_at !== "string" || !isRfc3339Utc(value.generated_at)) issue(issues, "generated_at", "invalid_generated_at", "generated_at must be RFC3339 UTC");
  if (value.status !== "federation_report_ready" && value.status !== "invalid") issue(issues, "status", "invalid_status", "status must be federation_report_ready or invalid");
  if (value.decision !== "federation_report_ready" && value.decision !== "invalid_federation_report_input") issue(issues, "decision", "invalid_decision", "decision must be a T068 federation report decision");
  if (!Array.isArray(value.reasons) || value.reasons.length === 0 || value.reasons.some((entry) => typeof entry !== "string" || entry.length === 0)) issue(issues, "reasons", "invalid_reasons", "reasons must be non-empty strings");
}

function validateReportContext(value: unknown, issues: FederationReportIssue[]): void {
  if (!isRecord(value)) {
    issue(issues, "report_context", "report_context_required", "report context must be present");
    return;
  }
  const expected = reportContext();
  validateKnownKeys(value, new Set(Object.keys(expected)), "report_context", issues);
  for (const [key, expectedValue] of Object.entries(expected)) if (value[key] !== expectedValue) issue(issues, `report_context.${key}`, "source_of_truth_boundary_required", `${key} must remain ${expectedValue}`);
}

function validateSummaryShape(value: unknown, path: string, issues: FederationReportIssue[]): void {
  if (!isRecord(value)) {
    issue(issues, path, "summary_required", "summary must be present");
    return;
  }
  if (typeof value.peer_count !== "number") issue(issues, `${path}.peer_count`, "invalid_count", "peer_count must be numeric");
  for (const key of ["peers_by_status", "treaties_by_status", "reputation", "lineage", "boundary", "quarantine_revocation"]) if (!isRecord(value[key])) issue(issues, `${path}.${key}`, "summary_section_required", `${key} must be present`);
}

function validatePeerReports(value: unknown, path: string, issues: FederationReportIssue[]): void {
  if (!Array.isArray(value)) {
    issue(issues, path, "peer_reports_must_be_array", "peer reports must be an array");
    return;
  }
  validateSortedUnique(value.map((entry) => isRecord(entry) && typeof entry.peer_id === "string" ? entry.peer_id : ""), path, issues, true);
}

function validateGuards(value: unknown, issues: FederationReportIssue[]): void {
  if (!isRecord(value)) {
    issue(issues, "guards", "guards_required", "guards must be present");
    return;
  }
  validateKnownKeys(value, new Set(Object.keys(guards())), "guards", issues);
  for (const key of Object.keys(guards())) if (value[key] !== true) issue(issues, `guards.${key}`, "guard_required", `${key} must be true`);
}

function validateDryRun(value: unknown, issues: FederationReportIssue[]): void {
  if (!isRecord(value)) {
    issue(issues, "dry_run", "dry_run_required", "dry_run must be present");
    return;
  }
  validateKnownKeys(value, new Set(Object.keys(dryRun())), "dry_run", issues);
  for (const key of Object.keys(dryRun())) if (value[key] !== false) issue(issues, `dry_run.${key}`, "side_effect_forbidden", `${key} must be false`);
}

function validateTerminal(value: Record<string, unknown>, issues: FederationReportIssue[]): void {
  if (value.status === "federation_report_ready" && value.decision !== "federation_report_ready") issue(issues, "decision", "ready_decision_mismatch", "ready reports must use federation_report_ready");
  if (value.status === "invalid" && value.decision !== "invalid_federation_report_input") issue(issues, "decision", "invalid_decision_mismatch", "invalid reports must use invalid_federation_report_input");
  if (value.status === "invalid") {
    if (!Array.isArray(value.issues) || value.issues.length === 0) issue(issues, "issues", "invalid_issues_required", "invalid federation report must carry issues");
    else value.issues.forEach((entry, index) => validateIssue(entry, `issues.${index}`, issues));
  } else if (value.issues !== undefined) {
    issue(issues, "issues", "non_invalid_issues_forbidden", "non-invalid federation report must not carry issues");
  }
}

function validateIssue(value: unknown, path: string, issues: FederationReportIssue[]): void {
  if (!isRecord(value)) {
    issue(issues, path, "issue_must_be_object", "issue must be an object");
    return;
  }
  validateKnownKeys(value, ISSUE_KEYS, path, issues);
  for (const key of ["path", "code", "message"]) if (typeof value[key] !== "string" || value[key].length === 0) issue(issues, `${path}.${key}`, "invalid_issue_field", "issue fields must be non-empty strings");
}

function reportContext(): FederationReportResult["report_context"] {
  return {
    derived_artifact: true,
    source_of_truth: false,
    treaty_replacement: false,
    authoritative_peer_state: false,
    authoritative_reputation: false,
  };
}

function guards(): FederationReportResult["guards"] {
  return {
    derived_artifact_only: true,
    source_refs_required: true,
    revoked_and_quarantined_visible: true,
    lineage_exchange_traceable: true,
    no_treaty_replacement: true,
    no_authoritative_reputation_write: true,
    no_network_transport: true,
    no_dashboard_hosting: true,
    no_automatic_treaty_change: true,
  };
}

function dryRun(): FederationReportResult["dry_run"] {
  return {
    network_transport_performed: false,
    dashboard_hosted: false,
    treaty_changed: false,
    reputation_written: false,
    github_api_called: false,
  };
}

function emptyInput(): FederationReportInput {
  return {
    report_id: "invalid-federation-report",
    source_refs: {
      peer_registry_ref: "forge://invalid/peer-registry",
      reputation_ref: "forge://invalid/reputation",
      boundary_policy_ref: "forge://hiroshitanaka-creator/ForgeRoot/policy/network-boundary",
      treaty_refs: [],
      lineage_refs: [],
    },
    peers: [],
    lineage_exchanges: [],
    boundary_decisions: [],
  };
}

function emptyPeer(): Required<FederationPeerInput> {
  return {
    peer_id: "invalid-peer",
    repository_full_name: "owner/invalid",
    status: "unknown",
    treaty: { treaty_id: "missing-treaty", status: "missing", allowed_actions: [], expires_at: null },
    reputation: { score: 0, recommended_action: "revocation_review" },
    last_interaction_at: null,
  };
}

function emptyLineageExchange(): Required<FederationLineageExchangeInput> {
  return {
    exchange_id: "invalid-exchange",
    peer_id: "invalid-peer",
    direction: "import",
    lineage_ref: "forge-lineage://invalid/root",
    pack_id: "forge-archive-pack://invalid",
    status: "blocked",
    boundary_decision_id: null,
    adoption_performed: false,
    occurred_at: DEFAULT_NOW,
  };
}

function emptyBoundaryDecision(): FederationBoundaryDecisionInput {
  return {
    boundary_decision_id: "network-boundary-00000000",
    peer_id: "invalid-peer",
    status: "invalid",
    decision: "invalid_network_boundary_input",
    action: "lineage_import_candidate",
    reasons: ["invalid_boundary_decision"],
  };
}

function reportDigestPayload(value: Omit<FederationReportResult, "federation_report_id" | "federation_report_digest"> | FederationReportResult): unknown {
  return {
    manifest_version: value.manifest_version,
    schema_ref: value.schema_ref,
    report_id: value.report_id,
    generated_at: value.generated_at,
    status: value.status,
    decision: value.decision,
    reasons: value.reasons,
    inputs: value.inputs,
    report_context: value.report_context,
    summary: value.summary,
    peer_reports: value.peer_reports,
    json_report: value.json_report,
    markdown_report: value.markdown_report,
    guards: value.guards,
    dry_run: value.dry_run,
    issues: value.issues ?? [],
  };
}

function countBy<T extends string>(keys: readonly T[], values: readonly T[]): Record<T, number> {
  const out = Object.fromEntries(keys.map((key) => [key, 0])) as Record<T, number>;
  values.forEach((value) => { out[value] += 1; });
  return out;
}

function sortBoundaryStatuses(values: readonly FederationBoundaryStatus[]): readonly FederationBoundaryStatus[] {
  const set = new Set(values);
  return BOUNDARY_STATUSES.filter((status) => set.has(status));
}

function sortedIds(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort();
}

function normalizeStringArray(value: unknown, path: string, issues: FederationReportIssue[], requireSorted: boolean): readonly string[] {
  if (!Array.isArray(value)) {
    issue(issues, path, "array_required", `${path} must be an array`);
    return [];
  }
  const entries = value.map((entry, index) => {
    if (typeof entry !== "string" || entry.length === 0) {
      issue(issues, `${path}.${index}`, "non_empty_string_required", `${path} entries must be non-empty strings`);
      return "";
    }
    if (!SAFE_REF.test(entry)) issue(issues, `${path}.${index}`, "invalid_ref", `${path} entries must be safe refs`);
    return entry;
  }).filter((entry) => entry.length > 0);
  validateSortedUnique(entries, path, issues, requireSorted);
  return [...new Set(entries)].sort();
}

function validateSortedUnique(values: readonly string[], path: string, issues: FederationReportIssue[], requireSorted: boolean): void {
  const seen = new Set<string>();
  let previous = "";
  values.forEach((entry, index) => {
    if (seen.has(entry)) issue(issues, `${path}.${index}`, "duplicate_entry", `${path} entries must be unique`);
    if (requireSorted && index > 0 && previous > entry) issue(issues, path, "entries_not_sorted", `${path} entries must be sorted`);
    seen.add(entry);
    previous = entry;
  });
}

function safeRefField(value: unknown, path: string, issues: FederationReportIssue[]): string {
  const text = stringField(value, path, issues);
  if (text.length > 0 && !SAFE_REF.test(text)) issue(issues, path, "invalid_ref", `${path} must be a safe ref`);
  return text;
}

function nullableSafeRef(value: unknown, path: string, issues: FederationReportIssue[]): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || value.length === 0 || !SAFE_REF.test(value)) {
    issue(issues, path, "invalid_ref", `${path} must be null or a safe ref`);
    return null;
  }
  return value;
}

function nullableTimestamp(value: unknown, path: string, issues: FederationReportIssue[]): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string" || !isRfc3339Utc(value)) {
    issue(issues, path, "invalid_timestamp", `${path} must be null or RFC3339 UTC`);
    return null;
  }
  return value;
}

function timestampField(value: unknown, path: string, issues: FederationReportIssue[]): string {
  if (typeof value !== "string" || !isRfc3339Utc(value)) {
    issue(issues, path, "invalid_timestamp", `${path} must be RFC3339 UTC`);
    return DEFAULT_NOW;
  }
  return value;
}

function optionalBoolean(value: unknown, path: string, issues: FederationReportIssue[], fallback: boolean, requireComplete: boolean): boolean {
  if (value === undefined) {
    if (requireComplete) issue(issues, path, "missing_lineage_key", `${path} must be present in resolved lineage exchange`);
    return fallback;
  }
  return booleanField(value, path, issues);
}

function numberField(value: unknown, path: string, issues: FederationReportIssue[], min: number, max: number, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    issue(issues, path, "invalid_number", `${path} must be a number from ${min} to ${max}`);
    return fallback;
  }
  return value;
}

function stringField(value: unknown, path: string, issues: FederationReportIssue[]): string {
  if (typeof value !== "string") {
    issue(issues, path, "string_required", `${path} must be a string`);
    return "";
  }
  if (value.trim().length === 0) issue(issues, path, "non_empty_string_required", `${path} must be non-empty`);
  return value.trim();
}

function optionalString(value: unknown, path: string, issues: FederationReportIssue[]): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string") {
    issue(issues, path, "string_required", `${path} must be a string when provided`);
    return undefined;
  }
  return value;
}

function enumField(value: unknown, allowed: Set<string>, path: string, code: string, issues: FederationReportIssue[], fallback: string): string {
  if (typeof value === "string" && allowed.has(value)) return value;
  issue(issues, path, code, `${path} contains an unknown value`);
  return fallback;
}

function booleanField(value: unknown, path: string, issues: FederationReportIssue[]): boolean {
  if (typeof value === "boolean") return value;
  issue(issues, path, "boolean_required", `${path} must be boolean`);
  return false;
}

function validateKnownKeys(value: Record<string, unknown>, allowed: Set<string>, path: string, issues: FederationReportIssue[]): void {
  for (const key of Object.keys(value)) if (!allowed.has(key)) issue(issues, `${path}.${key}`, "unknown_key", "unknown keys are not allowed");
}

function validateNoSecretMaterial(value: unknown, path: string, issues: FederationReportIssue[]): void {
  if (typeof value === "string") {
    const lower = value.toLowerCase();
    if (lower.includes("bearer ") || lower.includes("ghp_") || lower.includes("github_pat_") || lower.includes("-----begin") || lower.includes("private_key")) issue(issues, path, "secret_material_forbidden", "federation reports must not contain token or private-key material");
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) => validateNoSecretMaterial(entry, `${path}.${index}`, issues));
    return;
  }
  if (isRecord(value)) for (const [key, child] of Object.entries(value)) validateNoSecretMaterial(child, `${path}.${key}`, issues);
}

function resolveTimestamp(value: string | undefined, fallback: string): string | null {
  if (value !== undefined) return isRfc3339Utc(value) ? value : null;
  return isRfc3339Utc(fallback) ? fallback : DEFAULT_NOW;
}

function isRfc3339Utc(value: string): boolean {
  if (!RFC3339_UTC.test(value)) return false;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  const normalized = value.includes(".") ? value : value.replace("Z", ".000Z");
  return parsed.toISOString() === normalized;
}

function compare(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function canonicalDigest(value: unknown): string {
  return `sha-fnv1a-${fnv1a(canonicalStringify(value)).toString(16).padStart(8, "0")}`;
}

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

function stableId(prefix: string, parts: readonly string[]): string {
  return `${prefix}-${fnv1a(parts.join("\u001f")).toString(16).padStart(8, "0")}`;
}

function fnv1a(value: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

function uniqueStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values.filter((entry) => entry.length > 0))];
}

function issue(issues: FederationReportIssue[], path: string, code: string, message: string): void {
  issues.push({ path, code, message });
}

function makeIssue(path: string, code: string, message: string): FederationReportIssue {
  return { path, code, message };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

export const runT068FederationObservability = renderFederationReport;
export const validateT068FederationObservability = validateFederationReport;
