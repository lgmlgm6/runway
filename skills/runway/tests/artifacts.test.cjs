const test = require('node:test');
const assert = require('node:assert/strict');

const {
  computeInvalidatedArtifacts,
  getEarliestInvalidatedStage,
  markArtifactsInvalid,
} = require('../lib/artifacts.cjs');

test('requirements spec invalidates all downstream artifacts', () => {
  assert.deepEqual(computeInvalidatedArtifacts('requirements_spec'), [
    'tech_spec',
    'task_plan',
    'branch_execution',
    'execution_report',
    'cr_report',
    'qa_report',
  ]);
});

test('code changes after execution report invalidate downstream reports only', () => {
  assert.deepEqual(computeInvalidatedArtifacts('execution_report'), [
    'cr_report',
    'qa_report',
  ]);
  assert.equal(getEarliestInvalidatedStage(['cr_report', 'qa_report']), 6);
});

test('markArtifactsInvalid deduplicates and sorts invalidated artifacts by stage order', () => {
  const checkpoint = {
    invalidated_artifacts: ['qa_report'],
  };

  const updated = markArtifactsInvalid(checkpoint, 'task_plan');
  assert.deepEqual(updated.invalidated_artifacts, [
    'branch_execution',
    'execution_report',
    'cr_report',
    'qa_report',
  ]);
  assert.equal(updated.resume_from_stage, 4);
});
