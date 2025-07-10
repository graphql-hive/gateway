import { createServer } from 'node:http';
import { render, renderToFile } from './render-landing-page';

const server = createServer(async (_req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/html' });
  await renderToFile(); // ensure the landing page is rendered to file on every change
  const landingPage = await render({
    productName: 'Hive Gateway',
    productDescription:
      'Unify and accelerate your data graph across diverse services with Hive Gateway, which seamlessly integrates with Apollo Federation.',
    productPackageName: '@graphql-hive/gateway',
    graphiqlPathname: '/graphiql',
    graphqlUrl: 'http://localhost:4000/graphql',
    productLink: 'https://graphql-hive.com',
    requestPathname: '/graphql',
  });
  res.end(landingPage);
});

server.listen(3000);

console.log('Landing page rendered at http://localhost:3000');
