use serde_json::{Map, Value};
use unicode_normalization::UnicodeNormalization;

use crate::error::{Error, Result};
use crate::source::MAGIC_LINE;

pub const ZERO_HASH_SENTINEL: &str =
    "sha256:0000000000000000000000000000000000000000000000000000000000000000";

pub const TOP_LEVEL_KEY_ORDER: &[&str] = &[
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
    "identity",
    "role",
    "constitution",
    "repo_profile",
    "approval_matrix",
    "branch_contracts",
    "allowed_species",
    "budget_caps",
    "treaty_policy",
    "policy_type",
    "rules",
    "thresholds",
    "actions_on_breach",
    "required_approvals",
    "cooldowns",
    "quarantine_triggers",
    "context_recipe",
    "tools",
    "memory",
    "scores",
    "evolution",
    "mutation_log",
    "suite_name",
    "tasks",
    "graders",
    "risk_class",
    "success_metrics",
    "shadow_only",
    "lineage_type",
    "peer_repo",
    "trust_level",
    "allowed_actions",
    "forbidden_actions",
    "lineage_scope",
    "revocation_policy",
    "reputation_floor",
    "index_name",
    "sources",
    "entries",
    "retention_policy",
    "provenance",
    "attachments",
    "integrity",
    "compat",
    "extensions",
];

pub fn canonical_string(value: &Value) -> Result<String> {
    String::from_utf8(canonical_bytes(value)?).map_err(|err| Error::UnsupportedYaml {
        path: "$".to_string(),
        message: err.to_string(),
    })
}

pub fn canonical_bytes(value: &Value) -> Result<Vec<u8>> {
    let normalized = normalize_for_hash(value);
    let root = normalized.as_object().ok_or(Error::RootNotMapping)?;
    validate_top_level_keys(root)?;

    let mut out = String::new();
    out.push_str(MAGIC_LINE);
    emit_mapping(root, &mut out, 0, true, None)?;
    if !out.ends_with('\n') {
        out.push('\n');
    }
    Ok(out.into_bytes())
}

fn validate_top_level_keys(root: &Map<String, Value>) -> Result<()> {
    for key in root.keys() {
        if !TOP_LEVEL_KEY_ORDER.contains(&key.as_str()) {
            return Err(Error::UnknownTopLevelKey { key: key.clone() });
        }
    }
    Ok(())
}

fn normalize_for_hash(value: &Value) -> Value {
    let mut value = normalize_strings(value);
    if let Value::Object(root) = &mut value {
        if let Some(Value::Object(integrity)) = root.get_mut("integrity") {
            if integrity.contains_key("canonical_hash") {
                integrity.insert(
                    "canonical_hash".to_string(),
                    Value::String(ZERO_HASH_SENTINEL.to_string()),
                );
            }
            if integrity.contains_key("signatures") {
                integrity.insert("signatures".to_string(), Value::Array(vec![]));
            }
        }
    }
    value
}

fn normalize_strings(value: &Value) -> Value {
    match value {
        Value::String(s) => Value::String(s.nfc().collect()),
        Value::Array(items) => Value::Array(items.iter().map(normalize_strings).collect()),
        Value::Object(map) => Value::Object(
            map.iter()
                .map(|(k, v)| (k.nfc().collect::<String>(), normalize_strings(v)))
                .collect(),
        ),
        other => other.clone(),
    }
}

fn emit_mapping(
    map: &Map<String, Value>,
    out: &mut String,
    indent: usize,
    top_level: bool,
    sequence_item_indent: Option<usize>,
) -> Result<()> {
    let entries = ordered_entries(map, top_level);
    for (idx, (key, value)) in entries.iter().enumerate() {
        if idx == 0 {
            if let Some(item_indent) = sequence_item_indent {
                push_indent(out, item_indent);
                out.push_str("- ");
            } else {
                push_indent(out, indent);
            }
        } else {
            push_indent(out, indent);
        }

        out.push_str(&emit_key(key));
        out.push(':');
        if is_inline_value(value) {
            out.push(' ');
            emit_inline_value(value, out)?;
            out.push('\n');
        } else {
            out.push('\n');
            emit_value(value, out, indent + 2)?;
        }
    }
    Ok(())
}

