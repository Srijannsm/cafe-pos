"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { apiFetchJson, getCurrentUser } from "../lib/api";
import { useRequireAuth } from "../lib/useRequireAuth";
import { NavBar } from "../components/NavBar";
import { IconInbox, IconGitMerge, IconX } from "../components/icons";
import { Input } from "../components/ui/Input";
import { TableTile } from "../components/ui/TableTile";
import { Skeleton } from "../components/ui/Skeleton";
import { EmptyState } from "../components/ui/EmptyState";
import { ErrorState } from "../components/ui/ErrorState";
import { Button } from "../components/ui/Button";
import { FilterPills } from "../components/ui/FilterPills";
import { InlineAlert } from "../components/ui/InlineAlert";

type MergedFromTable = { id: number; tableNumber: string };

type Table = {
  id: number;
  tableNumber: string;
  capacity: number;
  status: "free" | "occupied" | "reserved";
  activeOrderId: number | null;
  activeOrderStatus: string | null;
  mergedIntoId: number | null;
  mergedFrom: MergedFromTable[];
};

const FILTERS = ["All", "Free", "Occupied", "Reserved"] as const;
type Filter = (typeof FILTERS)[number];

// Two distinct interaction modes:
// - "physical" : merge 2+ FREE tables into one seating area (pre-order)
// - "transfer" : move items from one OCCUPIED order to another
type FloorMode = "normal" | "physical" | "transfer";

