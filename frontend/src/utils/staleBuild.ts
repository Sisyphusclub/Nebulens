const RELOADED_AT_KEY = 'nebulens:stale-build-reload';
/** A second failure within this long of the last reload means reloading is not helping. */
const RELOAD_GUARD_MS = 10_000;

/** A lazily loaded page that no longer exists on the server, as after a new release. */
export function isStaleBuildError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /dynamically imported module|Importing a module script failed|error loading dynamically imported module|ChunkLoadError/i.test(
    message,
  );
}

/** Reloads to pick up the new release, unless the page was just reloaded for the same reason. */
export function reloadForNewBuild(): boolean {
  let last = 0;
  try {
    last = Number(sessionStorage.getItem(RELOADED_AT_KEY) ?? 0);
  } catch {
    // Storage blocked: a reload loop is worse than one failed page, so do not reload.
    return false;
  }
  if (Date.now() - last < RELOAD_GUARD_MS) return false;
  try {
    sessionStorage.setItem(RELOADED_AT_KEY, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}
