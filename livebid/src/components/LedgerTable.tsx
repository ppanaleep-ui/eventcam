import { formatMoney } from "@/lib/money";

const LABELS: Record<string, string> = {
  TOPUP: "Wallet top-up",
  HOLD: "Reserved for bid",
  HOLD_RELEASE: "Bid released",
  PURCHASE: "Purchase",
  SALE: "Sale",
  FEE: "Platform fee",
  REFUND: "Refund",
  PAYOUT_PENDING: "Sale (in escrow)",
  PAYOUT_RELEASE: "Escrow released",
  WITHDRAW: "Withdrawal",
  WITHDRAW_REFUND: "Withdrawal refunded",
};

const BUCKETS: Record<string, string> = {
  AVAILABLE: "available",
  HELD: "held",
  PENDING: "escrow",
};

export type LedgerRow = {
  id: string;
  kind: string;
  bucket: string;
  amount: number;
  balanceAfter: number;
  note: string | null;
  createdAt: Date;
};

export function LedgerTable({ entries }: { entries: LedgerRow[] }) {
  if (!entries.length) {
    return <p className="p-4 text-sm text-slate-400">No wallet activity yet.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs uppercase tracking-wide text-slate-400">
          <tr>
            <th className="px-4 py-3">When</th>
            <th className="px-4 py-3">Movement</th>
            <th className="px-4 py-3">Bucket</th>
            <th className="px-4 py-3 text-right">Amount</th>
            <th className="px-4 py-3 text-right">Balance</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id} className="border-t border-white/5">
              <td className="whitespace-nowrap px-4 py-3 text-slate-400">
                {entry.createdAt.toLocaleString()}
              </td>
              <td className="px-4 py-3">
                <span className="font-medium">{LABELS[entry.kind] ?? entry.kind}</span>
                {entry.note && <span className="block text-xs text-slate-500">{entry.note}</span>}
              </td>
              <td className="px-4 py-3 text-slate-400">{BUCKETS[entry.bucket] ?? entry.bucket}</td>
              <td
                className={`money px-4 py-3 text-right font-semibold ${
                  entry.amount >= 0 ? "text-neon-400" : "text-hot-400"
                }`}
              >
                {entry.amount >= 0 ? "+" : ""}
                {formatMoney(entry.amount)}
              </td>
              <td className="money px-4 py-3 text-right text-slate-400">
                {formatMoney(entry.balanceAfter)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
