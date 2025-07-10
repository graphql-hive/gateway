import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const styles = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'LandingPage.css'),
  'utf-8',
);

export interface LandingPageProps {
  productName?: string;
  productDescription?: string;
  productLink?: string;
  productPackageName?: string;
  graphiqlLink?: string;
  content?: string;
  requestUrl?: string;
  requestPathname?: string;
}

export function LandingPage(props: LandingPageProps) {
  const {
    productName = '__PRODUCT_NAME__',
    productDescription = '__PRODUCT_DESCRIPTION__',
    productLink = '__PRODUCT_LINK__',
    productPackageName = '__PRODUCT_PACKAGE_NAME__',
    graphiqlLink = '__GRAPHIQL_LINK__',
    content = '__CONTENT__',
    requestUrl = '__REQUEST_URL__',
    requestPathname = '__REQUEST_PATHNAME__',
  } = props;
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>{`Welcome to ${productName}`}</title>
        <link
          rel="apple-touch-icon"
          sizes="180x180"
          href="https://the-guild.dev/apple-touch-icon.png"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="32x32"
          href="https://the-guild.dev/favicon-32x32.png"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="16x16"
          href="https://the-guild.dev/favicon-16x16.png"
        />
        <link
          rel="icon"
          type="image/png"
          sizes="16x16"
          href="https://the-guild.dev/favicon-16x16.png"
        />
        <link
          rel="shorcut icon"
          type="image/x-icon"
          href="https://the-guild.dev/favicon.ico"
        />

        <link
          rel="stylesheet"
          href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/styles/default.min.css"
        />
        <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/highlight.min.js"></script>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/languages/typescript.min.js"></script>
        <script>{'hljs.highlightAll();'}</script>

        <style dangerouslySetInnerHTML={{ __html: styles }} />
      </head>
      <body id="body">
        <main>
          <section className="hero">
            <div className="logo">
              <svg
                viewBox="0 0 52 53"
                fill="currentColor"
                className="size-7 text-green-1000"
              >
                <defs>
                  <path
                    id="hive-gateway-path"
                    d="m25 .524872-7.7758.000001V13.6981c0 2.2382-1.8128 4.051-4.0509 4.051H0l7.2e-7 7.7758H8.48411c1.06096 0 2.07849-.4215 2.82859-1.1718l12.5159-12.5176C24.5786 11.0854 25 10.068 25 9.00727V.524872Zm2 0 7.7758.000001V13.6981c0 2.2382 1.8128 4.051 4.0509 4.051H52v7.7758h-8.4841c-1.061 0-2.0785-.4215-2.8286-1.1718L28.1714 11.8355C27.4214 11.0854 27 10.068 27 9.00727V.524872ZM25 52.5249h-7.7758V39.3516c0-2.2381-1.8128-4.0509-4.0509-4.0509H0l7.2e-7-7.7758H8.48411c1.06096 0 2.07849.4215 2.82859 1.1717l12.5159 12.5176c.75.7502 1.1714 1.7675 1.1714 2.8283v8.4824Zm2 0h7.7758V39.3516c0-2.2381 1.8128-4.0509 4.0509-4.0509H52v-7.7758h-8.4841c-1.061 0-2.0785.4215-2.8286 1.1717L28.1714 41.2142c-.75.7502-1.1714 1.7675-1.1714 2.8283v8.4824Zm2.8369-29.837H22.163v7.6739h7.6739v-7.6739Z"
                  ></path>
                  <clipPath id="hive-gateway-clip-path">
                    <use href="#hive-gateway-path"></use>
                  </clipPath>
                </defs>
                <use
                  href="#hive-gateway-path"
                  clipPath="url(#hive-gateway-clip-path)"
                ></use>
              </svg>
              <h1>{productName}</h1>
            </div>
            <p className="description">{productDescription}</p>
            <div className="links">
              <a href={productLink} className="docs">
                📚 Read the Documentation
              </a>
              <br />
              <a href={graphiqlLink} className="graphiql">
                🗃️ Visit GraphiQL
              </a>
            </div>
          </section>
          <section
            className="content"
            dangerouslySetInnerHTML={{ __html: content }}
          ></section>
          <section className="four-oh-four">
            <h2>ℹ️ Not the Page You Expected To See?</h2>
            <p>
              This page is shown be default whenever a 404 is hit.
              <br />
              You can disable this by behavior via the <code>
                landingPage
              </code>{' '}
              option.
            </p>
            <pre>
              <code className="language-ts">
                {`import { defineConfig } from '${productPackageName}';

export const gatewayConfig = defineConfig({
  landingPage: false,
});`}
              </code>
            </pre>

            <p>
              If you expected
              <u>this</u>
              page to be the GraphQL route, you need to configure Hive Gateway.
              <br />
              Currently, the GraphQL route is configured to be on{' '}
              <a href={graphiqlLink} className="graphiql">
                {graphiqlLink}
              </a>
              .
            </p>

            <pre>
              <code lang="ts">{`import { defineConfig } from '${productPackageName}';

export const gatewayConfig = defineConfig({
  graphqlEndpoint: '${requestPathname}',
});
`}</code>
            </pre>
          </section>
        </main>
      </body>
    </html>
  );
}
