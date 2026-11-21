export interface HistogramData {
  count: number;
  sum: number;
}

export interface MetricsSnapshot {
  readonly counters: Record<string, number>;
  readonly gauges: Record<string, number>;
  readonly histograms: Record<string, HistogramData>;
}

export interface MetricsPort {
  increment(name: string, tags?: Record<string, string | number>, value?: number): void;
  gauge(name: string, value: number, tags?: Record<string, string | number>): void;
  histogram(name: string, value: number, tags?: Record<string, string | number>): void;
  recordHttpRequest(method: string, route: string, status: number, durationMs: number): void;
  getSnapshot(): MetricsSnapshot;
}

export interface InMemoryMetricsOptions {
  readonly maxEntries?: number | undefined;
}

const DEFAULT_MAX_METRICS_ENTRIES = 5000;

function sanitizeMetricName(name: string): string {
  return name.replace(/[^a-zA-Z0-9_:]/g, "_");
}

function sanitizeTagName(key: string): string {
  return key.replace(/[^a-zA-Z0-9_]/g, "_");
}

function sanitizeTagValue(val: string | number): string {
  return String(val).replace(/[\r\n",]/g, "");
}

function formatMetricKey(name: string, tags?: Record<string, string | number>): string {
  const sanitizedName = sanitizeMetricName(name);
  if (!tags || Object.keys(tags).length === 0) {
    return sanitizedName;
  }

  const tagPairs = Object.entries(tags)
    .sort(([k1], [k2]) => k1.localeCompare(k2))
    .map(([k, v]) => `${sanitizeTagName(k)}=${sanitizeTagValue(v)}`);

  return `${sanitizedName}{${tagPairs.join(",")}}`;
}

export class InMemoryMetrics implements MetricsPort {
  readonly #counters: Map<string, number> = new Map();
  readonly #gauges: Map<string, number> = new Map();
  readonly #histograms: Map<string, { count: number; sum: number }> = new Map();
  readonly #maxEntries: number;

  constructor(options?: InMemoryMetricsOptions) {
    this.#maxEntries = options?.maxEntries ?? DEFAULT_MAX_METRICS_ENTRIES;
  }

  increment(name: string, tags?: Record<string, string | number>, value = 1): void {
    if (!Number.isFinite(value)) {
      return;
    }
    const key = formatMetricKey(name, tags);
    if (!this.#counters.has(key) && this.#counters.size >= this.#maxEntries) {
      return; // Bounded protection against high-cardinality OOM DoS
    }
    const current = this.#counters.get(key) ?? 0;
    this.#counters.set(key, current + value);
  }

  gauge(name: string, value: number, tags?: Record<string, string | number>): void {
    if (!Number.isFinite(value)) {
      return;
    }
    const key = formatMetricKey(name, tags);
    if (!this.#gauges.has(key) && this.#gauges.size >= this.#maxEntries) {
      return; // Bounded protection against high-cardinality OOM DoS
    }
    this.#gauges.set(key, value);
  }

  histogram(name: string, value: number, tags?: Record<string, string | number>): void {
    if (!Number.isFinite(value)) {
      return;
    }
    const key = formatMetricKey(name, tags);
    if (!this.#histograms.has(key) && this.#histograms.size >= this.#maxEntries) {
      return; // Bounded protection against high-cardinality OOM DoS
    }
    const existing = this.#histograms.get(key) ?? { count: 0, sum: 0 };
    this.#histograms.set(key, {
      count: existing.count + 1,
      sum: existing.sum + value,
    });
  }

  recordHttpRequest(method: string, route: string, status: number, durationMs: number): void {
    const tags = {
      method: method.toUpperCase(),
      route,
      status,
    };
    this.increment("http_requests_total", tags, 1);
    this.histogram("http_request_duration_ms", durationMs, tags);

    if (status >= 400) {
      this.increment("http_errors_total", tags, 1);
    }
  }

  getSnapshot(): MetricsSnapshot {
    const counters: Record<string, number> = {};
    for (const [k, v] of this.#counters.entries()) {
      counters[k] = v;
    }

    const gauges: Record<string, number> = {};
    for (const [k, v] of this.#gauges.entries()) {
      gauges[k] = v;
    }

    const histograms: Record<string, HistogramData> = {};
    for (const [k, v] of this.#histograms.entries()) {
      histograms[k] = { ...v };
    }

    return { counters, gauges, histograms };
  }
}

export function createInMemoryMetrics(options?: InMemoryMetricsOptions): MetricsPort {
  return new InMemoryMetrics(options);
}
