import fs from 'fs';
import { createServer } from 'http';
import { Opts } from '@internal/testing';

const opts = Opts(process.argv);
const selfHostingPort = opts.getServicePort('selfHostingHive');

// Echo server

function log(msg: string) {
  process.stdout.write(msg);
}

createServer((req, res) => {
  res.writeHead(200, req.headers);
  log(`${req.method} ${req.url}\n`);
  log(`headers: ${JSON.stringify(req.headers)}\n`);

  if (req.url?.endsWith('/supergraph')) {
    res.end(fs.readFileSync(process.env['SUPERGRAPH_PATH']!, 'utf-8'));
    return;
  }

  // usage
  req.on('data', (chunk) => {
    log(chunk.toString('utf8'));
  });
  req.once('end', () => {
    res.end();
  });
}).listen(selfHostingPort, () => {
  process.stderr.write(
    `Hive Console listening on http://localhost:${selfHostingPort}\n`,
  );
});
