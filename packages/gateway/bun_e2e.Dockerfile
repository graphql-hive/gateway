FROM gateway_e2e_base-bun

# install the extra depdenencies under the workspace node_modules making sure
# that modules installed by the user work as expected (extending the image)
COPY --chown=bun bundle/e2e/node_modules node_modules
