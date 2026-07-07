export declare const DISTRIBUTED_EVOLUTION_DEMO_VERSION: 1;
export declare const DISTRIBUTED_EVOLUTION_DEMO_SCHEMA_REF: "urn:forgeroot:distributed-evolution-demo:v1";
export type DistributedEvolutionDemoStatus = "ready" | "blocked" | "invalid";
export type DistributedEvolutionDemoDecision = "distributed_evolution_demo_ready" | "distributed_evolution_demo_blocked" | "invalid_distributed_evolution_demo_input";
export interface DistributedEvolutionDemoIssue {
    readonly path: string;
    readonly code: string;
    readonly message: string;
}
export interface DistributedEvolutionDemoInput {
    readonly now?: string;
    readonly topology?: unknown;
    readonly route_id?: string;
    readonly open_federation_requested?: boolean;
    readonly network_transport_requested?: boolean;
    readonly lineage_adoption_requested?: boolean;
}
export interface DistributedEvolutionDemoStep {
    readonly name: string;
    readonly status: string;
    readonly produced: string;
    readonly id: string | null;
}
export interface DistributedEvolutionDemoResult {
    readonly manifest_version: typeof DISTRIBUTED_EVOLUTION_DEMO_VERSION;
    readonly schema_ref: typeof DISTRIBUTED_EVOLUTION_DEMO_SCHEMA_REF;
    readonly demo_id: string;
    readonly created_at: string;
    readonly status: DistributedEvolutionDemoStatus;
    readonly decision: DistributedEvolutionDemoDecision;
    readonly reasons: readonly string[];
    readonly topology_ref: {
        readonly topology_id: string;
        readonly topology_path: "labs/forge-net/topology.yml";
        readonly scope: "lab_only";
        readonly source_of_truth: false;
    };
    readonly steps: readonly DistributedEvolutionDemoStep[];
    readonly summary: {
        readonly route_id: string | null;
        readonly source_peer_id: string | null;
        readonly target_peer_id: string | null;
        readonly lineage_pack_id: string | null;
        readonly boundary_decision_id: string | null;
        readonly cross_repo_composition_id: string | null;
        readonly arena_result_id: string | null;
        readonly federation_report_id: string | null;
        readonly arena_winner_candidate_id: string | null;
    };
    readonly invariants: {
        readonly lab_only: true;
        readonly source_of_truth_replacement: false;
        readonly open_federation_enabled: false;
        readonly live_network_transport_performed: false;
        readonly github_api_called: false;
        readonly github_pr_created: false;
        readonly git_push_performed: false;
        readonly lineage_adoption_performed: false;
        readonly policy_mutation_performed: false;
        readonly authoritative_reputation_written: false;
        readonly automatic_merge_performed: false;
        readonly all_read_back_validations_passed: boolean;
    };
    readonly validation_summary: {
        readonly lineage_pack: boolean;
        readonly peer_reputation: boolean;
        readonly network_boundary: boolean;
        readonly cross_repo_pr: boolean;
        readonly arena: boolean;
        readonly federation_report: boolean;
    };
    readonly chain: {
        readonly lineagePack?: unknown;
        readonly peerReputation?: unknown;
        readonly networkBoundary?: unknown;
        readonly crossRepoPr?: unknown;
        readonly arenaComparison?: unknown;
        readonly federationReport?: unknown;
    };
    readonly demo_digest: string;
    readonly issues?: readonly DistributedEvolutionDemoIssue[];
}
export interface DistributedEvolutionDemoValidation {
    readonly ok: boolean;
    readonly issues: readonly DistributedEvolutionDemoIssue[];
}
export declare const DISTRIBUTED_EVOLUTION_DEMO_CONTRACT: {
    readonly consumes: readonly ["t069_forge_net_topology", "t061_lineage_pack_export", "t063_peer_reputation", "t067_network_boundary", "t062_cross_repo_pr_composition", "t065_conflict_arena", "t068_federation_report"];
    readonly produces: readonly ["t070_distributed_evolution_demo_manifest", "lab_only_distributed_evolution_chain"];
    readonly validates: readonly ["topology_lab_only", "treaty_scoped_route", "lineage_pack_read_back", "boundary_read_back", "cross_repo_pr_read_back", "arena_read_back", "federation_report_read_back", "no_side_effects"];
    readonly forbids: readonly ["open_federation", "live_network_transport", "github_api_call", "github_pr_creation", "git_push", "automatic_lineage_adoption", "authoritative_reputation_write", "policy_mutation", "automatic_merge"];
    readonly deterministic: true;
    readonly labOnly: true;
    readonly manifestOnly: true;
};
export declare function runDistributedEvolutionDemo(input?: DistributedEvolutionDemoInput): DistributedEvolutionDemoResult;
export declare function validateDistributedEvolutionDemo(value: unknown): DistributedEvolutionDemoValidation;
export declare const runT070DistributedEvolutionDemo: typeof runDistributedEvolutionDemo;
export declare const validateT070DistributedEvolutionDemo: typeof validateDistributedEvolutionDemo;
