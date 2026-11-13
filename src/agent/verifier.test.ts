import { expect, test } from 'vitest';
import http from 'node:http';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { WebSocketServer } from 'ws';

for (const fault of ['none', 'missing-end', 'early-violation', 'wrong-mode']) {
  test(`verification outcome for ${fault}`, async () => {
    let turn = 0;
    const server = http.createServer((req, res) => {
      res.setHeader('Content-Type', 'application/json');
      if (req.url === '/reset') turn++;
      res.end(JSON.stringify(req.url === '/health' ? {mode: 'normal'} : req.url === '/log'
        ? (fault === 'early-violation' && turn === 1 ? [{verdict: 'violation', type: 'TOOL_ACK_TIMEOUT'}] : []) : {}));
    });
    const wss = new WebSocketServer({server});
    wss.on('connection', ws => ws.on('message', () => {
      if (fault !== 'missing-end' || turn !== 1) ws.send(JSON.stringify({type:'STREAM_END',seq:1,stream_id:'test'}));
    }));
    server.listen(0, '127.0.0.1'); await once(server, 'listening');
    const port = (server.address() as {port:number}).port;
    const base = `http://127.0.0.1:${port}`;
    const child = spawn(process.execPath, ['scripts/verify-agent-server.mjs', ...(fault === 'wrong-mode' ? ['--mode', 'chaos'] : [])], {
      env: {...process.env, WS_URL:`ws://127.0.0.1:${port}`, HEALTH_URL:`${base}/health`, LOG_URL:`${base}/log`, RESET_URL:`${base}/reset`, VERIFY_TIMEOUT_MS:'150'},
    });
    let output = ''; child.stdout.on('data', c => output += c); child.stderr.on('data', c => output += c);
    try {
      const [code] = await once(child, 'exit');
      expect(code, output).toBe(fault === "none" ? 0 : 1);
      if (fault === "missing-end") expect(output).toContain("timed out waiting for STREAM_END");
      if (fault === "early-violation") expect(output).toContain("TOOL_ACK_TIMEOUT");
      if (fault === "wrong-mode") expect(output).toContain("Expected chaos server");
    } finally { child.kill(); for (const ws of wss.clients) ws.terminate(); wss.close(); server.close(); }
  }, 5000);
}
