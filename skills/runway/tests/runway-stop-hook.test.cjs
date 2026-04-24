const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execSync, spawnSync } = require('node:child_process');

const STOP_HOOK_SH = path.join(__dirname, '..', '..', '..', 'hooks', 'runway-stop-hook.sh');
const STATE_LIB = path.join(__dirname, '..', 'lib', 'state.cjs');
const { initStateFile, updateStateFile } = require(STATE_LIB);

// ── helpers ───────────────────────────────────────────────────────────────────

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'runway-hook-test-'));
}

function writeHookScript(dir) {
  const hookPath = path.join(dir, 'runway-stop-hook.sh');
  fs.copyFileSync(STOP_HOOK_SH, hookPath);
  fs.chmodSync(hookPath, 0o755);
  return hookPath;
}

function makeTranscript(dir, messages) {
  const lines = messages.map(m => JSON.stringify(m));
  const transcriptPath = path.join(dir, 'transcript.json');
  fs.writeFileSync(transcriptPath, lines.join('\n'));
  return transcriptPath;
}

function makeAssistantTextMessage(text) {
  return { role: 'assistant', message: { content: [{ type: 'text', text }] } };
}

function makeAssistantToolUseMessage(toolName = 'Agent') {
  return { role: 'assistant', message: { content: [{ type: 'tool_use', name: toolName, id: 'tu_1', input: {} }] } };
}

function makeAssistantEmptyMessage() {
  return { role: 'assistant', message: { content: [] } };
}

function runHook(hookPath, projectDir, transcriptPath, sessionId = '') {
  const input = JSON.stringify({
    transcript_path: transcriptPath || '',
    session_id: sessionId,
  });

  const result = spawnSync('bash', [hookPath], {
    input,
    env: {
      ...process.env,
      CLAUDE_SESSION_ID: sessionId,
    },
    cwd: projectDir,
    encoding: 'utf8',
    timeout: 10000,
  });

  return {
    exitCode: result.status,
    stdout: result.stdout || '',
    stderr: result.stderr || '',
  };
}

function setupProjectDir(tmpDir) {
  // Hook uses relative path ".claude/runway-state/pipeline.local.md"
  // so cwd must be the project root
  const stateDir = path.join(tmpDir, '.claude', 'runway-state');
  fs.mkdirSync(stateDir, { recursive: true });
  return { projectDir: tmpDir, stateDir };
}

// ── tests ─────────────────────────────────────────────────────────────────────

test('allows exit when no pipeline state exists', () => {
  const tmp = makeTempDir();
  const hookPath = writeHookScript(tmp);
  const { projectDir } = setupProjectDir(tmp);

  const result = runHook(hookPath, path.join(projectDir, '.claude', 'runway-state'), null, 'sess-1');
  assert.equal(result.exitCode, 0, 'should exit 0 (allow exit) when no state file');
  const out = JSON.parse(result.stdout || '{}');
  assert.notEqual(out.decision, 'block', 'should not block when no state');
});

test('allows exit when pipeline state is active:false', () => {
  const tmp = makeTempDir();
  const hookPath = writeHookScript(tmp);
  const { projectDir, stateDir } = setupProjectDir(tmp);

  initStateFile({ rootDir: projectDir, name: 'pipeline.local.md', mode: 'pipeline', maxIterations: 50, completionPromise: null, sessionId: 'sess-1', startedAt: new Date().toISOString(), prompt: '继续' });
  updateStateFile(path.join(stateDir, 'pipeline.local.md'), { active: false });

  const result = runHook(hookPath, projectDir, null, 'sess-1');
  assert.equal(result.exitCode, 0);
  const out = JSON.parse(result.stdout || '{}');
  assert.notEqual(out.decision, 'block');
});

