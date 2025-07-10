export function LandingPage() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <title>Welcome to __PRODUCT_NAME__</title>
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
        <script>hljs.highlightAll();</script>
        {/* <style>
      * {
        box-sizing: border-box;
      }

      body,
      html {
        padding: 20px;
        margin: 0;
        background-color: black;
        color: white;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol";
      }
      a {
        color: lightblue;
      }
      code {
        background-color: lightgray;
        color: black;
        padding: 2px;
        border-radius: 4px;
        font-family: monospace;
      }

      table {
        border: 2px solid lightgray;
        border-radius: 4px;
        border-spacing: 0;
      }
      th {
        text-align: left;
        color: lightgray;
        border-bottom: 4px solid lightgray;
      }
      th, td {
        padding: 6px 8px;
      }
      td {
        overflow-wrap: anywhere;
      }

      pre {
        max-width: 100%;
      }

      .hero {
        display: flex;
        flex-direction: column;
        align-items: center;
      }
      .hero .logo {
        font-size: 2rem;
        display: flex;
        align-items: center;
        gap: 10px;
      }
      .hero .logo svg {
        height: 50px;
      }
      .hero .logo h1 {
        margin: 0;
      }
      .hero .description {
        color: gray;
      }
      .hero .links {
        text-align: center;
      }

      .content {
        position: relative;
        margin: 50px auto;
        display: flex;
        flex-direction: column;
        max-width: 800px;
      }

      .four-oh-four {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        background-color: #2f2f2f;
        border-radius: 4px;
        margin: 0 auto;
        padding: 10px;
        max-width: 800px;
        border: 1px solid gray;
        opacity: 0.4;
        transition: opacity 0.3s ease-in-out;
      }
      .four-oh-four:hover {
        opacity: 1;
      }
      .four-oh-four p {
        text-align: center;
      }
    </style> */}
      </head>
      <body id="body">
        <main>
          <section className="hero">
            <div className="logo">
              __PRODUCT_LOGO__
              <h1>__PRODUCT_NAME__</h1>
            </div>
            <p className="description">__PRODUCT_DESCRIPTION__</p>
            <div className="links">
              <a href="__PRODUCT_LINK__" className="docs">
                📚 Read the Documentation
              </a>
              <br />
              <a href="__GRAPHIQL_LINK__" className="graphiql">
                🗃️ Visit GraphiQL
              </a>
            </div>
          </section>
          <section className="content">__CONTENT__</section>
          <section className="four-oh-four">
            <h2>ℹ️ Not the Page You Expected To See?</h2>
            <p>
              This page is shown be default whenever a 404 is hit.
              <br />
              You can disable this by behavior via the
              <code>landingPage</code>
              option.
            </p>
            <pre>
              <code className="language-typescript">
                {`import { defineConfig } from '__PRODUCT_PACKAGE_NAME__';

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
              Currently, the GraphQL route is configured to be on
              <a href="__GRAPHIQL_LINK__" className="graphiql">
                __GRAPHIQL_LINK__
              </a>
              .
            </p>

            <pre>
              <code className="language-typescript">{`import { defineConfig } from '__PRODUCT_PACKAGE_NAME__';

export const gatewayConfig = defineConfig({
  graphqlEndpoint: '__REQUEST_PATHNAME__',
});
`}</code>
            </pre>
          </section>
        </main>
      </body>
    </html>
  );
}
