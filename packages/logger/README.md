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

## Message Formatting

The Hive Logger uses the [`quick-format-unescaped` library](https://github.com/pinojs/quick-format-unescaped) to format log messages that include interpolation (e.g., placeholders like %s, %d, etc.).

```ts
import { Logger } from '@graphql-hive/logger';

const log = new Logger();

log.info('hello %s %j %d %o', 'world', { obj: true }, 4, { another: 'obj' });
```

Outputs:

```sh
2025-04-10T14:00:00.000Z INF hello world {"obj":true} 4 {"another":"obj"}
```

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

## Writers

Logger writers are responsible for handling how and where log messages are output. In Hive Logger, writers are pluggable components that receive structured log data and determine its final destination and format. This allows you to easily customize logging behavior, such as printing logs to the console, writing them as JSON, storing them in memory for testing, or sending them to external systems.

By default, Hive Logger provides several built-in writers, but you can also implement your own to suit your application's needs. The built-ins are:

### `MemoryLogWriter`

Writes the logs to memory allowing you to access the logs. Mostly useful for testing.

```ts
import { Logger, MemoryLogWriter } from '@graphql-hive/logger';

const writer = new MemoryLogWriter();

const log = new Logger({ writers: [writer] });

log.info({ my: 'attrs' }, 'Hello World!');

console.log(writer.logs);
```

Outputs:

```sh
[ { level: 'info', msg: 'Hello World!', attrs: { my: 'attrs' } } ]
```

### `ConsoleLogWriter` (default)

The default log writer used by the Hive Logger. It outputs log messages to the console in a human-friendly, colorized format, making it easy to distinguish log levels and read structured attributes. Each log entry includes a timestamp, the log level (with color), the message, and any additional attributes (with colored keys), which are pretty-printed and formatted for clarity.

The writer works in both Node.js and browser-like environments, automatically disabling colors if not supported. This makes `ConsoleLogWriter` ideal for all cases, providing clear and readable logs out of the box.

```ts
import { ConsoleLogWriter, Logger } from '@graphql-hive/logger';

const writer = new ConsoleLogWriter({
  noColor: true, // defaults to env.NO_COLOR. read more: https://no-color.org/
  noTimestamp: true,
});

const log = new Logger({ writers: [writer] });

log.info({ my: 'attrs' }, 'Hello World!');
```

Outputs:

<!-- prettier-ignore-start -->
```sh
INF Hello World!
  my: "attrs"
```
<!-- prettier-ignore-end -->

### `JSONLogWriter` (default when `LOG_JSON=1`)

Built-in log writer that outputs each log entry as a structured JSON object. When used, it prints logs to the console in JSON format, including all provided attributes, the log level, message, and a timestamp.

If the `LOG_JSON_PRETTY=1` environment variable is provided, the output will be pretty-printed for readability; otherwise, it is compact.

This writer's format is ideal for machine parsing, log aggregation, or integrating with external logging systems, especially useful for production environments or when logs need to be consumed by other tools.

```ts
import { JSONLogWriter, Logger } from '@graphql-hive/logger';

const log = new Logger({ writers: [new JSONLogWriter()] });

log.info({ my: 'attrs' }, 'Hello World!');
```

Outputs:

<!-- prettier-ignore-start -->
```sh
{"my":"attrs","level":"info","msg":"Hello World!","timestamp":"2025-04-10T14:00:00.000Z"}
```
<!-- prettier-ignore-end -->

Or pretty printed:

<!-- prettier-ignore-start -->
```sh
$ LOG_JSON_PRETTY=1 node example.js

{
  "my": "attrs",
  "level": "info",
  "msg": "Hello World!",
  "timestamp": "2025-04-10T14:00:00.000Z"
}
```
<!-- prettier-ignore-end -->

### Custom Writers

You can implement custom log writers for the Hive Logger by creating a class that implements the `LogWriter` interface. This interface requires a single `write` method, which receives the log level, attributes, and message.

Your writer can perform any action, such as sending logs to a file, external service, or custom destination.

Writers can be synchronous (returning `void`) or asynchronous (returning a `Promise<void>`). If your writer performs asynchronous operations (like network requests or file writes), simply return a promise from the `write` method.

```ts
import {
  Attributes,
  ConsoleLogWriter,
  Logger,
  LogLevel,
  LogWriter,
} from '@graphql-hive/logger';

class HTTPLogWriter implements LogWriter {
  async write(level: LogLevel, attrs: Attributes, msg: string) {
    await fetch('https://my-log-service.com', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ level, attrs, msg }),
    });
  }
}

const log = new Logger({
  // send logs both to the HTTP loggging service and output them to the console
  writers: [new HTTPLogWriter(), new ConsoleLogWriter()],
});

log.info('Hello World!');

await log.flush(); // make sure all async writes settle
```

#### Flushing and Non-Blocking Logging

The logger does not block when you log asynchronously. Instead, it tracks all pending async writes internally. When you call `log.flush()` or dispose the logger when using the [Explicit Resource Management](https://github.com/tc39/proposal-explicit-resource-management), it waits for all pending writes to finish, ensuring no logs are lost on shutdown. During normal operation, logging remains fast and non-blocking, even if some writers are async.

This design allows you to use async writers without impacting the performance of your application or blocking the main thread.

##### Handling Async Write Errors

The Logger handles write errors for asynchronous writers by tracking all write promises. When `await log.flush()` is called (including during async disposal), it waits for all pending writes to settle. If any writes fail (i.e., their promises reject), their errors are collected and after all writes have settled, if there were any errors, an `AggregateError` is thrown containing all the individual write errors.

```ts
import { Logger } from './Logger';

let i = 0;
const log = new Logger({
  writers: [
    {
      async write() {
        i++;
        throw new Error('Write failed! #' + i);
      },
    },
  ],
});

// no fail during logs
log.info('hello');
log.info('world');

try {
  await log.flush();
} catch (e) {
  // flush will fail with each individually failed writes
  console.error(e);
}
```

Outputs:

```sh
AggregateError: Failed to flush 2 writes
    at async <anonymous> (/project/example.js:20:3) {
  [errors]: [
    Error: Write failed! #1
        at Object.write (/project/example.js:9:15),
    Error: Write failed! #2
        at Object.write (/project/example.js:9:15)
  ]
}
```
