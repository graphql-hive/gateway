import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SVGProps } from 'react';

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
          href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/styles/github.min.css"
        />
        <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/highlight.min.js"></script>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/languages/typescript.min.js"></script>
        <script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.11.1/languages/shell.min.js"></script>
        <script>{'hljs.highlightAll();'}</script>

        <style dangerouslySetInnerHTML={{ __html: styles }} />
      </head>
      <body id="body">
        <div className="watermark">
          <Logo
            style={{
              position: 'absolute',
              left: '-20%',
              top: '-10vh',
              width: '40%',
              color: 'var(--background-light-color)',
            }}
          />
          <Logo
            style={{
              position: 'absolute',
              right: '-25%',
              bottom: '5vh',
              width: '50%',
              color: 'var(--background-light-color)',
            }}
          />
        </div>
        <main>
          <section className="hero">
            <div className="logo">
              <Logo />
              <h1>{productName}</h1>
            </div>
            <p className="description">{productDescription}</p>
            <br />
            <div className="links">
              <a href={productLink} className="button">
                📚 Read the Documentation
              </a>
              <a href={graphiqlLink} className="button accent">
                🗃️ Visit GraphiQL
              </a>
            </div>
          </section>
          <section className="content">
            <p>You can interact with this endpoint by sending a POST request</p>
            <div className="shell">
              <span className="dollar">$</span>
              <pre className="command">
                {`curl --url '${requestUrl}' \\
  --header 'content-type: application/json' \\
  --data '{"query":"query { __typename }"}'`}
              </pre>
            </div>
          </section>
          <section className="four-oh-four">
            <h2>Not the Page You Expected To See?</h2>
            <p>
              This page is shown be default whenever a 404 is hit.
              <br />
              You can disable this by behavior via the <code>
                landingPage
              </code>{' '}
              option.
            </p>
            <pre>
              <code className="language-typescript">
                {`import { defineConfig } from '${productPackageName}';

export const gatewayConfig = defineConfig({
  landingPage: false,
});`}
              </code>
            </pre>

            <p>
              If you expected <u>this</u> page to be the GraphQL route, you need
              to configure Hive Gateway.
              <br />
              Currently, the GraphQL route is configured to be on{' '}
              <a href={graphiqlLink} className="graphiql">
                {graphiqlLink}
              </a>
              .
            </p>

            <pre>
              <code className="language-typescript">{`import { defineConfig } from '${productPackageName}';

export const gatewayConfig = defineConfig({
  graphqlEndpoint: '${requestPathname}',
});
`}</code>
            </pre>
          </section>
        </main>
        <footer>
          Developed with ❤️ by{' '}
          <a
            title="View our website"
            href="https://the-guild.dev"
            rel="noopener noreferrer"
            className="the-guild"
          >
            <svg viewBox="0 0 51 54" fill="currentColor" className="logo">
              <path
                fillRule="evenodd"
                clipRule="evenodd"
                d="M2.06194 20.2745C2.68522 20.4867 3.35002 20.6073 4.04393 20.6073C4.6672 20.6073 5.26838 20.5117 5.83612 20.3391V36.7481C5.83612 37.328 6.14561 37.8684 6.64488 38.1582L22.3391 47.2835C23.0814 46.4108 24.1808 45.8554 25.4084 45.8554C26.7446 45.8554 27.927 46.5134 28.6639 47.5218C28.6769 47.5403 28.6909 47.5576 28.7039 47.5756C28.7557 47.6494 28.8041 47.7248 28.8511 47.8026L28.9049 47.891C28.9465 47.9626 28.9849 48.0355 29.0214 48.1093C29.0414 48.1489 29.0603 48.1891 29.0792 48.2294C29.1105 48.2978 29.14 48.3673 29.1681 48.4378C29.1881 48.4882 29.2059 48.5388 29.2237 48.5899C29.2462 48.6544 29.2684 48.7195 29.2873 48.7852C29.3056 48.8477 29.3202 48.9107 29.3359 48.9737L29.3762 49.1513C29.3918 49.23 29.4021 49.3097 29.4129 49.3902C29.4188 49.4379 29.428 49.4847 29.4323 49.5324C29.4448 49.6627 29.4523 49.7941 29.4523 49.9277C29.4523 50.1406 29.4313 50.3474 29.3994 50.5516L29.3881 50.6275C29.0576 52.5406 27.4007 54 25.4084 54C23.6318 54 22.1227 52.8386 21.5809 51.2314L4.7578 41.4502C3.08905 40.4806 2.06194 38.6876 2.06194 36.7481V20.2745ZM46.0991 10.2908C48.3291 10.2908 50.1428 12.1173 50.1428 14.3631C50.1428 15.5848 49.6037 16.6794 48.755 17.4265V36.7481C48.755 38.6876 47.7279 40.4806 46.0591 41.4502L31.6051 49.8539C31.5889 48.479 31.1274 47.2135 30.3619 46.1876L44.1722 38.1582C44.6713 37.8684 44.9809 37.328 44.9809 36.7481V18.2736C43.2938 17.7838 42.0554 16.2179 42.0554 14.3631C42.0554 13.4601 42.3524 12.6277 42.8485 11.9517C42.856 11.9409 42.8641 11.9306 42.8717 11.9197C42.9655 11.7948 43.0657 11.6743 43.1725 11.5608L43.187 11.545C43.4086 11.3127 43.6567 11.1079 43.9274 10.9337C43.9553 10.9152 43.985 10.8984 44.0136 10.8804C44.1209 10.8158 44.2303 10.755 44.3435 10.7002C44.3765 10.6844 44.4094 10.6671 44.4427 10.6519C44.5846 10.5878 44.7291 10.5286 44.879 10.4814C44.879 10.4819 44.8796 10.4814 44.879 10.4814L45.173 10.3994C45.4705 10.3287 45.7805 10.2908 46.0991 10.2908ZM40.5727 19.0708V32.5386C40.5727 34.1339 39.7202 35.6206 38.3486 36.4181L27.5398 42.696L26.5424 43.2466L26.5543 42.0944V37.3194L35.4506 32.1471V27.4102L27.8779 25.24L40.5727 19.0708ZM10.2444 19.0627L15.3665 21.593V32.1467L24.1279 37.2409V43.1973L12.4684 36.4189C11.0968 35.6206 10.2444 34.1339 10.2444 32.5388V19.0627ZM23.1844 9.96788C24.5349 9.18328 26.2818 9.18328 27.6325 9.96788L39.4904 16.8956L38.3636 17.4327L33.9644 19.6061L25.4084 14.6315L16.8523 19.6061L11.3442 16.8843L12.4026 16.2425C12.4123 16.2338 12.4398 16.2153 12.4694 16.1985L23.1844 9.96788ZM25.4083 0C26.3394 0 27.27 0.242165 28.1041 0.72704L42.644 9.18112C41.5737 9.9076 40.7455 10.9637 40.2899 12.2006L26.217 4.01908C25.9718 3.87572 25.6919 3.80081 25.4083 3.80081C25.1248 3.80081 24.8454 3.87572 24.5995 4.01908L8.02283 13.6574C8.06272 13.887 8.08753 14.1216 8.08753 14.3632C8.08753 16.1154 6.98116 17.608 5.43643 18.1814C5.42457 18.1858 5.41217 18.1906 5.40031 18.1944C5.27792 18.2385 5.15392 18.2765 5.02666 18.3085L4.95065 18.328C4.83419 18.3551 4.71503 18.3764 4.59533 18.3931L4.49775 18.4079C4.3484 18.4246 4.19742 18.4356 4.04377 18.4356C3.87932 18.4356 3.71758 18.4225 3.55743 18.403C3.5143 18.3974 3.47225 18.3899 3.42965 18.3834C3.30673 18.3643 3.18595 18.34 3.06679 18.3101C3.03012 18.3008 2.99347 18.2921 2.95681 18.2819C2.64139 18.1922 2.3416 18.0679 2.06177 17.9088L1.82144 17.7607C0.725648 17.0318 0 15.7822 0 14.3632C0 12.1175 1.81431 10.2909 4.04377 10.2909C4.62229 10.2909 5.17117 10.4158 5.66881 10.6368L22.7124 0.72704C23.5465 0.242165 24.4777 0 25.4083 0Z"
              ></path>
            </svg>
            <svg viewBox="0 0 47 25" fill="currentColor" className="name">
              <path d="M0.313477 2.77294H3.57946V10.6541H6.26751V2.77294H9.53349V0.163818H0.313477V2.77294Z"></path>
              <path d="M17.8588 0.163818V4.23889H13.5848V0.163818H10.9102V10.6541H13.5848V6.75386H17.8588V10.6541H20.5468V0.163818H17.8588Z"></path>
              <path d="M22.568 10.6541H30.6187V8.05842H25.2561V6.71352H29.6645V4.27923H25.2561V2.77294H30.6187V0.163818H22.568V10.6541Z"></path>
              <path d="M5.53497 20.9193H8.05247V21.2043C7.55963 21.9036 6.76042 22.3569 5.82801 22.3569C4.25624 22.3569 3.00414 21.1395 3.00414 19.6113C3.00414 18.0831 4.25624 16.8657 5.82801 16.8657C6.73378 16.8657 7.53299 17.2672 8.05247 17.9018L10.2237 16.4772C9.22464 15.208 7.61291 14.3661 5.82801 14.3661C2.81766 14.3661 0.313477 16.7232 0.313477 19.6113C0.313477 22.4994 2.81766 24.8564 5.82801 24.8564C6.89362 24.8564 7.94591 24.4679 8.45208 23.7167V24.6622H10.5433V18.7695H5.53497V20.9193Z"></path>
              <path d="M19.0352 14.5604V20.0905C19.0352 21.5539 18.3026 22.3569 16.904 22.3569C15.5187 22.3569 14.7994 21.5539 14.7994 20.0905V14.5604H12.1354V20.2459C12.1354 22.849 13.7871 24.8564 16.904 24.8564C20.0076 24.8564 21.6859 22.849 21.6859 20.2459V14.5604H19.0352Z"></path>
              <path d="M23.5364 14.5604V24.6622H26.2004V14.5604H23.5364Z"></path>
              <path d="M28.1958 24.6622H35.8283V22.1626H30.8465V14.5604H28.1958V24.6622Z"></path>
              <path d="M37.1999 24.6622H42.0218C45.2719 24.6622 46.937 22.3698 46.937 19.6113C46.937 16.8657 45.2719 14.5604 42.0218 14.5604H37.1999V24.6622ZM41.822 17.0729C43.4071 17.0729 44.2463 18.096 44.2463 19.6113C44.2463 21.1266 43.4071 22.1626 41.822 22.1626H39.864V17.0729H41.822Z"></path>
            </svg>
          </a>
        </footer>
      </body>
    </html>
  );
}

function Logo(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 52 53" fill="currentColor" {...props}>
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
  );
}
