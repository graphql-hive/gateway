# IMPORTANT: make sure bundle is ready with `yarn bundle`

FROM node:26-bookworm-slim AS install

WORKDIR /install

RUN npm i graphql@16.14.0

RUN npm audit fix --force

#

FROM node:26-bookworm-slim

RUN apt-get update && \
  DEBIAN_FRONTEND=noninteractive apt-get dist-upgrade -y && \
  DEBIAN_FRONTEND=noninteractive apt-get install -y \
    debian-security-support \
    wget curl \
    dumb-init

# cleanup
RUN apt-get autoremove -y && \
  apt-get clean && \
  rm -rf /var/lib/apt/lists/*

WORKDIR /gateway

# DEPRECATED: the /serve mount point has been deprecated in favour of /gateway
#             we're keeping a symlink just for an easier transition
RUN ln -s /gateway /serve

COPY --chown=root --from=install /install/node_modules /node_modules
COPY --chown=root bundle/node_modules /node_modules
COPY --chown=root bundle/dist .

# node user can create files and install modules, but not modify the bundle (existing contents)
RUN chown node . && \
  echo "{}" > package.json && chown node package.json

# npm install should ignore peer deps (which is often "graphql" which is available in root)
RUN echo "omit=peer" > .npmrc && chown node .npmrc

# we need to set NODE_PATH to include because the root node_modules will dynamically import modules and we want node to search user-installed modules too (when extending the docker image)
ENV NODE_PATH=/gateway/node_modules

# ensure that node uses the system CA certificates too because of https://nodejs.org/en/blog/release/v24.7.0
ENV NODE_EXTRA_CA_CERTS=/etc/ssl/certs/ca-certificates.crt

# fix npm vulnerability by updating npm to latest version
RUN npm install npm@latest -g

# fix tar vulnerability by updating tar to latest v7 version
RUN npm install tar@^7 -g
RUN rm -rf /usr/local/lib/node_modules/npm/node_modules/tar

# fix glob vulnerability by updating glob to latest version ^11
# deal with CVE-2025-64756
RUN npm install glob@^11 -g
# node-gyp uses glob v10, but v11 is safe because it requires node v20+ and we're running v26
RUN rm -rf /usr/local/lib/node_modules/npm/node_modules/node-gyp/node_modules/glob
# npm uses glob v11, so we've just bumped it to the latest
RUN rm -rf /usr/local/lib/node_modules/npm/node_modules/glob

# fix @isaacs/brace-expansion vulnerability by updating it to the latest version ^5.0.1
RUN npm install @isaacs/brace-expansion@^5.0.1 -g
RUN rm -rf /usr/local/lib/node_modules/npm/node_modules/@isaacs/brace-expansion

# fix minimatch vulnerability by updating it to the latest version ^10.2.4
RUN npm install minimatch@^10.2.4 -g
RUN rm -rf /usr/local/lib/node_modules/npm/node_modules/minimatch

# fix brace-expansion vulnerability by updating it to the latest version ^5.0.4
RUN npm install brace-expansion@^5.0.4 -g
RUN rm -rf /usr/local/lib/node_modules/npm/node_modules/brace-expansion 

# fix picomatch  vulnerability by updating it to the latest version ^4.0.4
RUN npm install picomatch@^4.0.4 -g
RUN rm -rf /usr/local/lib/node_modules/npm/node_modules/picomatch 
RUN rm -rf /usr/local/lib/node_modules/npm/node_modules/tinyglobby/node_modules/picomatch

# fix ip-address vulnerability (CVE-2026-42338) by updating to the latest version ^10.1.1
RUN npm install ip-address@^10.1.1 -g
RUN rm -rf /usr/local/lib/node_modules/npm/node_modules/ip-address

# fix undici vulnerability (CVE-2026-12151) by updating to ^6.27.0
RUN npm install undici@^6.27.0 -g

USER node
ENTRYPOINT ["dumb-init", "node", "bin.mjs"]
