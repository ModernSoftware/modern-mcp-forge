// Serialize classic/native project selection across their management endpoints.
let pending: Promise<unknown> = Promise.resolve();
export function projectTransition<T>(operation: () => Promise<T>): Promise<T> {
  const next = pending.then(operation);
  pending = next.catch(() => {});
  return next;
}
