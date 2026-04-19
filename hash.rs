use std::collections::HashSet;

use unicode_normalization::UnicodeNormalization;

use crate::error::{Error, Result};

pub const MAGIC_LINE: &str = "#!forge/v1\n";

#[derive(Debug, Clone)]
struct MappingFrame {
    indent: usize,
    keys: HashSet<String>,
}

/// Validate v1 source-form constraints and return the YAML body behind the magic line.
pub fn validate_source_and_body(source_bytes: &[u8]) -> Result<&str> {
    let source = std::str::from_utf8(source_bytes)?;

    if !source.starts_with(MAGIC_LINE) {
        return Err(Error::MissingMagicLine);
    }
    if source.contains('\r') {
        return Err(Error::CrLfLineEnding);
    }
    if !source.ends_with('\n') || source.ends_with("\n\n") {
        return Err(Error::TrailingNewline);
    }
    if source.contains('\t') {
        return Err(Error::TabCharacter);
    }
    if source.nfc().collect::<String>() != source {
        return Err(Error::NonNfc);
    }

    let body = &source[MAGIC_LINE.len()..];
    detect_forbidden_yaml_features(body)?;
    detect_duplicate_mapping_keys(body)?;

    Ok(body)
}

fn detect_forbidden_yaml_features(body: &str) -> Result<()> {
    for (idx, raw_line) in body.lines().enumerate() {
        let line_no = idx + 2; // account for magic line
        let uncommented = strip_comment(raw_line);
        let line = uncommented.as_str();
        let trimmed = line.trim_start();

        if trimmed.starts_with("<<:") || trimmed.starts_with("- <<:") {
            return Err(Error::ForbiddenYamlFeature {
                feature: "merge key".to_string(),
                line: line_no,
            });
        }

        for (byte_idx, ch) in line.char_indices() {
            if is_inside_quotes(line, byte_idx) {
                continue;
            }
            if ch == '{' {
                let rest = line[byte_idx + ch.len_utf8()..].trim_start();
                if !rest.starts_with('}') {
                    return Err(Error::FlowMappingUnsupported { line: line_no });
                }
            }
            if ch == '&' && looks_like_yaml_anchor_or_alias_token(line, byte_idx) {
                return Err(Error::ForbiddenYamlFeature {
                    feature: "anchor".to_string(),
                    line: line_no,
                });
            }
            if ch == '*' && looks_like_yaml_anchor_or_alias_token(line, byte_idx) {
                return Err(Error::ForbiddenYamlFeature {
                    feature: "alias".to_string(),
                    line: line_no,
                });
            }
        }
    }
    Ok(())
}

fn looks_like_yaml_anchor_or_alias_token(line: &str, byte_idx: usize) -> bool {
    let prev_ok = line[..byte_idx]
        .chars()
        .next_back()
        .map(|c| c.is_whitespace() || c == ':' || c == '[' || c == ',' || c == '-')
        .unwrap_or(true);
    let next_ok = line[byte_idx + 1..]
        .chars()
        .next()
        .map(|c| c.is_ascii_alphanumeric() || c == '_' || c == '-')
        .unwrap_or(false);
    prev_ok && next_ok
}

fn detect_duplicate_mapping_keys(body: &str) -> Result<()> {
    let mut stack: Vec<MappingFrame> = Vec::new();

    for (idx, raw_line) in body.lines().enumerate() {
        let line_no = idx + 2;
        let uncommented = strip_comment(raw_line);
        if uncommented.trim().is_empty() {
            continue;
        }

        let indent = uncommented.chars().take_while(|c| *c == ' ').count();
        let content = uncommented[indent..].trim_end();

        if let Some(item_content) = content.strip_prefix("- ") {
            let item_map_indent = indent + 2;
            while stack.last().map(|f| f.indent >= item_map_indent).unwrap_or(false) {
                stack.pop();
            }
            stack.push(MappingFrame {
                indent: item_map_indent,
                keys: HashSet::new(),
            });

            if let Some(key) = parse_mapping_key(item_content.trim_start())? {
                insert_key(stack.last_mut().expect("fresh item frame"), key, line_no)?;
            }
            continue;
        }

        let Some(key) = parse_mapping_key(content)? else {
            continue;
        };

        while stack.last().map(|f| f.indent > indent).unwrap_or(false) {
            stack.pop();
        }
        if !stack.last().map(|f| f.indent == indent).unwrap_or(false) {
            stack.push(MappingFrame {
                indent,
                keys: HashSet::new(),
            });
        }
        insert_key(stack.last_mut().expect("mapping frame"), key, line_no)?;
    }

    Ok(())
}

