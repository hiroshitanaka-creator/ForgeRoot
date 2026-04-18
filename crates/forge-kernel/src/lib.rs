//! ForgeRoot `.forge` v1 canonical parser and hash kernel.
//!
//! T005 deliberately keeps this crate small and deterministic:
//!
//! - validate source-form constraints before parsing YAML;
//! - parse the YAML document behind `#!forge/v1`;
//! - reject duplicate mapping keys in the block-style `.forge` source subset;
//! - serialize a canonical byte stream with fixed top-level key ordering;
//! - compute and verify `sha256:<hex>` canonical hashes.

pub mod canonical;
pub mod error;
pub mod hash;
pub mod parser;
pub mod source;
pub mod validate;

pub use canonical::{canonical_bytes, canonical_string, TOP_LEVEL_KEY_ORDER, ZERO_HASH_SENTINEL};
pub use error::{Error, Result};
pub use hash::{canonical_hash, verify_integrity, IntegrityStatus};
pub use parser::{parse_bytes, parse_file, parse_str, ForgeDocument};
pub use validate::validate_document_shape;
