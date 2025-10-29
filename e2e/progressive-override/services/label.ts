import { createServer } from 'http';
import { Opts } from '@internal/testing';

const port = Opts(process.argv).getServicePort('label');

createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  if (req.headers['x-use-inventory-service'] === 'true') {
    res.end('use_inventory_service');
  } else {
    res.end('do_not_use_inventory_service');
  }
}).listen(port, () => {
  console.log(`Label service is running at http://localhost:${port}/`);
});
