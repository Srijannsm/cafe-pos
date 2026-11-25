"use client";

import { useEffect, useRef, useState, use } from "react";
import Link from "next/link";
import { apiFetchJson } from "../../../../lib/api";
import { useRequireAuth } from "../../../../lib/useRequireAuth";
import { Button } from "../../../../components/ui/Button";
import { Skeleton } from "../../../../components/ui/Skeleton";
import { ErrorState } from "../../../../components/ui/ErrorState";
import { IconPrinter, IconChevronLeft, IconCheckCircle } from "../../../../components/icons";
import { METHOD_LABEL, assetUrl } from "../../../../lib/format";

type Order = {
  id: number; status: string; billNumber: number | null; total: string | null; subtotal: string | null; vatAmount: string | null;
  discountAmount: string | null; discountReason: string | null; serviceCharge: string | null; printCount: number; createdAt: string;
  table: { tableNumber: string }; waiter: { name: string } | null;
  orderItems: { id: number; quantity: number; price: string; voidedAt: string | null; menuItem: { name: string }; orderItemModifiers: { modifier: { name: string; priceDelta: string } }[] }[];
  payments: { id: number; method: string; amount: string; paidAt: string }[];
  cafe: {
    name: string; vatEnabled: boolean; vatRate: string; panNumber: string | null; logoUrl: string | null; address: string | null; phone: string | null;
    wifiName: string | null; wifiPassword: string | null; instagram: string | null; receiptFooter: string | null; serviceChargeRate: string; pricesIncludeVat: boolean;
  };
};

