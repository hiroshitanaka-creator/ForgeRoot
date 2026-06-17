use std::path::{Component, Path};

use regex::Regex;
use serde_json::Value;

use crate::canonical::TOP_LEVEL_KEY_ORDER;
use crate::error::{Error, Result};

const COMMON_REQUIRED: &[&str] = &[
    "forge_version",
    "schema_ref",
    "kind",
    "id",
    "revision",
    "mind_ref",
    "status",
    "title",
    "summary",
    "owners",
    "created_at",
    "updated_at",
    "extensions",
];

const KINDS: &[&str] = &[
    "mind",
    "agent",
    "policy",
    "eval_suite",
    "lineage",
    "treaty",
    "memory_index",
];

const STATUSES: &[&str] = &["seeded", "active", "quarantined", "deprecated", "fossilized"];

pub fn validate_document_shape(value: &Value) -> Result<()> {
    let root = value.as_object().ok_or(Error::RootNotMapping)?;

    for key in root.keys() {
        if !TOP_LEVEL_KEY_ORDER.contains(&key.as_str()) {
            return Err(Error::UnknownTopLevelKey { key: key.clone() });
        }
    }

    for key in COMMON_REQUIRED {
        require(root.get(*key), &format!("$.{key}"))?;
    }

    require_int_eq(root.get("forge_version"), "$.forge_version", 1)?;

    let kind = require_string(root.get("kind"), "$.kind")?;
    if !KINDS.contains(&kind) {
        return shape("$.kind", format!("unsupported kind '{kind}'"));
    }

    let schema_ref = require_string(root.get("schema_ref"), "$.schema_ref")?;
    let expected_schema_ref = format!("urn:forgeroot:forge:{kind}:v1");
    if schema_ref != expected_schema_ref {
        return shape(
            "$.schema_ref",
            format!("expected '{expected_schema_ref}' for kind '{kind}'"),
        );
    }

    validate_regex(
        require_string(root.get("id"), "$.id")?,
        r"^forge://[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/(mind|agent|policy|eval_suite|lineage|treaty|memory_index)/[a-z0-9._-]+$",
        "$.id",
        "invalid forge URI",
    )?;
    validate_regex(
        require_string(root.get("revision"), "$.revision")?,
        r"^[0-9A-HJKMNP-TV-Z]{26}$",
        "$.revision",
        "revision must be a ULID string",
    )?;

    match root.get("mind_ref") {
        Some(Value::Null) => {}
        Some(Value::String(s)) => validate_regex(
            s,
            r"^forge://[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/(mind|agent|policy|eval_suite|lineage|treaty|memory_index)/[a-z0-9._-]+$",
            "$.mind_ref",
            "invalid forge URI or null expected",
        )?,
        _ => return shape("$.mind_ref", "must be a forge URI string or null"),
    }

    let status = require_string(root.get("status"), "$.status")?;
    if !STATUSES.contains(&status) {
        return shape("$.status", format!("unsupported status '{status}'"));
    }

    require_nonempty_string(root.get("title"), "$.title")?;
    require_nonempty_string(root.get("summary"), "$.summary")?;
    require_string_array_nonempty(root.get("owners"), "$.owners")?;
    require_nonempty_string(root.get("created_at"), "$.created_at")?;
    require_nonempty_string(root.get("updated_at"), "$.updated_at")?;
    require_object(root.get("extensions"), "$.extensions")?;

    match kind {
        "mind" => require_keys(
            root,
            &[
                "identity",
                "constitution",
                "repo_profile",
                "approval_matrix",
                "branch_contracts",
                "allowed_species",
                "budget_caps",
                "treaty_policy",
                "provenance",
            ],
        ),
        "agent" => require_keys(
            root,
            &[
                "identity",
                "role",
                "constitution",
                "context_recipe",
                "tools",
                "memory",
                "scores",
                "evolution",
                "mutation_log",
                "provenance",
            ],
        ),
        "policy" => require_keys(
            root,
            &[
                "policy_type",
                "rules",
                "thresholds",
                "actions_on_breach",
                "required_approvals",
                "cooldowns",
                "quarantine_triggers",
                "provenance",
            ],
        ),
        "eval_suite" => require_keys(
            root,
            &[
                "suite_name",
                "tasks",
                "graders",
                "risk_class",
                "success_metrics",
                "shadow_only",
                "provenance",
            ],
        ),
        "lineage" => require_keys(root, &["lineage_type", "entries", "provenance"]),
        "treaty" => require_keys(
            root,
            &[
                "peer_repo",
                "trust_level",
                "allowed_actions",
                "forbidden_actions",
                "lineage_scope",
                "revocation_policy",
                "reputation_floor",
                "provenance",
            ],
        ),
        "memory_index" => require_keys(
            root,
            &["index_name", "sources", "entries", "retention_policy", "provenance"],
        ),
        _ => unreachable!(),
    }?;

    if kind == "mind" {
        validate_mind(root)?;
    }

    Ok(())
}

