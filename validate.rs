use std::fs;
use std::path::Path;

use serde_json::{Map, Number, Value};

use crate::canonical::canonical_bytes;
use crate::error::{Error, Result};
use crate::hash::canonical_hash;
use crate::source::validate_source_and_body;
use crate::validate::validate_document_shape;

#[derive(Debug, Clone)]
pub struct ForgeDocument {
    pub value: Value,
    pub canonical: Vec<u8>,
    pub canonical_hash: String,
}

pub fn parse_file(path: impl AsRef<Path>) -> Result<ForgeDocument> {
    let path = path.as_ref();
    let bytes = fs::read(path).map_err(|source| Error::Io {
        path: path.to_path_buf(),
        source,
    })?;
    parse_bytes(&bytes)
}

pub fn parse_str(source: &str) -> Result<ForgeDocument> {
    parse_bytes(source.as_bytes())
}

pub fn parse_bytes(source_bytes: &[u8]) -> Result<ForgeDocument> {
    let body = validate_source_and_body(source_bytes)?;
    let yaml: serde_yaml::Value = serde_yaml::from_str(body)?;
    let value = yaml_to_json(yaml, "$")?;
    validate_document_shape(&value)?;
    let canonical = canonical_bytes(&value)?;
    let canonical_hash = canonical_hash(&canonical);
    Ok(ForgeDocument {
        value,
        canonical,
        canonical_hash,
    })
}

fn yaml_to_json(value: serde_yaml::Value, path: &str) -> Result<Value> {
    match value {
        serde_yaml::Value::Null => Ok(Value::Null),
        serde_yaml::Value::Bool(v) => Ok(Value::Bool(v)),
        serde_yaml::Value::Number(n) => {
            if let Some(i) = n.as_i64() {
                Ok(Value::Number(Number::from(i)))
            } else if let Some(u) = n.as_u64() {
                Ok(Value::Number(Number::from(u)))
            } else if let Some(f) = n.as_f64() {
                Number::from_f64(f)
                    .map(Value::Number)
                    .ok_or_else(|| Error::UnsupportedYaml {
                        path: path.to_string(),
                        message: "non-finite floating point value".to_string(),
                    })
            } else {
                Err(Error::UnsupportedYaml {
                    path: path.to_string(),
                    message: "unknown numeric representation".to_string(),
                })
            }
        }
        serde_yaml::Value::String(s) => Ok(Value::String(s)),
        serde_yaml::Value::Sequence(seq) => seq
            .into_iter()
            .enumerate()
            .map(|(idx, item)| yaml_to_json(item, &format!("{path}[{idx}]")))
            .collect::<Result<Vec<_>>>()
            .map(Value::Array),
        serde_yaml::Value::Mapping(mapping) => {
            let mut out = Map::new();
            for (key, val) in mapping {
                let key = match key {
                    serde_yaml::Value::String(s) => s,
                    other => {
                        return Err(Error::NonStringKey {
                            path: format!("{path}.{other:?}"),
                        })
                    }
                };
                let child_path = format!("{path}.{key}");
                out.insert(key, yaml_to_json(val, &child_path)?);
            }
            Ok(Value::Object(out))
        }
        serde_yaml::Value::Tagged(tagged) => Err(Error::UnsupportedYaml {
            path: path.to_string(),
            message: format!("tagged YAML value is not in the v1 subset: {:?}", tagged.tag),
        }),
    }
}
