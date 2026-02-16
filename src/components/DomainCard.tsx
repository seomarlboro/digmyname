import { useState } from "react";
import { ExternalLink, Heart, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useFavorites } from "@/hooks/useFavorites";
import { useCheapestRegistrars } from "@/hooks/useCheapestRegistrars";
import AuthDialog from "@/components/AuthDialog";
import { getRegistrarColor } from "@/lib/registrarColors";
import type { DomainResult } from "@/lib/domainData";

interface DomainCardProps {
  result: DomainResult;
  compact?: boolean;
}

const DomainCard = ({ result, compact = false }: DomainCardProps) => {
  const { domain, tld, available, checking } = result;
  const { user } = useAuth();
  const { isFavorite, toggleFavorite } = useFavorites();
  const cheapestByTld = useCheapestRegistrars();
  const [authOpen, setAuthOpen] = useState(false);

  const ext = domain.split(".").pop() ?? "";
  const cheapest = cheapestByTld.get(ext);
  const displayPrice = cheapest?.regPrice ?? tld.regPrice;
  const displayRenew = cheapest?.renewPrice ?? tld.renewPrice;
  const hasHighRenewal = displayRenew > displayPrice * 1.8;
  const registrarName = cheapest?.registrar ?? null;
  const favorited = isFavorite(domain);

  const handleFavorite = () => {
    if (!user) {
      setAuthOpen(true);
      return;
    }
    toggleFavorite(domain);
  };

  const parts = domain.split(".");
  const name = parts.slice(0, -1).join(".");

  if (compact) {
    return (
      <>
        <div className="grid border-b border-border px-4 py-4 transition-colors hover:bg-secondary/50" style={{ gridTemplateColumns: '2fr 1fr 1fr 1fr auto', alignItems: 'center', gap: '0 1rem' }}>
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-foreground">
              {name}.<span className="text-primary">{ext}</span>
            </h3>
            {checking && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
          </div>
          {registrarName ? (
            <span className={`text-xs font-medium min-w-[80px] ${getRegistrarColor(registrarName).text}`}>{registrarName}</span>
          ) : (
            <span className="min-w-[80px]" />
          )}
          <span className="text-xs text-muted-foreground min-w-[80px]">{hasHighRenewal ? `renews $${displayRenew}` : ''}</span>
          {available && !checking ? (
            <>
              <span className="text-lg font-bold text-foreground">${displayPrice}</span>
              <Button size="sm" className="h-9 gap-1.5 rounded-lg btn-gradient text-sm border-0 px-4">
                <ExternalLink className="h-3.5 w-3.5" />
                Buy
              </Button>
            </>
          ) : !checking ? (
            <>
              <span />
              <Button variant="ghost" size="sm" className="h-9 gap-1.5 rounded-lg text-sm text-muted-foreground">
                <ExternalLink className="h-3.5 w-3.5" />
                Whois
              </Button>
            </>
          ) : (
            <>
              <span />
              <span />
            </>
          )}
        </div>
        <AuthDialog open={authOpen} onOpenChange={setAuthOpen} />
      </>
    );
  }

  return (
    <>
      <div className="card-hover rounded-xl border border-border bg-card p-4 sm:p-5">
        {/* Mobile: stacked, Desktop: single row */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          {/* Left: domain + badges */}
          <div className="flex-1 min-w-0">
            <h3 className="text-xl font-bold text-foreground">
              {name}.<span className="text-primary">{ext}</span>
            </h3>
            <div className="flex items-center gap-1.5 mt-1.5">
              {registrarName && (() => {
                const rc = getRegistrarColor(registrarName);
                return (
                  <Badge variant="outline" className={`text-xs font-medium ${rc.text} ${rc.bg} ${rc.border}`}>
                    {registrarName}
                  </Badge>
                );
              })()}
              {tld.features.map((f) => (
                <Badge key={f} variant="secondary" className="text-xs font-normal">
                  {f}
                </Badge>
              ))}
            </div>
          </div>

          {/* Right: price + actions */}
          <div className="flex items-center gap-3 sm:gap-4">
            <div className="sm:text-right">
              <p className="text-2xl font-bold text-foreground">
                ${displayPrice}
                <span className="text-sm font-normal text-muted-foreground">/year</span>
              </p>
              {hasHighRenewal && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  renews ${displayRenew}/yr
                </p>
              )}
            </div>

            <Button
              variant="ghost"
              size="icon"
              className={`h-9 w-9 ${favorited ? "text-destructive" : "text-muted-foreground hover:text-primary"}`}
              onClick={handleFavorite}
            >
              <Heart className={`h-4 w-4 ${favorited ? "fill-current" : ""}`} />
            </Button>

            {available ? (
              <Button className="gap-1.5 rounded-lg btn-gradient border-0">
                <ExternalLink className="h-4 w-4" />
                Buy Now
              </Button>
            ) : (
              <Button variant="outline" className="gap-1.5 rounded-lg">
                <ExternalLink className="h-4 w-4" />
                Whois
              </Button>
            )}
          </div>
        </div>
      </div>
      <AuthDialog open={authOpen} onOpenChange={setAuthOpen} />
    </>
  );
};

export default DomainCard;
