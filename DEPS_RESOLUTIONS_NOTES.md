# Notes about dependency resolutions in [package.json](/package.json)

Here we collect reasons and write explanations about why some resolutions or patches have been added.

### pkgroll

1. https://github.com/privatenumber/pkgroll/issues/101 (added `interop: "auto"` to `getRollupConfigs` outputs)
1. Skip libchecking while generating type declarations because we never bundle `@types` by disabling `respectExternal` ([read more](https://github.com/Swatinem/rollup-plugin-dts?tab=readme-ov-file#what-to-expect))
