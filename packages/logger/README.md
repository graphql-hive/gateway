# Hive Logger

Lightweight and customizable logging utility designed for use within the GraphQL Hive ecosystem. It provides structured logging capabilities, making it easier to debug and monitor applications effectively.

## Compatibility

The Hive Logger is designed to work seamlessly in all JavaScript environments, including Node.js, browsers, and serverless platforms. Its lightweight design ensures minimal overhead, making it suitable for a wide range of applications.

# Getting started

## Install

```sh
npm i @graphql-hive/logger
```

## Usage

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
$ node example.js

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
