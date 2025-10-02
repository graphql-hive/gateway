# IMPORTANT: make sure bundle is ready with `yarn bundle`

FROM oven/bun:1.2.15-slim AS install

WORKDIR /install

RUN bun i graphql@^16.9.0

#

FROM oven/bun:1.2.15-slim

# use the upcoming debian release (trixie) to get the latest security updates
RUN echo "deb http://ftp.debian.org/debian trixie main" >> /etc/apt/sources.list && \
  apt-get update

# some packaged libraries are vulnerable out of the box, upgrade everything
# we use "dist-upgrade" to ensure that the latest versions are installed even if they require new dependencies
RUN apt-get dist-upgrade -y

RUN apt-get install -y \
  # for security updates
  debian-security-support \
  # necessary for the gateway to run
  libc-bin \
  # for healthchecks
  wget curl \
  # for proper signal propagation
  dumb-init

# Install specific security updates for openssl
RUN wget http://security.debian.org/debian-security/pool/updates/main/o/openssl/openssl_3.5.1-1+deb13u1_amd64.deb \
  && dpkg -i openssl_3.5.1-1+deb13u1_amd64.deb \
  && wget http://security.debian.org/debian-security/pool/updates/main/o/openssl/libssl3t64_3.5.1-1+deb13u1_amd64.deb \
  && dpkg -i libssl3t64_3.5.1-1+deb13u1_amd64.deb \
  && wget http://security.debian.org/debian-security/pool/updates/main/o/openssl/openssl-provider-legacy_3.5.1-1+deb13u1_amd64.deb \
  && dpkg -i openssl-provider-legacy_3.5.1-1+deb13u1_amd64.deb

RUN echo "deb http://security.debian.org/debian-security bookworm-security main" >> /etc/apt/sources.list && \
 apt-get update && \
 apt-get install --only-upgrade -y openssl libssl3t64 openssl-provider-legacy && \
 apt-get install -f -y

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
RUN chown bun . && \
    echo "{}" > package.json && chown bun package.json

# npm install should ignore peer deps (which is often "graphql" which is available in root)
RUN echo "omit=peer" > .npmrc && chown bun .npmrc

# we need to set NODE_PATH to include because the root node_modules will dynamically import modules and we want node to search user-installed modules too (when extending the docker image)
ENV NODE_PATH=/gateway/node_modules

USER bun
ENTRYPOINT ["dumb-init", "bun", "bin.mjs"]