/// Path-aware validation: runs `validate_document_shape` then checks that the
/// file's `kind`, `id`, `identity.species`, and `identity.role_name` are
/// consistent with the canonical `.forge` directory layout.
///
/// Recognised layouts:
/// - `.forge/agents/<species>.forge`  → kind=agent, species matches, role_name matches prefix, id ends with `/agent/<species>`
/// - `.forge/mind.forge`              → kind=mind
/// - `.forge/policies/<slug>.forge`   → kind=policy
///
/// When `path` is `None` the function is identical to `validate_document_shape`.
pub fn validate_document_shape_for_path(value: &Value, path: Option<&Path>) -> Result<()> {
    validate_document_shape(value)?;
    if let Some(p) = path {
        validate_path_kind_consistency(value, p)?;
    }
    Ok(())
}

fn validate_path_kind_consistency(value: &Value, path: &Path) -> Result<()> {
    let root = value.as_object().expect("already validated");
    let kind = root.get("kind").and_then(Value::as_str).unwrap_or("");

    if let Some(species) = find_forge_agents_basename(path) {
        if kind != "agent" {
            return shape(
                "$.kind",
                format!("path is under .forge/agents/ but kind is '{kind}', expected 'agent'"),
            );
        }
        let id = root.get("id").and_then(Value::as_str).unwrap_or("");
        let expected_suffix = format!("/agent/{species}");
        if !id.ends_with(&expected_suffix) {
            return shape(
                "$.id",
                format!("id must end with '/agent/{species}' for .forge/agents/{species}.forge"),
            );
        }
        if let Some(identity) = root.get("identity").and_then(Value::as_object) {
            let doc_species = identity.get("species").and_then(Value::as_str).unwrap_or("");
            if doc_species != species {
                return shape(
                    "$.identity.species",
                    format!(
                        "species '{doc_species}' does not match path basename '{species}'"
                    ),
                );
            }
            let expected_role = species.split('.').next().unwrap_or("");
            let role_name = identity.get("role_name").and_then(Value::as_str).unwrap_or("");
            if role_name != expected_role {
                return shape(
                    "$.identity.role_name",
                    format!(
                        "role_name '{role_name}' does not match species prefix '{expected_role}'"
                    ),
                );
            }
        }
    } else if is_forge_mind_file(path) {
        if kind != "mind" {
            return shape(
                "$.kind",
                format!("path is .forge/mind.forge but kind is '{kind}', expected 'mind'"),
            );
        }
    } else if is_forge_policies_file(path) {
        if kind != "policy" {
            return shape(
                "$.kind",
                format!("path is under .forge/policies/ but kind is '{kind}', expected 'policy'"),
            );
        }
    }

    Ok(())
}

fn find_forge_agents_basename(path: &Path) -> Option<String> {
    let components: Vec<_> = path.components().collect();
    let n = components.len();
    if n < 3 {
        return None;
    }
    for i in 0..n - 2 {
        let c0 = match &components[i] {
            Component::Normal(s) => s.to_string_lossy(),
            _ => continue,
        };
        let c1 = match &components[i + 1] {
            Component::Normal(s) => s.to_string_lossy(),
            _ => continue,
        };
        let c2 = match &components[i + 2] {
            Component::Normal(s) => s.to_string_lossy(),
            _ => continue,
        };
        if c0 == ".forge" && c1 == "agents" {
            if let Some(base) = c2.strip_suffix(".forge") {
                if !base.is_empty() {
                    return Some(base.to_string());
                }
            }
        }
    }
    None
}

fn is_forge_mind_file(path: &Path) -> bool {
    let components: Vec<_> = path.components().collect();
    let n = components.len();
    if n < 2 {
        return false;
    }
    for i in 0..n - 1 {
        let c0 = match &components[i] {
            Component::Normal(s) => s.to_string_lossy(),
            _ => continue,
        };
        let c1 = match &components[i + 1] {
            Component::Normal(s) => s.to_string_lossy(),
            _ => continue,
        };
        if c0 == ".forge" && c1 == "mind.forge" {
            return true;
        }
    }
    false
}

