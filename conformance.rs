use serde_json::Value;
use sha2::{Digest, Sha256};

use crate::canonical::canonical_bytes;
use crate::error::{Error, Result};

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum IntegrityStatus {
    PresentAndValid { hash: String },
    Absent { hash: String },
}

pub fn canonical_hash(canonical_bytes: &[u8]) -> String {
    let digest = Sha256::digest(canonical_bytes);
    format!("sha256:{digest:x}")
}

pub fn hash_value(value: &Value) -> Result<String> {
    Ok(canonical_hash(&canonical_bytes(value)?))
}

pub fn verify_integrity(value: &Value) -> Result<IntegrityStatus> {
    let computed = hash_value(value)?;
    let Some(integrity) = value.get("integrity").and_then(Value::as_object) else {
        return Ok(IntegrityStatus::Absent { hash: computed });
    };
    let Some(expected) = integrity.get("canonical_hash").and_then(Value::as_str) else {
        return Ok(IntegrityStatus::Absent { hash: computed });
    };
    if expected == computed {
        Ok(IntegrityStatus::PresentAndValid { hash: computed })
    } else {
        Err(Error::IntegrityMismatch {
            expected: expected.to_string(),
            computed,
        })
    }
}
