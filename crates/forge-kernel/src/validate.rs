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
