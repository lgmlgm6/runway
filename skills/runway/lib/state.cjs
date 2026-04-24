const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_STATE_DIR = path.join('.claude', 'runway-state');
const DEFAULT_MAX_STATE_AGE_MS = 2 * 60 * 60 * 1000;

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function stateDirFor(rootDir) {
  return path.join(rootDir, DEFAULT_STATE_DIR);
}

function encodeValue(value) {
  if (value === null) {
    return 'null';
  }
  if (typeof value === 'boolean' || typeof value === 'number') {
    return String(value);
  }
  return JSON.stringify(String(value));
}

function decodeValue(value) {
  const trimmed = value.trim();
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;
  if (trimmed === 'null') return null;
  if (/^-?\d+$/.test(trimmed)) return Number(trimmed);
  if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
    try {
      return JSON.parse(trimmed.replace(/^'/, '"').replace(/'$/, '"'));
    } catch {
      return trimmed.slice(1, -1);
    }
  }
  return trimmed;
}

function serializeState(state) {
  const frontmatter = [
    '---',
    `active: ${encodeValue(state.active)}`,
    `mode: ${encodeValue(state.mode)}`,
    `iteration: ${encodeValue(state.iteration)}`,
    `max_iterations: ${encodeValue(state.max_iterations)}`,
    `completion_promise: ${encodeValue(state.completion_promise)}`,
    `session_id: ${encodeValue(state.session_id)}`,
    `started_at: ${encodeValue(state.started_at)}`,
    '---',
    '',
  ].join('\n');

  return `${frontmatter}${state.prompt || ''}`;
}

function parseState(content) {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) {
    throw new Error('Invalid state file: missing frontmatter');
  }

  const [, frontmatter, prompt = ''] = match;
  const state = { prompt };
  for (const line of frontmatter.split('\n')) {
    if (!line.trim()) continue;
    const separatorIndex = line.indexOf(':');
    if (separatorIndex === -1) continue;
    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1);
    state[key] = decodeValue(value);
  }

  return state;
}

function writeStateFile(filePath, state) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, serializeState(state));
  return filePath;
}

function initStateFile({
  rootDir,
  name,
  mode,
  maxIterations,
  completionPromise,
  sessionId,
  startedAt,
  prompt,
}) {
  const filePath = path.join(stateDirFor(rootDir), name);
  writeStateFile(filePath, {
    active: true,
    mode,
    iteration: 1,
    max_iterations: maxIterations,
    completion_promise: completionPromise ?? null,
    session_id: sessionId ?? null,
    started_at: startedAt ?? null,
    prompt: prompt || '',
  });
  return filePath;
}

function readStateFile(filePath) {
  return parseState(fs.readFileSync(filePath, 'utf8'));
}

function updateStateFile(filePath, updates) {
  const current = readStateFile(filePath);
  const next = {
    ...current,
    ...updates,
  };
  writeStateFile(filePath, next);
  return next;
}

function deactivateStateFile(filePath) {
  return updateStateFile(filePath, { active: false });
}

function isStateFileStale(filePath, options = {}) {
  if (!fs.existsSync(filePath)) {
    return false;
  }

  const now = options.now ? new Date(options.now) : new Date();
  const maxAgeMs = options.maxAgeMs ?? DEFAULT_MAX_STATE_AGE_MS;
  const stats = fs.statSync(filePath);
  return now.getTime() - stats.mtimeMs > maxAgeMs;
}

function resolveActiveState({ rootDir, sessionId, now, maxAgeMs = DEFAULT_MAX_STATE_AGE_MS }) {
  const dirPath = stateDirFor(rootDir);
  if (!fs.existsSync(dirPath)) {
    return null;
  }

  const nowMs = now ? new Date(now).getTime() : Date.now();

  const candidates = fs.readdirSync(dirPath)
    .map((name) => ({ filePath: path.join(dirPath, name), stat: fs.statSync(path.join(dirPath, name)) }))
    .filter(({ stat }) => stat.isFile())
    .filter(({ stat }) => nowMs - stat.mtimeMs <= maxAgeMs)
    .map(({ filePath, stat }) => ({ filePath, stat, state: readStateFile(filePath) }))
    .filter(({ state }) => state.active === true)
    .filter(({ state }) => !sessionId || !state.session_id || state.session_id === sessionId)
    .sort((left, right) => right.stat.mtimeMs - left.stat.mtimeMs);

  return candidates[0] || null;
}

module.exports = {
  DEFAULT_MAX_STATE_AGE_MS,
  DEFAULT_STATE_DIR,
  initStateFile,
  readStateFile,
  updateStateFile,
  deactivateStateFile,
  isStateFileStale,
  resolveActiveState,
};
