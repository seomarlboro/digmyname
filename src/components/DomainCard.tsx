import { memo } from "react";
import { ExternalLink, Gem, Heart, Loader2, RefreshCw, AlertCircle, Tag, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { PromoCode } from "@/components/PromoCode";
import { CtaLink } from "@/components/CtaLink";
import { Skeleton } from "@/components/ui/skeleton";
import { useDomainAge, formatRegisteredSince } from "@/hooks/useDomainAge";
import { getRegistrarColor, getRegistrarUrl } from "@/lib/registrarColors";

import type { DomainResult } from "@/lib/domainData";
import { deriveCardFacts, type CheapestRegistrar } from "@/lib/cardFacts";
import type { CardActionKind } from "@/lib/cardClickEvent";

interface DomainCardProps {
  result: DomainResult;
  compact?: boolean;
  onRetry?: (domain: string) => void;
  /** Cheapest registrar row for this card's TLD, from the list's single price-table read. */
  cheapest?: CheapestRegistrar;
  favorited: boolean;
  /** The list decides whether to toggle or to ask for sign-in first. */
  onToggleFavorite: (domain: string) => void;
  /** Analytics for outbound links (src/lib/siteEvents.ts). Only observes the click; the link goes where it always went. */
  onAction?: (kind: CardActionKind, domain: string) => void;
}

// ---------------------------------------------------------------------------
// Layout stability (CLS): every state of a card — checking, available,
// uncertain, taken — must occupy the same vertical space so rows never jump
// when a result resolves. These are floors, not fixed heights: genuinely
// taller content (wrapped domain, explanatory copy) can still grow.
//   • COMPACT_ROW_MIN — compact grid row: py-4 (32px) + h-9 action button.
//   • CARD_BODY_MIN   — full card body row on sm+: h-10 CTA + badge line.
// ---------------------------------------------------------------------------
const COMPACT_ROW_MIN = "min-h-[68px]";
const CARD_BODY_MIN = "sm:min-h-[56px]";

/**
 * Compact row grid — a table: every row is its own grid, so every track is fixed
 * or a fraction of the same width, never content-sized.
 *   Desktop, 4 cells in every row variant: name · tags · renewal · [price + actions].
 *   Phone, 4 visible cells: name · price · like · open (the rest is `hidden sm:*`).
 * Price and actions share the last cell, packed against the right edge: the button
 * sits at the row edge and the price one gap before it, in every row.
 */
const COMPACT_GRID =
  "grid-cols-[minmax(0,1fr)_96px_40px_40px] items-center gap-x-1 sm:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_140px_360px] sm:gap-x-4 [&>*:nth-child(4)]:justify-self-end sm:[&>*:nth-child(3)]:justify-self-end";

/** The right-hand cell of a compact row: price (or status) then actions, packed right. */
const COMPACT_END = "flex items-center justify-end gap-4";

/** Prices always carry cents: "$11.40", never "$11.4". */
const usd = (n: number) => `$${n.toFixed(2)}`;

/** Amber that passes AA on white (amber-500 was ~2:1); dark keeps the lighter tone. */
const AMBER_TEXT = "text-amber-700 dark:text-amber-400";

/** Card roots take focus only programmatically (after Retry); the ring shows for keyboard users. */
const FOCUS_RING = "outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Retry moves a card between sections (unverified → checking → its verdict) and each
 * move remounts it, which used to drop keyboard focus on <body>. The domain being
 * retried keeps focus on its card through those remounts until a settled card mounts.
 */
let pendingRetryFocus: string | null = null;



/**
 * One result row. Pure function of its props (memoised): no store subscriptions
 * of its own, so an answer landing on one card does not re-render the other 52.
 */
const DomainCard = ({ result, compact = false, onRetry, cheapest, favorited, onToggleFavorite, onAction }: DomainCardProps) => {
  const { domain, available, checking } = result;
  const isUncertain = result.uncertain === true;
  const isBrand = result.sldBlocked === true;

  // One derivation shared with the filter bar (src/lib/cardFacts.ts): premium
  // flags, the trusted price (never a seed), renewal trap, "Check price" state.
  const {
    isPremium,
    isPremiumUnverified,
    isLikelyPremium,
    trustedPrice,
    renewPrice: displayRenew,
    hasHighRenewal,
    showCheckPrice,
    premiumPrice,
    registrarName,
    promoCode,
    whoisPrivacy,
  } = deriveCardFacts(result, cheapest);
  const buyUrl = registrarName ? getRegistrarUrl(registrarName, domain) : null;
  // When no trusted DB price exists, "Check price" still needs a real
  // registrar search destination — never "#". Spaceship's URL builder works
  // for any TLD, so it's a safe universal fallback.
  const checkPriceUrl = getRegistrarUrl("Spaceship", domain);
  const actionUrl = buyUrl ?? checkPriceUrl;

  // Registration year for taken domains — fetched lazily in the background,
  // so it never delays the availability check.
  const age = useDomainAge(domain, !checking && result.uncertain !== true && !available);
  const sinceLabel = formatRegisteredSince(age);
  /** One taken-state label for cards and compact rows. */
  const registeredText = sinceLabel ? `Registered ${sinceLabel.toLowerCase()}` : "Registered";


  const handleFavorite = () => onToggleFavorite(domain);

  const focusRoot = (el: HTMLElement | null) => {
    if (!el || pendingRetryFocus !== domain) return;
    el.focus({ preventScroll: true });
    if (!checking) pendingRetryFocus = null;
  };
  const retry = () => {
    pendingRetryFocus = domain;
    onRetry?.(domain);
  };

  // The desktop favourite control — the same button the full card uses, shared by the compact rows.
  const desktopHeart = (
    <Button
      variant="ghost"
      size="icon"
      className={`hidden h-9 w-9 rounded-full sm:flex ${favorited ? "text-destructive" : "text-muted-foreground hover:text-primary"}`}
      onClick={handleFavorite}
      aria-label={favorited ? `Remove ${domain} from favorites` : `Save ${domain} to favorites`}
      aria-pressed={favorited}
    >
      <Heart className={`h-4 w-4 ${favorited ? "fill-current" : ""}`} />
    </Button>
  );

  const parts = domain.split(".");
  const name = parts.slice(0, -1).join(".");
  const ext = parts[parts.length - 1] ?? "";

  // One consistent brand marker across every section (available/taken/uncertain).
  // Same amber tone as the uncertain "brand_protected" box so the whole
  // brand class reads as a single class, not three different things.
  const brandChip = (
    <Badge
      variant="outline"
      className="border-amber-500/40 bg-amber-500/10 text-xs font-medium text-amber-600 dark:text-amber-400"
    >
      Trademark
    </Badge>
  );

  if (checking) {
    if (compact) {
      return (
        <div className={`grid ${COMPACT_GRID} border-b border-border px-3 py-3 sm:px-4 sm:py-4 transition-colors ${COMPACT_ROW_MIN} ${FOCUS_RING}`} ref={focusRoot} tabIndex={-1}>
          <div className="flex items-center gap-2">
            <h3 className="min-w-0 truncate text-base font-semibold text-foreground sm:text-lg">
              {name}.<span className="text-mint">{ext}</span>
            </h3>
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          </div>
          {/* Reserved slots: same footprint as the resolved row so nothing reflows. */}
          <span className="hidden sm:block" />
          <Skeleton className="hidden h-4 w-14 min-w-[80px] max-w-[80px] sm:block" />
          <div className={COMPACT_END}>
            <Skeleton className="h-5 w-14" />
            <Skeleton className="hidden h-10 w-24 rounded-full sm:block" />
          </div>
        </div>
      );
    }
    return (
      <div className={`card-hover rounded-xl border border-border p-4 sm:p-5 ${FOCUS_RING}`} ref={focusRoot} tabIndex={-1}>
        <div className={`flex flex-col gap-3 sm:flex-row sm:items-center ${CARD_BODY_MIN}`}>
          {/* Left slot: domain + reserved badge line (matches resolved layout). */}
          <div className="flex-1 min-w-0 pr-8">
            <h3 className="text-xl font-bold text-foreground">
              {name}.<span className="text-mint">{ext}</span>
            </h3>
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
          </div>
          {/* Right slot: reserved price + CTA footprint. */}
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="sm:text-right">
              <Skeleton className="h-8 w-20" />
            </div>
            <Skeleton className="h-10 w-28 rounded-3xl" />
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        </div>
      </div>
    );
  }


  // Uncertain — APIs failed or disagreed. Show retry instead of misleading "Taken".
  if (isUncertain) {
    const brandProtected = result.uncertainReason === "brand_protected";
    // Our own budget expired (or the batch never reached us) — the registry did
    // NOT fail, so don't say it did.
    const stillChecking = result.uncertainReason === "budget_timeout" || result.reachFailed;
    if (compact) {
      return (
        <div className={`grid ${COMPACT_GRID} border-b border-border px-3 py-3 sm:px-4 sm:py-4 transition-colors hover:bg-muted/10 ${COMPACT_ROW_MIN} ${FOCUS_RING}`} ref={focusRoot} tabIndex={-1}>
          <div className="flex items-center gap-2">
            <h3 className="min-w-0 truncate text-base font-semibold text-foreground sm:text-lg">
              {name}.<span className="text-mint">{ext}</span>
            </h3>
            <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
          </div>
          {brandProtected ? (
            <Badge variant="outline" className="hidden w-fit border-amber-500/40 bg-amber-500/10 text-xs font-medium text-amber-600 dark:text-amber-400 sm:inline-flex">
              Trademark
            </Badge>
          ) : (
            <span className="hidden text-xs text-muted-foreground min-w-[80px] sm:inline">{result.reachFailed ? "No connection" : stillChecking ? "Still checking" : "Couldn't verify"}</span>
          )}
          <span className="hidden sm:block" />
          {brandProtected ? (
            <span />
          ) : (
            <Button
              variant="outline"
              onClick={retry}
              disabled={!onRetry}
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Retry
            </Button>
          )}
        </div>
      );
    }
    return (
      <div className={`card-hover rounded-xl border border-amber-500/30 p-4 sm:p-5 ${FOCUS_RING}`} ref={focusRoot} tabIndex={-1}>
        <div className={`flex flex-col gap-3 sm:flex-row sm:items-center ${CARD_BODY_MIN}`}>
          <div className="flex-1 min-w-0">
            <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
              <span>{name}.<span className="text-mint">{ext}</span></span>
              <AlertCircle className="h-4 w-4 text-amber-500" />
            </h3>
            {brandProtected ? (
              <>
                <Badge variant="outline" className="mt-1.5 border-amber-500/40 bg-amber-500/10 text-xs font-medium text-amber-600 dark:text-amber-400">
                  Trademark
                </Badge>
                <p className="text-xs text-muted-foreground mt-1.5">
                  This name matches a protected trademark — registries typically reserve or block it. Unlikely to be registerable.
                </p>
              </>
            ) : (
              <p className="text-xs text-muted-foreground mt-1.5">
                {result.reachFailed
                  ? "Couldn't reach our server — check your connection and retry."
                  : stillChecking
                    ? "Still checking — this one's slow. Retry."
                    : "Couldn't verify availability — sources disagreed. Try again."}
              </p>
            )}
          </div>
          {!brandProtected && (
            <Button
              variant="outline"
              onClick={retry}
              disabled={!onRetry}
            >
              <RefreshCw className="h-4 w-4" />
              Retry
            </Button>
          )}
        </div>
      </div>
    );
  }



  if (compact) {
    return (
      <>
        <div className={`grid ${COMPACT_GRID} border-b border-border px-3 py-3 sm:px-4 sm:py-4 transition-colors hover:bg-muted/10 ${COMPACT_ROW_MIN} ${FOCUS_RING}`} ref={focusRoot} tabIndex={-1}>
          <div className="flex items-center gap-2">
            <h3 className="min-w-0 truncate text-base font-semibold text-foreground sm:text-lg">
              {name}.<span className="text-mint">{ext}</span>
            </h3>
          </div>
          {/* Tags column: starts at the same x in every row, whatever the name length. */}
          <div className="hidden min-w-0 flex-wrap items-center gap-1.5 sm:flex">
            {isBrand && brandChip}
            {available && registrarName && (
              <Badge
                variant="outline"
                className={`shrink-0 text-xs font-medium ${getRegistrarColor(registrarName).text} ${getRegistrarColor(registrarName).bg} ${getRegistrarColor(registrarName).border}`}
              >
                {registrarName}
              </Badge>
            )}
          </div>
          {/* For a premium name this is the registrar-quoted premium renewal (or nothing), never the standard one. */}
          <span className="hidden text-xs text-muted-foreground min-w-[80px] sm:inline">{available && displayRenew != null ? `renews ${usd(displayRenew)}` : ""}</span>
          {available ? (
            <>
              <div className={COMPACT_END}>
                {/* Price (or "Check price"), with the premium mark right before it. */}
                <span className="inline-flex items-center gap-1.5">
                {(isPremium || isLikelyPremium) && (
                  <span className="inline-flex shrink-0" title={isPremium || isPremiumUnverified ? "Premium" : "Likely premium"}>
                    <Gem className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                    <span className="sr-only">{isPremium || isPremiumUnverified ? "Premium" : "Likely premium"}</span>
                  </span>
                )}
                {isPremium && premiumPrice != null ? (
                  <span className="text-lg font-bold text-foreground">{usd(premiumPrice)}</span>
                ) : isPremium || isLikelyPremium || showCheckPrice ? (
                  <span className={`text-sm font-semibold ${AMBER_TEXT}`}>Check price</span>
                ) : (
                  <span className="text-lg font-bold text-foreground">{usd(trustedPrice!)}</span>
                )}
                </span>
                {/* Always "Buy": the price cell already says "Check price", and one label keeps every price at the same x. */}
                <CtaLink href={actionUrl} onClick={() => onAction?.("buy", domain)} ariaLabel={`Buy ${domain} at ${registrarName ?? "Spaceship"}`} className="hidden sm:inline-flex">
                  Buy
                </CtaLink>
                {desktopHeart}
              </div>
              {/* Phone compact row: like + open, nothing else. */}
              <Button
                variant="ghost"
                size="icon"
                className={`h-10 w-10 rounded-full sm:hidden ${favorited ? "text-destructive" : "text-muted-foreground"}`}
                onClick={handleFavorite}
                aria-label={favorited ? `Remove ${domain} from favorites` : `Save ${domain} to favorites`}
                aria-pressed={favorited}
              >
                <Heart className={`h-4 w-4 ${favorited ? "fill-current" : ""}`} />
              </Button>
              <Button variant="ghost" size="icon" className="text-muted-foreground sm:hidden" asChild>
                <a
                  href={actionUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`${showCheckPrice ? "Check price for" : "Buy"} ${domain} at ${registrarName ?? "Spaceship"}`}
                  onClick={() => onAction?.("buy", domain)}
                >
                  <ExternalLink className="h-4 w-4" />
                </a>
              </Button>
            </>
          ) : (
            <div className={COMPACT_END}>
              {result.forSale ? (
                <span className={`hidden text-sm font-semibold items-center gap-1 sm:flex ${AMBER_TEXT}`}>
                  <Tag className="h-3.5 w-3.5" />
                  For sale
                </span>
              ) : (
                <span className="hidden whitespace-nowrap text-xs text-muted-foreground items-center gap-1 sm:flex">
                  <CalendarClock className="h-3 w-3" />
                  {registeredText}
                </span>
              )}
              <div className="flex items-center gap-1">
                {result.forSale && result.listingUrl ? (
                  <CtaLink href={result.listingUrl} onClick={() => onAction?.("aftermarket", domain)} className="hidden sm:inline-flex">
                    {result.forSaleVia ?? "View"}
                  </CtaLink>
                ) : (
                  <CtaLink tone="secondary" href={`https://www.whois.com/whois/${domain}`} onClick={() => onAction?.("whois", domain)} className="hidden sm:inline-flex">
                    Whois
                  </CtaLink>
                )}
                {/* Phones: one open-site arrow, same control as the available row's. Desktop: the single button above. */}
                <Button variant="ghost" size="icon" className="text-muted-foreground sm:hidden" asChild aria-label={`Open ${domain}`}>
                  <a href={`https://${domain}`} target="_blank" rel="noopener noreferrer" onClick={() => onAction?.("visit", domain)}>
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              </div>
              {desktopHeart}
            </div>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <div className={`card-hover relative rounded-xl border border-border p-4 sm:p-5 ${FOCUS_RING}`} ref={focusRoot} tabIndex={-1}>
        <Button
          variant="ghost"
          size="icon"
          className={`absolute right-1 top-1 h-11 w-11 rounded-full sm:hidden ${favorited ? "text-destructive" : "text-muted-foreground hover:text-primary"}`}
          onClick={handleFavorite}
          aria-label={favorited ? `Remove ${domain} from favorites` : `Save ${domain} to favorites`}
          aria-pressed={favorited}
        >
          <Heart className={`h-4 w-4 ${favorited ? "fill-current" : ""}`} />
        </Button>

        {/* Mobile: stacked, Desktop: single row */}
        <div className={`flex flex-col gap-3 sm:flex-row sm:items-center ${CARD_BODY_MIN}`}>
          {/* Left: domain + badges */}
          <div className="flex-1 min-w-0 pr-8">
            <h3 className="text-xl font-bold text-foreground">
              {name}.<span className="text-mint">{ext}</span>
            </h3>
            <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
              {isBrand && brandChip}
              {available && registrarName && (() => {
                const rc = getRegistrarColor(registrarName);
                return (
                  <Badge variant="outline" className={`text-xs font-medium ${rc.text} ${rc.bg} ${rc.border}`}>
                    {registrarName}
                  </Badge>
                );
              })()}
              {/* Real attributes of the cheapest registrar's offer — from the price table, never a static seed. */}
              {available && whoisPrivacy && (
                <Badge variant="secondary" className="text-xs font-normal">
                  WHOIS privacy
                </Badge>
              )}
              {available && promoCode && <PromoCode code={promoCode} title="Promo code at the cheapest registrar — click to copy" />}
              {/* Only for extensions with tracked prices; a plain link, so the card needs no router. */}
              {available && cheapest && (
                <a href={`/tld/${ext}`} className="text-xs text-muted-foreground underline-offset-2 transition-colors hover:text-foreground hover:underline">
                  All .{ext} prices
                </a>
              )}
            </div>
          </div>

          {/* Right: price + actions */}
          <div className="flex items-center gap-3 sm:gap-4">
            {available ? (
              // Desktop: renewal then price in one fixed-width cell packed against the button — every button lines up,
              // the price never runs under it, and the renewal sits one gap before the price. Phones keep renewal under the price.
              <div className="flex items-center justify-end gap-4 sm:w-[340px]">
              <p className={`hidden whitespace-nowrap text-right text-xs sm:block sm:w-[140px] ${hasHighRenewal ? AMBER_TEXT : "text-muted-foreground"}`}>
                {displayRenew != null ? `renews ${usd(displayRenew)}/yr` : ""}
              </p>
              <div className="sm:flex sm:w-[180px] sm:flex-col sm:items-end sm:whitespace-nowrap">
                {isPremium ? (
                  <>
                    {premiumPrice != null ? (
                      <>
                        {/* One line: premium mark right before the price, as in compact rows. */}
                        <p className="flex items-center gap-1.5 text-2xl font-bold text-foreground" title="Registrar-confirmed premium price">
                          <Gem className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                          <span>
                            <span className="sr-only">Premium </span>
                            {usd(premiumPrice)}
                            <span className="text-sm font-normal text-muted-foreground">/year</span>
                          </span>
                        </p>
                        {displayRenew != null && (
                          <p className={`text-xs mt-0.5 sm:hidden ${hasHighRenewal ? AMBER_TEXT : "text-muted-foreground"}`}>
                            renews {usd(displayRenew)}/yr
                          </p>
                        )}
                      </>
                    ) : (
                      <>
                        {/* The standard registrar's renewal does not apply to a premium name. */}
                        <p className="flex items-center gap-1.5 text-2xl font-bold text-foreground">
                          <Gem className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" aria-hidden="true" />
                          Premium
                        </p>
                      </>
                    )}
                  </>
                ) : isLikelyPremium || showCheckPrice ? (
                  <>
                    <p className={`text-base font-semibold whitespace-nowrap ${AMBER_TEXT}`}>
                      {isPremiumUnverified ? "Premium" : isLikelyPremium ? "Likely premium" : "Check price"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {isPremiumUnverified ? "price at checkout" : "Verify on registrar"}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-2xl font-bold text-foreground">
                      {usd(trustedPrice!)}
                      <span className="text-sm font-normal text-muted-foreground">/year</span>
                    </p>
                    {/* Renewal always sits under the first-year price; a renewal trap is highlighted, not hidden-until-bad. */}
                    {displayRenew != null && (
                      <p className={`text-xs mt-0.5 sm:hidden ${hasHighRenewal ? AMBER_TEXT : "text-muted-foreground"}`}>
                        renews {usd(displayRenew)}/yr
                      </p>
                    )}
                  </>
                )}
              </div>
              </div>
            ) : result.forSale ? (
              <div className="sm:text-right">
                <p className={`text-xl font-bold flex items-center gap-1.5 sm:justify-end ${AMBER_TEXT}`}>
                  <Tag className="h-4 w-4" />
                  For sale
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Listed on {result.forSaleVia ?? "marketplace"}
                </p>
              </div>
            ) : (
              // A taken card said only "Since 1997" (or nothing): the word "Taken" lived in the section heading, off-screen once you scroll.
              <div className="sm:text-right">
                <p className="text-sm text-muted-foreground flex items-center gap-1.5 sm:justify-end">
                  <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
                  {registeredText}
                </p>
              </div>
            )}

            {available ? (
              // One label and width everywhere; the registrar is the badge on the left and in the accessible name.
              <CtaLink href={actionUrl} onClick={() => onAction?.("buy", domain)} ariaLabel={`Buy ${domain} at ${registrarName ?? "Spaceship"}`}>
                Buy
              </CtaLink>
            ) : result.forSale && result.listingUrl ? (
              <div className="flex items-center gap-2">
                <CtaLink href={result.listingUrl} onClick={() => onAction?.("aftermarket", domain)}>
                  View listing
                </CtaLink>
                <Button variant="outline" size="icon" asChild aria-label={`Open ${domain}`}>
                  <a href={`https://${domain}`} target="_blank" rel="noopener noreferrer" onClick={() => onAction?.("visit", domain)}>
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <CtaLink tone="secondary" href={`https://www.whois.com/whois/${domain}`} onClick={() => onAction?.("whois", domain)}>
                  Whois
                </CtaLink>
                <Button variant="outline" size="icon" asChild aria-label={`Open ${domain}`}>
                  <a href={`https://${domain}`} target="_blank" rel="noopener noreferrer" onClick={() => onAction?.("visit", domain)}>
                    <ExternalLink className="h-4 w-4" />
                  </a>
                </Button>
              </div>
            )}
            <Button
              variant="ghost"
              size="icon"
              className={`hidden h-9 w-9 rounded-full sm:flex ${favorited ? "text-destructive" : "text-muted-foreground hover:text-primary"}`}
              onClick={handleFavorite}
              aria-label={favorited ? `Remove ${domain} from favorites` : `Save ${domain} to favorites`}
              aria-pressed={favorited}
            >
              <Heart className={`h-4 w-4 ${favorited ? "fill-current" : ""}`} />
            </Button>
          </div>
        </div>
      </div>
    </>
  );
};

export default memo(DomainCard);
