/**
 * A readable reason for a Mapbox error. Mapbox sends HTTP failures (for example 403 for a URL-restricted token on an
 * unlisted address) with an EMPTY message, so falling back on the status matters: an empty string would be falsy and
 * the alert would silently never show.
 */
export function describeMapError(error: { message?: string; status?: number } | undefined): string {
  const status = error?.status;
  if (status === 401 || status === 403) {
    return 'Mapbox refused to serve the map to this address. The token may be invalid or restricted to other URLs.';
  }
  return error?.message || 'The map background couldn’t be loaded.';
}
