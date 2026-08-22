/**
 * Money is stored in minor units (cents) with the currency alongside it, so it
 * always has to be divided and labelled together — never formatted with a
 * hardcoded symbol.
 */
export function formatMoney(amountMinor: number, currency: string | null): string {
  const value = amountMinor / 100;
  if (!currency) return value.toFixed(2);

  try {
    return new Intl.NumberFormat(undefined, { style: 'currency', currency }).format(value);
  } catch {
    // Intl throws RangeError on a currency code it doesn't recognise, and
    // currencyAtSale is a free-form String in the schema.
    return `${value.toFixed(2)} ${currency}`;
  }
}
