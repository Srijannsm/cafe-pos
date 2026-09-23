"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetchJson } from "../../../lib/api";
import { useToast } from "../../../components/Toast";
import { QRCodeSVG } from "qrcode.react";
import { IconTable, IconEdit, IconCheck, IconX, IconQrCode } from "../../../components/icons";
import { SectionCard } from "../_components/SectionCard";
import { Input } from "../../../components/ui/Input";
import { Button } from "../../../components/ui/Button";
import { DataTable } from "../../../components/ui/DataTable";
import { PageHeader } from "../../../components/ui/PageHeader";
import { Modal } from "../../../components/ui/Modal";
import { ConfirmDialog } from "../../../components/ui/ConfirmDialog";

type TableRow = {
  id: number;
  tableNumber: string;
  capacity: number;
  status: "free" | "occupied" | "reserved";
  qrToken: string;
};

export default function TablesManagementPage() {
  const { showToast, toastHost } = useToast();

  const [tables, setTables] = useState<TableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const [tableDrafts, setTableDrafts] = useState<Record<number, { tableNumber: string; capacity: string }>>({});
  const [editingTableId, setEditingTableId] = useState<number | null>(null);
  const [tableSearch, setTableSearch] = useState("");

  const [newTableNumber, setNewTableNumber] = useState("");
  const [newTableCapacity, setNewTableCapacity] = useState("");
  const [savingTable, setSavingTable] = useState(false);

  const [qrTable, setQrTable] = useState<TableRow | null>(null);
  const [regeneratingTable, setRegeneratingTable] = useState<TableRow | null>(null);

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
    refreshAll()
      .then(() => setLoadError(false))
      .catch(() => setLoadError(true))
      .finally(() => setLoading(false));
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

  function orderingLink(table: TableRow) {
    if (typeof window === "undefined") return "";
    return `${window.location.origin}/order/table/${table.qrToken}`;
  }

  async function handleCopyLink(table: TableRow) {
    try {
      await navigator.clipboard.writeText(orderingLink(table));
      showToast(`Ordering link for "${table.tableNumber}" copied`);
    } catch {
      showToast("Could not copy the link", "error");
    }
  }

  async function handleRegenerateQr(table: TableRow) {
    try {
      await apiFetchJson(`/tables/${table.id}/regenerate-qr`, { method: "PATCH" });
      await refreshAll();
      showToast(`New ordering link generated for "${table.tableNumber}" -- the old QR code no longer works`);
    } catch {
      showToast(`Could not regenerate the link for "${table.tableNumber}"`, "error");
    }
  }

  function handlePrintQr(table: TableRow) {
    const printWindow = window.open("", "_blank", "width=420,height=520");
    if (!printWindow) return;
    const svg = document.getElementById(`qr-svg-${table.id}`)?.outerHTML ?? "";
    printWindow.document.write(`
      <html>
        <head>
          <title>Table ${table.tableNumber} -- Scan to order</title>
          <style>
            body { font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; gap: 16px; }
            h1 { font-size: 20px; margin: 0; }
            p { font-size: 13px; color: #666; margin: 0; }
          </style>
        </head>
        <body>
          ${svg}
          <h1>Table ${table.tableNumber}</h1>
          <p>Scan to view the menu and order</p>
        </body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
  }

  const filteredTables = tables.filter((table) => table.tableNumber.toLowerCase().includes(tableSearch.toLowerCase()));

  return (
    <div className="space-y-8">
      {toastHost}
      <PageHeader title="Tables" description="Add tables and edit numbers or seating." />

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
          <Button type="submit" loading={savingTable}>
            Add table
          </Button>
        </form>
      </SectionCard>

      <SectionCard icon={<IconTable />} title="Existing tables" description="Search and edit table numbers or seating.">
        <DataTable
          columns={[
            { header: "Table number", skeletonWidth: "w-16" },
            { header: "Capacity", skeletonWidth: "w-8" },
            { header: "Self-order link", skeletonWidth: "w-40" },
            { header: "Actions", headerClassName: "text-right" },
          ]}
          data={filteredTables}
          rowKey={(table) => table.id}
          loading={loading}
          error={loadError}
          onRetry={() => {
            setLoading(true);
            setLoadError(false);
            refreshAll()
              .then(() => setLoadError(false))
              .catch(() => setLoadError(true))
              .finally(() => setLoading(false));
          }}
          search={tableSearch}
          onSearchChange={setTableSearch}
          searchPlaceholder="Search tables…"
          errorState={{
            title: "Couldn't load tables",
            description: "The table data didn't come through — check your connection and try again.",
          }}
          empty={{
            icon: <IconTable />,
            title: tables.length === 0 ? "No tables yet" : "No tables match your search",
            description:
              tables.length === 0
                ? "Add your first table using the form above and it will appear here."
                : "Try a different search term or clear the filter.",
          }}
          renderRow={(table) => {
            const isEditing = editingTableId === table.id;
            const draft = tableDrafts[table.id] ?? {
              tableNumber: table.tableNumber,
              capacity: String(table.capacity),
            };
            return (
              <>
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
                <td className="py-4 pr-4">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setQrTable(table)}
                      className="label-sm inline-flex items-center gap-1.5 text-brand-strong hover:underline"
                    >
                      <IconQrCode className="h-4 w-4 shrink-0" />
                      Show QR
                    </button>
                    <span className="text-ink-faint">·</span>
                    <button
                      type="button"
                      onClick={() => handleCopyLink(table)}
                      className="label-sm text-ink-secondary hover:underline"
                    >
                      Copy link
                    </button>
                    <span className="text-ink-faint">·</span>
                    <button
                      type="button"
                      onClick={() => setRegeneratingTable(table)}
                      className="label-sm text-ink-secondary hover:underline"
                    >
                      Regenerate
                    </button>
                  </div>
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
              </>
            );
          }}
        />
      </SectionCard>

      <ConfirmDialog
        open={regeneratingTable !== null}
        title={`Regenerate link for table ${regeneratingTable?.tableNumber ?? ""}?`}
        description="The current QR code and ordering link will stop working. You'll need to print a new QR code for this table."
        confirmLabel="Regenerate"
        tone="warning"
        onConfirm={() => {
          if (regeneratingTable) handleRegenerateQr(regeneratingTable);
          setRegeneratingTable(null);
        }}
        onCancel={() => setRegeneratingTable(null)}
      />

      <Modal open={qrTable !== null} onClose={() => setQrTable(null)} size="sm" title={qrTable ? `Table ${qrTable.tableNumber}` : ""}>
        {qrTable && (
          <>
            <div className="flex justify-center rounded-md bg-white p-4">
              <QRCodeSVG
                id={`qr-svg-${qrTable.id}`}
                value={orderingLink(qrTable)}
                size={200}
                level="M"
              />
            </div>

            <p className="body-sm mt-4 break-all text-ink-secondary">{orderingLink(qrTable)}</p>

            <div className="mt-4 flex gap-2">
              <Button variant="secondary" className="flex-1" onClick={() => handleCopyLink(qrTable)}>
                Copy link
              </Button>
              <Button className="flex-1" onClick={() => handlePrintQr(qrTable)}>
                Print
              </Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
