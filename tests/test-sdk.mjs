import { query } from '@anthropic-ai/claude-agent-sdk';
import { spawn } from 'child_process';

try {
  const q = query({
    prompt: 'Say hello in one word. Nothing else.',
    options: {
      cwd: 'D:\\Projects\\party-queue',
      permissionMode: 'bypassPermissions',
      allowDangerouslySkipPermissions: true,
      maxTurns: 3,
      spawnClaudeCodeProcess: (opts) => {
        const cmd = opts.command === 'node' ? process.execPath : opts.command;
        const env = { ...process.env, ...opts.env };
        delete env.CLAUDECODE;
        const child = spawn(cmd, opts.args, {
          cwd: opts.cwd,
          env,
          stdio: ['pipe', 'pipe', 'pipe'],
          windowsHide: true,
        });
        child.stderr.on('data', (d) => console.error('STDERR:', d.toString().slice(0, 300)));
        child.on('error', (e) => console.error('CHILD ERR:', e.message));
        return child;
      },
    }
  });

  for await (const msg of q) {
    console.log('MSG:', msg.type, msg.subtype || '');
    if (msg.type === 'result') {
      console.log('RESULT:', msg.subtype, String(msg.result || '').slice(0, 500));
      break;
    }
    if (msg.type === 'assistant' && msg.content) {
      const text = typeof msg.content === 'string' ? msg.content : msg.content?.filter(b => b.type === 'text').map(b => b.text).join('');
      if (text) console.log('ASSISTANT:', text.slice(0, 500));
    }
  }
  console.log('SUCCESS');
} catch (err) {
  console.error('ERROR:', err.message);
}