test('allows exit when iteration cap reached', () => {
  const tmp = makeTempDir();
  const hookPath = writeHookScript(tmp);
  const { projectDir, stateDir } = setupProjectDir(tmp);

  initStateFile({ rootDir: projectDir, name: 'pipeline.local.md', mode: 'pipeline', maxIterations: 3, completionPromise: null, sessionId: 'sess-1', startedAt: new Date().toISOString(), prompt: '继续' });
  updateStateFile(path.join(stateDir, 'pipeline.local.md'), { iteration: 3 });

  const transcriptPath = makeTranscript(tmp, [makeAssistantTextMessage('working...')]);
  const result = runHook(hookPath, projectDir, transcriptPath, 'sess-1');
  assert.equal(result.exitCode, 0);
  const out = JSON.parse(result.stdout || '{}');
  assert.notEqual(out.decision, 'block');
});

test('allows exit when session is stale', () => {
  const tmp = makeTempDir();
  const hookPath = writeHookScript(tmp);
  const { projectDir, stateDir } = setupProjectDir(tmp);

  initStateFile({ rootDir: projectDir, name: 'pipeline.local.md', mode: 'pipeline', maxIterations: 50, completionPromise: null, sessionId: 'old-session', startedAt: new Date().toISOString(), prompt: '继续' });

  const transcriptPath = makeTranscript(tmp, [makeAssistantTextMessage('working...')]);
  const result = runHook(hookPath, projectDir, transcriptPath, 'new-session');
  assert.equal(result.exitCode, 0);
  const out = JSON.parse(result.stdout || '{}');
  assert.notEqual(out.decision, 'block');
});

test('allows exit when completion promise is satisfied', () => {
  const tmp = makeTempDir();
  const hookPath = writeHookScript(tmp);
  const { projectDir, stateDir } = setupProjectDir(tmp);

  initStateFile({ rootDir: projectDir, name: 'pipeline.local.md', mode: 'pipeline', maxIterations: 50, completionPromise: 'PARALLEL DEV COMPLETE', sessionId: 'sess-1', startedAt: new Date().toISOString(), prompt: '继续' });

  const transcriptPath = makeTranscript(tmp, [makeAssistantTextMessage('All done. <promise>PARALLEL DEV COMPLETE</promise>')]);
  const result = runHook(hookPath, projectDir, transcriptPath, 'sess-1');
  assert.equal(result.exitCode, 0);
  const out = JSON.parse(result.stdout || '{}');
  assert.notEqual(out.decision, 'block');
});

test('allows exit when state file is corrupted (non-numeric iteration)', () => {
  const tmp = makeTempDir();
  const hookPath = writeHookScript(tmp);
  const { projectDir, stateDir } = setupProjectDir(tmp);

  const statePath = path.join(stateDir, 'pipeline.local.md');
  fs.writeFileSync(statePath, '---\nactive: true\nmode: pipeline\niteration: bad\nmax_iterations: bad\ncompletion_promise: null\nsession_id: null\nstarted_at: null\n---\n继续\n');

  const result = runHook(hookPath, projectDir, null, 'sess-1');
  assert.equal(result.exitCode, 0);
  const out = JSON.parse(result.stdout || '{}');
  assert.notEqual(out.decision, 'block');
});

test('allows exit when prompt body is empty', () => {
  const tmp = makeTempDir();
  const hookPath = writeHookScript(tmp);
  const { projectDir, stateDir } = setupProjectDir(tmp);

  const statePath = path.join(stateDir, 'pipeline.local.md');
  fs.writeFileSync(statePath, '---\nactive: true\nmode: pipeline\niteration: 1\nmax_iterations: 50\ncompletion_promise: null\nsession_id: sess-1\nstarted_at: 2026-04-20T00:00:00Z\n---\n');

  const transcriptPath = makeTranscript(tmp, [makeAssistantTextMessage('working...')]);
  const result = runHook(hookPath, projectDir, transcriptPath, 'sess-1');
  assert.equal(result.exitCode, 0);
  const out = JSON.parse(result.stdout || '{}');
  assert.notEqual(out.decision, 'block');
});

// ── THE THREE BUG CASES — these should block but currently allow exit ─────────

