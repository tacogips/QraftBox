export function resolveFetchImplementation(
  fetchImplementation?: typeof fetch,
): typeof fetch {
  if (fetchImplementation !== undefined) {
    return fetchImplementation;
  }

  return ((
    input: Parameters<typeof fetch>[0],
    init?: Parameters<typeof fetch>[1],
  ): ReturnType<typeof fetch> => globalThis.fetch(input, init)) as typeof fetch;
}
