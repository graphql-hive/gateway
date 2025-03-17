FROM gateway_e2e_base

# install the extra depdenencies under the workspace node_modules making sure
# that modules installed by the user work as expected (extending the image)
COPY --chown=node bundle/e2e/package.json package.json
COPY --chown=node bundle/e2e/node_modules node_modules
