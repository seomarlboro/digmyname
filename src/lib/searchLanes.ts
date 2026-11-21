/**
 * Which authoritative check may leave with the fast lane instead of waiting
 * for the 250 ms authoritative debounce.
 *
 * The first answer the stopwatch stops on is almost always the headline card
 * (the typed TLD, else .com). Sending that ONE domain immediately saves the
 * whole debounce on the number the user sees. The guard: the pipeline treats a
 * 1–5 character label as a premium suspect on every TLD and escalates it to
 * the paid third signal, so a per-keystroke early check of short prefixes
 * would buy a Fastly call for "a", "ac", "acm", "acme"… — those wait for the
 * debounce like before.
 */
export const PREMIUM_SUSPECT_MAX_SLD = 5;

export function isPremiumSuspectSld(sld: string): boolean {
  return sld.length <= PREMIUM_SUSPECT_MAX_SLD;
}

/** The label before the first dot. */
export function sldOf(domain: string): string {
  const dot = domain.indexOf(".");
  return dot === -1 ? domain : domain.slice(0, dot);
}

/**
 * The domain to check ahead of the debounce, or null when the headline is a
 * premium suspect (short) or there is nothing to check.
 */
export function earlyHeadline(solo: readonly string[]): string | null {
  const headline = solo[0];
  if (!headline) return null;
  return isPremiumSuspectSld(sldOf(headline)) ? null : headline;
}

/**
 * Names per price follow-up request. One request = one bulk call to the
 * registrar, which takes 25 names at most (PORKBUN_BULK_MAX in the pipeline).
 */
export const PRICE_QUOTE_CHUNK = 25;

/**
 * The price follow-up for one group of cards: the names that came back without
 * a price (`waiting`), in the order the cards are on screen, cut into requests
 * of PRICE_QUOTE_CHUNK. An empty result means there is nothing to ask.
 */
export function quoteChunks(onScreen: readonly string[], waiting: ReadonlySet<string>): string[][] {
  const names = onScreen.filter((d) => waiting.has(d));
  const chunks: string[][] = [];
  for (let i = 0; i < names.length; i += PRICE_QUOTE_CHUNK) chunks.push(names.slice(i, i + PRICE_QUOTE_CHUNK));
  return chunks;
}
