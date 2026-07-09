// Back/forward navigation history for FK jumps. A position is a (tableId, filter) pair; the history
// is a linear stack with a cursor, exactly like a browser's. Pure so the reducer is unit-testable
// without a provider.

export type NavEntry = { tableId: string; filter: string };

export type NavState = { entries: NavEntry[]; index: number };

export const EMPTY_NAV: NavState = { entries: [], index: -1 };

function sameEntry(a: NavEntry, b: NavEntry): boolean {
  return a.tableId === b.tableId && a.filter === b.filter;
}

// Records a navigation from `from` to `to`. Drops any forward history (a new jump replaces the redo
// path), seeds the base with `from` when the current position isn't already it (so Back returns to
// the source), then appends `to` and points the cursor at it. Re-jumping to the current position is
// a no-op (never a zero-length redo entry).
export function pushNavigation(
  state: NavState,
  from: NavEntry,
  to: NavEntry,
): NavState {
  const base = state.index >= 0 ? state.entries.slice(0, state.index + 1) : [];
  const current = base[base.length - 1] ?? null;
  if (current && sameEntry(current, to)) {
    return state;
  }
  const withFrom = current && sameEntry(current, from) ? base : [...base, from];
  const entries = [...withFrom, to];
  return { entries, index: entries.length - 1 };
}

export function canGoBack(state: NavState): boolean {
  return state.index > 0;
}

export function canGoForward(state: NavState): boolean {
  return state.index >= 0 && state.index < state.entries.length - 1;
}

export function goBack(state: NavState): NavState {
  return canGoBack(state) ? { ...state, index: state.index - 1 } : state;
}

export function goForward(state: NavState): NavState {
  return canGoForward(state) ? { ...state, index: state.index + 1 } : state;
}

export function currentEntry(state: NavState): NavEntry | null {
  return state.index >= 0 ? (state.entries[state.index] ?? null) : null;
}
