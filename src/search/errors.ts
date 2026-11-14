/** A search error whose message is safe to expose to callers. */
export class SearchFailure extends Error {}

/** A sanitized search failure that permits trying an independent provider. */
export class SearchUnavailable extends SearchFailure {}

/** Classify explicit HTTP failures without treating rate limits as quota exhaustion. */
export function statusFailure(source: string, status: number): Error {
  const message = `${source}: access failed (HTTP ${status})`;
  return status >= 500 || status === 402
    ? new SearchUnavailable(message)
    : new SearchFailure(message);
}
