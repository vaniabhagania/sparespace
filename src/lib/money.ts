/** All money is stored and calculated as integer paise (1 rupee = 100 paise). */

export function formatINR(paise: number): string {
  const rupees = paise / 100;
  const whole = Number.isInteger(rupees);
  return (
    "₹" +
    rupees.toLocaleString("en-IN", {
      minimumFractionDigits: whole ? 0 : 2,
      maximumFractionDigits: 2,
    })
  );
}

/** "120", "120.5", "1,200" -> paise. Returns null for anything that is not a plain amount. */
export function rupeesToPaise(input: string): number | null {
  const cleaned = input.trim().replace(/[,\s₹]/g, "");
  if (!/^\d{1,7}(\.\d{1,2})?$/.test(cleaned)) return null;
  return Math.round(parseFloat(cleaned) * 100);
}

export function paiseToRupeesInput(paise: number | null | undefined): string {
  if (paise == null) return "";
  const r = paise / 100;
  return Number.isInteger(r) ? String(r) : r.toFixed(2);
}
