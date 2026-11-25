"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetchJson } from "../../../lib/api";
import { useToast } from "../../../components/Toast";
import { useCafeSettings } from "../../../lib/CafeSettingsContext";
import { PageHeader } from "../../../components/ui/PageHeader";
import { Button } from "../../../components/ui/Button";
import { Modal } from "../../../components/ui/Modal";
import { Panel, Pill } from "../../../components/ui/Field";
import { StatCard } from "../../../components/ui/StatCard";
import { EmptyState } from "../../../components/ui/EmptyState";
import { Skeleton } from "../../../components/ui/Skeleton";
import { IconWallet, IconBanknote, IconReceipt, IconPrinter } from "../../../components/icons";
import { CashMoveModal, CloseShiftModal, OpenShiftModal, ZReport, type ShiftSummary } from "../../../components/admin/cash";
import { METHOD_LABEL, dateTime, rs } from "../../../lib/format";

export default function CashPage() {
  const { showToast, toastHost } = useToast();
  const { settings } = useCafeSettings();
  const [shift, setShift] = useState<ShiftSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [openModal, setOpenModal] = useState(false);
  const [move, setMove] = useState<null | "pay_in" | "pay_out" | "expense">(null);
  const [closing, setClosing] = useState(false);
  const [report, setReport] = useState<ShiftSummary | null>(null);

  const load = useCallback(async () => {
    try {
      setShift(await apiFetchJson<ShiftSummary | null>("/shifts/current"));
    } catch (e) {
      showToast((e as Error).message, "error");
    } finally {
      setLoading(false);
    }
  }, [showToast]);
  useEffect(() => { load(); }, [load]);

  return (
    <div>
      {toastHost}
      <PageHeader
        title="Today's drawer"
        description="Open the drawer with a float, log cash in/out, and count it at close. The difference is your leak detector."
        actions={shift ? (
          <>
            <Button variant="secondary" onClick={() => setMove("expense")}>Cash in / out</Button>
            <Button onClick={() => setClosing(true)}>Close shift</Button>
          </>
        ) : !loading ? <Button onClick={() => setOpenModal(true)}>Open shift</Button> : null}
      />

      {loading ? (
        <div className="grid gap-4 sm:grid-cols-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32 rounded-2xl" />)}</div>
      ) : !shift ? (
        <Panel>
          <EmptyState icon={<IconWallet className="h-6 w-6" />} title="No shift open" description="Open one at the start of the day. Cash payments taken by cashiers are linked to it automatically." action={<Button onClick={() => setOpenModal(true)}>Open shift</Button>} />
        </Panel>
      ) : (
        <div className="space-y-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard icon={<IconWallet />} label="Expected in drawer" value={rs(shift.expectedCash)} caption={`Opened ${dateTime(shift.openedAt)} by ${shift.openedBy}`} />
            <StatCard icon={<IconBanknote />} label="Cash sales" value={rs(shift.cashSales)} />
            <StatCard icon={<IconReceipt />} label="All sales" value={rs(shift.totalSales)} caption={`${shift.billsPaid} bills paid`} />
            <StatCard icon={<IconWallet />} label="Paid out / expenses" value={rs(shift.payOuts)} caption={Number(shift.payIns) ? `+ ${rs(shift.payIns)} cash in` : undefined} />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Panel>
              <h3 className="mb-4 text-base font-semibold">Sales by payment method</h3>
              {Object.keys(shift.salesByMethod).length === 0 ? <p className="text-sm text-ink-faint">No payments yet this shift.</p> : (
                <div className="space-y-3">
                  {Object.entries(shift.salesByMethod).map(([m, v]) => {
                    const pct = Number(shift.totalSales) ? (Number(v) / Number(shift.totalSales)) * 100 : 0;
                    return (
                      <div key={m}>
                        <div className="mb-1 flex justify-between text-sm"><span className="text-ink-secondary">{METHOD_LABEL[m] ?? m}</span><span className="tabular font-medium">{rs(v)}</span></div>
                        <div className="h-2 rounded-full bg-surface-sunken"><div className="h-2 rounded-full bg-brand" style={{ width: `${pct}%` }} /></div>
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>
            <Panel>
              <h3 className="mb-4 text-base font-semibold">Cash movements</h3>
              {shift.movements.length === 0 ? <p className="text-sm text-ink-faint">Nothing yet.</p> : (
                <ul className="divide-y divide-border-subtle">
                  {shift.movements.map((m) => (
                    <li key={m.id} className="flex items-center justify-between py-2.5 text-sm">
                      <span>
                        <Pill tone={m.type === "pay_in" ? "success" : "warning"}>{m.type === "pay_in" ? "Cash in" : m.type === "expense" ? "Expense" : "Pay out"}</Pill>
                        <span className="ml-2 text-ink-secondary">{m.category ?? ""}{m.note ? ` — ${m.note}` : ""}</span>
                      </span>
                      <span className={`tabular font-medium ${m.type === "pay_in" ? "text-status-success-ink" : "text-ink-primary"}`}>{m.type === "pay_in" ? "+" : "−"}{rs(m.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </div>
      )}

      <OpenShiftModal open={openModal} onClose={() => setOpenModal(false)} onDone={() => { setOpenModal(false); showToast("Shift opened"); load(); }} onError={(m) => showToast(m, "error")} />
      <CashMoveModal open={!!move} initialType={move ?? "expense"} onClose={() => setMove(null)} onDone={(m) => { setMove(null); showToast(m); load(); }} onError={(m) => showToast(m, "error")} />
      <CloseShiftModal open={closing} shift={shift} onClose={() => setClosing(false)} onDone={(s) => { setClosing(false); setReport(s); load(); }} onError={(m) => showToast(m, "error")} />
      <Modal open={!!report} onClose={() => setReport(null)} title="Shift closed" size="sm">
        {report && (
          <>
            <ZReport s={report} cafeName={settings?.name ?? "Cafe"} />
            <div className="mt-4 flex justify-end gap-2 print:hidden">
              <Button variant="secondary" icon={<IconPrinter />} onClick={() => window.print()}>Print</Button>
              <Button onClick={() => setReport(null)}>Done</Button>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
