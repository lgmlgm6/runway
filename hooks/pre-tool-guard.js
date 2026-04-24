#!/usr/bin/env node
// runway: PreToolUse hook — read-before-edit guard
const fs = require('fs');
const path = require('path');

let input = '';
const t = setTimeout(() => process.exit(0), 3000);
process.stdin.setEncoding('utf8');
process.stdin.on('data', c => input += c);
process.stdin.on('end', () => {
  clearTimeout(t);
  try {
    const data = JSON.parse(input);
    const toolName = data.tool_name;
    if (toolName !== 'Write' && toolName !== 'Edit') return process.exit(0);

    const filePath = data.tool_input?.file_path || '';
    if (!filePath) return process.exit(0);

    try { fs.accessSync(filePath, fs.constants.F_OK); } catch { return process.exit(0); }

    const output = {
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        additionalContext:
          `READ-BEFORE-EDIT REMINDER: You are about to modify "${path.basename(filePath)}" ` +
          'which already exists. If you have not already used the Read tool to read this file ' +
          'in the current session, you MUST Read it first before editing. The runtime will ' +
          'reject edits to files that have not been read. Use the Read tool on this file path, ' +
          'then retry your edit.',
      },
    };
    process.stdout.write(JSON.stringify(output));
  } catch { process.exit(0); }
});