const n2 = (v: string | number | null | undefined) => Number(v ?? 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

// Words for the total -- standard on Nepali bills ("Rupees one thousand ... only").
function inWords(amount: number) {
  const a = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen"];
  const b = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
  const two = (n: number) => (n < 20 ? a[n]! : `${b[Math.floor(n / 10)]}${n % 10 ? `-${a[n % 10]}` : ""}`);
  const three = (n: number) => (n >= 100 ? `${a[Math.floor(n / 100)]} hundred${n % 100 ? ` ${two(n % 100)}` : ""}` : two(n));
  let n = Math.floor(amount);
  if (n === 0) return "zero";
  const parts: string[] = [];
  const crore = Math.floor(n / 10000000); n %= 10000000;
  const lakh = Math.floor(n / 100000); n %= 100000;
  const thousand = Math.floor(n / 1000); n %= 1000;
  if (crore) parts.push(`${three(crore)} crore`);
  if (lakh) parts.push(`${two(lakh)} lakh`);
  if (thousand) parts.push(`${two(thousand)} thousand`);
  if (n) parts.push(three(n));
  const paisa = Math.round((amount - Math.floor(amount)) * 100);
  return `${parts.join(" ")}${paisa ? ` and ${two(paisa)} paisa` : ""}`;
}

export default function ReceiptPage({ params }: { params: Promise<{ orderId: string }> }) {
  const { orderId } = use(params);
  const ready = useRequireAuth();
  const [order, setOrder] = useState<Order | null>(null);
  const [err, setErr] = useState(false);
  const [change, setChange] = useState<number | null>(null);
  const autoPrinted = useRef(false);

  useEffect(() => {
    if (!ready) return;
    const q = new URLSearchParams(window.location.search);
    if (q.get("change")) setChange(Number(q.get("change")));
    apiFetchJson<Order>(`/orders/${orderId}`).then((o) => {
      setOrder(o);
      if (q.get("print") === "1" && !autoPrinted.current) {
        autoPrinted.current = true;
        setTimeout(() => print(o), 300);
      }
    }).catch(() => setErr(true));
  }, [ready, orderId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Count every print so reprints are labelled "COPY OF ORIGINAL" -- the
  // first print is the original bill (IRD practice).
  async function print(o = order) {
    if (!o) return;
    try {
      const r = await apiFetchJson<{ printCount: number }>(`/orders/${orderId}/printed`, { method: "PATCH" });
      setOrder({ ...o, printCount: r.printCount });
    } catch {
      // still allow printing
    }
    setTimeout(() => window.print(), 50);
  }

  if (err) return <main className="p-6"><ErrorState title="Couldn't load receipt" /></main>;
  if (!order) return <main className="mx-auto max-w-sm p-6"><Skeleton className="h-[480px] rounded-2xl" /></main>;

  const c = order.cafe;
  const live = order.orderItems.filter((i) => !i.voidedAt);
  const paid = order.status === "paid";
  const copyNo = order.printCount > 1 ? order.printCount - 1 : 0;
  const logo = assetUrl(c.logoUrl);
  const date = new Date(order.payments.at(-1)?.paidAt ?? order.createdAt);

  return (
    <main className="min-h-screen bg-surface-canvas pb-10 print:bg-white print:pb-0">
      <header className="flex h-14 items-center gap-2 border-b border-border-subtle bg-surface-raised px-2 sm:px-4 print:hidden">
        <Link href="/billing" aria-label="Back" className="rounded-full p-2.5 text-ink-secondary hover:bg-surface-sunken"><IconChevronLeft className="h-5 w-5" /></Link>
        <p className="flex-1 font-semibold">Receipt</p>
        <Button size="small" icon={<IconPrinter />} onClick={() => print()}>{order.printCount ? "Reprint" : "Print"}</Button>
      </header>

      {paid && (
        <div className="mx-auto mt-6 flex max-w-sm items-center gap-3 rounded-2xl bg-status-success-tint px-4 py-3 text-status-success-ink print:hidden">
          <IconCheckCircle className="h-6 w-6 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold">Paid — table is free</p>
            {change ? <p className="text-sm">Give change: Rs {n2(change)}</p> : null}
          </div>
          <Link href="/" className="text-sm font-semibold underline">Tables</Link>
        </div>
      )}

      <div className="receipt-print mx-auto mt-6 w-full max-w-[340px] bg-white p-5 font-mono text-[12px] leading-[1.45] text-black shadow-sm print:mt-0 print:max-w-none print:p-0 print:shadow-none">
        {copyNo > 0 && <p className="mb-2 border border-black py-1 text-center text-[11px] font-bold">COPY OF ORIGINAL ({copyNo})</p>}
        <div className="text-center">
          {logo && <img src={logo} alt="" className="mx-auto mb-1.5 h-12 w-12 object-contain grayscale" />}
          <p className="text-[15px] font-bold">{c.name}</p>
          {c.address && <p>{c.address}</p>}
          {c.phone && <p>Tel: {c.phone}</p>}
          {c.panNumber && <p>{c.vatEnabled ? "VAT" : "PAN"} No: {c.panNumber}</p>}
          <p className="mt-1.5 font-bold">{c.vatEnabled ? "TAX INVOICE" : paid ? "INVOICE" : "ESTIMATE"}</p>
        </div>
        <div className="my-2 border-t border-dashed border-black" />
        <div className="flex justify-between"><span>Bill #{order.billNumber ?? "—"}</span><span>Table {order.table.tableNumber}</span></div>
        <div className="flex justify-between"><span>{date.toLocaleDateString("en-GB")} {date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}</span><span>{order.waiter?.name ?? "QR"}</span></div>
        <div className="my-2 border-t border-dashed border-black" />
        {live.map((i) => {
          const unit = Number(i.price) + i.orderItemModifiers.reduce((s, m) => s + Number(m.modifier.priceDelta), 0);
          return (
            <div key={i.id} className="mb-1">
              <div className="flex justify-between gap-2"><span>{i.quantity} x {i.menuItem.name}</span><span>{n2(unit * i.quantity)}</span></div>
              {i.orderItemModifiers.length > 0 && <p className="pl-4 text-[11px]">+ {i.orderItemModifiers.map((m) => m.modifier.name).join(", ")}</p>}
              {i.quantity > 1 && <p className="pl-4 text-[11px]">@ {n2(unit)}</p>}
            </div>
          );
        })}
        <div className="my-2 border-t border-dashed border-black" />
        <div className="flex justify-between"><span>Subtotal</span><span>{n2(order.subtotal)}</span></div>
        {Number(order.discountAmount) > 0 && <div className="flex justify-between"><span>Discount{order.discountReason ? ` (${order.discountReason})` : ""}</span><span>-{n2(order.discountAmount)}</span></div>}
        {Number(order.serviceCharge) > 0 && <div className="flex justify-between"><span>Service charge {Number(c.serviceChargeRate)}%</span><span>{n2(order.serviceCharge)}</span></div>}
        {c.vatEnabled && (
          <>
            {!c.pricesIncludeVat && <div className="flex justify-between"><span>Taxable amount</span><span>{n2(Number(order.subtotal) - Number(order.discountAmount ?? 0) + Number(order.serviceCharge ?? 0))}</span></div>}
            <div className="flex justify-between"><span>VAT {Number(c.vatRate)}%{c.pricesIncludeVat ? " (incl.)" : ""}</span><span>{n2(order.vatAmount)}</span></div>
          </>
        )}
        <div className="mt-1 flex justify-between border-t border-black pt-1 text-[14px] font-bold"><span>TOTAL</span><span>Rs {n2(order.total)}</span></div>
        <p className="mt-0.5 text-[11px] capitalize">Rupees {inWords(Number(order.total ?? 0))} only</p>
        {order.payments.length > 0 && (
          <>
            <div className="my-2 border-t border-dashed border-black" />
            {order.payments.map((p) => <div key={p.id} className="flex justify-between"><span>Paid · {METHOD_LABEL[p.method] ?? p.method}</span><span>{n2(p.amount)}</span></div>)}
            {change ? <div className="flex justify-between"><span>Change</span><span>{n2(change)}</span></div> : null}
          </>
        )}
        <div className="my-2 border-t border-dashed border-black" />
        <div className="text-center text-[11px]">
          <p>{c.receiptFooter || "Thank you — see you again!"}</p>
          {c.wifiName && <p>Wi-Fi: {c.wifiName}{c.wifiPassword ? ` / ${c.wifiPassword}` : ""}</p>}
          {c.instagram && <p>Instagram @{c.instagram}</p>}
        </div>
      </div>
    </main>
  );
}
