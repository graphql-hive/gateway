// https://github.com/unjs/std-env/blob/ab15595debec9e9115a9c1d31bc7597a8e71dbfd/src/runtimes.ts
export const isNode =
  !globalThis.Bun && globalThis.process?.release?.name === 'node';
export const controllerInSignalSy = Symbol('CONTROLLER_IN_SIGNAL');
export const signalRegistry = new FinalizationRegistry<() => void>((cb) =>
  cb(),
);
