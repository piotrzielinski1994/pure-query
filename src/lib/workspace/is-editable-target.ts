// Whether an event target is a text-editing surface (input/textarea/select or a
// contenteditable element). A global Backspace/Delete shortcut consults this so
// it never hijacks a keystroke meant for typing.
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  if (target.isContentEditable) {
    return true;
  }
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
}
