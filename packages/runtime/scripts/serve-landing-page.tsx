import { createServer } from 'node:http';
import { render } from './render-landing-page';

const server = createServer(async (_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  const landingPage = await render({
    productName: 'Hive Gateway',
    productDescription: 'Federated GraphQL Gateway',
    productPackageName: '@graphql-hive/gateway',
    graphiqlLink: '/graphiql',
    content: '<p>Welcome to Hive Gateway!</p>',
    requestUrl: 'http://localhost:3000/graphql',
    requestPathname: '/graphql',
  });
  res.end(landingPage);
});

server.listen(3000);

console.log('Landing page rendered at http://localhost:3000');
