import type { Proc } from '@internal/proc';

export type ResponseErrorOptions = (
  | {
      message: string;
    }
  | {
      status: number;
      statusText: string;
    }
) & {
  resText: string;
  proc?: Proc;
};

export class ResponseError extends Error {
  constructor({ resText, proc, ...options }: ResponseErrorOptions) {
    const message =
      'message' in options
        ? options.message
        : `Status is not 200, got status ${options.status} ${options.statusText} and body:\n${resText}`;
    super(message);
    this.name = 'ResponseError';
    if (proc != null && resText.includes('Unexpected')) {
      process.stderr.write(proc.getStd('both'));
    }
    Error.captureStackTrace(this, this.constructor);
  }
}