test('BLOCKS when transcript_path is missing (not found) — active pipeline state must not be cleared', () => {
  const tmp = makeTempDir();
  const hookPath = writeHookScript(tmp);
  const { projectDir, stateDir } = setupProjectDir(tmp);

  initStateFile({ rootDir: projectDir, name: 'pipeline.local.md', mode: 'pipeline', maxIterations: 50, completionPromise: null, sessionId: 'sess-1', startedAt: new Date().toISOString(), prompt: '继续执行' });

  // Pass empty transcript_path — simulates the case where Claude Code doesn't provide it
  const input = JSON.stringify({ transcript_path: '', session_id: 'sess-1' });
  const result = spawnSync('bash', [hookPath], {
    input,
    env: { ...process.env, CLAUDE_SESSION_ID: 'sess-1' },
    cwd: projectDir,
    encoding: 'utf8',
    timeout: 10000,
  });

  // State file must NOT be deleted
  assert.ok(fs.existsSync(path.join(stateDir, 'pipeline.local.md')), 'state file must survive when transcript is missing');

  const out = JSON.parse(result.stdout || '{}');
  assert.equal(out.decision, 'block', 'must block (re-inject) when transcript missing but state is active');
});

test('BLOCKS when transcript has no assistant messages — active pipeline state must not be cleared', () => {
  const tmp = makeTempDir();
  const hookPath = writeHookScript(tmp);
  const { projectDir, stateDir } = setupProjectDir(tmp);

  initStateFile({ rootDir: projectDir, name: 'pipeline.local.md', mode: 'pipeline', maxIterations: 50, completionPromise: null, sessionId: 'sess-1', startedAt: new Date().toISOString(), prompt: '继续执行' });

  // Transcript with only user messages, no assistant
  const transcriptPath = makeTranscript(tmp, [
    { role: 'user', message: { content: [{ type: 'text', text: '开始' }] } },
  ]);

  const result = spawnSync('bash', [hookPath], {
    input: JSON.stringify({ transcript_path: transcriptPath, session_id: 'sess-1' }),
    env: { ...process.env, CLAUDE_SESSION_ID: 'sess-1' },
    cwd: projectDir,
    encoding: 'utf8',
    timeout: 10000,
  });

  assert.ok(fs.existsSync(path.join(stateDir, 'pipeline.local.md')), 'state file must survive when no assistant messages');

  const out = JSON.parse(result.stdout || '{}');
  assert.equal(out.decision, 'block', 'must block when no assistant messages but state is active');
});

test('BLOCKS when last assistant message is tool-use only (e.g. after Agent dispatch) — Stage 6 reviewer subagents done scenario', () => {
  // This is the exact scenario in the screenshot: 3 reviewers Done, orchestrator's
  // last message was Agent tool_use dispatch, no text output — hook must NOT clear state.
  const tmp = makeTempDir();
  const hookPath = writeHookScript(tmp);
  const { projectDir, stateDir } = setupProjectDir(tmp);

  initStateFile({ rootDir: projectDir, name: 'pipeline.local.md', mode: 'pipeline', maxIterations: 30, completionPromise: 'CODE REVIEW COMPLETE', sessionId: 'sess-1', startedAt: new Date().toISOString(), prompt: '继续执行 review' });

  // Last assistant message: dispatched 3 Agent tool_use calls, no text
  const transcriptPath = makeTranscript(tmp, [
    makeAssistantTextMessage('并行派发三个 reviewer。'),
    makeAssistantToolUseMessage('Agent'), // the actual dispatch — tool_use only, no text
  ]);

  const result = spawnSync('bash', [hookPath], {
    input: JSON.stringify({ transcript_path: transcriptPath, session_id: 'sess-1' }),
    env: { ...process.env, CLAUDE_SESSION_ID: 'sess-1' },
    cwd: projectDir,
    encoding: 'utf8',
    timeout: 10000,
  });

  assert.ok(fs.existsSync(path.join(stateDir, 'pipeline.local.md')), 'state file must survive after Agent dispatch');

  const out = JSON.parse(result.stdout || '{}');
  assert.equal(out.decision, 'block', 'must block after Agent tool_use dispatch — orchestrator is mid-execution');
});

