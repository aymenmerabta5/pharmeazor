export function mockAsync<T>(value: T): () => Promise<T> {
  return async () => value;
}
