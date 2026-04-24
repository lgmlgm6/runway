const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getStageContract,
  validateStageTransition,
} = require('../lib/contracts.cjs');

test('stage 3 auto-advances with plan output', () => {
  const contract = getStageContract(3);
  assert.equal(contract.skill, 'runway-task-planning');
  assert.equal(contract.hardGate, false);
  assert.deepEqual(contract.requiredOutputs, ['plan_path']);
});

test('validateStageTransition fails when required outputs are missing', () => {
  const result = validateStageTransition({
    fromStage: 2,
    toStage: 3,
    payload: {},
  });

  assert.equal(result.ok, false);
  assert.match(result.error, /missing required outputs/i);
  assert.deepEqual(result.missing, ['tech_spec_content_id']);
});

test('validateStageTransition succeeds with required handoff payload', () => {
  const result = validateStageTransition({
    fromStage: 3,
    toStage: 4,
    payload: { plan_path: '.runway/plans/2026-04-15-feature.md' },
  });

  assert.equal(result.ok, true);
  assert.equal(result.contract.hardGate, false);
});
