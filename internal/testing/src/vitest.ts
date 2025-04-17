const cancelledCtrl = new AbortController();

// @ts-expect-error https://github.com/vitest-dev/vitest/issues/7647#issuecomment-2712223721
globalThis.__vitest_worker__?.onCancel // new line to type-check rest
  .then(() => cancelledCtrl.abort('Test run cancelled'));

/** Worker's test run has been cancelled by the user. Using `Q` or a single `CTRL+C`. */
export const cancelledSignal = cancelledCtrl.signal;
