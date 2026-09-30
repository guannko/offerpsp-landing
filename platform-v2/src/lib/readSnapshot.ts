// Share concurrent reads only; never cache failures or mutations.
const pendingReads = new Map<string, Promise<unknown>>();

export function shareRead<T>(key: string, read: () => PromiseLike<T>): Promise<T> {
  const pending = pendingReads.get(key);
  if (pending) return pending as Promise<T>;
  const request = Promise.resolve().then(read);
  pendingReads.set(key, request);
  const cleanup = () => { if (pendingReads.get(key) === request) pendingReads.delete(key); };
  request.then(cleanup, cleanup);
  return request;
}

export function keepReadSnapshot<T>(previous: T, incoming: T | null, failed: boolean,
  sameUser: boolean, empty: T): T {
  return !failed && incoming !== null ? incoming : sameUser ? previous : empty;
}
