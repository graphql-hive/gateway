FROM gateway_e2e_base-bun

# install the extra depdenencies under the workspace node_modules making sure
# that modules installed by the user work as expected (extending the image)
# COPY --chown=bun bundle/e2e/package.json package.json - not necessary in bun since `bun install` wont clean the node_modules
COPY --chown=bun bundle/e2e/node_modules node_modules
