# T048 Speciation Proposal

## Purpose

A speciation proposal records a reviewable role split or merge without creating
or replacing `.forge` agent genomes. It is the lineage surface between T046
prompt patches, T047 tool-routing patches, and later EvolutionGuard decisions.

The canonical package API is `createSpeciationProposal(input)`.

## Shape

```ts
type SpeciationMode = "split" | "merge";

interface SpeciationParentTarget {
  path: string;
  species: string;
  content: Record<string, unknown>;
}

interface SpeciationChildDraft {
  path: string;
  species: string;
  role_name: string;
  title: string;
  summary: string;
  speciation_id: string;
  rationale: string;
  prompt_patch_ref?: string | null;
  tool_routing_patch_ref?: string | null;
}

interface SpeciationInput {
  now?: string;
  mode: SpeciationMode;
  parents: SpeciationParentTarget[];
  children: SpeciationChildDraft[];
  rationale: {
    summary: string;
    expected_benefits: string[];
    risks: string[];
  };
  approval: {
    requested_by: string;
    approval_class: "C";
    human_review_required_before_execution: true;
    human_review_required_before_merge: true;
  };
  supporting_mutations?: Array<{
    type: "prompt_patch" | "tool_routing";
    mutation_id: string;
    target_path: string;
  }>;
}
```

## Split And Merge Rules

- `split` requires exactly one parent and at least two children.
- `merge` requires at least two parents and exactly one child.
- Parent files must be canonical `.forge/agents/<species>.forge` documents.
- Parent content identity, role name, and evolution lineage fields must match
  the parent path and species.
- Child paths, species, and `speciation_id` values must be unique.
- A child must not reuse a parent path, parent species, or parent
  `speciation_id`; this prevents silent replacement.

## Safety Boundary

Every accepted proposal is Class C and requires human review before execution
and before merge.

The proposal is manifest-only. It never writes child genomes, replaces parent
genomes, mutates policies or workflows, calls GitHub APIs, approves, merges, or
executes supporting mutations.

## Guarantees

- Deterministic: identical input yields the same `proposal_id`,
  `mutation_record.mutation_id`, lineage event, and proposal digest.
- Reviewable lineage: the manifest records parent species, child species,
  parent `speciation_id` values, child `speciation_id` values, rationale, and
  supporting mutation IDs.
- Read-back validation re-checks target paths, mutation-record target paths,
  lineage event contents, proposal digest coverage, and timestamp validity.
- Fail closed: malformed input, forbidden targets, invalid split/merge
  cardinality, missing rationale, missing approval gates, bad supporting
  mutation refs, lineage cycles, and silent replacement attempts reject the
  proposal.

## Out Of Scope

Child genome creation, parent deprecation or replacement, automatic role
selection, EvolutionGuard acceptance, lineage threshold evaluation, GitHub
transport, policy mutation, workflow mutation, approval execution, and merge are
outside T048.
