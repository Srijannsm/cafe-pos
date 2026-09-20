"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetchJson } from "../../../lib/api";
import { useToast } from "../../../components/Toast";
import { IconTable, IconEdit, IconCheck, IconX } from "../../../components/icons";
import { SectionCard } from "../_components/SectionCard";
import { Input } from "../../../components/ui/Input";
import { Button } from "../../../components/ui/Button";

type TableRow = {
  id: number;
  tableNumber: string;
  capacity: number;
  status: "free" | "occupied" | "reserved";
};

export default function TablesManagementPage() {
  const { showToast, toastHost } = useToast();

  const [tables, setTables] = useState<TableRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [tableDrafts, setTableDrafts] = useState<Record<number, { tableNumber: string; capacity: string }>>({});
  const [editingTableId, setEditingTableId] = useState<number | null>(null);
  const [tableSearch, setTableSearch] = useState("");

  const [newTableNumber, setNewTableNumber] = useState("");
  const [newTableCapacity, setNewTableCapacity] = useState("");
  const [savingTable, setSavingTable] = useState(false);

  const refreshAll = useCallback(async () => {
    const tablesRes = await apiFetchJson<TableRow[]>("/tables");
    setTables(tablesRes);
    setTableDrafts(
      Object.fromEntries(
        tablesRes.map((table) => [table.id, { tableNumber: table.tableNumber, capacity: String(table.capacity) }]),
      ),
    );
  }, []);

  useEffect(() => {
    refreshAll().finally(() => setLoading(false));
  }, [refreshAll]);

  async function handleAddTable(e: React.FormEvent) {
    e.preventDefault();
    setSavingTable(true);
    try {
      await apiFetchJson("/tables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tableNumber: newTableNumber, capacity: Number(newTableCapacity) }),
      });
      setNewTableNumber("");
      setNewTableCapacity("");
      await refreshAll();
      showToast(`Table "${newTableNumber}" added`);
    } catch {
      showToast("Could not add that table", "error");
    } finally {
      setSavingTable(false);
    }
  }

  async function handleUpdateTable(table: TableRow, data: { tableNumber: string; capacity: number }) {
    try {
      await apiFetchJson(`/tables/${table.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      await refreshAll();
      showToast(`Table "${data.tableNumber}" updated`);
    } catch {
      showToast(`Could not update table "${table.tableNumber}"`, "error");
    }
  }

  const filteredTables = tables.filter((table) => table.tableNumber.toLowerCase().includes(tableSearch.toLowerCase()));

  return (
    <div className="space-y-8">
      {toastHost}
      <div>
        <h1 className="display-md text-ink-primary">Tables</h1>
        <p className="body-md mt-1 text-ink-secondary">Add tables and edit numbers or seating.</p>
      </div>

      <SectionCard icon={<IconTable />} title="Add table" description="Table status follows the order lifecycle and can't be set here.">
        <form onSubmit={handleAddTable} className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="label-sm text-ink-faint">Table number</label>
            <Input className="w-40" value={newTableNumber} onChange={(e) => setNewTableNumber(e.target.value)} required />
          </div>
          <div className="flex flex-col gap-1">
            <label className="label-sm text-ink-faint">Capacity</label>
            <Input
              className="w-28"
              type="number"
              value={newTableCapacity}
              onChange={(e) => setNewTableCapacity(e.target.value)}
              required
            />
          </div>
          <Button type="submit" disabled={savingTable}>
            Add table
          </Button>
        </form>
      </SectionCard>

      <SectionCard icon={<IconTable />} title="Existing tables" description="Search and edit table numbers or seating.">
        <div className="mb-5 sm:max-w-xs">
          <Input pill placeholder="Search tables…" value={tableSearch} onChange={(e) => setTableSearch(e.target.value)} />
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-md bg-surface-sunken" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead>
                <tr className="label-sm border-b border-border-subtle text-ink-secondary">
                  <th className="py-3 pr-4">Table number</th>
                  <th className="py-3 pr-4">Capacity</th>
                  <th className="py-3 pr-0 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredTables.map((table) => {
                  const isEditing = editingTableId === table.id;
                  const draft = tableDrafts[table.id] ?? {
                    tableNumber: table.tableNumber,
                    capacity: String(table.capacity),
                  };
                  return (
                    <tr key={table.id} className="border-b border-border-subtle last:border-0">
                      <td className="py-4 pr-4">
                        {isEditing ? (
                          <Input
                            autoFocus
                            className="w-36"
                            value={draft.tableNumber}
                            onChange={(e) =>
                              setTableDrafts((cur) => ({
                                ...cur,
                                [table.id]: { ...draft, tableNumber: e.target.value },
                              }))
                            }
                          />
                        ) : (
                          <span className="body-md font-medium text-ink-primary">{table.tableNumber}</span>
                        )}
                      </td>
                      <td className="py-4 pr-4">
                        {isEditing ? (
                          <Input
                            type="number"
                            className="w-24"
                            value={draft.capacity}
                            onChange={(e) =>
                              setTableDrafts((cur) => ({
                                ...cur,
                                [table.id]: { ...draft, capacity: e.target.value },
                              }))
                            }
                          />
                        ) : (
                          <span className="body-md text-ink-secondary">{table.capacity}</span>
                        )}
                      </td>
                      <td className="py-4 pr-0 text-right">
                        {isEditing ? (
                          <div className="flex justify-end gap-1.5">
                            <button
                              type="button"
                              aria-label={`Save table ${table.tableNumber}`}
                              onClick={() => {
                                handleUpdateTable(table, {
                                  tableNumber: draft.tableNumber,
                                  capacity: Number(draft.capacity),
                                });
                                setEditingTableId(null);
                              }}
                              className="flex h-9 w-9 items-center justify-center rounded-md text-status-success-ink transition hover:bg-status-success-tint"
                            >
                              <IconCheck className="h-4 w-4" />
                            </button>
                            <button
                              type="button"
                              aria-label="Cancel edit"
                              onClick={() => {
                                setTableDrafts((cur) => ({
                                  ...cur,
                                  [table.id]: { tableNumber: table.tableNumber, capacity: String(table.capacity) },
                                }));
                                setEditingTableId(null);
                              }}
                              className="flex h-9 w-9 items-center justify-center rounded-md text-ink-faint transition hover:bg-surface-sunken"
                            >
                              <IconX className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            aria-label={`Edit table ${table.tableNumber}`}
                            onClick={() => setEditingTableId(table.id)}
                            className="ml-auto flex h-9 w-9 items-center justify-center rounded-md text-ink-secondary transition hover:bg-surface-sunken"
                          >
                            <IconEdit className="h-4 w-4" />
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filteredTables.length === 0 && (
                  <tr>
                    <td colSpan={3} className="body-md py-8 text-center text-ink-faint">
                      {tables.length === 0 ? "No tables yet." : "No tables match your search."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
