# IMPORTANT: make sure bundle is ready with `yarn bundle`

FROM node:24-bookworm-slim AS install

WORKDIR /install

RUN npm i graphql@^16.9.0

#

FROM node:24-bookworm-slim

# use the upcoming debian release (trixie) to get the latest security updates
RUN echo "deb http://ftp.debian.org/debian trixie main" >> /etc/apt/sources.list && \
  apt-get update

# some packaged libraries are vulnerable out of the box, upgrade everything
# we use "dist-upgrade" to ensure that the latest versions are installed even if they require new dependencies
RUN apt-get dist-upgrade -y

RUN apt-get install -y \
  # for healthchecks
  wget curl \
  # for proper signal propagation
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

USER node
ENTRYPOINT ["dumb-init", "node", "bin.mjs"]
