/** Structured logger. Pass fields in `obj`; never log bodies, tokens, passwords or full emails. */
export interface Logger {
  fatal(obj: object, msg?: string): void;
  error(obj: object, msg?: string): void;
  warn(obj: object, msg?: string): void;
  info(obj: object, msg?: string): void;
  debug(obj: object, msg?: string): void;
  trace(obj: object, msg?: string): void;
  child(bindings: object): Logger;
}
