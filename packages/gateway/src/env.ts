// inject dotenv options to process.env
try {
  const envConfigFilePath = process.env['DOTENV_CONFIG_PATH'];
  process.loadEnvFile?.(envConfigFilePath);
} catch (err) {
  // ignore if dotenv is not available
}
