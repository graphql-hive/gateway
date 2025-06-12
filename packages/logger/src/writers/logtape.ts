import { getLogger, Logger as LogTapeLogger } from "@logtape/logtape";
import { LogLevel } from "../logger";
import { Attributes } from "../utils";
import { LogWriter } from "./common";

export interface LogTapeLogWriterOptions {
	category?: Parameters<typeof getLogger>[0];
	getProperties?(
		level: LogLevel,
		attrs: Attributes | null | undefined,
		msg: string | null | undefined,
	): Record<string, unknown>;
}

export class LogTapeLogWriter implements LogWriter {
	#logTapeLogger: LogTapeLogger;

	constructor(public options: LogTapeLogWriterOptions) {
		this.#logTapeLogger = getLogger(this.options.category ?? ["graphql-hive"]);
	}

	write(
		level: LogLevel,
		attrs: Attributes | null | undefined,
		msg: string | null | undefined,
	): void {
		// TODO: Type dangerously and incorrectly asserted for now
		// "trace" level needed: https://github.com/dahlia/logtape/issues/24
		// "warning" method needed: https://github.com/dahlia/logtape/issues/44
		const log = this.#logTapeLogger[level as "info"];
		const properties = this.options.getProperties
			? this.options.getProperties(level, attrs, msg)
			: attrs
				? { ...attrs }
				: undefined;
		if (msg != null) log(msg, properties);
		else if (properties) log(properties);
	}
}
