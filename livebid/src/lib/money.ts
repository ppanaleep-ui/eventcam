// Money helpers. Everything inside the app is an integer number of satang
// (1/100 THB); strings only ever appear at the UI edge.

export const CURRENCY_SYMBOL = "฿";

/** 125050 → "฿1,250.50" */
export function formatMoney(satang: number, withSymbol = true): string {
  const negative = satang < 0;
  const abs = Math.abs(Math.round(satang));
  const baht = Math.floor(abs / 100);
  const cents = abs % 100;
  const text = `${baht.toLocaleString("en-US")}.${String(cents).padStart(2, "0")}`;
  return `${negative ? "-" : ""}${withSymbol ? CURRENCY_SYMBOL : ""}${text}`;
}

/** "1,250.50" | "1250.5" | 1250.5 → 125050. Throws on garbage. */
export function parseMoney(input: string | number): number {
  const raw = typeof input === "number" ? String(input) : input.trim().replace(/,/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(raw)) {
    throw new Error("Invalid amount");
  }
  const [baht, cents = ""] = raw.split(".");
  return Number(baht) * 100 + Number(cents.padEnd(2, "0"));
}

/** Rounds a percentage fee to whole satang, never above the base amount. */
export function feeOf(amount: number, percent: number): number {
  return Math.min(amount, Math.round((amount * percent) / 100));
}
