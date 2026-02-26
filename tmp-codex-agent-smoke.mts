import { runAgent } from 'codex-agent';

const req = { prompt: 'say hello', cwd: '/g/gits/tacogips/QraftBox' };
const events: string[] = [];
const started = Date.now();
for await (const ev of runAgent(req, { codexBinary: 'codex' })) {
  events.push(ev.type);
  if (ev.type === 'session.message') {
    const chunk = ev.chunk as any;
    if (chunk?.type === 'event_msg' && chunk?.payload?.type === 'AgentMessage') {
      console.log('AGENT_MESSAGE', String(chunk.payload.message ?? '').slice(0, 200));
    }
  }
  if (ev.type === 'session.completed' || ev.type === 'session.error') break;
}
console.log('EVENTS', events.join(','));
console.log('ELAPSED_MS', Date.now() - started);
