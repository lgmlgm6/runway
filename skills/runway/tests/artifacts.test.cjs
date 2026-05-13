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
    'papi_sync',
    'test_cases',
    'branch_execution',
    'execution_report',
    'cr_report',
    'shepherd_config',
    'qa_report',
    'deploy_stack',
    'test_report',
    'bug_analysis',
    'project_knowledge',
  ]);
});

test('execution report invalidates all later verification and release artifacts', () => {
  assert.deepEqual(computeInvalidatedArtifacts('execution_report'), [
    'cr_report',
    'shepherd_config',
    'qa_report',
    'deploy_stack',
    'test_report',
    'bug_analysis',
    'project_knowledge',
  ]);
  assert.equal(getEarliestInvalidatedStage(['cr_report', 'test_report', 'project_knowledge']), 6);
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
    'shepherd_config',
    'qa_report',
    'deploy_stack',
    'test_report',
    'bug_analysis',
    'project_knowledge',
  ]);
  assert.equal(updated.resume_from_stage, 4);
});
