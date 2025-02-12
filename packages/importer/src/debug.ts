export const isDebug = ['importer'].includes(String(process.env['DEBUG']));

export function debug(message: string) {
  if (isDebug) {
    process.stderr.write(
      `${JSON.stringify({
        name: 'importer',
        level: 'debug',
        message,
      })}\n`,
    );
  }
}
