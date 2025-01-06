# IMPORTANT: make sure bundle is ready with `yarn bundle`

FROM node:22-slim AS install

WORKDIR /install

RUN npm i graphql@^16.9.0

#

FROM node:22-slim

RUN apt-get update && apt-get install -y \
  # for healthchecks
  wget curl \
  # for proper signal propagation
  dumb-init && \
  # clean
  apt-get clean

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

USER node
ENTRYPOINT ["dumb-init", "node", "bin.mjs"]
