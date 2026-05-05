#!/usr/bin/env node
// Claude Code PreToolUse hook for Write/Edit.
// 攔截 audit/report/analysis 一次性檔寫到不該去的位置。
// 跨平台 Node 版(替代 kit 原 .sh,Windows 友善)。
'use strict';

const fs = require('fs');

let raw;
try {
  raw = fs.readFileSync(0, 'utf8');
} catch {
  process.exit(0);
}

let data;
try {
  data = JSON.parse(raw);
} catch {
  process.exit(0);
}

const filePath = data && data.tool_input && data.tool_input.file_path;
if (!filePath || typeof filePath !== 'string') {
  process.exit(0);
}

const normalized = filePath.replace(/\\/g, '/');
const basename = normalized.split('/').pop() || '';

const suspicious = /^(audit|report|analysis|review|inspection|scan)[-_a-zA-Z0-9]*\.(md|txt|json)$/i;
if (!suspicious.test(basename)) {
  process.exit(0);
}

const allowedPrefixes = [
  '.claude/scratch/',
  '.claude/decisions/',
  '/tmp/',
];

const lower = normalized.toLowerCase();
const isAllowed = allowedPrefixes.some(p => lower.includes(p));
if (isAllowed) {
  process.exit(0);
}

process.stderr.write(
  `BLOCKED by pre-write-guard\n\n` +
  `Path: ${filePath}\n\n` +
  `This filename looks like a one-shot analysis artifact (audit/report/analysis/...).\n\n` +
  `Allowed locations:\n` +
  `  - .claude/scratch/    (short-term, gitignored, janitor cleans)\n` +
  `  - .claude/decisions/  (long-term decision log, one line each)\n\n` +
  `Or: don't write a file at all — report findings directly in the conversation.\n` +
  `\n` +
  `If this is short-term scratch  -> rewrite path to .claude/scratch/${basename}\n` +
  `If this is a worth-keeping decision -> append one line to .claude/decisions/log.md\n` +
  `If this is just for the user   -> respond in the chat, no file\n`
);
process.exit(2);
