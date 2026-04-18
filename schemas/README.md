# schemas

Machine-readable schemas live here.

- `forge-v1.schema.json` — Draft 2020-12 JSON Schema for parsed `.forge` v1 YAML documents after removing the `#!forge/v1` magic line.

T005 adds `crates/forge-kernel/`, which performs source-form validation and canonical hashing. The Rust kernel currently implements a minimal shape validator aligned with this schema, but full Draft 2020-12 JSON Schema evaluation inside Rust is deferred.
