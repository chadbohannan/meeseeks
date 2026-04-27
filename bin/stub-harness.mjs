#!/usr/bin/env node
// Pretend Claude Code: emits stream-json events on stdout, reads stream-json on stdin.
// Args: --scripted=<comma-list of event keywords> e.g. --scripted=init,assistant,result

import readline from 'node:readline';

const arg = process.argv.find(a => a.startsWith('--scripted='));
const events = arg ? arg.slice('--scripted='.length).split(',') : ['init', 'assistant', 'result'];

function emit(obj) {
  process.stdout.write(JSON.stringify(obj) + '\n');
}

setImmediate(() => {
  for (const kind of events) {
    if (kind === 'init') emit({ type: 'system', subtype: 'init', session_id: 's1' });
    else if (kind === 'assistant') emit({ type: 'assistant', message: { content: [{ type: 'text', text: 'hi' }] } });
    else if (kind === 'result') emit({ type: 'result', subtype: 'success', session_id: 's1' });
    else if (kind === 'crash') process.exit(1);
  }
});

const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
  let msg;
  try { msg = JSON.parse(line); } catch { return; }
  if (msg && msg.type === 'user') {
    emit({ type: 'assistant', message: { content: [{ type: 'text', text: 'reply' }] } });
    emit({ type: 'result', subtype: 'success' });
  }
  if (msg && msg.type === 'control' && msg.subtype === 'quit') {
    process.exit(0);
  }
});

process.on('SIGTERM', () => { process.exit(143); });
