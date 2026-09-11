import { memo } from "react";
import { ExternalLink, Heart, Loader2, ArrowUpRight, RefreshCw, AlertCircle, Tag, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useDomainAge, formatRegisteredSince } from "@/hooks/useDomainAge";
import { getRegistrarColor, getRegistrarUrl } from "@/lib/registrarColors";

import type { DomainResult } from "@/lib/domainData";
import { deriveCardFacts, type CheapestRegistrar } from "@/lib/cardFacts";

interface DomainCardProps {
  result: DomainResult;
  compact?: boolean;
  onRetry?: (domain: string) => void;
  /** Cheapest registrar row for this card's TLD, from the list's single price-table read. */
  cheapest?: CheapestRegistrar;
  favorited: boolean;
  /** The list decides whether to toggle or to ask for sign-in first. */
  onToggleFavorite: (domain: string) => void;
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
 * One result row. Pure function of its props (memoised): no store subscriptions
 * of its own, so an answer landing on one card does not re-render the other 52.
 */
const DomainCard = ({ result, compact = false, onRetry, cheapest, favorited, onToggleFavorite }: DomainCardProps) => {
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


  const handleFavorite = () => onToggleFavorite(domain);

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
        <div className={`grid border-b border-border px-4 py-4 transition-colors ${COMPACT_ROW_MIN}`} style={{ gridTemplateColumns: '2fr 1fr 1fr auto auto', alignItems: 'center', gap: '0 1.5rem' }}>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-foreground">
              {name}.<span className="text-mint">{ext}</span>
            </h3>
            <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
          </div>
          {/* Reserved slots: same footprint as the resolved row so nothing reflows. */}
          <Skeleton className="h-4 w-16 min-w-[80px] max-w-[80px]" />
          <Skeleton className="h-4 w-14 min-w-[80px] max-w-[80px]" />
          <Skeleton className="h-5 w-14" />
          <Skeleton className="h-9 w-20 rounded-3xl" />
        </div>
      );
    }
    return (
      <div className="card-hover rounded-xl border border-border p-4 sm:p-5">
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
        <div className={`grid border-b border-border px-4 py-4 transition-colors hover:bg-muted/10 ${COMPACT_ROW_MIN}`} style={{ gridTemplateColumns: '2fr 1fr 1fr auto auto', alignItems: 'center', gap: '0 1.5rem' }}>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-foreground">
              {name}.<span className="text-mint">{ext}</span>
            </h3>
            <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
          </div>
          {brandProtected ? (
            <Badge variant="outline" className="w-fit border-amber-500/40 bg-amber-500/10 text-xs font-medium text-amber-600 dark:text-amber-400">
              Trademark
            </Badge>
          ) : (
            <span className="text-xs text-muted-foreground min-w-[80px]">{stillChecking ? "Still checking" : "Couldn't verify"}</span>
          )}
          <span className="min-w-[80px]" />
          <span />
          {brandProtected ? (
            <span />
          ) : (
            <Button
              variant="ghost"
              size="sm"
              className="h-9 gap-1.5 rounded-3xl text-sm text-muted-foreground hover:text-foreground"
              onClick={() => onRetry?.(domain)}
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
      <div className="card-hover rounded-xl border border-amber-500/30 p-4 sm:p-5">
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
                {stillChecking
                  ? "Still checking — this one's slow. Retry."
                  : "Couldn't verify availability — sources disagreed. Try again."}
              </p>
            )}
          </div>
          {!brandProtected && (
            <Button
              variant="outline"
              className="gap-1.5 rounded-3xl border-amber-500/40 text-amber-600 hover:text-amber-600 dark:text-amber-400"
              onClick={() => onRetry?.(domain)}
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
        <div className={`grid border-b border-border px-4 py-4 transition-colors hover:bg-muted/10 ${COMPACT_ROW_MIN}`} style={{ gridTemplateColumns: '2fr 1fr 1fr auto auto', alignItems: 'center', gap: '0 1.5rem' }}>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-foreground">
              {name}.<span className="text-mint">{ext}</span>
            </h3>
            {isBrand && brandChip}
          </div>
          {available && registrarName ? (
            <span className={`text-xs font-medium min-w-[80px] ${getRegistrarColor(registrarName).text}`}>{registrarName}</span>
          ) : (
            <span className="min-w-[80px]" />
          )}
          <span className="text-xs text-muted-foreground min-w-[80px]">{available ? (displayRenew != null ? `renews $${displayRenew}` : '') : ''}</span>
          {available ? (
            <>
              <div className="flex items-center gap-2">
                {isPremium ? (
                  <span className="text-lg font-bold text-foreground">
                    {premiumPrice != null ? `$${premiumPrice}` : "Premium"}
                    {premiumPrice != null && <span className="ml-1.5 text-xs font-semibold text-amber-500">Premium</span>}
                  </span>
                ) : isLikelyPremium || showCheckPrice ? (
                  <span className="text-sm font-semibold text-amber-500">
                    {isPremiumUnverified ? "Premium" : isLikelyPremium ? "Likely premium" : "Check price"}
                  </span>
                ) : (
                  <span className="text-lg font-bold text-foreground">${trustedPrice}</span>
                )}
              </div>
              <Button size="sm" className="h-9 gap-1.5 rounded-3xl btn-gradient text-sm border-0 px-4" asChild>
                <a href={actionUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-3.5 w-3.5" />
                  {showCheckPrice ? "Check price" : "Buy"}
                </a>
              </Button>
            </>
          ) : (
            <>
              {result.forSale ? (
                <span className="text-sm font-semibold text-amber-500 flex items-center gap-1">
                  <Tag className="h-3.5 w-3.5" />
                  For sale
                </span>
              ) : sinceLabel ? (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <CalendarClock className="h-3 w-3" />
                  {sinceLabel}
                </span>
              ) : (
                <span />
              )}
              <div className="flex items-center gap-1">
                {result.forSale && result.listingUrl ? (
                  <Button size="sm" className="h-9 gap-1.5 rounded-3xl btn-gradient text-sm border-0 px-4" asChild>
                    <a href={result.listingUrl} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-3.5 w-3.5" />
                      {result.forSaleVia ?? "View"}
                    </a>
                  </Button>
                ) : (
                  <Button variant="ghost" size="sm" className="h-9 gap-1.5 rounded-3xl text-sm text-muted-foreground hover:text-foreground" asChild>
                    <a href={`https://www.whois.com/whois/${domain}`} target="_blank" rel="noopener noreferrer">
                      <ExternalLink className="h-3.5 w-3.5" />
                      Whois
                    </a>
                  </Button>
                )}
                <Button variant="ghost" size="icon" className="h-9 w-9 rounded-3xl text-muted-foreground hover:text-primary" asChild aria-label={`Open ${domain}`}>
                  <a href={`https://${domain}`} target="_blank" rel="noopener noreferrer">
                    <ArrowUpRight className="h-4 w-4" />
                  </a>
                </Button>
              </div>
            </>
          )}
        </div>
      </>
    );
  }

  return (
    <>
      <div className="card-hover relative rounded-xl border border-border p-4 sm:p-5">
        <Button
          variant="ghost"
          size="icon"
          className={`absolute right-2 top-2 h-9 w-9 rounded-full sm:hidden ${favorited ? "text-destructive" : "text-muted-foreground hover:text-primary"}`}
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
              {available && promoCode && (
                <Badge variant="secondary" className="font-mono text-xs font-normal" title="Promo code at the cheapest registrar">
                  {promoCode}
                </Badge>
              )}
            </div>
          </div>

          {/* Right: price + actions */}
          <div className="flex items-center gap-3 sm:gap-4">
            {available ? (
              <div className="sm:text-right">
                {isPremium ? (
                  <>
                    {premiumPrice != null ? (
                      <>
                        <p className="text-2xl font-bold text-foreground">
                          ${premiumPrice}
                          <span className="text-sm font-normal text-muted-foreground">/year</span>
                        </p>
                        <p className="text-xs text-amber-500 mt-0.5">Premium · registrar-confirmed price</p>
                      </>
                    ) : (
                      <>
                        <p className="text-2xl font-bold text-foreground">Premium</p>
                        {displayRenew != null && (
                          <p className="text-xs text-muted-foreground mt-0.5">
                            renews ${displayRenew}/yr
                          </p>
                        )}
                      </>
                    )}
                  </>
                ) : isLikelyPremium || showCheckPrice ? (
                  <>
                    <p className="text-base font-semibold whitespace-nowrap text-amber-500">
                      {isPremiumUnverified ? "Premium" : isLikelyPremium ? "Likely premium" : "Check price"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {isPremiumUnverified ? "price confirmed at checkout" : "Verify on registrar"}
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-2xl font-bold text-foreground">
                      ${trustedPrice}
                      <span className="text-sm font-normal text-muted-foreground">/year</span>
                    </p>
                    {hasHighRenewal && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        renews ${displayRenew}/yr
                      </p>
                    )}
                  </>
                )}
              </div>
            ) : result.forSale ? (
              <div className="sm:text-right">
                <p className="text-xl font-bold text-amber-500 flex items-center gap-1.5 sm:justify-end">
                  <Tag className="h-4 w-4" />
                  For sale
                </p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Listed on {result.forSaleVia ?? "marketplace"}
                </p>
              </div>
            ) : sinceLabel ? (
              <div className="sm:text-right">
                <p className="text-sm text-muted-foreground flex items-center gap-1.5 sm:justify-end">
                  <CalendarClock className="h-3.5 w-3.5 text-muted-foreground" />
                  {sinceLabel}
                </p>
              </div>
            ) : null}

            {available ? (
              <Button className="gap-1.5 rounded-3xl btn-gradient border-0" asChild>
                <a href={actionUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="h-4 w-4" />
                  {showCheckPrice ? "Check price" : "Buy Now"}
                </a>
              </Button>
            ) : result.forSale && result.listingUrl ? (
              <div className="flex items-center gap-2">
                <Button className="gap-1.5 rounded-3xl btn-gradient border-0" asChild>
                  <a href={result.listingUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" />
                    View listing
                  </a>
                </Button>
                <Button variant="outline" size="icon" className="rounded-3xl" asChild aria-label={`Open ${domain}`}>
                  <a href={`https://${domain}`} target="_blank" rel="noopener noreferrer">
                    <ArrowUpRight className="h-4 w-4" />
                  </a>
                </Button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <Button variant="outline" className="gap-1.5 rounded-3xl" asChild>
                  <a href={`https://www.whois.com/whois/${domain}`} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="h-4 w-4" />
                    Whois
                  </a>
                </Button>
                <Button variant="outline" size="icon" className="rounded-3xl" asChild aria-label={`Open ${domain}`}>
                  <a href={`https://${domain}`} target="_blank" rel="noopener noreferrer">
                    <ArrowUpRight className="h-4 w-4" />
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
