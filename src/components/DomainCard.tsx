import { useState } from "react";
import { ExternalLink, Heart, Loader2, ArrowUpRight, RefreshCw, AlertCircle, Tag, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { useFavorites } from "@/hooks/useFavorites";
import { useCheapestRegistrars } from "@/hooks/useCheapestRegistrars";
import { useDomainAge, formatRegisteredSince } from "@/hooks/useDomainAge";
import AuthDialog from "@/components/LazyAuthDialog";
import { getRegistrarColor, getRegistrarUrl } from "@/lib/registrarColors";

import { resolveDisplayPrice, type DomainResult } from "@/lib/domainData";

interface DomainCardProps {
  result: DomainResult;
  compact?: boolean;
  onRetry?: (domain: string) => void;
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



const DomainCard = ({ result, compact = false, onRetry }: DomainCardProps) => {
  const { domain, tld, available, checking } = result;
  const isUncertain = result.uncertain === true;
  const isBrand = result.sldBlocked === true;
  const { user } = useAuth();
  const { isFavorite, toggleFavorite } = useFavorites();
  const cheapestByTld = useCheapestRegistrars();
  const [authOpen, setAuthOpen] = useState(false);

  const ext = domain.split(".").pop() ?? "";
  const cheapest = cheapestByTld.get(ext);
  const isPremium = result.premium === true;
  const isPremiumUnverified = result.premiumUnverified === true;
  const isLikelyPremium = !isPremium && (result.likelyPremium === true || isPremiumUnverified);
  // Never fabricate a price: if no trusted DB row exists, fall through to the
  // price-less "Check price" state instead of the static seed price.
  const trustedPrice = resolveDisplayPrice(cheapest?.regPrice);
  const hasTrustedPrice = trustedPrice != null;
  const displayRenew = hasTrustedPrice ? (cheapest?.renewPrice ?? null) : null;
  const hasHighRenewal =
    !isPremium && !isLikelyPremium && hasTrustedPrice && displayRenew != null && displayRenew > trustedPrice * 1.8;
  const showCheckPrice = available && (isPremiumUnverified || !hasTrustedPrice) && !isPremium;
  const registrarName = hasTrustedPrice ? (cheapest?.registrar ?? null) : null;
  const buyUrl = registrarName ? getRegistrarUrl(registrarName, domain) : null;
  const favorited = isFavorite(domain);

  // Registration year for taken domains — fetched lazily in the background,
  // so it never delays the availability check.
  const age = useDomainAge(domain, !checking && result.uncertain !== true && !available);
  const sinceLabel = formatRegisteredSince(age);


  const handleFavorite = () => {
    if (!user) {
      setAuthOpen(true);
      return;
    }
    toggleFavorite(domain);
  };

  const parts = domain.split(".");
  const name = parts.slice(0, -1).join(".");

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
              {name}.<span className="text-primary">{ext}</span>
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
              {name}.<span className="text-primary">{ext}</span>
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
            <Loader2 className="hidden h-5 w-5 animate-spin text-muted-foreground sm:block" />
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground sm:hidden" />
          </div>
        </div>
      </div>
    );
  }


  // Uncertain — APIs failed or disagreed. Show retry instead of misleading "Taken".
  if (isUncertain) {
    const brandProtected = result.uncertainReason === "brand_protected";
    if (compact) {
      return (
        <div className="grid border-b border-border px-4 py-4 transition-colors hover:bg-muted/10" style={{ gridTemplateColumns: '2fr 1fr 1fr auto auto', alignItems: 'center', gap: '0 1.5rem' }}>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-foreground">
              {name}.<span className="text-primary">{ext}</span>
            </h3>
            <AlertCircle className="h-3.5 w-3.5 text-amber-500" />
          </div>
          {brandProtected ? (
            <Badge variant="outline" className="w-fit border-amber-500/40 bg-amber-500/10 text-xs font-medium text-amber-600 dark:text-amber-400">
              Trademark
            </Badge>
          ) : (
            <span className="text-xs text-muted-foreground min-w-[80px]">Couldn't verify</span>
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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex-1 min-w-0">
            <h3 className="text-xl font-bold text-foreground flex items-center gap-2">
              <span>{name}.<span className="text-primary">{ext}</span></span>
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
                  ? "Couldn't reach the registry — try again."
                  : "Couldn't verify availability — registry didn't respond. Try again."}
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
        <div className="grid border-b border-border px-4 py-4 transition-colors hover:bg-muted/10" style={{ gridTemplateColumns: '2fr 1fr 1fr auto auto', alignItems: 'center', gap: '0 1.5rem' }}>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-foreground">
              {name}.<span className="text-primary">{ext}</span>
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
                  <span className="text-lg font-bold text-foreground">Premium</span>
                ) : isLikelyPremium || showCheckPrice ? (
                  <span className="text-sm font-semibold text-amber-500">
                    {isPremiumUnverified ? "Premium" : isLikelyPremium ? "Likely premium" : "Check price"}
                  </span>
                ) : (
                  <span className="text-lg font-bold text-foreground">${trustedPrice}</span>
                )}
              </div>
              <Button size="sm" className="h-9 gap-1.5 rounded-3xl btn-gradient text-sm border-0 px-4" asChild>
                <a href={buyUrl ?? "#"} target="_blank" rel="noopener noreferrer">
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
        <AuthDialog open={authOpen} onOpenChange={setAuthOpen} />
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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {/* Left: domain + badges */}
          <div className="flex-1 min-w-0 pr-8">
            <h3 className="text-xl font-bold text-foreground">
              {name}.<span className="text-primary">{ext}</span>
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
              {available && tld.features.map((f) => (
                <Badge key={f} variant="secondary" className="text-xs font-normal">
                  {f}
                </Badge>
              ))}
            </div>
          </div>

          {/* Right: price + actions */}
          <div className="flex items-center gap-3 sm:gap-4">
            {available ? (
              <div className="sm:text-right">
                {isPremium ? (
                  <>
                    <p className="text-2xl font-bold text-foreground">Premium</p>
                    {displayRenew != null && (
                      <p className="text-xs text-muted-foreground mt-0.5">
                        renews ${displayRenew}/yr
                      </p>
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
                <a href={buyUrl ?? "#"} target="_blank" rel="noopener noreferrer">
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
      <AuthDialog open={authOpen} onOpenChange={setAuthOpen} />
    </>
  );
};

export default DomainCard;
