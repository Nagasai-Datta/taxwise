/** Indian digit grouping: last three digits, then pairs. 1234567 -> 12,34,567 */
export function inr(n: number): string {
  const neg = n < 0;
  const s = Math.round(Math.abs(n)).toString();
  let out = s;
  if (s.length > 3) {
    const last3 = s.slice(-3);
    let rest = s.slice(0, -3);
    const parts: string[] = [];
    while (rest.length > 2) {
      parts.unshift(rest.slice(-2));
      rest = rest.slice(0, -2);
    }
    if (rest.length) parts.unshift(rest);
    out = parts.join(",") + "," + last3;
  }
  return (neg ? "-" : "") + "\u20B9" + out;
}

export function pct(rate: number): string {
  const p = rate * 100;
  return (Math.abs(p % 1) < 1e-9 ? p.toFixed(0) : p.toFixed(2)) + "%";
}

/** Rupee amounts are rounded to whole rupees at every step, as the Act requires. */
export function rupees(n: number): number {
  return Math.round(n);
}