fn is_forge_policies_file(path: &Path) -> bool {
    let components: Vec<_> = path.components().collect();
    let n = components.len();
    if n < 3 {
        return false;
    }
    for i in 0..n - 2 {
        let c0 = match &components[i] {
            Component::Normal(s) => s.to_string_lossy(),
            _ => continue,
        };
        let c1 = match &components[i + 1] {
            Component::Normal(s) => s.to_string_lossy(),
            _ => continue,
        };
        let c2 = match &components[i + 2] {
            Component::Normal(s) => s.to_string_lossy(),
            _ => continue,
        };
        if c0 == ".forge" && c1 == "policies" {
            return c2.ends_with(".forge");
        }
    }
    false
}

fn validate_mind(root: &serde_json::Map<String, Value>) -> Result<()> {
    let profile = require_object(root.get("repo_profile"), "$.repo_profile")?;
    require_enum(
        profile.get("default_mode"),
        "$.repo_profile.default_mode",
        &["observe", "propose", "evolve", "federate", "quarantine", "halted"],
    )?;
    require_enum(
        profile.get("network_mode"),
        "$.repo_profile.network_mode",
        &["off", "allowlisted", "supervised", "open"],
    )?;
    require_enum(
        profile.get("spawn_mode"),
        "$.repo_profile.spawn_mode",
        &["off", "lab-only", "allowlisted", "open"],
    )?;
    require(profile.get("maintenance_sla"), "$.repo_profile.maintenance_sla")?;

    let approvals = require_object(root.get("approval_matrix"), "$.approval_matrix")?;
    for class in ["A", "B", "C", "D"] {
        require(approvals.get(class), &format!("$.approval_matrix.{class}"))?;
    }
    Ok(())
}

fn require_keys(root: &serde_json::Map<String, Value>, keys: &[&str]) -> Result<()> {
    for key in keys {
        require(root.get(*key), &format!("$.{key}"))?;
    }
    Ok(())
}

fn require<'a>(value: Option<&'a Value>, path: &str) -> Result<&'a Value> {
    value.ok_or_else(|| Error::Shape {
        path: path.to_string(),
        message: "required field missing".to_string(),
    })
}

fn require_int_eq(value: Option<&Value>, path: &str, expected: i64) -> Result<()> {
    match require(value, path)? {
        Value::Number(n) if n.as_i64() == Some(expected) => Ok(()),
        _ => shape(path, format!("must equal integer {expected}")),
    }
}

fn require_string<'a>(value: Option<&'a Value>, path: &str) -> Result<&'a str> {
    match require(value, path)? {
        Value::String(s) => Ok(s),
        _ => shape(path, "must be a string"),
    }
}

fn require_nonempty_string(value: Option<&Value>, path: &str) -> Result<()> {
    let s = require_string(value, path)?;
    if s.is_empty() {
        shape(path, "must not be empty")
    } else {
        Ok(())
    }
}

fn require_string_array_nonempty(value: Option<&Value>, path: &str) -> Result<()> {
    match require(value, path)? {
        Value::Array(items) if !items.is_empty() => {
            for (idx, item) in items.iter().enumerate() {
                if !item.is_string() {
                    return shape(&format!("{path}[{idx}]"), "must be a string");
                }
            }
            Ok(())
        }
        Value::Array(_) => shape(path, "must contain at least one item"),
        _ => shape(path, "must be an array"),
    }
}

fn require_object<'a>(
    value: Option<&'a Value>,
    path: &str,
) -> Result<&'a serde_json::Map<String, Value>> {
    match require(value, path)? {
        Value::Object(map) => Ok(map),
        _ => shape(path, "must be an object"),
    }
}

fn require_enum(value: Option<&Value>, path: &str, allowed: &[&str]) -> Result<()> {
    let s = require_string(value, path)?;
    if allowed.contains(&s) {
        Ok(())
    } else {
        shape(path, format!("must be one of {allowed:?}"))
    }
}

fn validate_regex(value: &str, pattern: &str, path: &str, message: &str) -> Result<()> {
    let re = Regex::new(pattern).expect("validator regex compiles");
    if re.is_match(value) {
        Ok(())
    } else {
        shape(path, message)
    }
}

fn shape<T>(path: &str, message: impl Into<String>) -> Result<T> {
    Err(Error::Shape {
        path: path.to_string(),
        message: message.into(),
    })
}
