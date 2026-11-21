import { AsyncLocalStorage } from "node:async_hooks";
import { randomBytes } from "node:crypto";
import { defaultRedactionEngine, type RedactionEngine } from "@/redaction/engine.js";

export interface TraceContext {
  readonly traceId: string;
  readonly spanId: string;
  readonly parentSpanId?: string | undefined;
}

export interface Span {
  setAttribute(key: string, value: unknown): void;
  getAttributes(): Record<string, unknown>;
}

export interface TracingPort {
  getTraceContext(): TraceContext;
  withSpan<T>(name: string, fn: (span: Span) => Promise<T> | T): Promise<T>;
}

class SpanImpl implements Span {
  readonly #attributes: Record<string, unknown> = {};
  readonly #engine: RedactionEngine;

  constructor(engine: RedactionEngine) {
    this.#engine = engine;
  }

  setAttribute(key: string, value: unknown): void {
    if (!key) {
      return;
    }
    if (this.#engine.isSensitiveKey(key)) {
      this.#attributes[key] = "[REDACTED]";
    } else {
      this.#attributes[key] = value;
    }
  }

  getAttributes(): Record<string, unknown> {
    return { ...this.#attributes };
  }
}

export class InMemoryTracer implements TracingPort {
  readonly #storage = new AsyncLocalStorage<TraceContext>();
  readonly #engine: RedactionEngine;

  constructor(engine: RedactionEngine = defaultRedactionEngine) {
    this.#engine = engine;
  }

  getTraceContext(): TraceContext {
    const active = this.#storage.getStore();
    if (active) {
      return active;
    }
    return {
      traceId: randomBytes(16).toString("hex"),
      spanId: randomBytes(8).toString("hex"),
    };
  }

  async withSpan<T>(name: string, fn: (span: Span) => Promise<T> | T): Promise<T> {
    const parent = this.#storage.getStore();
    const traceId = parent ? parent.traceId : randomBytes(16).toString("hex");
    const spanId = randomBytes(8).toString("hex");

    const newContext: TraceContext = {
      traceId,
      spanId,
      parentSpanId: parent?.spanId,
    };

    const span = new SpanImpl(this.#engine);
    span.setAttribute("span.name", name);

    return this.#storage.run(newContext, async () => {
      try {
        return await fn(span);
      } catch (error) {
        span.setAttribute("error", true);
        span.setAttribute("error.message", error instanceof Error ? error.message : String(error));
        throw error;
      }
    });
  }
}

export function createInMemoryTracer(engine?: RedactionEngine): TracingPort {
  return new InMemoryTracer(engine);
}
