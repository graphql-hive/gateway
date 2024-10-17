export function createOpt(key: string, val: string | number): string {
  if (key.includes(' ')) {
    throw new Error(`Arg key "${key}" contains spaces`);
  }
  const strVal = String(val);
  if (strVal.includes(' ')) {
    throw new Error(`Arg value "${strVal}" contains spaces`);
  }
  return `--${key}=${strVal}`;
}

export function createPortOpt(val: number): string {
  return createOpt('port', val);
}

export function createServicePortOpt(name: string, val: number): string {
  return createOpt(`${name}_port`, val);
}

export interface Opts {
  get(key: string): string | undefined;
  get(key: string, required: true): string;
  getPort(): number | undefined;
  getPort(required: true): number;
  getServicePort(name: string): number | undefined;
  getServicePort(name: string, required: true): number;
}

export function Opts(argv: string[]): Opts {
  function get(key: string): string | undefined;
  function get(key: string, required: true): string;
  function get(key: string, required?: true): string | undefined {
    if (key.includes(' ')) {
      throw new Error(`Arg key "${key}" contains spaces`);
    }
    let val = undefined as string | undefined;
    for (const arg of argv) {
      const [, valPart] = arg.split(`--${key}=`);
      if (valPart) {
        val = valPart;
        break;
      }
    }
    if (required && !val) {
      throw new Error(`Arg "${key}" is required`);
    }
    return val;
  }
  function getPort(): number | undefined;
  function getPort(required: true): number;
  function getPort(required?: true): number | undefined {
    const strVal = required ? get('port', required) : get('port');
    if (!strVal) {
      return undefined;
    }
    const val = parseInt(strVal);
    if (isNaN(val)) {
      throw new Error(`Arg value "${strVal}" is not a number.`);
    }
    return val;
  }
  function getServicePort(name: string): number | undefined;
  function getServicePort(name: string, required: true): number;
  function getServicePort(name: string, required?: true) {
    const strVal = required
      ? get(`${name}_port`, required)
      : get(`${name}_port`);
    if (!strVal) {
      return undefined;
    }
    const val = parseInt(strVal);
    if (isNaN(val)) {
      throw new Error(`Arg value "${strVal}" is not a number.`);
    }
    return val;
  }
  return {
    get,
    getPort,
    getServicePort,
  };
}
