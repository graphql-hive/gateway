import { Attributes, LogLevel, LogWriter } from '@graphql-hive/logger';
import { Context, context, ROOT_CONTEXT } from '@opentelemetry/api';
import { logs, SeverityNumber, type Logger } from '@opentelemetry/api-logs';
import { Resource } from '@opentelemetry/resources';
import {
  BatchLogRecordProcessor,
  ConsoleLogRecordExporter,
  LoggerProvider,
  LogRecordExporter,
  LogRecordLimits,
  LogRecordProcessor,
  SimpleLogRecordProcessor,
} from '@opentelemetry/sdk-logs';
import { BufferConfig } from '@opentelemetry/sdk-trace-base';
import { otelCtxForRequestId } from './plugin';

type ProcessorOptions = {
  forceFlushTimeoutMillis?: number;
  logRecordLimits?: LogRecordLimits;
  resource?: Resource;
  console?: boolean;
};

export type OpenTelemetryLogWriterSetupOptions =
  | {
      logger: Logger;
    }
  | {
      provider: LoggerProvider;
    }
  | (ProcessorOptions &
      (
        | {
            processors: LogRecordProcessor[];
            exporter?: never;
          }
        | {
            exporter: LogRecordExporter;
            batching?: boolean | BufferConfig;
            processors?: never;
          }
        | {
            console: boolean;
            processors?: never;
            exporter?: never;
          }
      ));

export type OpenTelemetryLogWriterOptions =
  OpenTelemetryLogWriterSetupOptions & {
    useContextManager?: boolean;
  };

export class OpenTelemetryLogWriter implements LogWriter {
  private logger: Logger;
  private useContextManager: boolean;

  constructor(options: OpenTelemetryLogWriterOptions) {
    this.useContextManager = options.useContextManager ?? true;

    if ('logger' in options) {
      this.logger = options.logger;
      return;
    }

    if ('provider' in options) {
      if (
        'register' in options.provider &&
        typeof options.provider.register === 'function'
      ) {
        options.provider.register();
      } else {
        logs.setGlobalLoggerProvider(options.provider);
      }
    } else {
      const processors = options.processors ?? [];

      if (options.exporter) {
        if (options.batching !== false) {
          processors.push(
            new BatchLogRecordProcessor(
              options.exporter,
              options.batching === true ? {} : options.batching,
            ),
          );
        }
        processors.push(new SimpleLogRecordProcessor(options.exporter));
      }

      if (options.console) {
        processors.push(
          new SimpleLogRecordProcessor(new ConsoleLogRecordExporter()),
        );
      }

      logs.setGlobalLoggerProvider(
        new LoggerProvider({
          ...options,
          processors,
        }),
      );
    }

    this.logger = logs.getLogger('gateway');
  }

  flush(): void | Promise<void> {
    const provider = logs.getLoggerProvider();
    if ('forceFlush' in provider && typeof provider.forceFlush === 'function') {
      provider.forceFlush();
    }
  }

  write(
    level: LogLevel,
    attrs: Attributes | null | undefined,
    msg: string | null | undefined,
  ): void | Promise<void> {
    const attributes = Array.isArray(attrs)
      ? { ...attrs }
      : (attrs ?? undefined);

    return this.logger.emit({
      body: msg,
      attributes: attributes,
      severityNumber: HIVE_LOG_LEVEL_NUMBERS[level],
      severityText: level,
      context: this.useContextManager
        ? context.active()
        : getContextForRequest(attributes),
    });
  }
}

export const HIVE_LOG_LEVEL_NUMBERS = {
  trace: SeverityNumber.TRACE,
  debug: SeverityNumber.DEBUG,
  info: SeverityNumber.INFO,
  warn: SeverityNumber.WARN,
  error: SeverityNumber.ERROR,
};

export function getContextForRequest(attributes?: {
  requestId?: string;
}): Context {
  if (!attributes?.requestId) {
    return ROOT_CONTEXT;
  }

  return otelCtxForRequestId.get(attributes.requestId) ?? ROOT_CONTEXT;
}
