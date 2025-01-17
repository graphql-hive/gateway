export const isDebug = ['1', 'y', 'yes', 't', 'true'].includes(
  String(process.env['DEBUG']),
);

export function debug(msg: string) {
  if (isDebug) {
    process.stderr.write(`[${new Date().toISOString()}] HOOKS ${msg}\n`);
  }
}
