/**
 * Temporary mock for Tauri functions
 * This will be replaced with actual service calls in later phases
 */
export async function invoke<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  console.warn(`[MOCK] Tauri invoke called: ${command}`, args);
  throw new Error(`Tauri invoke not implemented yet: ${command}`);
}

export type UnlistenFn = () => void;

export async function listen<T>(
  event: string,
  handler: (event: { payload: T }) => void
): Promise<UnlistenFn> {
  console.warn(`[MOCK] Tauri listen called: ${event}`);
  return () => {
    console.warn(`[MOCK] Tauri unlisten called: ${event}`);
  };
}
