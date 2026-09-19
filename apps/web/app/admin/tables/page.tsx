"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetchJson } from "../../../lib/api";
import { useToast } from "../../../components/Toast";
import { IconTable, IconSearch, IconEdit, IconCheck, IconX } from "../../../components/icons";
import { SectionCard } from "../_components/SectionCard";

type TableRow = {
  id: number;
  tableNumber: string;
  capacity: number;
  status: "free" | "occupied" | "reserved";
};

const inputClass =
  "w-full rounded-xl border border-stone-300 px-3 py-2 text-sm text-stone-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-subtle";

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
        <h1 className="text-3xl font-bold text-stone-900">Tables</h1>
        <p className="mt-1 text-sm text-stone-500">Add tables and edit numbers or seating.</p>
      </div>

      <SectionCard icon={<IconTable />} title="Add table" description="Table status follows the order lifecycle and can't be set here.">
        <form onSubmit={handleAddTable} className="flex flex-wrap items-end gap-3">
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-stone-400">Table number</label>
            <input
              className={`${inputClass} w-40`}
              value={newTableNumber}
              onChange={(e) => setNewTableNumber(e.target.value)}
              required
            />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs font-semibold uppercase tracking-wide text-stone-400">Capacity</label>
            <input
              className={`${inputClass} w-28`}
              type="number"
              value={newTableCapacity}
              onChange={(e) => setNewTableCapacity(e.target.value)}
              required
            />
          </div>
          <button type="submit" disabled={savingTable} className="btn btn-primary">
            Add table
          </button>
        </form>
      </SectionCard>

      <SectionCard icon={<IconTable />} title="Existing tables" description="Search and edit table numbers or seating.">
        <div className="relative mb-5 sm:max-w-xs">
          <IconSearch className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
          <input
            className="w-full rounded-xl border border-stone-300 py-2 pl-9 pr-3 text-sm focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-subtle"
            placeholder="Search tables…"
            value={tableSearch}
            onChange={(e) => setTableSearch(e.target.value)}
          />
        </div>

        {loading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-xl bg-stone-200" />
            ))}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-stone-200 text-xs font-bold uppercase tracking-wide text-stone-400">
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
                    <tr key={table.id} className="border-b border-stone-100 last:border-0">
                      <td className="py-4 pr-4">
                        {isEditing ? (
                          <input
                            autoFocus
                            className="w-36 rounded-lg border border-stone-300 px-2.5 py-2 text-sm font-semibold text-stone-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-subtle"
                            value={draft.tableNumber}
                            onChange={(e) =>
                              setTableDrafts((cur) => ({
                                ...cur,
                                [table.id]: { ...draft, tableNumber: e.target.value },
                              }))
                            }
                          />
                        ) : (
                          <span className="font-medium text-stone-900">{table.tableNumber}</span>
                        )}
                      </td>
                      <td className="py-4 pr-4">
                        {isEditing ? (
                          <input
                            type="number"
                            className="w-24 rounded-lg border border-stone-300 px-2.5 py-2 text-sm font-semibold text-stone-900 focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary-subtle"
                            value={draft.capacity}
                            onChange={(e) =>
                              setTableDrafts((cur) => ({
                                ...cur,
                                [table.id]: { ...draft, capacity: e.target.value },
                              }))
                            }
                          />
                        ) : (
                          <span className="text-stone-700">{table.capacity}</span>
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
                              className="flex h-9 w-9 items-center justify-center rounded-lg text-success transition hover:bg-success-subtle"
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
                              className="flex h-9 w-9 items-center justify-center rounded-lg text-stone-400 transition hover:bg-stone-100"
                            >
                              <IconX className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            aria-label={`Edit table ${table.tableNumber}`}
                            onClick={() => setEditingTableId(table.id)}
                            className="ml-auto flex h-9 w-9 items-center justify-center rounded-lg text-stone-500 transition hover:bg-stone-100"
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
                    <td colSpan={3} className="py-8 text-center text-sm text-stone-400">
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
