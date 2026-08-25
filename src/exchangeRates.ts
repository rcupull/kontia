const rateKey = (baseCurrency: string, currencyCode: string) =>
  `kontia-exchange-rate:${baseCurrency}:${currencyCode}`;

export function rememberedExchangeRate(
  baseCurrency: string,
  currencyCode: string,
) {
  if (currencyCode === baseCurrency) return 1;
  if (typeof window === "undefined") return undefined;
  const rate = Number(
    window.localStorage.getItem(rateKey(baseCurrency, currencyCode)),
  );
  return Number.isFinite(rate) && rate > 0 ? rate : undefined;
}

export function rememberExchangeRate(
  baseCurrency: string,
  currencyCode: string,
  rate: number,
) {
  if (
    typeof window === "undefined" ||
    currencyCode === baseCurrency ||
    !Number.isFinite(rate) ||
    rate <= 0
  )
    return;
  window.localStorage.setItem(
    rateKey(baseCurrency, currencyCode),
    String(rate),
  );
}
