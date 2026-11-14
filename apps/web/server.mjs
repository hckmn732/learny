// E2E test server (Playwright webServer). `next start` uses the Node defaults (5 s keep-alive),
// which aborts a mutation that reuses a connection left idle by a long assertion. The suites run
// one browser worker against this process for several minutes, so the keep-alive window is raised
// to keep every replay-free request on a live socket.
import { createServer } from 'node:http';

import next from 'next';

const port = Number(process.env.PORT ?? 3100);
const app = next({ dev: false, dir: process.cwd() });
await app.prepare();

const handler = app.getRequestHandler();
const server = createServer((request, response) => {
  void handler(request, response);
});

server.keepAliveTimeout = 65_000;
server.headersTimeout = 66_000;
server.requestTimeout = 0;

server.listen(port, () => {
  process.stdout.write(`learny e2e server: http://127.0.0.1:${String(port)}\n`);
});

for (const signal of ['SIGTERM', 'SIGINT']) {
  process.on(signal, () => {
    server.close(() => {
      process.exit(0);
    });
  });
}
