import { ExternalLink, Heart, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { DomainResult } from "@/lib/domainData";

interface DomainCardProps {
  result: DomainResult;
  compact?: boolean;
}

const DomainCard = ({ result, compact = false }: DomainCardProps) => {
  const { domain, tld, available, checking } = result;
  const hasHighRenewal = tld.renewPrice > tld.regPrice * 1.8;

  const parts = domain.split(".");
  const name = parts.slice(0, -1).join(".");
  const ext = parts[parts.length - 1];

  if (compact) {
    return (
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
              <span className="text-sm font-bold text-foreground">${tld.regPrice}</span>
              <Button size="sm" className="h-7 gap-1 rounded-md bg-primary text-primary-foreground text-xs hover:bg-primary/90">
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
    );
  }

  return (
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
                ${tld.renewPrice}/year
              </span>
            )}
            <p className="text-2xl font-bold text-foreground">
              ${tld.regPrice}
              <span className="text-sm font-normal text-muted-foreground">/year</span>
            </p>
            {hasHighRenewal && (
              <p className="text-xs text-warning font-medium">
                Renews at ${tld.renewPrice}/yr
              </p>
            )}
          </div>

          <Button variant="ghost" size="icon" className="text-muted-foreground hover:text-primary">
            <Heart className="h-4 w-4" />
          </Button>

          {available ? (
            <Button className="gap-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90">
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
      <div className="border-t border-border px-6 py-3">
        <p className="text-xs text-muted-foreground">Registrar: <span className="font-semibold text-foreground">DomainHub</span></p>
      </div>
    </div>
  );
};

export default DomainCard;
