{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "urn:forgeroot:forge:v1",
  "title": ".forge v1 parsed YAML document",
  "description": "Base JSON Schema for ForgeRoot .forge v1 documents after stripping the #!forge/v1 magic line. Source-form and canonical-hash checks are specified in docs/specs/forge-v1.md.",
  "type": "object",
  "additionalProperties": false,
  "required": [
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
    "extensions"
  ],
  "properties": {
    "forge_version": {
      "type": "integer",
      "const": 1
    },
    "schema_ref": {
      "type": "string",
      "pattern": "^urn:forgeroot:forge:(mind|agent|policy|eval_suite|lineage|treaty|memory_index):v1$"
    },
    "kind": {
      "type": "string",
      "enum": [
        "mind",
        "agent",
        "policy",
        "eval_suite",
        "lineage",
        "treaty",
        "memory_index"
      ]
    },
    "id": {
      "$ref": "#/$defs/forge_uri"
    },
    "revision": {
      "$ref": "#/$defs/ulid"
    },
    "mind_ref": {
      "anyOf": [
        {
          "$ref": "#/$defs/forge_uri"
        },
        {
          "type": "null"
        }
      ]
    },
    "status": {
      "type": "string",
      "enum": [
        "seeded",
        "active",
        "quarantined",
        "deprecated",
        "fossilized"
      ]
    },
    "title": {
      "type": "string",
      "minLength": 1,
      "maxLength": 160
    },
    "summary": {
      "type": "string",
      "minLength": 1,
      "maxLength": 2000
    },
    "owners": {
      "type": "array",
      "minItems": 1,
      "uniqueItems": true,
      "items": {
        "type": "string",
        "minLength": 1
      }
    },
    "created_at": {
      "$ref": "#/$defs/rfc3339"
    },
    "updated_at": {
      "$ref": "#/$defs/rfc3339"
    },
    "identity": {
      "$ref": "#/$defs/freeform_object"
    },
    "role": {
      "$ref": "#/$defs/freeform_object"
    },
    "constitution": {
      "$ref": "#/$defs/freeform_object"
    },
    "repo_profile": {
      "$ref": "#/$defs/repo_profile"
    },
    "approval_matrix": {
      "$ref": "#/$defs/approval_matrix"
    },
    "branch_contracts": {
      "type": "array",
      "items": {
        "$ref": "#/$defs/freeform_object"
      }
    },
    "allowed_species": {
      "type": "array",
      "items": {
        "type": "string",
        "pattern": "^[a-z0-9][a-z0-9._-]*$"
      }
    },
    "budget_caps": {
      "$ref": "#/$defs/freeform_object"
    },
    "treaty_policy": {
      "$ref": "#/$defs/freeform_object"
    },
    "policy_type": {
      "type": "string",
      "pattern": "^[a-z][a-z0-9_-]*$"
    },
    "rules": {
      "type": "array",
      "minItems": 1,
      "items": {
        "$ref": "#/$defs/policy_rule"
      }
    },
    "thresholds": {
      "$ref": "#/$defs/freeform_object"
    },
    "actions_on_breach": {
      "type": "object",
      "additionalProperties": {
        "type": "array",
        "items": {
          "anyOf": [
            {
              "type": "string"
            },
            {
              "$ref": "#/$defs/freeform_object"
            }
          ]
        }
      }
    },
    "required_approvals": {
      "$ref": "#/$defs/approval_matrix"
    },
    "cooldowns": {
      "$ref": "#/$defs/freeform_object"
    },
    "quarantine_triggers": {
      "type": "array",
      "items": {
        "type": "string",
        "pattern": "^[a-z][a-z0-9_-]*$"
      }
    },
    "context_recipe": {
      "$ref": "#/$defs/context_recipe"
    },
    "tools": {
      "type": "array",
      "items": {
        "$ref": "#/$defs/tool_ref"
      }
    },
    "memory": {
      "$ref": "#/$defs/freeform_object"
    },
    "scores": {
      "$ref": "#/$defs/scores"
    },
    "evolution": {
      "$ref": "#/$defs/evolution"
    },
    "mutation_log": {
      "type": "array",
      "items": {
        "$ref": "#/$defs/mutation_record"
      }
    },
    "suite_name": {
      "type": "string",
      "minLength": 1
    },
    "tasks": {
      "type": "array",
      "minItems": 1,
      "items": {
        "$ref": "#/$defs/freeform_object"
      }
    },
    "graders": {
      "type": "array",
      "minItems": 1,
      "items": {
        "$ref": "#/$defs/freeform_object"
      }
    },
    "risk_class": {
      "$ref": "#/$defs/approval_class"
    },
    "success_metrics": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "string",
        "minLength": 1
      }
    },
    "shadow_only": {
      "type": "boolean"
    },
    "lineage_type": {
      "type": "string",
      "enum": [
        "graph",
        "fitness",
        "species",
        "adoption"
      ]
    },
    "peer_repo": {
      "type": "string",
      "pattern": "^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$"
    },
    "trust_level": {
      "type": "string",
      "enum": [
        "none",
        "observe",
        "exchange",
        "collaborate"
      ]
    },
    "allowed_actions": {
      "type": "array",
      "items": {
        "type": "string",
        "pattern": "^[a-z][a-z0-9_-]*$"
      }
    },
    "forbidden_actions": {
      "type": "array",
      "items": {
        "type": "string",
        "pattern": "^[a-z][a-z0-9_-]*$"
      }
    },
    "lineage_scope": {
      "type": "array",
      "items": {
        "type": "string",
        "pattern": "^[a-z][a-z0-9_-]*$"
      }
    },
    "revocation_policy": {
      "$ref": "#/$defs/freeform_object"
    },
    "reputation_floor": {
      "type": "number",
      "minimum": 0,
      "maximum": 1
    },
    "index_name": {
      "type": "string",
      "minLength": 1
    },
    "sources": {
      "type": "array",
      "items": {
        "$ref": "#/$defs/freeform_object"
      }
    },
    "entries": {
      "type": "array",
      "items": {
        "$ref": "#/$defs/freeform_object"
      }
    },
    "retention_policy": {
      "$ref": "#/$defs/freeform_object"
    },
    "provenance": {
      "$ref": "#/$defs/provenance"
    },
    "attachments": {
      "type": "array",
      "items": {
        "$ref": "#/$defs/attachment"
      }
    },
    "integrity": {
      "$ref": "#/$defs/integrity"
    },
    "compat": {
      "$ref": "#/$defs/compat"
    },
    "extensions": {
      "$ref": "#/$defs/extensions"
    }
  },
  "allOf": [
    {
      "if": {
        "properties": {
          "kind": {
            "const": "mind"
          }
        },
        "required": [
          "kind"
        ]
      },
      "then": {
        "properties": {
          "schema_ref": {
            "const": "urn:forgeroot:forge:mind:v1"
          }
        },
        "required": [
          "identity",
          "constitution",
          "repo_profile",
          "approval_matrix",
          "branch_contracts",
          "allowed_species",
          "budget_caps",
          "treaty_policy",
          "provenance"
        ]
      }
    },
    {
      "if": {
        "properties": {
          "kind": {
            "const": "agent"
          }
        },
        "required": [
          "kind"
        ]
      },
      "then": {
        "properties": {
          "schema_ref": {
            "const": "urn:forgeroot:forge:agent:v1"
          }
        },
        "required": [
          "identity",
          "role",
          "constitution",
          "context_recipe",
          "tools",
          "memory",
          "scores",
          "evolution",
          "mutation_log",
          "provenance"
        ]
      }
    },
    {
      "if": {
        "properties": {
          "kind": {
            "const": "policy"
          }
        },
        "required": [
          "kind"
        ]
      },
      "then": {
        "properties": {
          "schema_ref": {
            "const": "urn:forgeroot:forge:policy:v1"
          }
        },
        "required": [
          "policy_type",
          "rules",
          "thresholds",
          "actions_on_breach",
          "required_approvals",
          "cooldowns",
          "quarantine_triggers",
          "provenance"
        ]
      }
    },
    {
      "if": {
        "properties": {
          "kind": {
            "const": "eval_suite"
          }
        },
        "required": [
          "kind"
        ]
      },
      "then": {
        "properties": {
          "schema_ref": {
            "const": "urn:forgeroot:forge:eval_suite:v1"
          }
        },
        "required": [
          "suite_name",
          "tasks",
          "graders",
          "risk_class",
          "success_metrics",
          "shadow_only",
          "provenance"
        ]
      }
    },
    {
      "if": {
        "properties": {
          "kind": {
            "const": "lineage"
          }
        },
        "required": [
          "kind"
        ]
      },
      "then": {
        "properties": {
          "schema_ref": {
            "const": "urn:forgeroot:forge:lineage:v1"
          }
        },
        "required": [
          "lineage_type",
          "entries",
          "provenance"
        ]
      }
    },
    {
      "if": {
        "properties": {
          "kind": {
            "const": "treaty"
          }
        },
        "required": [
          "kind"
        ]
      },
      "then": {
        "properties": {
          "schema_ref": {
            "const": "urn:forgeroot:forge:treaty:v1"
          }
        },
        "required": [
          "peer_repo",
          "trust_level",
          "allowed_actions",
          "forbidden_actions",
          "lineage_scope",
          "revocation_policy",
          "reputation_floor",
          "provenance"
        ]
      }
    },
    {
      "if": {
        "properties": {
          "kind": {
            "const": "memory_index"
          }
        },
        "required": [
          "kind"
        ]
      },
      "then": {
        "properties": {
          "schema_ref": {
            "const": "urn:forgeroot:forge:memory_index:v1"
          }
        },
        "required": [
          "index_name",
          "sources",
          "entries",
          "retention_policy",
          "provenance"
        ]
      }
    },
    {
      "if": {
        "properties": {
          "kind": {
            "const": "mind"
          }
        },
        "required": [
          "kind"
        ]
      },
      "then": {
        "properties": {
          "mind_ref": {
            "type": "null"
          }
        }
      },
      "else": {
        "properties": {
          "mind_ref": {
            "$ref": "#/$defs/forge_uri"
          }
        }
      }
    }
  ],
  "$defs": {
    "forge_uri": {
      "type": "string",
      "pattern": "^forge://[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+/(mind|agent|policy|eval_suite|lineage|treaty|memory_index)/[a-z0-9][a-z0-9._-]*$"
    },
    "ulid": {
      "type": "string",
      "description": "Crockford Base32 ULID. First character limited to 0-7 for 128-bit range.",
      "pattern": "^[0-7][0-9A-HJKMNP-TV-Z]{25}$"
    },
    "sha256": {
      "type": "string",
      "pattern": "^sha256:[0-9a-f]{64}$"
    },
    "rfc3339": {
      "type": "string",
      "format": "date-time"
    },
    "approval_class": {
      "type": "string",
      "enum": [
        "A",
        "B",
        "C",
        "D"
      ]
    },
    "freeform_object": {
      "type": "object",
      "additionalProperties": true
    },
    "non_empty_string_array": {
      "type": "array",
      "minItems": 1,
      "items": {
        "type": "string",
        "minLength": 1
      }
    },
    "repo_profile": {
      "type": "object",
      "additionalProperties": true,
      "required": [
        "default_mode",
        "network_mode",
        "spawn_mode",
        "maintenance_sla"
      ],
      "properties": {
        "default_mode": {
          "type": "string",
          "enum": [
            "observe",
            "propose",
            "evolve",
            "federate",
            "quarantine",
            "halted"
          ]
        },
        "network_mode": {
          "type": "string",
          "enum": [
            "off",
            "allowlisted",
            "supervised",
            "open"
          ]
        },
        "spawn_mode": {
          "type": "string",
          "enum": [
            "off",
            "lab-only",
            "allowlisted",
            "open"
          ]
        },
        "maintenance_sla": {
          "$ref": "#/$defs/freeform_object"
        }
      }
    },
    "approval_matrix": {
      "type": "object",
      "required": [
        "A",
        "B",
        "C",
        "D"
      ],
      "additionalProperties": false,
      "properties": {
        "A": {
          "$ref": "#/$defs/approval_entry"
        },
        "B": {
          "$ref": "#/$defs/approval_entry"
        },
        "C": {
          "$ref": "#/$defs/approval_entry"
        },
        "D": {
          "$ref": "#/$defs/approval_entry"
        }
      }
    },
    "approval_entry": {
      "type": "object",
      "additionalProperties": true,
      "properties": {
        "summary": {
          "type": "string"
        },
        "auto_pr_allowed": {
          "type": "boolean"
        },
        "min_human_approvals": {
          "type": "integer",
          "minimum": 0
        },
        "merge_requires_human": {
          "type": "boolean"
        },
        "codeowner_required": {
          "type": "boolean"
        },
        "self_approval_forbidden": {
          "type": "boolean"
        },
        "human_only_operation": {
          "type": "boolean"
        }
      }
    },
    "policy_rule": {
      "type": "object",
      "additionalProperties": true,
      "required": [
        "id",
        "statement"
      ],
      "properties": {
        "id": {
          "type": "string",
          "pattern": "^[a-z][a-z0-9-]*$"
        },
        "statement": {
          "type": "string",
          "minLength": 1
        },
        "pass_conditions": {
          "$ref": "#/$defs/freeform_object"
        },
        "fail_conditions": {
          "$ref": "#/$defs/freeform_object"
        },
        "required_approval_class": {
          "$ref": "#/$defs/approval_class"
        }
      }
    },
    "context_recipe": {
      "type": "object",
      "additionalProperties": true,
      "properties": {
        "static_slots": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "dynamic_slots": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "token_budget": {
          "$ref": "#/$defs/freeform_object"
        },
        "compaction_policy": {
          "type": "string"
        }
      }
    },
    "tool_ref": {
      "type": "object",
      "additionalProperties": true,
      "required": [
        "namespace",
        "name",
        "mode"
      ],
      "properties": {
        "namespace": {
          "type": "string",
          "pattern": "^[a-z][a-z0-9_-]*$"
        },
        "name": {
          "type": "string",
          "pattern": "^[a-z][a-z0-9_.-]*$"
        },
        "mode": {
          "type": "string",
          "enum": [
            "read",
            "write",
            "execute",
            "network"
          ]
        },
        "max_calls": {
          "type": "integer",
          "minimum": 0
        },
        "timeout_ms": {
          "type": "integer",
          "minimum": 0
        },
        "approval": {
          "type": [
            "string",
            "null"
          ]
        },
        "fallback": {
          "type": [
            "string",
            "null"
          ]
        }
      }
    },
    "scores": {
      "type": "object",
      "additionalProperties": true,
      "properties": {
        "windows": {
          "type": "object",
          "additionalProperties": {
            "type": "object",
            "additionalProperties": {
              "type": "number",
              "minimum": 0,
              "maximum": 1
            }
          }
        }
      }
    },
    "evolution": {
      "type": "object",
      "additionalProperties": true,
      "properties": {
        "generation": {
          "type": "integer",
          "minimum": 0
        },
        "parents": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/forge_uri"
          }
        },
        "events": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/freeform_object"
          }
        }
      }
    },
    "mutation_record": {
      "type": "object",
      "additionalProperties": true,
      "required": [
        "mutation_id",
        "class",
        "decision"
      ],
      "properties": {
        "mutation_id": {
          "type": "string",
          "pattern": "^[a-z0-9][a-z0-9_-]*$"
        },
        "class": {
          "type": "string",
          "enum": [
            "prompt_patch",
            "tool_route_patch",
            "threshold_shift",
            "role_split",
            "role_merge",
            "memory_prune",
            "policy_tighten",
            "peer_graft"
          ]
        },
        "target_paths": {
          "type": "array",
          "items": {
            "type": "string"
          }
        },
        "patch_format": {
          "type": "string"
        },
        "patch_ref": {
          "type": [
            "string",
            "null"
          ]
        },
        "decision": {
          "type": "string",
          "enum": [
            "proposed",
            "shadow_passed",
            "rejected",
            "accepted",
            "rolled_back"
          ]
        },
        "source_pr": {
          "type": [
            "integer",
            "null"
          ],
          "minimum": 1
        },
        "rollback_of": {
          "type": [
            "string",
            "null"
          ]
        }
      }
    },
    "provenance": {
      "type": "object",
      "additionalProperties": true,
      "minProperties": 1
    },
    "attachment": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "path",
        "media_type",
        "sha256_raw",
        "sha256_zstd",
        "bytes"
      ],
      "properties": {
        "path": {
          "type": "string",
          "pattern": "^\\.forge/packs/[a-z0-9_-]+/[0-9a-f]{64}\\.jsonl\\.zst$"
        },
        "media_type": {
          "type": "string",
          "enum": [
            "application/zstd"
          ]
        },
        "sha256_raw": {
          "$ref": "#/$defs/sha256"
        },
        "sha256_zstd": {
          "$ref": "#/$defs/sha256"
        },
        "bytes": {
          "type": "integer",
          "minimum": 0
        }
      }
    },
    "integrity": {
      "type": "object",
      "additionalProperties": false,
      "properties": {
        "canonical_hash": {
          "$ref": "#/$defs/sha256"
        },
        "attachment_hashes": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/sha256"
          }
        },
        "signatures": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/signature"
          }
        }
      }
    },
    "signature": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "scheme",
        "keyid",
        "sig",
        "signed_at"
      ],
      "properties": {
        "scheme": {
          "type": "string",
          "enum": [
            "github-app-jws",
            "sigstore-bundle",
            "ssh-sig"
          ]
        },
        "keyid": {
          "type": "string",
          "minLength": 1
        },
        "sig": {
          "type": "string",
          "minLength": 1
        },
        "signed_at": {
          "$ref": "#/$defs/rfc3339"
        }
      }
    },
    "compat": {
      "type": "object",
      "additionalProperties": true,
      "properties": {
        "min_runtime": {
          "type": "string"
        },
        "max_runtime": {
          "type": "string"
        },
        "migrates_from": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/freeform_object"
          }
        }
      }
    },
    "extensions": {
      "type": "object",
      "propertyNames": {
        "pattern": "^[a-z0-9][a-z0-9-]*$"
      },
      "additionalProperties": {
        "type": "object",
        "additionalProperties": true
      }
    }
  }
}
