import http from 'node:http';

const server = http.createServer((req, res) => {
  if (req.url?.endsWith('good')) {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ apple: 'good' }));
    return;
  }
  if (req.url?.endsWith('bad')) {
    res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify({ apple: 'bad' }));
    return;
  }
  res.writeHead(404);
  res.end();
  return;
});

server.listen(4001);
