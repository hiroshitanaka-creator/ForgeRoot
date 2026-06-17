export {
  createWorkingMemoryUpdate,
  validateWorkingMemoryUpdate,
  WORKING_MEMORY_UPDATE_VERSION,
  WORKING_MEMORY_UPDATE_SCHEMA_REF,
} from "./working.js";
export type {
  WorkingMemoryFact,
  WorkingMemoryUpdate,
  WorkingMemoryUpdateResult,
  WorkingMemoryUpdateValidationResult,
} from "./working.js";

export {
  createEpisodeDigest,
  validateEpisodeDigest,
  EPISODE_DIGEST_VERSION,
  EPISODE_DIGEST_SCHEMA_REF,
} from "./digest.js";
export type {
  EpisodeType,
  EpisodeReliability,
  EpisodeDigest,
  EpisodeDigestResult,
  EpisodeDigestValidationResult,
} from "./digest.js";
