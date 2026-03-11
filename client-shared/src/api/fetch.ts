export function resolveFetchImplementation(
  fetchImplementation?: typeof fetch,
): typeof fetch {
  if (fetchImplementation !== undefined) {
    return fetchImplementation;
  }

  return ((input: RequestInfo | URL, init?: RequestInit): Promise<Response> =>
    globalThis.fetch(input, init)) as typeof fetch;
}
