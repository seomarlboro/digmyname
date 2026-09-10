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
