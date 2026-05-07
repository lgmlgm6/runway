const { WORKFLOW_MANIFEST } = require('./workflow-manifest.cjs');

// Derive STAGE_CONTRACTS from the single manifest source of truth.
const STAGE_CONTRACTS = Object.fromEntries(
  Object.entries(WORKFLOW_MANIFEST.stages).map(([key, stage]) => [
    Number(key),
    {
      stage: Number(key),
      skill: stage.skill,
      hardGate: stage.hardGate,
      requiredInputs: stage.inputs,
      requiredOutputs: stage.outputs,
    },
  ]),
);

function getStageContract(stage) {
  const contract = STAGE_CONTRACTS[stage];
  if (!contract) {
    throw new Error(`Unknown stage: ${stage}`);
  }
  return contract;
}

function validateStageTransition({ fromStage, toStage, payload }) {
  const contract = getStageContract(fromStage);
  if (contract.stage + 1 !== toStage) {
    return {
      ok: false,
      error: `invalid stage transition: ${fromStage} -> ${toStage}`,
      contract,
    };
  }

  const missing = contract.requiredOutputs.filter((key) => payload[key] == null);
  if (missing.length > 0) {
    return {
      ok: false,
      error: `missing required outputs for stage ${fromStage}`,
      missing,
      contract,
    };
  }

  return {
    ok: true,
    contract,
  };
}

module.exports = {
  STAGE_CONTRACTS,
  getStageContract,
  validateStageTransition,
};
