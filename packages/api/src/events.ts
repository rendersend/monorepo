/**
 * Thin event emission helper.
 *
 * Call initEvents(store) once at startup. After that, emit() can be called
 * anywhere in the request path. It never throws — a failed event write never
 * affects the response.
 */
import type { DataStore, EmitEventInput } from "./db/types.ts";

let _store: DataStore | null = null;

export function initEvents(store: DataStore): void {
  _store = store;
}

export async function emit(input: EmitEventInput): Promise<void> {
  if (!_store) return;
  try {
    await _store.debug.events.emit(input, Date.now());
  } catch {
    // event writes must never crash the request
  }
}
