import { createServer } from 'http';
import { Opts } from '@internal/testing';

const opts = Opts(process.argv);
const selfHostingPort = opts.getServicePort('selfHostingHive');

// Echo server

createServer((req, res) => {
  process.stdout.write(`${req.method} ${req.url}\n`);
  res.writeHead(200, req.headers);
  req.on('data', (chunk) => {
    process.stdout.write(chunk);
    res.write(chunk);
  });
  req.on('end', () => {
    res.end();
  });
}).listen(selfHostingPort, () => {
  process.stderr.write(
    `Echo server listening on http://localhost:${selfHostingPort}\n`,
  );
});
