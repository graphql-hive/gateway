import { createServer } from 'http';
import { Opts } from '@internal/testing';

const opts = Opts(process.argv);
const selfHostingPort = opts.getServicePort('selfHostingHive');

// Echo server

createServer((req, res) => {
  function echo(msg: string) {
    process.stdout.write(msg);
    res.write(msg);
  }
  res.writeHead(200, req.headers);
  echo(`${req.method} ${req.url}\n`);
  echo(`headers: ${JSON.stringify(req.headers)}\n`);
  req.on('data', (chunk) => {
    echo(chunk.toString('utf8'));
  });
  req.once('end', () => {
    res.end();
  });
}).listen(selfHostingPort, () => {
  process.stderr.write(
    `Echo server listening on http://localhost:${selfHostingPort}\n`,
  );
});
