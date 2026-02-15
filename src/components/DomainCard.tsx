import { useState } from "react";
import { ExternalLink, Heart, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { useFavorites } from "@/hooks/useFavorites";
import { useCheapestRegistrars } from "@/hooks/useCheapestRegistrars";
import AuthDialog from "@/components/AuthDialog";
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
        <div className="flex items-center justify-between border-b border-border px-4 py-3 transition-colors hover:bg-secondary/50">
          <div className="flex items-center gap-3">
            <h3 className="text-base font-semibold text-foreground">
              {name}.<span className="text-primary">{ext}</span>
            </h3>
            {checking ? (
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
            ) : available ? (
              <Badge className="bg-available/15 text-available text-[11px] px-1.5 py-0">Available</Badge>
            ) : (
              <Badge variant="secondary" className="text-[11px] px-1.5 py-0">Taken</Badge>
            )}
          </div>
          <div className="flex items-center gap-3">
            {available && !checking && (
              <>
                <span className="text-sm font-bold text-foreground">${displayPrice}</span>
                <Button size="sm" className="h-7 gap-1 rounded-md btn-gradient text-xs border-0">
                  <ExternalLink className="h-3 w-3" />
                  Buy
                </Button>
              </>
            )}
            {!available && !checking && (
              <Button variant="ghost" size="sm" className="h-7 gap-1 rounded-md text-xs text-muted-foreground">
                <ExternalLink className="h-3 w-3" />
                Whois
              </Button>
            )}
          </div>
        </div>
        <AuthDialog open={authOpen} onOpenChange={setAuthOpen} />
      </>
    );
  }

  return (
    <>
      <div className="card-hover rounded-xl border border-border bg-card">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between p-6">
          <div className="flex-1">
            <h3 className="text-xl font-bold text-foreground">
              {name}.<span className="text-primary">{ext}</span>
            </h3>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {tld.features.map((f) => (
                <Badge key={f} variant="secondary" className="text-xs font-normal">
                  {f}
                </Badge>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="text-right">
              {hasHighRenewal && (
                <span className="text-xs text-warning line-through">
                  ${displayRenew}/year
                </span>
              )}
              <p className="text-2xl font-bold text-foreground">
                ${displayPrice}
                <span className="text-sm font-normal text-muted-foreground">/year</span>
              </p>
              {hasHighRenewal && (
                <p className="text-xs text-warning font-medium">
                  Renews at ${displayRenew}/yr
                </p>
              )}
            </div>

            <Button
              variant="ghost"
              size="icon"
              className={favorited ? "text-destructive" : "text-muted-foreground hover:text-primary"}
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
        {registrarName && (
          <div className="border-t border-border px-6 py-3">
            <Badge variant="secondary" className="text-xs font-normal">
              {registrarName}
            </Badge>
          </div>
        )}
      </div>
      <AuthDialog open={authOpen} onOpenChange={setAuthOpen} />
    </>
  );
};

export default DomainCard;
