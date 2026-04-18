use std::path::PathBuf;

use thiserror::Error;

pub type Result<T> = std::result::Result<T, Error>;

#[derive(Debug, Error)]
pub enum Error {
    #[error("source is not UTF-8: {0}")]
    NonUtf8(#[from] std::str::Utf8Error),

    #[error("missing .forge magic line: expected exactly '#!forge/v1' followed by LF")]
    MissingMagicLine,

    #[error("CR or CRLF line endings are forbidden; normalize source to LF")]
    CrLfLineEnding,

    #[error("source must end with exactly one LF")]
    TrailingNewline,

    #[error("tabs are forbidden in .forge source")]
    TabCharacter,

    #[error("source is not Unicode NFC-normalized")]
    NonNfc,

    #[error("YAML anchors, aliases, and merge keys are forbidden: {feature} at line {line}")]
    ForbiddenYamlFeature { feature: String, line: usize },

    #[error("flow-style mappings are not accepted by the T005 kernel; use block mappings or the empty mapping {{}} at line {line}")]
    FlowMappingUnsupported { line: usize },

    #[error("duplicate mapping key '{key}' at line {line}")]
    DuplicateKey { key: String, line: usize },

    #[error("YAML parse error: {0}")]
    Yaml(#[from] serde_yaml::Error),

    #[error("parsed YAML root must be a mapping/object")]
    RootNotMapping,

    #[error("mapping key must be a string at path {path}")]
    NonStringKey { path: String },

    #[error("unsupported YAML scalar/tag at path {path}: {message}")]
    UnsupportedYaml { path: String, message: String },

    #[error("shape validation failed at {path}: {message}")]
    Shape { path: String, message: String },

    #[error("unknown top-level key '{key}'")]
    UnknownTopLevelKey { key: String },

    #[error("canonical hash mismatch: expected {expected}, computed {computed}")]
    IntegrityMismatch { expected: String, computed: String },

    #[error("I/O error for {path}: {source}")]
    Io {
        path: PathBuf,
        #[source]
        source: std::io::Error,
    },
}
