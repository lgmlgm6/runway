const STAGE_CONTRACTS = {
  1: {
    stage: 1,
    skill: 'runway-prd-analysis',
    hardGate: true,
    requiredInputs: ['prd_content_id', 'citadel_parent_id', 'mis'],
    requiredOutputs: ['requirements_spec_content_id'],
  },
  2: {
    stage: 2,
    skill: 'runway-tech-design',
    hardGate: true,
    requiredInputs: ['requirements_spec_content_id', 'mis'],
    requiredOutputs: ['tech_spec_content_id'],
  },
  3: {
    stage: 3,
    skill: 'runway-task-planning',
    hardGate: false,
    requiredInputs: ['tech_spec_content_id', 'mis'],
    requiredOutputs: ['plan_path'],
  },
  4: {
    stage: 4,
    skill: 'ee-ones branch',
    hardGate: false,
    requiredInputs: ['plan_path', 'ones_work_item_id'],
    requiredOutputs: ['branch_name', 'base_sha'],
  },
  5: {
    stage: 5,
    skill: 'runway-parallel-dev',
    hardGate: false,
    requiredInputs: ['plan_path', 'branch_name', 'base_sha'],
    requiredOutputs: ['head_sha', 'execution_report'],
  },
  6: {
    stage: 6,
    skill: 'runway-code-review-fix',
    hardGate: false,
    requiredInputs: ['branch_name', 'base_sha', 'head_sha'],
    requiredOutputs: ['cr_report'],
  },
  7: {
    stage: 7,
    skill: 'runway-qa-verify',
    hardGate: false,
    requiredInputs: ['head_sha'],
    requiredOutputs: ['qa_report'],
  },
};

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
