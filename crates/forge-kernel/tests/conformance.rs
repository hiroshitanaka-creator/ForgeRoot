use std::path::{Path, PathBuf};

use forge_kernel::{parse_file, parse_str, validate_document_shape_for_path, verify_integrity, IntegrityStatus};

fn repo_root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
}

fn fixture(path: &str) -> PathBuf {
    repo_root().join("docs/specs/fixtures/forge-v1").join(path)
}

#[test]
fn existing_t004_valid_fixture_hash_is_stable() {
    let doc = parse_file(fixture("valid/minimal-agent.forge")).expect("minimal agent parses");
    assert_eq!(
        doc.canonical_hash,
        "sha256:c9479eb2f842c5d17157ce5557df0d7a1708952ccf8d247fdcb5968fa0c10275"
    );
}

#[test]
fn t003_bootstrap_files_are_parseable() {
    let mind = parse_file(repo_root().join(".forge/mind.forge")).expect("mind parses");
    let policy = parse_file(repo_root().join(".forge/policies/constitution.forge"))
        .expect("constitution parses");

    assert_eq!(mind.canonical_hash, "sha256:3f2e4e4793194d00e1c73982e79591633349e3b47a64db7e01af464103b81702");
    assert_eq!(policy.canonical_hash, "sha256:a9f49b52c71bc8be774885d37e814f0a6a7ceeae524aa9f6f95d7fd5636bdeaf");
}

#[test]
fn comments_and_source_order_do_not_change_hash() {
    let a = parse_file(fixture("hash/equivalent-comments-a.forge")).expect("A parses");
    let b = parse_file(fixture("hash/equivalent-comments-b.forge")).expect("B parses");

    assert_eq!(a.canonical, b.canonical);
    assert_eq!(a.canonical_hash, b.canonical_hash);
    assert_eq!(a.canonical_hash, "sha256:acd78ed7aa1e0ae9025c2b00c5bcbc2a1eb7687a9b7888c97d1c60d332924c4d");
}

#[test]
fn invalid_shape_missing_revision_is_rejected() {
    let err = parse_file(fixture("invalid/missing-revision.forge")).unwrap_err();
    assert!(err.to_string().contains("revision"));
}


#[test]
fn bad_magic_is_rejected() {
    let err = parse_file(fixture("invalid/bad-magic.forge")).unwrap_err();
    assert!(err.to_string().contains("magic"));
}

#[test]
fn duplicate_keys_are_rejected() {
    let err = parse_file(fixture("invalid/duplicate-key.forge")).unwrap_err();
    assert!(err.to_string().contains("duplicate mapping key"));
}

#[test]
fn crlf_is_rejected() {
    let err = parse_file(fixture("invalid/crlf-line-endings.forge")).unwrap_err();
    assert!(err.to_string().contains("CR"));
}

#[test]
fn tabs_are_rejected() {
    let err = parse_file(fixture("invalid/tab-indentation.forge")).unwrap_err();
    assert!(err.to_string().contains("tabs"));
}

#[test]
fn anchors_and_aliases_are_rejected() {
    let err = parse_file(fixture("invalid/anchor-alias.forge")).unwrap_err();
    assert!(err.to_string().contains("anchor") || err.to_string().contains("alias"));
}

#[test]
fn non_empty_flow_mappings_are_rejected_until_duplicate_detection_is_event_based() {
    let err = parse_file(fixture("invalid/flow-mapping.forge")).unwrap_err();
    assert!(err.to_string().contains("flow-style mappings"));
}

#[test]
fn integrity_absent_returns_external_hash() {
    let doc = parse_file(fixture("hash/equivalent-comments-a.forge")).expect("fixture parses");
    let status = verify_integrity(&doc.value).expect("integrity status resolves");
    assert_eq!(
        status,
        IntegrityStatus::Absent {
            hash: "sha256:acd78ed7aa1e0ae9025c2b00c5bcbc2a1eb7687a9b7888c97d1c60d332924c4d".to_string(),
        }
    );
}


