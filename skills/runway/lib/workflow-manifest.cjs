// Single source of truth for the Runway control plane.
// contracts.cjs and artifacts.cjs re-export from here.
// Quality strategies (TDD, admission, severity loop, etc.) stay in each Stage's SKILL.md.

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
      // triangle-loop resumes Stage 2 on interrupt but does NOT block user exit
      loopName: 'triangle-loop.local.md',
      maxIterations: 20,
      completionPromise: null,
    },
    3: {
      skill: 'runway-task-planning',
      hardGate: false,
      inputs: ['tech_spec_content_id', 'mis'],
      outputs: ['plan_path'],
      loopName: null,
      maxIterations: null,
      completionPromise: null,
    },
    4: {
      skill: 'ee-ones branch',
      hardGate: false,
      inputs: ['plan_path', 'ones_work_item_id'],
      outputs: ['branch_name', 'base_sha'],
      loopName: null,
      maxIterations: null,
      completionPromise: null,
    },
    5: {
      skill: 'runway-parallel-dev',
      hardGate: false,
      inputs: ['plan_path', 'branch_name', 'base_sha'],
      outputs: ['head_sha', 'execution_report'],
      // pipeline.local.md — Stop hook guards this loop against accidental exit
      loopName: 'pipeline.local.md',
      maxIterations: 50,
      completionPromise: 'PARALLEL DEV COMPLETE',
    },
    6: {
      skill: 'runway-code-review-fix',
      hardGate: false,
      inputs: ['branch_name', 'base_sha', 'head_sha'],
      outputs: ['cr_report'],
      loopName: 'pipeline.local.md',
      maxIterations: 30,
      completionPromise: 'CODE REVIEW COMPLETE',
    },
    7: {
      skill: 'runway-qa-verify',
      hardGate: false,
      inputs: ['head_sha'],
      outputs: ['qa_report'],
      loopName: 'pipeline.local.md',
      maxIterations: 20,
      completionPromise: 'QA VERIFY COMPLETE',
    },
  },

  // Maps each artifact to the stage that produces it.
  // Consumed by artifacts.cjs and runway-tools loop-init.
  artifactToStage: {
    requirements_spec: 1,
    tech_spec: 2,
    task_plan: 3,
    branch_execution: 4,
    execution_report: 5,
    cr_report: 6,
    qa_report: 7,
  },

  // When an artifact changes, all listed downstream artifacts are invalidated.
  invalidation: {
    requirements_spec: ['tech_spec', 'task_plan', 'branch_execution', 'execution_report', 'cr_report', 'qa_report'],
    tech_spec:         ['task_plan', 'branch_execution', 'execution_report', 'cr_report', 'qa_report'],
    task_plan:         ['branch_execution', 'execution_report', 'cr_report', 'qa_report'],
    branch_execution:  ['execution_report', 'cr_report', 'qa_report'],
    execution_report:  ['cr_report', 'qa_report'],
    cr_report:         ['qa_report'],
    qa_report:         [],
  },
};

module.exports = { WORKFLOW_MANIFEST };
