# Hive Logger

Lightweight and customizable logging utility designed for use within the GraphQL Hive ecosystem. It provides structured logging capabilities, making it easier to debug and monitor applications effectively.

## Compatibility

The Hive Logger is designed to work seamlessly in all JavaScript environments, including Node.js, browsers, and serverless platforms. Its lightweight design ensures minimal overhead, making it suitable for a wide range of applications.

# Getting Started

## Install

```sh
npm i @graphql-hive/logger
```

## Basic Usage

Create a default logger that set to the `info` log level writing to the console.

```ts
import { Logger } from '@graphql-hive/logger';

const log = new Logger();

log.debug('I wont be logged by default');

log.info({ some: 'attributes' }, 'Hello %s!', 'world');

const child = log.child({ requestId: '123-456' });

child.warn({ more: 'attributes' }, 'Oh hello child!');

const err = new Error('Woah!');

child.error({ err }, 'Something went wrong!');
```

Will produce the following output to the console output:

<!-- prettier-ignore-start -->
```sh
2025-04-10T14:00:00.000Z INF Hello world!
  some: "attributes"
2025-04-10T14:00:00.000Z WRN Oh hello child!
  requestId: "123-456"
  more: "attributes"
2025-04-10T14:00:00.000Z ERR Something went wrong!
  requestId: "123-456"
  err: {
    stack: "Error: Woah!
        at <anonymous> (/project/example.js:13:13)
        at ModuleJob.run (node:internal/modules/esm/module_job:274:25)
        at async onImport.tracePromise.__proto__ (node:internal/modules/esm/loader:644:26)
        at async asyncRunEntryPointWithESMLoader (node:internal/modules/run_main:98:5)"
    message: "Woah!"
    name: "Error"
    class: "Error"
  }
```
<!-- prettier-ignore-end -->

or if you wish to have JSON output, set the `LOG_JSON` environment variable to a truthy value:

<!-- prettier-ignore-start -->
```sh
$ LOG_JSON=1 node example.js

{"some":"attributes","level":"info","msg":"Hello world!","timestamp":"2025-04-10T14:00:00.000Z"}
{"requestId":"123-456","more":"attributes","level":"info","msg":"Hello child!","timestamp":"2025-04-10T14:00:00.000Z"}
{"requestId":"123-456","err":{"stack":"Error: Woah!\n    at <anonymous> (/project/example.js:13:13)\n    at ModuleJob.run (node:internal/modules/esm/module_job:274:25)\n    at async onImport.tracePromise.__proto__ (node:internal/modules/esm/loader:644:26)\n    at async asyncRunEntryPointWithESMLoader (node:internal/modules/run_main:98:5)","message":"Woah!","name":"Error","class":"Error"},"level":"error","msg":"Something went wrong!","timestamp":"2025-04-10T14:00:00.000Z"}
```
<!-- prettier-ignore-end -->

## Logging Levels

The default logger uses the `info` log level which will make sure to log only `info`+ logs. Available log levels are:

- `trace`
- `debug`
- `info` _default_
- `warn`
- `error`

You can change the loggers logging level on creation or dynamically.

```ts
import { Logger } from '@graphql-hive/logger';

const log = new Logger({ level: 'debug' });

log.trace(
  // you can suply "lazy" attributes which wont be evaluated unless the log level allows logging
  () => ({
    wont: 'be evaluated',
    some: expensiveOperation(),
  }),
  'Wont be logged and attributes wont be evaluated',
);

log.debug('Hello world!');

const child = log.child('[prefix] ');

child.debug('Child loggers inherit the parent log level');

log.setLevel('trace');

log.trace(() => ({ hi: 'there' }), 'Now tracing is logged too!');

child.trace('Also on the child logger');

child.setLevel('info');

log.trace('Still logging!');

child.debug('Wont be logged because the child has a different log level now');

child.info('Hello child!');
```

Outputs the following to the console:

<!-- prettier-ignore-start -->
```sh
2025-04-10T14:00:00.000Z DBG Hello world!
2025-04-10T14:00:00.000Z DBG [prefix] Child loggers inherit the parent log level
2025-04-10T14:00:00.000Z TRC Now tracing is logged too!
  hi: "there"
2025-04-10T14:00:00.000Z TRC [prefix] Also on the child logger
2025-04-10T14:00:00.000Z TRC Still logging!
2025-04-10T14:00:00.000Z INF Hello child!
```
<!-- prettier-ignore-end -->
