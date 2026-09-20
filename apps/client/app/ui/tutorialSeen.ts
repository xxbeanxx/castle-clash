const KEY = "cc:tutorial:seen";

/** Whether this browser has already been shown the tutorial. Storage can be blocked or absent
 *  (private windows, embedded browsers), and the tutorial must never be what breaks: unreadable
 *  means "seen", so a broken store never traps a player in a tutorial on every visit. */
export function tutorialSeen(): boolean {
  try {
    return localStorage.getItem(KEY) !== null;
  } catch {
    return true;
  }
}

export function markTutorialSeen(): void {
  try {
    localStorage.setItem(KEY, "1");
  } catch {
    // Nothing to do: it will just be offered again next visit.
  }
}

/** The tutorial room's URL, carrying where to go afterwards (a same-origin path). */
export function tutorialUrl(next: string): string {
  return `/play/new?mode=tutorial&next=${encodeURIComponent(next)}`;
}
