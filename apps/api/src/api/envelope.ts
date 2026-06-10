export type ApiEnvelope<T> =
  | { success: true; data: T; error: null }
  | { success: false; data: null; error: string };

export function ok<T>(data: T): ApiEnvelope<T> {
  return { success: true, data, error: null };
}

export function fail(error: string): ApiEnvelope<never> {
  return { success: false, data: null, error };
}
