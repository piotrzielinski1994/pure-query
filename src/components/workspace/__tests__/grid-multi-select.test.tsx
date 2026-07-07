import { describe, it, expect, vi } from "vitest";
import { useState } from "react";
import { render, screen, within, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { DataGrid } from "@/components/workspace/data-grid";

const noop = () => {};
const alwaysFalse = () => false;

function MultiSelectGrid({
  onDeleteRows,
  onDeleteRow,
  onCopyRows,
}: {
  onDeleteRows?: (indices: number[]) => void;
  onDeleteRow?: (index: number) => void;
  onCopyRows?: (indices: number[], format: "CSV" | "JSON") => void;
}) {
  const columns = ["id", "name"];
  const rows = [
    ["1", "Ada"],
    ["2", "Linus"],
    ["3", "Grace"],
    ["4", "Edsger"],
  ];
  // Mirror the real caller: hold the selection set in React state via the reducer the grid drives.
  const [selected, setSelected] = useState<Set<number>>(new Set([0]));
  const [anchor, setAnchor] = useState<number | null>(0);

  const handleSelectRow = (index: number, mode: string) => {
    if (mode === "toggle") {
      const next = new Set(selected);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      setSelected(next);
      setAnchor(index);
      return;
    }
    if (mode === "range" && anchor !== null) {
      const start = Math.min(anchor, index);
      const end = Math.max(anchor, index);
      const next = new Set<number>();
      for (let i = start; i <= end; i += 1) next.add(i);
      setSelected(next);
      return;
    }
    setSelected(new Set([index]));
    setAnchor(index);
  };

  return (
    <DataGrid
      columns={columns}
      rows={rows}
      selectedRows={selected}
      onSelectRow={handleSelectRow}
      editable
      editValueAt={(rowIndex, column) =>
        rows[rowIndex]?.[columns.indexOf(column)] ?? null
      }
      isDirtyAt={alwaysFalse}
      onCommitEdit={noop}
      onDeleteRow={onDeleteRow}
      onDeleteRows={onDeleteRows}
      onCopyRows={onCopyRows}
      shortcuts={{}}
    />
  );
}

const rowFor = (name: string) =>
  screen.getByText(name).closest("tr") as HTMLElement;

const isSelected = (name: string) =>
  rowFor(name).getAttribute("aria-selected") === "true";

describe("grid multi-select", () => {
  // behavior: Cmd/Ctrl+click adds a second row to the selection.
  it("should add a row to the selection when it is Cmd/Ctrl-clicked", async () => {
    const user = userEvent.setup();
    render(<MultiSelectGrid />);

    await user.click(rowFor("Ada"));
    await user.keyboard("{Meta>}");
    await user.click(rowFor("Grace"));
    await user.keyboard("{/Meta}");

    expect(isSelected("Ada")).toBe(true);
    expect(isSelected("Grace")).toBe(true);
    expect(isSelected("Linus")).toBe(false);
  });

  // behavior: Shift+click selects the inclusive range from the anchor.
  it("should select the contiguous range when a row is Shift-clicked", async () => {
    const user = userEvent.setup();
    render(<MultiSelectGrid />);

    await user.click(rowFor("Ada"));
    await user.keyboard("{Shift>}");
    await user.click(rowFor("Grace"));
    await user.keyboard("{/Shift}");

    expect(isSelected("Ada")).toBe(true);
    expect(isSelected("Linus")).toBe(true);
    expect(isSelected("Grace")).toBe(true);
    expect(isSelected("Edsger")).toBe(false);
  });

  // behavior: a plain click resets the selection to one row.
  it("should reset the selection to a single row on a plain click", async () => {
    const user = userEvent.setup();
    render(<MultiSelectGrid />);

    await user.keyboard("{Meta>}");
    await user.click(rowFor("Ada"));
    await user.click(rowFor("Linus"));
    await user.keyboard("{/Meta}");
    await user.click(rowFor("Grace"));

    expect(isSelected("Grace")).toBe(true);
    expect(isSelected("Ada")).toBe(false);
    expect(isSelected("Linus")).toBe(false);
  });
});

describe("grid bulk delete", () => {
  // behavior: a multi-selection's row menu offers "Delete N rows" and calls onDeleteRows with all.
  it("should call onDeleteRows with every selected index from the row menu", async () => {
    const user = userEvent.setup();
    const onDeleteRows = vi.fn();
    render(<MultiSelectGrid onDeleteRows={onDeleteRows} onDeleteRow={noop} />);

    await user.click(rowFor("Ada"));
    await user.keyboard("{Meta>}");
    await user.click(rowFor("Grace"));
    await user.keyboard("{/Meta}");

    fireEvent.contextMenu(rowFor("Ada"));
    const item =
      screen.queryByRole("menuitem", { name: /delete 2 rows/i }) ??
      screen.getByText(/delete 2 rows/i);
    await user.click(item);

    expect(onDeleteRows).toHaveBeenCalledTimes(1);
    expect([...onDeleteRows.mock.calls[0][0]].sort()).toEqual([0, 2]);
  });

  // behavior: the Delete key deletes the multi-selection when focus is in the grid.
  it("should call onDeleteRows when Delete is pressed with the grid focused", async () => {
    const user = userEvent.setup();
    const onDeleteRows = vi.fn();
    render(<MultiSelectGrid onDeleteRows={onDeleteRows} onDeleteRow={noop} />);

    await user.click(rowFor("Ada"));
    await user.keyboard("{Meta>}");
    await user.click(rowFor("Linus"));
    await user.keyboard("{/Meta}");

    await user.keyboard("{Delete}");

    expect(onDeleteRows).toHaveBeenCalledTimes(1);
    expect([...onDeleteRows.mock.calls[0][0]].sort()).toEqual([0, 1]);
  });

  // behavior: a single-row selection shows the plain "Delete" item, not "Delete N rows".
  it("should show a single Delete item when only one row is selected", async () => {
    const user = userEvent.setup();
    const onDeleteRow = vi.fn();
    render(<MultiSelectGrid onDeleteRows={vi.fn()} onDeleteRow={onDeleteRow} />);

    await user.click(rowFor("Ada"));
    fireEvent.contextMenu(rowFor("Ada"));

    expect(
      within(document.body).queryByText(/delete \d+ rows/i),
    ).toBeNull();
    const item =
      screen.queryByRole("menuitem", { name: /^delete$/i }) ??
      screen.getByText("Delete");
    await user.click(item);
    expect(onDeleteRow).toHaveBeenCalledWith(0);
  });
});

describe("grid copy from context menu", () => {
  // behavior: the row menu offers "Copy CSV"/"Copy JSON" for the selection and calls onCopyRows
  // with every selected index + the format.
  it("should call onCopyRows with the selected indices for Copy CSV", async () => {
    const user = userEvent.setup();
    const onCopyRows = vi.fn();
    render(<MultiSelectGrid onCopyRows={onCopyRows} onDeleteRow={noop} />);

    await user.click(rowFor("Ada"));
    await user.keyboard("{Meta>}");
    await user.click(rowFor("Grace"));
    await user.keyboard("{/Meta}");

    fireEvent.contextMenu(rowFor("Ada"));
    await user.click(
      screen.queryByRole("menuitem", { name: /copy csv/i }) ??
        screen.getByText(/copy csv/i),
    );

    expect(onCopyRows).toHaveBeenCalledTimes(1);
    expect([...onCopyRows.mock.calls[0][0]].sort()).toEqual([0, 2]);
    expect(onCopyRows.mock.calls[0][1]).toBe("CSV");
  });

  // behavior: Copy JSON passes the "JSON" format.
  it("should call onCopyRows with JSON for Copy JSON", async () => {
    const user = userEvent.setup();
    const onCopyRows = vi.fn();
    render(<MultiSelectGrid onCopyRows={onCopyRows} onDeleteRow={noop} />);

    await user.click(rowFor("Ada"));
    fireEvent.contextMenu(rowFor("Ada"));
    await user.click(
      screen.queryByRole("menuitem", { name: /copy json/i }) ??
        screen.getByText(/copy json/i),
    );

    expect(onCopyRows).toHaveBeenCalledWith([0], "JSON");
  });

  // behavior: with no onCopyRows wired, no copy items appear (read-only grid without the prop).
  it("should not show copy items when onCopyRows is absent", async () => {
    const user = userEvent.setup();
    render(<MultiSelectGrid onDeleteRow={noop} />);

    await user.click(rowFor("Ada"));
    fireEvent.contextMenu(rowFor("Ada"));

    expect(within(document.body).queryByText(/copy csv/i)).toBeNull();
    expect(within(document.body).queryByText(/copy json/i)).toBeNull();
  });
});
