/** One dependency `/readyz` waits on. `check` rejects (or hangs) when the dependency is down. */
export interface ReadinessCheck {
  readonly name: string;
  check(): Promise<void>;
}
