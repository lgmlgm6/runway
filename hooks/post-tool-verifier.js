#!/usr/bin/env node
// runway: PostToolUse hook — Bash failure reminder
let input = '';
const t = setTimeout(() => process.exit(0), 3000);
process.stdin.setEncoding('utf8');
process.stdin.on('data', c => input += c);
process.stdin.on('end', () => {
  clearTimeout(t);
  try {
    const data = JSON.parse(input);
    const toolName = data.tool_name;
    const response = data.tool_response || data.tool_output || {};
    const interrupted = response.interrupted || false;
    const exitCode = response.exit_code ?? 0;

    if (toolName !== 'Bash' || (exitCode === 0 && !interrupted)) return process.exit(0);

    const output = {
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: 'Command failed. Please investigate the error and fix before continuing.',
      },
    };
    process.stdout.write(JSON.stringify(output));
  } catch { process.exit(0); }
});