#[test]
fn integrity_hash_and_signatures_are_normalized_for_hashing() {
    let base = r#"#!forge/v1
forge_version: 1
schema_ref: urn:forgeroot:forge:agent:v1
kind: agent
id: forge://hiroshitanaka-creator/ForgeRoot/agent/integrity.demo
revision: 01KPF100000000000000000000
mind_ref: forge://hiroshitanaka-creator/ForgeRoot/mind/root
status: seeded
title: Integrity Demo Agent
summary: Agent used to prove canonical hash ignores signature material.
owners:
  - github-app://forgeroot
created_at: 2026-04-18T00:00:00Z
updated_at: 2026-04-18T00:00:00Z
identity: {}
role: {}
constitution: {}
context_recipe: {}
tools: []
memory: {}
scores: {}
evolution: {}
mutation_log: []
provenance: {}
"#;

    let first = format!(
        "{}integrity:\n  canonical_hash: sha256:{}\n  attachment_hashes: []\n  signatures:\n    - scheme: github-app-jws\n      keyid: a\n      sig: aaa\n      signed_at: 2026-04-18T00:00:00Z\nextensions: {{}}\n",
        base,
        "1".repeat(64)
    );
    let second = format!(
        "{}integrity:\n  canonical_hash: sha256:{}\n  attachment_hashes: []\n  signatures:\n    - scheme: github-app-jws\n      keyid: b\n      sig: bbb\n      signed_at: 2026-04-19T00:00:00Z\nextensions: {{}}\n",
        base,
        "2".repeat(64)
    );

    let first_doc = parse_str(&first).expect("first integrity fixture parses");
    let second_doc = parse_str(&second).expect("second integrity fixture parses");

    assert_eq!(first_doc.canonical, second_doc.canonical);
    assert_eq!(first_doc.canonical_hash, second_doc.canonical_hash);
}

// ── path-aware validation tests ──────────────────────────────────────────────

#[test]
fn path_aware_valid_agent_at_canonical_agents_path() {
    let doc = parse_file(fixture("valid/minimal-agent.forge")).expect("minimal agent parses");
    let path = Path::new(".forge/agents/planner.alpha.forge");
    validate_document_shape_for_path(&doc.value, Some(path))
        .expect("valid planner at .forge/agents/planner.alpha.forge should pass");
}

#[test]
fn path_aware_valid_canonical_executor_agent() {
    let doc = parse_file(fixture("valid/canonical-executor-agent.forge"))
        .expect("canonical executor fixture parses");
    let path = Path::new(".forge/agents/executor.alpha.forge");
    validate_document_shape_for_path(&doc.value, Some(path))
        .expect("valid executor at .forge/agents/executor.alpha.forge should pass");
}

#[test]
fn path_aware_species_mismatch_at_executor_path_is_rejected() {
    let doc = parse_file(fixture("invalid/agent-species-mismatch.forge"))
        .expect("species-mismatch fixture passes base validation");
    let path = Path::new(".forge/agents/executor.alpha.forge");
    let err = validate_document_shape_for_path(&doc.value, Some(path))
        .unwrap_err();
    assert!(
        err.to_string().contains("species"),
        "expected 'species' in error, got: {err}"
    );
}

#[test]
fn path_aware_wrong_kind_at_agents_path_fails() {
    let doc = parse_file(repo_root().join(".forge/mind.forge")).expect("mind parses");
    let path = Path::new(".forge/agents/root.forge");
    let err = validate_document_shape_for_path(&doc.value, Some(path)).unwrap_err();
    assert!(
        err.to_string().contains("kind"),
        "expected 'kind' in error, got: {err}"
    );
}

#[test]
fn path_aware_valid_mind_at_mind_path() {
    let mind_path = repo_root().join(".forge/mind.forge");
    let doc = parse_file(&mind_path).expect("mind parses");
    validate_document_shape_for_path(&doc.value, Some(Path::new(".forge/mind.forge")))
        .expect("mind at .forge/mind.forge should pass");
}

#[test]
fn path_aware_agent_at_mind_path_is_rejected() {
    let doc = parse_file(fixture("valid/minimal-agent.forge")).expect("minimal agent parses");
    let err = validate_document_shape_for_path(&doc.value, Some(Path::new(".forge/mind.forge")))
        .unwrap_err();
    assert!(
        err.to_string().contains("kind"),
        "expected 'kind' in error, got: {err}"
    );
}

#[test]
fn path_aware_valid_policy_at_policies_path() {
    let policy_path = repo_root().join(".forge/policies/constitution.forge");
    let doc = parse_file(&policy_path).expect("constitution parses");
    validate_document_shape_for_path(
        &doc.value,
        Some(Path::new(".forge/policies/constitution.forge")),
    )
    .expect("policy at .forge/policies/constitution.forge should pass");
}

#[test]
fn path_none_skips_path_consistency_check() {
    let doc = parse_file(fixture("invalid/agent-species-mismatch.forge"))
        .expect("species-mismatch fixture passes base validation");
    validate_document_shape_for_path(&doc.value, None)
        .expect("no path means only base validation, which passes for this fixture");
}
