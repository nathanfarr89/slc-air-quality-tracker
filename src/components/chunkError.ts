/**
 * A lazy chunk that fails to download (usually because a new deploy replaced the old files)
 * needs a page reload, not a re-render.
 */
export function isChunkLoadError(error: Error): boolean {
  return (
    error.name === 'ChunkLoadError' ||
    /Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module/i.test(
      error.message,
    )
  );
}
