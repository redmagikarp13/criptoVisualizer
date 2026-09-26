// Cotações reconhecidas no Spot da Binance. Mantenha em sincronia com
// src-tauri/src/preferences.rs (QUOTES). A separação usa o sufixo mais longo.
export const QUOTES = [
  'USDT', 'USDC', 'FDUSD', 'TUSD', 'DAI', 'EURI', 'EUR', 'GBP', 'TRY', 'BRL', 'ARS',
  'COP', 'MXN', 'RUB', 'UAH', 'ZAR', 'JPY', 'AUD', 'CAD', 'CHF', 'PLN', 'SEK', 'NOK',
  'AED', 'NGN', 'PEN', 'CZK', 'RON', 'DOP', 'GEL', 'KES', 'RSD', 'BAM', 'MKD', 'ALL',
  'BTC', 'ETH', 'BNB',
] as const;

export function splitSymbol(value: string): { base: string; quote: string } | null {
  if (!/^[A-Z0-9]{5,24}$/.test(value)) return null;
  let best: { base: string; quote: string } | null = null;
  for (const quote of QUOTES) {
    if (value.length <= quote.length + 1 || !value.endsWith(quote)) continue;
    const base = value.slice(0, value.length - quote.length);
    if (base.length >= 2 && (!best || quote.length > best.quote.length)) best = { base, quote };
  }
  return best;
}

export function isB3Symbol(value: string): boolean {
  return /^[A-Z]{4}[0-9]{1,2}[FB]?$/.test(value);
}

export function isCryptoSymbol(value: string): boolean {
  return splitSymbol(value) !== null;
}

export const isValidSymbol = (value: string): boolean => isCryptoSymbol(value) || isB3Symbol(value);

// Rótulo "BTC / USDT"; mantém o texto original se o símbolo não for reconhecido ou for ação B3.
export function pairLabel(symbol: string): string {
  const split = splitSymbol(symbol);
  return split ? `${split.base} / ${split.quote}` : symbol;
}
