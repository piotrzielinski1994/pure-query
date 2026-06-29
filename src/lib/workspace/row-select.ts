// How a grid row click adjusts the multi-selection: plain = replace with the one row, toggle
// (Cmd/Ctrl) = flip one row, range (Shift) = inclusive span from the anchor to the clicked index.
export type RowSelectMode = "replace" | "toggle" | "range";

export type RowSelectionState = {
  selected: Set<number>;
  // The row a range extends from; null when nothing has been clicked yet.
  anchor: number | null;
};

export function nextRowSelection(
  state: RowSelectionState,
  index: number,
  mode: RowSelectMode,
): RowSelectionState {
  if (mode === "toggle") {
    const selected = new Set(state.selected);
    if (selected.has(index)) {
      selected.delete(index);
    } else {
      selected.add(index);
    }
    return { selected, anchor: index };
  }
  if (mode === "range" && state.anchor !== null) {
    const start = Math.min(state.anchor, index);
    const end = Math.max(state.anchor, index);
    const selected = new Set<number>();
    for (let i = start; i <= end; i += 1) {
      selected.add(i);
    }
    // The anchor stays put so a follow-up range click re-spans from the same origin.
    return { selected, anchor: state.anchor };
  }
  return { selected: new Set([index]), anchor: index };
}
