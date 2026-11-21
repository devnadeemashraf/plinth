import { type DestinationStream, type Logger as PinoLogger, pino } from "pino";
import { defaultRedactionEngine, type RedactionEngine } from "@/redaction/engine.js";

export type LogLevel = "trace" | "debug" | "info" | "warn" | "error" | "fatal";

export interface LogDestination {
  write(msg: string): void;
}

export interface LoggerOptions {
  readonly level?: LogLevel;
  readonly destination?: LogDestination;
  readonly redactionEngine?: RedactionEngine;
}

export interface LoggerPort {
  trace(msg: string, metadata?: Record<string, unknown>): void;
  debug(msg: string, metadata?: Record<string, unknown>): void;
  info(msg: string, metadata?: Record<string, unknown>): void;
  warn(msg: string, metadata?: Record<string, unknown>): void;
  error(msg: string, metadata?: Record<string, unknown>): void;
  fatal(msg: string, metadata?: Record<string, unknown>): void;
  child(bindings: Record<string, unknown>): LoggerPort;
}

class PinoLoggerAdapter implements LoggerPort {
  readonly #logger: PinoLogger;
  readonly #engine: RedactionEngine;

  constructor(logger: PinoLogger, engine: RedactionEngine) {
    this.#logger = logger;
    this.#engine = engine;
  }

  #log(level: LogLevel, msg: string, metadata?: Record<string, unknown>): void {
    if (metadata !== undefined) {
      const sanitized = this.#engine.redact(metadata);
      this.#logger[level](sanitized, msg);
    } else {
      this.#logger[level]({}, msg);
    }
  }

  trace(msg: string, metadata?: Record<string, unknown>): void {
    this.#log("trace", msg, metadata);
  }

  debug(msg: string, metadata?: Record<string, unknown>): void {
    this.#log("debug", msg, metadata);
  }

  info(msg: string, metadata?: Record<string, unknown>): void {
    this.#log("info", msg, metadata);
  }

  warn(msg: string, metadata?: Record<string, unknown>): void {
    this.#log("warn", msg, metadata);
  }

  error(msg: string, metadata?: Record<string, unknown>): void {
    this.#log("error", msg, metadata);
  }

  fatal(msg: string, metadata?: Record<string, unknown>): void {
    this.#log("fatal", msg, metadata);
  }

  child(bindings: Record<string, unknown>): LoggerPort {
    const sanitizedBindings = this.#engine.redact(bindings);
    const childPino = this.#logger.child(sanitizedBindings as Record<string, unknown>);
    return new PinoLoggerAdapter(childPino, this.#engine);
  }
}

export function createLogger(options?: LoggerOptions): LoggerPort {
  const engine = options?.redactionEngine ?? defaultRedactionEngine;
  const level = options?.level ?? "info";

  let pinoInstance: PinoLogger;
  if (options?.destination) {
    pinoInstance = pino({ level }, options.destination as DestinationStream);
  } else {
    pinoInstance = pino({ level });
  }

  return new PinoLoggerAdapter(pinoInstance, engine);
}
