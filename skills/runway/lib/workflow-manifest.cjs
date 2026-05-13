// Single source of truth for the Runway control plane.
// contracts.cjs and artifacts.cjs derive from here.
// Stage-specific quality strategies still live in each Stage's SKILL.md.

const TRIANGLE_LOOP_NAME = 'triangle-loop.local.md';
const PIPELINE_LOOP_NAME = 'pipeline.local.md';
const PIPELINE_COMPLETION_PROMISE = 'RUNWAY STAGES 3-12 COMPLETE';
const PIPELINE_MAX_ITERATIONS = 80;

const WORKFLOW_MANIFEST = {
  stages: {
    1: {
      skill: 'runway-prd-analysis',
      hardGate: true,
      inputs: ['prd_content_id', 'citadel_parent_id', 'mis'],
      outputs: ['requirements_spec_content_id'],
      loopName: null,
      maxIterations: null,
      completionPromise: null,
    },
    2: {
      skill: 'runway-tech-design',
      hardGate: true,
      inputs: ['requirements_spec_content_id', 'mis'],
      outputs: ['tech_spec_content_id'],
      loopName: TRIANGLE_LOOP_NAME,
      maxIterations: 20,
      completionPromise: null,
    },
    3: {
      // Compound pre-branch stage: planning is required; papi/tclist are optional
      // sub-steps documented in the orchestrator.
      skill: 'runway-task-planning (+ runway-papi / runway-tclist)',
      hardGate: false,
      inputs: ['tech_spec_content_id', 'mis'],
      outputs: ['plan_path'],
      loopName: PIPELINE_LOOP_NAME,
      maxIterations: PIPELINE_MAX_ITERATIONS,
      completionPromise: PIPELINE_COMPLETION_PROMISE,
    },
    4: {
      skill: 'ee-ones branch',
      hardGate: false,
      inputs: ['plan_path', 'ones_work_item_id'],
      outputs: ['branch_name', 'base_sha'],
      loopName: PIPELINE_LOOP_NAME,
      maxIterations: PIPELINE_MAX_ITERATIONS,
      completionPromise: PIPELINE_COMPLETION_PROMISE,
    },
    5: {
      skill: 'runway-parallel-dev',
      hardGate: false,
      inputs: ['plan_path', 'branch_name', 'base_sha'],
      outputs: ['head_sha', 'execution_report'],
      loopName: PIPELINE_LOOP_NAME,
      maxIterations: PIPELINE_MAX_ITERATIONS,
      completionPromise: PIPELINE_COMPLETION_PROMISE,
    },
    6: {
      skill: 'runway-code-review-fix',
      hardGate: false,
      inputs: ['branch_name', 'base_sha', 'head_sha'],
      outputs: ['cr_report'],
      loopName: PIPELINE_LOOP_NAME,
      maxIterations: PIPELINE_MAX_ITERATIONS,
      completionPromise: PIPELINE_COMPLETION_PROMISE,
    },
    7: {
      skill: 'runway-shepherd',
      hardGate: false,
      inputs: ['head_sha'],
      outputs: ['shepherd_config_status'],
      loopName: PIPELINE_LOOP_NAME,
      maxIterations: PIPELINE_MAX_ITERATIONS,
      completionPromise: PIPELINE_COMPLETION_PROMISE,
    },
    8: {
      skill: 'runway-qa-verify',
      hardGate: false,
      inputs: ['head_sha'],
      outputs: ['qa_report'],
      loopName: PIPELINE_LOOP_NAME,
      maxIterations: PIPELINE_MAX_ITERATIONS,
      completionPromise: PIPELINE_COMPLETION_PROMISE,
    },
    9: {
      skill: 'ee-cargo',
      hardGate: false,
      inputs: ['branch_name'],
      outputs: ['cargo_stack_uuid', 'cargo_base_url'],
      loopName: PIPELINE_LOOP_NAME,
      maxIterations: PIPELINE_MAX_ITERATIONS,
      completionPromise: PIPELINE_COMPLETION_PROMISE,
    },
    10: {
      skill: 'runway-autotest',
      hardGate: false,
      inputs: ['tclist_content_id', 'cargo_base_url'],
      outputs: ['test_report_content_id', 'test_failed_count', 'test_failed_ids'],
      loopName: PIPELINE_LOOP_NAME,
      maxIterations: PIPELINE_MAX_ITERATIONS,
      completionPromise: PIPELINE_COMPLETION_PROMISE,
    },
    11: {
      skill: 'runway-bug-analysis / fix-loop',
      hardGate: false,
      inputs: ['test_report_content_id'],
      outputs: ['bug_analysis_content_id'],
      loopName: PIPELINE_LOOP_NAME,
      maxIterations: PIPELINE_MAX_ITERATIONS,
      completionPromise: PIPELINE_COMPLETION_PROMISE,
    },
    12: {
      skill: 'runway orchestrator retrospective',
      hardGate: false,
      inputs: ['execution_report', 'cr_report', 'qa_report'],
      outputs: [],
      loopName: PIPELINE_LOOP_NAME,
      maxIterations: PIPELINE_MAX_ITERATIONS,
      completionPromise: PIPELINE_COMPLETION_PROMISE,
    },
  },

  // Maps each artifact to the earliest stage that must rerun if it changes.
  artifactToStage: {
    requirements_spec: 1,
    tech_spec: 2,
    task_plan: 3,
    papi_sync: 3,
    test_cases: 3,
    branch_execution: 4,
    execution_report: 5,
    cr_report: 6,
    shepherd_config: 7,
    qa_report: 8,
    deploy_stack: 9,
    test_report: 10,
    bug_analysis: 11,
    project_knowledge: 12,
  },

  // When an artifact changes, all listed downstream artifacts are invalidated.
  invalidation: {
    requirements_spec: ['tech_spec', 'task_plan', 'papi_sync', 'test_cases', 'branch_execution', 'execution_report', 'cr_report', 'shepherd_config', 'qa_report', 'deploy_stack', 'test_report', 'bug_analysis', 'project_knowledge'],
    tech_spec:         ['task_plan', 'papi_sync', 'test_cases', 'branch_execution', 'execution_report', 'cr_report', 'shepherd_config', 'qa_report', 'deploy_stack', 'test_report', 'bug_analysis', 'project_knowledge'],
    task_plan:         ['branch_execution', 'execution_report', 'cr_report', 'shepherd_config', 'qa_report', 'deploy_stack', 'test_report', 'bug_analysis', 'project_knowledge'],
    papi_sync:         [],
    test_cases:        ['test_report', 'bug_analysis', 'project_knowledge'],
    branch_execution:  ['execution_report', 'cr_report', 'shepherd_config', 'qa_report', 'deploy_stack', 'test_report', 'bug_analysis', 'project_knowledge'],
    execution_report:  ['cr_report', 'shepherd_config', 'qa_report', 'deploy_stack', 'test_report', 'bug_analysis', 'project_knowledge'],
    cr_report:         ['shepherd_config', 'qa_report', 'deploy_stack', 'test_report', 'bug_analysis', 'project_knowledge'],
    shepherd_config:   ['deploy_stack', 'test_report', 'bug_analysis', 'project_knowledge'],
    qa_report:         ['deploy_stack', 'test_report', 'bug_analysis', 'project_knowledge'],
    deploy_stack:      ['test_report', 'bug_analysis', 'project_knowledge'],
    test_report:       ['bug_analysis', 'project_knowledge'],
    bug_analysis:      ['project_knowledge'],
    project_knowledge: [],
  },
};