export default function Home() {
  const router = useRouter();
  const ready = useRequireAuth();
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("All");
  const [isAdmin, setIsAdmin] = useState(false);

  // ── Floor interaction mode ──────────────────────────────────────────────
  const [floorMode, setFloorMode] = useState<FloorMode>("normal");

  // Physical merge state
  const [primaryTable, setPrimaryTable] = useState<Table | null>(null);
  const [selectedSecondaries, setSelectedSecondaries] = useState<Table[]>([]);

  // Transfer state
  const [transferSource, setTransferSource] = useState<Table | null>(null);
  const [transferTarget, setTransferTarget] = useState<Table | null>(null);

  const [actionPending, setActionPending] = useState(false);
  // ───────────────────────────────────────────────────────────────────────

  const loadTables = useCallback(() => {
    return apiFetchJson<Table[]>("/tables")
      .then((res) => {
        setTables(res);
        setLoadError(false);
      })
      .catch(() => setLoadError(true));
  }, []);

  useEffect(() => {
    setIsAdmin(getCurrentUser()?.role === "admin");
  }, []);

  useEffect(() => {
    if (!ready) return;
    loadTables().finally(() => setLoading(false));
    const interval = setInterval(loadTables, 5000);
    return () => clearInterval(interval);
  }, [ready, loadTables]);

  function cancelMode() {
    setFloorMode("normal");
    setPrimaryTable(null);
    setSelectedSecondaries([]);
    setTransferSource(null);
    setTransferTarget(null);
  }

  // ── Physical merge (free tables) ─────────────────────────────────────────
  function handlePhysicalMergeTileClick(table: Table) {
    if (table.status !== "free") return;

    if (!primaryTable) {
      setPrimaryTable(table);
      return;
    }

    // Tap primary again → deselect it (reset)
    if (table.id === primaryTable.id) {
      setPrimaryTable(null);
      setSelectedSecondaries([]);
      return;
    }

    // Toggle in/out of secondaries
    const alreadySelected = selectedSecondaries.some((t) => t.id === table.id);
    if (alreadySelected) {
      setSelectedSecondaries((prev) => prev.filter((t) => t.id !== table.id));
    } else {
      setSelectedSecondaries((prev) => [...prev, table]);
    }
  }

  async function confirmPhysicalMerge() {
    if (!primaryTable || selectedSecondaries.length === 0) return;
    setActionPending(true);
    try {
      for (const secondary of selectedSecondaries) {
        await apiFetchJson(`/tables/${primaryTable.id}/merge`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ secondaryTableId: secondary.id }),
        });
      }
      const secondaryNums = selectedSecondaries.map((t) => `Table ${t.tableNumber}`).join(" + ");
      cancelMode();
      await loadTables();
      setMessage(
        `Table ${primaryTable.tableNumber} + ${secondaryNums} merged. Start the order on Table ${primaryTable.tableNumber}.`,
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Merge failed — try again.");
      setActionPending(false);
    }
  }

  async function handleUnmerge(table: Table) {
    setActionPending(true);
    try {
      await apiFetchJson(`/tables/${table.id}/unmerge`, { method: "POST" });
      await loadTables();
      setMessage(
        `Tables split: ${table.mergedFrom.map((t) => `Table ${t.tableNumber}`).join(", ")} are now free.`,
      );
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Unmerge failed — try again.");
    } finally {
      setActionPending(false);
    }
  }

  // ── Order transfer ────────────────────────────────────────────────────────
  // Step 1: tap an occupied table → becomes source
  // Step 2: tap any other table →
  //   free table: move whole order there (move-to-table)
  //   occupied table: merge source items into that order (merge-into)
  function handleTransferTileClick(table: Table) {
    if (!transferSource) {
      if (table.status !== "occupied") return; // must pick an occupied source
      setTransferSource(table);
      return;
    }
    if (table.id === transferSource.id) {
      // Tap source again to deselect
      setTransferSource(null);
      setTransferTarget(null);
      return;
    }
    // Target can be free (move whole order) or occupied (merge items)
    setTransferTarget(table);
  }

  async function confirmTransfer() {
    if (!transferSource?.activeOrderId || !transferTarget) return;
    setActionPending(true);
    try {
      if (transferTarget.status === "free") {
        // Move the whole order to the free table
        const result = await apiFetchJson<{ id: number }>(
          `/orders/${transferSource.activeOrderId}/move-to-table/${transferTarget.id}`,
          { method: "PATCH" },
        );
        cancelMode();
        router.push(`/order/${result.id}`);
      } else if (transferTarget.activeOrderId) {
        // Merge source items into the occupied target order
        await apiFetchJson(
          `/orders/${transferSource.activeOrderId}/merge-into/${transferTarget.activeOrderId}`,
          { method: "PATCH" },
        );
        cancelMode();
        router.push(`/order/${transferTarget.activeOrderId}`);
      }
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Transfer failed — try again.");
      setActionPending(false);
    }
  }

  // ── Main tile click dispatcher ────────────────────────────────────────────
  async function handleTableClick(table: Table) {
    if (floorMode === "physical") { handlePhysicalMergeTileClick(table); return; }
    if (floorMode === "transfer") { handleTransferTileClick(table); return; }

    const user = getCurrentUser();
    if (!user) { router.push("/login"); return; }

    if (table.status === "free") {
      if (user.role !== "waiter" && user.role !== "admin") {
        setMessage("Only waiters can start a new order.");
        return;
      }
      setMessage("");
      try {
        const order = await apiFetchJson<{ id: number }>("/orders", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tableId: table.id, waiterId: user.id, orderType: "dine_in" }),
        });
        router.push(`/order/${order.id}`);
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Failed to create order.");
      }
      return;
    }

    if (!table.activeOrderId) {
      setMessage("No active order found for this table — try refreshing.");
      return;
    }
    if (table.activeOrderStatus === "billed") {
      router.push(`/billing/${table.activeOrderId}`);
    } else {
      router.push(`/order/${table.activeOrderId}`);
    }
  }

  const statusCounts = useMemo(() => {
    return tables.reduce(
      (acc, table) => { acc[table.status] += 1; return acc; },
      { free: 0, occupied: 0, reserved: 0 } as Record<Table["status"], number>,
    );
  }, [tables]);

  // Hide tables absorbed into another (mergedIntoId set)
  const visibleTables = useMemo(() => tables.filter((t) => t.mergedIntoId == null), [tables]);

  const filteredTables = useMemo(() => {
    return visibleTables.filter((table) => {
      if (filter !== "All" && table.status !== filter.toLowerCase()) return false;
      if (search && !table.tableNumber.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [visibleTables, filter, search]);

  const freeCount = visibleTables.filter((t) => t.status === "free").length;
  const occupiedCount = visibleTables.filter((t) => t.status === "occupied").length;

  const isPhysical = floorMode === "physical";
  const isTransfer = floorMode === "transfer";
  const isNormal = floorMode === "normal";

  // Merge confirmation label e.g. "Table 1 + Table 2 + Table 3"
  const mergeConfirmLabel = primaryTable
    ? [`Table ${primaryTable.tableNumber}`, ...selectedSecondaries.map((t) => `Table ${t.tableNumber}`)].join(" + ")
    : "";

  return (
    <main id="main-content" className="min-h-screen pb-28">
      <NavBar />
      <div className="p-4 sm:p-6">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <h1 className="display-md text-ink-primary">Tables</h1>

          {isNormal && (
            <div className="flex flex-wrap gap-2">
              {freeCount >= 2 && (
                <button
                  type="button"
                  onClick={() => setFloorMode("physical")}
                  className="flex items-center gap-2 rounded-xl border border-border-strong bg-surface-raised px-4 py-2 label-md font-semibold text-ink-secondary transition hover:bg-surface-sunken"
                >
                  <IconGitMerge className="h-4 w-4" />
                  Merge tables
                </button>
              )}
              {occupiedCount >= 1 && (
                <button
                  type="button"
                  onClick={() => setFloorMode("transfer")}
                  className="flex items-center gap-2 rounded-xl border border-border-strong bg-surface-raised px-4 py-2 label-md font-semibold text-ink-secondary transition hover:bg-surface-sunken"
                >
                  <IconGitMerge className="h-4 w-4" />
                  Transfer order
                </button>
              )}
            </div>
          )}

          {(isPhysical || isTransfer) && (
            <button
              type="button"
              onClick={cancelMode}
              className="flex items-center gap-2 rounded-xl border border-border-subtle px-4 py-2 label-md font-semibold text-ink-faint transition hover:text-ink-secondary"
            >
              <IconX className="h-4 w-4" />
              Cancel
            </button>
          )}
        </div>

        {/* Mode instruction banner */}
        {(isPhysical || isTransfer) && (
          <div className={`mb-5 rounded-xl border px-4 py-3 flex items-center gap-3 ${
            (isPhysical && !primaryTable) || (isTransfer && !transferSource)
              ? "border-brand/30 bg-brand-tint"
              : "border-status-success/30 bg-status-success-tint"
          }`}>
            <IconGitMerge className={`h-5 w-5 shrink-0 ${
              (isPhysical && !primaryTable) || (isTransfer && !transferSource)
                ? "text-brand"
                : "text-status-success-ink"
            }`} />
            <p className={`body-md font-medium ${
              (isPhysical && !primaryTable) || (isTransfer && !transferSource)
                ? "text-brand-strong"
                : "text-status-success-ink"
            }`}>
              {isPhysical && !primaryTable && "Tap the PRIMARY (main) free table — the one guests will order from"}
              {isPhysical && primaryTable && selectedSecondaries.length === 0 && `Table ${primaryTable.tableNumber} is primary — tap any additional free tables to add them`}
              {isPhysical && primaryTable && selectedSecondaries.length > 0 && `${mergeConfirmLabel} selected — tap more to add, or confirm below`}
              {isTransfer && !transferSource && "Tap the table to move items FROM"}
              {isTransfer && transferSource && !transferTarget && `Table ${transferSource.tableNumber} selected — tap a free table to move there, or an occupied table to merge items`}
            </p>
          </div>
        )}

        {!isPhysical && !isTransfer && (
          <div className="mb-6 flex flex-wrap items-center gap-3">
            <div className="w-full max-w-xs">
              <Input pill placeholder="Search tables…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <FilterPills
              options={FILTERS}
              value={filter}
              onChange={setFilter}
              renderLabel={(f) => {
                const count = f === "All" ? visibleTables.length : statusCounts[f.toLowerCase() as Table["status"]];
                return `${f} (${count})`;
              }}
            />
          </div>
        )}

        {message && (
          <InlineAlert className="mb-4" onDismiss={() => setMessage("")}>
            {message}
          </InlineAlert>
        )}

        {!ready || loading ? (
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} variant="rect" className="h-40 w-full rounded-xl" />
            ))}
          </div>
        ) : loadError ? (
          <ErrorState
            title="Couldn't load tables"
            description="The tables list didn't come through — check your connection and try again."
            onRetry={() => { setLoading(true); loadTables().finally(() => setLoading(false)); }}
          />
        ) : filteredTables.length === 0 ? (
          <EmptyState
            icon={<IconInbox className="h-6 w-6" />}
            title={visibleTables.length === 0 ? "No tables set up yet" : `No ${filter.toLowerCase()} tables`}
            description={
              visibleTables.length === 0
                ? isAdmin
                  ? "Add your first table to start seating guests."
                  : "Ask an admin to set up tables before you can seat guests."
                : "Try a different filter or clear your search."
            }
            action={
              visibleTables.length === 0 ? (
                isAdmin && (
                  <Link href="/admin/tables">
                    <Button variant="secondary">Go to Admin Tables</Button>
                  </Link>
                )
              ) : (
                <Button variant="secondary" onClick={() => { setFilter("All"); setSearch(""); }}>
                  Clear filter
                </Button>
              )
            }
          />
        ) : (
          <div className="grid grid-cols-2 gap-6 sm:grid-cols-3 lg:grid-cols-4">
            {filteredTables.map((table) => {
              const isThisPrimary = primaryTable?.id === table.id;
              const isThisSecondary = selectedSecondaries.some((t) => t.id === table.id);
              const isThisTransferSource = transferSource?.id === table.id;
              const isThisTransferTarget = transferTarget?.id === table.id;

              const isPhysicalDimmed =
                isPhysical && !isThisPrimary && !isThisSecondary && table.status !== "free";

              const isTransferDimmed =
                isTransfer &&
                !isThisTransferSource &&
                !isThisTransferTarget &&
                (() => {
                  // Before source picked: only occupied tables are selectable as source
                  if (!transferSource) return table.status !== "occupied";
                  // After source picked: the source itself is out; free OR occupied tables are valid targets
                  return table.id === transferSource.id;
                })();

              const mergedLabel =
                table.mergedFrom.length > 0
                  ? table.mergedFrom.map((t) => t.tableNumber).join("+")
                  : undefined;

              return (
                <TableTile
                  key={table.id}
                  tableNumber={table.tableNumber}
                  seats={table.capacity}
                  status={table.status}
                  activeOrderStatus={table.activeOrderStatus}
                  onClick={() => handleTableClick(table)}
                  isPhysicalPrimary={isThisPrimary}
                  isPhysicalSelected={isThisSecondary}
                  isPhysicalDimmed={isPhysicalDimmed}
                  isTransferSource={isThisTransferSource}
                  isTransferTarget={isThisTransferTarget}
                  isTransferDimmed={isTransferDimmed}
                  mergedLabel={mergedLabel}
                  onUnmerge={
                    isNormal && table.mergedFrom.length > 0
                      ? () => handleUnmerge(table)
                      : undefined
                  }
                  unmergeLoading={actionPending}
                />
              );
            })}
          </div>
        )}
      </div>

      {/* Physical merge confirmation bar */}
      {isPhysical && primaryTable && selectedSecondaries.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border-strong bg-surface-base px-4 py-4 shadow-xl">
          <div className="mx-auto flex max-w-lg flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="body-md font-semibold text-ink-primary">
                Merge {mergeConfirmLabel}
              </p>
              <p className="body-sm text-ink-secondary mt-0.5">
                {selectedSecondaries.map((t) => `Table ${t.tableNumber}`).join(", ")}{" "}
                {selectedSecondaries.length === 1 ? "will be" : "will each be"} hidden. Start the order on Table {primaryTable.tableNumber}.
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button variant="secondary" onClick={cancelMode} disabled={actionPending}>Cancel</Button>
              <Button variant="primary" onClick={confirmPhysicalMerge} loading={actionPending}>Confirm merge</Button>
            </div>
          </div>
        </div>
      )}

      {/* Physical merge — primary chosen, waiting for secondary */}
      {isPhysical && primaryTable && selectedSecondaries.length === 0 && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border-subtle bg-surface-base px-4 py-3 shadow-lg">
          <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
            <p className="body-sm text-ink-secondary">
              Table {primaryTable.tableNumber} is primary — tap additional free tables to absorb.
            </p>
            <button
              type="button"
              onClick={() => { setPrimaryTable(null); setSelectedSecondaries([]); }}
              className="label-sm text-ink-faint hover:text-ink-secondary shrink-0"
            >
              Change
            </button>
          </div>
        </div>
      )}

      {/* Transfer confirmation bar */}
      {isTransfer && transferSource && transferTarget && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border-strong bg-surface-base px-4 py-4 shadow-xl">
          <div className="mx-auto flex max-w-lg flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="body-md font-semibold text-ink-primary">
                Transfer: Table {transferSource.tableNumber} → Table {transferTarget.tableNumber}{transferTarget.status === "free" ? " (move order)" : " (merge items)"}
              </p>
              <p className="body-sm text-ink-secondary mt-0.5">
                All items (including kitchen orders) move to Table {transferTarget.tableNumber}. Table {transferSource.tableNumber} will be freed.
              </p>
            </div>
            <div className="flex gap-2 shrink-0">
              <Button variant="secondary" onClick={cancelMode} disabled={actionPending}>Cancel</Button>
              <Button variant="primary" onClick={confirmTransfer} loading={actionPending}>Confirm transfer</Button>
            </div>
          </div>
        </div>
      )}

      {/* Transfer — source chosen, waiting for target */}
      {isTransfer && transferSource && !transferTarget && (
        <div className="fixed bottom-0 left-0 right-0 z-40 border-t border-border-subtle bg-surface-base px-4 py-3 shadow-lg">
          <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
            <p className="body-sm text-ink-secondary">
              Table {transferSource.tableNumber} selected as source. Tap the target table.
            </p>
            <button
              type="button"
              onClick={() => { setTransferSource(null); setTransferTarget(null); }}
              className="label-sm text-ink-faint hover:text-ink-secondary shrink-0"
            >
              Change
            </button>
          </div>
        </div>
      )}
    </main>
  );
}
