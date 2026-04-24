const path = require('node:path');
const { resolveWorkflowAdvisory } = require('./status.cjs');

const IGNORED_PATTERNS = [
  `${path.sep}.runway${path.sep}`,
  `${path.sep}.claude${path.sep}runway-state${path.sep}`,
  `${path.sep}.claude${path.sep}hooks${path.sep}runway${path.sep}`,
];

function shouldIgnoreFile(filePath) {
  if (!filePath) {
    return true;
  }
  return IGNORED_PATTERNS.some((pattern) => filePath.includes(pattern));
}

function getWorkflowAdvisory({
  toolName,
  filePath,
  cwd,
  sessionId,
  now,
  maxAgeMs,
  isSubagent = false,
}) {
  if (toolName !== 'Edit' && toolName !== 'Write') {
    return null;
  }
  if (!cwd || isSubagent || shouldIgnoreFile(filePath)) {
    return null;
  }

  const workflow = resolveWorkflowAdvisory(cwd, {
    sessionId,
    now,
    maxAgeMs,
  });
  if (!workflow) {
    return null;
  }

  const mode = workflow.active_state.state?.mode || 'workflow';
  const stage = workflow.checkpoint?.current_stage ?? 'unknown';
  const onesId = workflow.checkpoint?.ones_id ?? 'unknown';

  return [
    `RUNWAY WORKFLOW ADVISORY: An active ${mode} workflow is in progress for ONES ${onesId} (Stage ${stage}).`,
    'This is a soft reminder only — proceed if the direct edit is intentional.',
    'If you need workflow context first, run `node "$HOME/.claude/skills/runway/bin/runway-tools.cjs" status --root "$PWD" --ones-id <id>`.',
  ].join(' ');
}

module.exports = {
  getWorkflowAdvisory,
};
