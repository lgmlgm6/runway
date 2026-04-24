#!/usr/bin/env node
// runway: PreToolUse hook — workflow advisory reminder
const path = require('path');

let input = '';
const t = setTimeout(() => process.exit(0), 3000);
process.stdin.setEncoding('utf8');
process.stdin.on('data', c => input += c);
process.stdin.on('end', () => {
  clearTimeout(t);
  try {
    const data = JSON.parse(input);
    const advisoryPath = process.env.CLAUDE_PLUGIN_ROOT
      ? path.join(process.env.CLAUDE_PLUGIN_ROOT, 'skills', 'runway', 'lib', 'workflow-advisory.cjs')
      : path.join(process.env.HOME || '', '.claude', 'skills', 'runway', 'lib', 'workflow-advisory.cjs');
    const { getWorkflowAdvisory } = require(advisoryPath);
    const message = getWorkflowAdvisory({
      toolName: data.tool_name,
      filePath: data.tool_input?.file_path || data.tool_input?.path || '',
      cwd: data.cwd || process.cwd(),
      sessionId: data.session_id || data.sessionId || null,
      now: new Date(),
      isSubagent: Boolean(data.tool_input?.is_subagent || data.session_type === 'task'),
    });
    if (!message) return process.exit(0);
    const output = {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        additionalContext: message,
      },
    };
    process.stdout.write(JSON.stringify(output));
  } catch { process.exit(0); }
});