fn ordered_entries<'a>(map: &'a Map<String, Value>, top_level: bool) -> Vec<(&'a String, &'a Value)> {
    let mut out = Vec::with_capacity(map.len());
    if top_level {
        for reserved in TOP_LEVEL_KEY_ORDER {
            if let Some((key, value)) = map.iter().find(|(key, _)| key.as_str() == *reserved) {
                out.push((key, value));
            }
        }
    } else {
        out.extend(map.iter());
        out.sort_by(|a, b| a.0.cmp(b.0));
    }
    out
}

fn emit_value(value: &Value, out: &mut String, indent: usize) -> Result<()> {
    match value {
        Value::Object(map) if map.is_empty() => {
            push_indent(out, indent);
            out.push_str("{}\n");
        }
        Value::Object(map) => emit_mapping(map, out, indent, false, None),
        Value::Array(items) if items.is_empty() => {
            push_indent(out, indent);
            out.push_str("[]\n");
        }
        Value::Array(items) => emit_sequence(items, out, indent),
        _ => {
            push_indent(out, indent);
            emit_inline_value(value, out)?;
            out.push('\n');
            Ok(())
        }
    }
}

fn emit_sequence(items: &[Value], out: &mut String, indent: usize) -> Result<()> {
    for item in items {
        match item {
            Value::Object(map) if map.is_empty() => {
                push_indent(out, indent);
                out.push_str("- {}\n");
            }
            Value::Object(map) => emit_mapping(map, out, indent + 2, false, Some(indent))?,
            Value::Array(inner) if inner.is_empty() => {
                push_indent(out, indent);
                out.push_str("- []\n");
            }
            Value::Array(_) => {
                push_indent(out, indent);
                out.push_str("-\n");
                emit_value(item, out, indent + 2)?;
            }
            _ => {
                push_indent(out, indent);
                out.push_str("- ");
                emit_inline_value(item, out)?;
                out.push('\n');
            }
        }
    }
    Ok(())
}

fn is_inline_value(value: &Value) -> bool {
    match value {
        Value::Null | Value::Bool(_) | Value::Number(_) | Value::String(_) => true,
        Value::Array(items) => items.is_empty(),
        Value::Object(map) => map.is_empty(),
    }
}

fn emit_inline_value(value: &Value, out: &mut String) -> Result<()> {
    match value {
        Value::Null => out.push_str("null"),
        Value::Bool(v) => out.push_str(if *v { "true" } else { "false" }),
        Value::Number(n) => out.push_str(&n.to_string()),
        Value::String(s) => out.push_str(&emit_string(s)),
        Value::Array(items) if items.is_empty() => out.push_str("[]"),
        Value::Object(map) if map.is_empty() => out.push_str("{}"),
        _ => {
            return Err(Error::UnsupportedYaml {
                path: "$".to_string(),
                message: "complex value cannot be emitted inline".to_string(),
            })
        }
    }
    Ok(())
}

fn emit_key(key: &str) -> String {
    if is_plain_safe(key) {
        key.to_string()
    } else {
        emit_double_quoted(key)
    }
}

fn emit_string(value: &str) -> String {
    if is_plain_safe(value) {
        value.to_string()
    } else {
        emit_double_quoted(value)
    }
}

fn is_plain_safe(value: &str) -> bool {
    if value.is_empty() {
        return false;
    }
    let lower = value.to_ascii_lowercase();
    if matches!(lower.as_str(), "null" | "true" | "false" | "~") {
        return false;
    }
    if value.parse::<i64>().is_ok() || value.parse::<f64>().is_ok() {
        return false;
    }
    let first = value.chars().next().expect("not empty");
    if matches!(first, '-' | '?' | ':' | ',' | '[' | ']' | '{' | '}' | '#' | '&' | '*' | '!' | '|' | '>' | '@' | '`' | '"' | '\'') {
        return false;
    }
    if value.ends_with(':') || value.contains(" #") || value.contains('\n') || value.contains('\r') || value.contains('\t') {
        return false;
    }
    value.chars().all(|ch| {
        ch.is_ascii_alphanumeric()
            || matches!(ch, '_' | '-' | '.' | '/' | ':' | '@' | '+' | '=' | '%')
    })
}

fn emit_double_quoted(value: &str) -> String {
    let mut out = String::with_capacity(value.len() + 2);
    out.push('"');
    for ch in value.chars() {
        match ch {
            '\\' => out.push_str("\\\\"),
            '"' => out.push_str("\\\""),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            _ => out.push(ch),
        }
    }
    out.push('"');
    out
}

fn push_indent(out: &mut String, indent: usize) {
    for _ in 0..indent {
        out.push(' ');
    }
}
