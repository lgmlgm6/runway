const ARTIFACT_TO_STAGE = {
  requirements_spec: 1,
  tech_spec: 2,
  task_plan: 3,
  branch_execution: 4,
  execution_report: 5,
  cr_report: 6,
  qa_report: 7,
};

const INVALIDATION_MAP = {
  requirements_spec: ['tech_spec', 'task_plan', 'branch_execution', 'execution_report', 'cr_report', 'qa_report'],
  tech_spec: ['task_plan', 'branch_execution', 'execution_report', 'cr_report', 'qa_report'],
  task_plan: ['branch_execution', 'execution_report', 'cr_report', 'qa_report'],
  branch_execution: ['execution_report', 'cr_report', 'qa_report'],
  execution_report: ['cr_report', 'qa_report'],
  cr_report: ['qa_report'],
  qa_report: [],
};

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
  return [...artifacts].sort((left, right) => {
    return (ARTIFACT_TO_STAGE[left] || Number.MAX_SAFE_INTEGER) - (ARTIFACT_TO_STAGE[right] || Number.MAX_SAFE_INTEGER);
  });
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
