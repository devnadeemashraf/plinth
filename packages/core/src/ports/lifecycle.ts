export type LifecycleHook = () => Promise<void> | void;

export interface LifecyclePort {
  onShutdown(name: string, hook: LifecycleHook, priority?: number): void;
  triggerShutdown(signal?: string): Promise<void>;
  isShuttingDown(): boolean;
}

interface HookEntry {
  readonly name: string;
  readonly hook: LifecycleHook;
  readonly priority: number;
}

export class DefaultLifecycleManager implements LifecyclePort {
  readonly #hooks = new Map<string, HookEntry>();
  #shuttingDown = false;

  onShutdown(name: string, hook: LifecycleHook, priority = 50): void {
    this.#hooks.set(name, { name, hook, priority });
  }

  async triggerShutdown(_signal = "SIGTERM"): Promise<void> {
    if (this.#shuttingDown) {
      return;
    }
    this.#shuttingDown = true;

    const sortedHooks = Array.from(this.#hooks.values()).sort((a, b) => b.priority - a.priority);

    for (const entry of sortedHooks) {
      try {
        await entry.hook();
      } catch {
        // Continue draining remaining hooks on shutdown failure
      }
    }
  }

  isShuttingDown(): boolean {
    return this.#shuttingDown;
  }
}