test('BLOCKS when last assistant message has empty content array — Stage 5 plan-read scenario', () => {
  // Stage 5: after reading plan and creating tracker, last assistant message may have
  // empty content (tool result only, no text). State must survive.
  const tmp = makeTempDir();
  const hookPath = writeHookScript(tmp);
  const { projectDir, stateDir } = setupProjectDir(tmp);

  initStateFile({ rootDir: projectDir, name: 'pipeline.local.md', mode: 'pipeline', maxIterations: 50, completionPromise: 'PARALLEL DEV COMPLETE', sessionId: 'sess-1', startedAt: new Date().toISOString(), prompt: '继续执行开发' });

  const transcriptPath = makeTranscript(tmp, [
    makeAssistantTextMessage('读取计划文件并初始化执行追踪器。'),
    makeAssistantEmptyMessage(), // empty content — no text, no tool_use
  ]);

  const result = spawnSync('bash', [hookPath], {
    input: JSON.stringify({ transcript_path: transcriptPath, session_id: 'sess-1' }),
    env: { ...process.env, CLAUDE_SESSION_ID: 'sess-1' },
    cwd: projectDir,
    encoding: 'utf8',
    timeout: 10000,
  });

  assert.ok(fs.existsSync(path.join(stateDir, 'pipeline.local.md')), 'state file must survive after empty content message');

  const out = JSON.parse(result.stdout || '{}');
  assert.equal(out.decision, 'block', 'must block when last message has empty content but state is active');
});

test('blocks and re-injects when active state exists and last message has text', () => {
  const tmp = makeTempDir();
  const hookPath = writeHookScript(tmp);
  const { projectDir, stateDir } = setupProjectDir(tmp);

  initStateFile({ rootDir: projectDir, name: 'pipeline.local.md', mode: 'pipeline', maxIterations: 50, completionPromise: null, sessionId: 'sess-1', startedAt: new Date().toISOString(), prompt: '继续执行' });

  const transcriptPath = makeTranscript(tmp, [makeAssistantTextMessage('Wave 1 完成，进入 Wave 2。')]);
  const result = spawnSync('bash', [hookPath], {
    input: JSON.stringify({ transcript_path: transcriptPath, session_id: 'sess-1' }),
    env: { ...process.env, CLAUDE_SESSION_ID: 'sess-1' },
    cwd: projectDir,
    encoding: 'utf8',
    timeout: 10000,
  });

  const out = JSON.parse(result.stdout);
  assert.equal(out.decision, 'block');
  assert.ok(out.reason, 'should include reason (prompt text)');
  assert.ok(out.systemMessage, 'should include systemMessage');
  assert.match(out.systemMessage, /iteration 2/);
});

test('increments iteration counter on each block', () => {
  const tmp = makeTempDir();
  const hookPath = writeHookScript(tmp);
  const { projectDir, stateDir } = setupProjectDir(tmp);

  const statePath = initStateFile({ rootDir: projectDir, name: 'pipeline.local.md', mode: 'pipeline', maxIterations: 50, completionPromise: null, sessionId: 'sess-1', startedAt: new Date().toISOString(), prompt: '继续' });

  const transcriptPath = makeTranscript(tmp, [makeAssistantTextMessage('progress')]);

  for (let i = 2; i <= 4; i++) {
    spawnSync('bash', [hookPath], {
      input: JSON.stringify({ transcript_path: transcriptPath, session_id: 'sess-1' }),
      env: { ...process.env, CLAUDE_SESSION_ID: 'sess-1' },
      cwd: projectDir,
      encoding: 'utf8',
      timeout: 10000,
    });

    const { readStateFile } = require(STATE_LIB);
    const state = readStateFile(statePath);
    assert.equal(state.iteration, i, `iteration should be ${i} after ${i - 1} blocks`);
  }
});
