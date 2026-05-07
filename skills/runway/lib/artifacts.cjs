const { WORKFLOW_MANIFEST } = require('./workflow-manifest.cjs');

// Derived from the single manifest source of truth.
const ARTIFACT_TO_STAGE = WORKFLOW_MANIFEST.artifactToStage;
const INVALIDATION_MAP  = WORKFLOW_MANIFEST.invalidation;

function computeInvalidatedArtifacts(changedArtifact) {
  return [...(INVALIDATION_MAP[changedArtifact] || [])];
}

function getEarliestInvalidatedStage(artifacts) {
  const stages = (artifacts || [])
    .map((artifact) => ARTIFACT_TO_STAGE[artifact])
    .filter(Boolean);

  if (stages.length === 0) {
    return null;
  }

  return Math.min(...stages);
}

function sortArtifacts(artifacts) {
  return [...artifacts].sort((left, right) =>
    (ARTIFACT_TO_STAGE[left] || Number.MAX_SAFE_INTEGER) -
    (ARTIFACT_TO_STAGE[right] || Number.MAX_SAFE_INTEGER),
  );
}

function markArtifactsInvalid(checkpoint, changedArtifact) {
  const invalidated = new Set([
    ...((checkpoint && checkpoint.invalidated_artifacts) || []),
    ...computeInvalidatedArtifacts(changedArtifact),
  ]);

  const invalidatedArtifacts = sortArtifacts(invalidated);
  return {
    ...(checkpoint || {}),
    invalidated_artifacts: invalidatedArtifacts,
    resume_from_stage: getEarliestInvalidatedStage(invalidatedArtifacts),
  };
}

module.exports = {
  ARTIFACT_TO_STAGE,
  computeInvalidatedArtifacts,
  getEarliestInvalidatedStage,
  markArtifactsInvalid,
};