fn insert_key(frame: &mut MappingFrame, key: String, line: usize) -> Result<()> {
    if key == "<<" {
        return Err(Error::ForbiddenYamlFeature {
            feature: "merge key".to_string(),
            line,
        });
    }
    if !frame.keys.insert(key.clone()) {
        return Err(Error::DuplicateKey { key, line });
    }
    Ok(())
}

fn parse_mapping_key(content: &str) -> Result<Option<String>> {
    let mut single = false;
    let mut double = false;
    let mut escaped = false;

    for (idx, ch) in content.char_indices() {
        if double && escaped {
            escaped = false;
            continue;
        }
        match ch {
            '\\' if double => escaped = true,
            '\'' if !double => single = !single,
            '"' if !single => double = !double,
            ':' if !single && !double => {
                let after = content[idx + 1..].chars().next();
                if after.map(|c| c.is_whitespace() || c == '\0' || c == '[' || c == '{').unwrap_or(true) {
                    let raw_key = content[..idx].trim();
                    if raw_key.is_empty() {
                        return Ok(None);
                    }
                    return Ok(Some(unquote_key(raw_key)));
                }
            }
            _ => {}
        }
    }
    Ok(None)
}

fn unquote_key(raw: &str) -> String {
    if raw.len() >= 2 && raw.starts_with('"') && raw.ends_with('"') {
        raw[1..raw.len() - 1]
            .replace("\\\"", "\"")
            .replace("\\\\", "\\")
    } else if raw.len() >= 2 && raw.starts_with('\'') && raw.ends_with('\'') {
        raw[1..raw.len() - 1].replace("''", "'")
    } else {
        raw.to_string()
    }
}

/// Strip comments outside single or double quotes.
///
/// For scanner purposes this treats any `#` outside quotes as a comment start.
fn strip_comment(line: &str) -> String {
    let mut out = String::with_capacity(line.len());
    let mut single = false;
    let mut double = false;
    let mut escaped = false;

    for ch in line.chars() {
        if double && escaped {
            out.push(ch);
            escaped = false;
            continue;
        }
        match ch {
            '\\' if double => {
                out.push(ch);
                escaped = true;
            }
            '\'' if !double => {
                single = !single;
                out.push(ch);
            }
            '"' if !single => {
                double = !double;
                out.push(ch);
            }
            '#' if !single && !double => break,
            _ => out.push(ch),
        }
    }
    out
}

fn is_inside_quotes(line: &str, byte_idx: usize) -> bool {
    let mut single = false;
    let mut double = false;
    let mut escaped = false;

    for (idx, ch) in line.char_indices() {
        if idx >= byte_idx {
            break;
        }
        if double && escaped {
            escaped = false;
            continue;
        }
        match ch {
            '\\' if double => escaped = true,
            '\'' if !double => single = !single,
            '"' if !single => double = !double,
            _ => {}
        }
    }
    single || double
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn duplicate_keys_are_rejected() {
        let src = b"#!forge/v1\nforge_version: 1\nforge_version: 1\n";
        let err = validate_source_and_body(src).unwrap_err();
        assert!(matches!(err, Error::DuplicateKey { .. }));
    }

    #[test]
    fn quoted_globs_are_not_aliases() {
        let src = b"#!forge/v1\npaths:\n  - \".github/workflows/**\"\n";
        validate_source_and_body(src).unwrap();
    }
}
