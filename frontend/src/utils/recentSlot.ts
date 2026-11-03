const KEY = 'nebulens:has-recent-creations';

/**
 * Whether the home page should hold room for the "continue" row before history arrives. Only
 * people who had something to continue last time get the space, so it never sits empty for
 * new visitors and never makes the skills below jump for returning ones.
 */
export function expectsRecentCreations(): boolean {
  try {
    return localStorage.getItem(KEY) === 'true';
  } catch {
    return false;
  }
}

export function rememberRecentCreations(hasAny: boolean): void {
  try {
    localStorage.setItem(KEY, String(hasAny));
  } catch {
    // Without storage the row just appears when it arrives.
  }
}
