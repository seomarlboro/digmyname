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
        <div className="flex items-center justify-between border-b border-border px-4 py-3.5 transition-colors hover:bg-secondary/50">
          <div className="flex items-center gap-3">
            <h3 className="text-lg font-semibold text-foreground">
              {name}.<span className="text-primary">{ext}</span>
            </h3>
            {checking && (
              <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
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
      <div className="card-hover rounded-xl border border-border bg-card p-5 sm:p-6">
        <h3 className="text-xl font-bold text-foreground">
          {name}.<span className="text-primary">{ext}</span>
        </h3>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {registrarName && (
            <Badge variant="secondary" className="text-xs font-normal">
              {registrarName}
            </Badge>
          )}
          {tld.features.map((f) => (
            <Badge key={f} variant="secondary" className="text-xs font-normal">
              {f}
            </Badge>
          ))}
        </div>

        <div className="mt-4 flex items-end justify-between">
          <div>
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

          <div className="flex items-center gap-2">
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