const PIPELINE_PROFILES = {
  standard: {
    entryStage:       1,
    skipStages:       [],
    hardGates:        [1, 2],
    specContextInput: ['requirements_spec_content_id', 'tech_spec_content_id'],
    papiInput:        'tech_spec_content_id',
    tclistInput:      ['requirements_spec_content_id', 'tech_spec_content_id'],
    dispatchAfter:    null,
    completionLinks:  ['requirements_spec', 'tech_spec', 'tclist'],
  },
  lite: {
    entryStage:       '0.5',
    skipStages:       [1, 2],
    hardGates:        [],
    specContextInput: ['requirement_text', 'mini_spec_path'],
    papiInput:        'mini_spec_path',
    tclistInput:      ['requirement_text', 'mini_spec_path'],
    dispatchAfter:    null,
    completionLinks:  ['mini_spec_path', 'tclist'],
  },
  fullstack: {
    entryStage:       1,
    skipStages:       [],
    hardGates:        [1, 2],
    specContextInput: ['requirements_spec_content_id', 'tech_spec_content_id'],
    papiInput:        'tech_spec_content_id',
    tclistInput:      ['requirements_spec_content_id', 'tech_spec_content_id'],
    dispatchAfter:    '2c',
    completionLinks:  ['requirements_spec', 'tech_spec', 'tclist'],
  },
  litefull: {
    entryStage:       '0.5',
    skipStages:       [1, 2],
    hardGates:        [],
    specContextInput: ['prd_content_id', 'mini_spec_path'],
    papiInput:        'mini_spec_path',
    tclistInput:      ['prd_content_id', 'mini_spec_path'],
    dispatchAfter:    '2c',
    completionLinks:  ['mini_spec_path', 'tclist'],
  },
};

module.exports = {
  TRIANGLE_LOOP_NAME,
  PIPELINE_LOOP_NAME,
  PIPELINE_COMPLETION_PROMISE,
  PIPELINE_MAX_ITERATIONS,
  WORKFLOW_MANIFEST,
  PIPELINE_PROFILES,
};
