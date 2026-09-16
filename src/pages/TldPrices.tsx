import { useMemo, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import RouteHead from "@/seo/RouteHead";
import NotFound from "@/pages/NotFound";
import { Badge } from "@/components/ui/badge";
import { PromoCode } from "@/components/PromoCode";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DataTable, Eyebrow, PageHeader, PageMain, Section, Stat, StatGrid, type DataColumn } from "@/components/PageKit";
import { NetworkIcon, StoreIcon, CertificateIcon } from "@/components/StatIcons";
import { getRegistrarColor } from "@/lib/registrarColors";
import { cn } from "@/lib/utils";
import { isSearchableTld } from "@/lib/searchableTlds";
import { FOOTER_TLDS } from "@/generated/tld-links";
import { TLD_SNAPSHOT, breadcrumbJsonLd, tldPageRoute } from "@/seo/tldRoutes";
import {
  PRICE_COLUMNS,
  TLD_HUB_PATH,
  buildTldPage,
  formatDay,
  snapshotFromRows,
  tldPath,
  usd,
  type RawPriceRow,
  type SnapshotTld,
  type TldPriceRow,
} from "@/lib/tldPages";

/** A URL segment must look like a TLD before it reaches the database. */
const TLD_RE = /^[a-z0-9-]{2,63}$/;

/** Live rows for one TLD, shaped like the build snapshot. RDAP facts are build-time only, so they come from the snapshot. */
async function fetchTld(tld: string, known: SnapshotTld | null): Promise<SnapshotTld | null> {
  const { data, error } = await supabase.from("registrar_prices").select(PRICE_COLUMNS).eq("tld", tld);
  if (error) throw error;
  const facts = { registryHost: known?.registryHost ?? null, inIanaBootstrap: known?.inIanaBootstrap ?? null };
  return snapshotFromRows((data ?? []) as unknown as RawPriceRow[], () => facts).tlds[0] ?? null;
}

const Money = ({ value, suffix, warn = false }: { value: number; suffix?: string; warn?: boolean }) => (
  <p className="flex items-baseline gap-1">
    <span className={cn("font-mono text-base font-extrabold tabular-nums", warn ? "text-warning" : "text-foreground")}>{usd(value)}</span>
    {suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
  </p>
);

const columns: DataColumn<TldPriceRow>[] = [
  {
    header: "Registrar",
    width: "1.3fr",
    cell: (r) => (
      <div>
        <span className={cn("text-base font-bold", getRegistrarColor(r.registrar).text)}>{r.registrar}</span>
        {(r.whoisPrivacy || r.promo) && (
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {r.whoisPrivacy && (
              <Badge variant="secondary" className="text-xs font-normal">
                WHOIS privacy
              </Badge>
            )}
            {r.promo && <PromoCode code={r.promo} title="Promo code published by the registrar — click to copy" />}
          </div>
        )}
      </div>
    ),
  },
  {
    header: "Register",
    cell: (r) => (
      <div>
        <Money value={r.reg} suffix="/yr" />
        {r.icannFee ? <p className="text-xs text-muted-foreground">ICANN fee {usd(r.icannFee)}</p> : null}
      </div>
    ),
  },
  {
    header: "Renew",
    cell: (r) => (
      <div>
        <Money value={r.renew} suffix="/yr" warn={r.trap} />
        {r.trap && <p className="text-xs text-warning">{r.renewalRatio.toFixed(2)}× year one</p>}
      </div>
    ),
  },
  {
    header: "Transfer",
    cell: (r) => (r.transfer != null ? <Money value={r.transfer} /> : <span className="text-sm text-muted-foreground">—</span>),
  },
  { header: "3 years", sub: "reg + 2 renewals", cell: (r) => <Money value={r.threeYear} /> },
  {
    header: "Verified",
    width: "0.9fr",
    cell: (r) => (
      <span className={cn("text-sm", r.stale ? "text-warning" : "text-muted-foreground")}>
        {formatDay(r.verifiedAt)}
        {r.stale && " · stale"}
      </span>
    ),
  },
];

const Prose = ({ children }: { children: React.ReactNode }) => <p className="max-w-3xl text-base text-muted-foreground">{children}</p>;

const TldPrices = () => {
  const navigate = useNavigate();
  const tld = (useParams().tld ?? "").toLowerCase();
  const valid = TLD_RE.test(tld);
  const fromSnapshot = useMemo(() => TLD_SNAPSHOT.tlds.find((t) => t.tld === tld) ?? null, [tld]);

  // Starts from the build snapshot (no spinner, same numbers as the prerendered HTML), then refreshes from the live table.
  const { data, isPending } = useQuery({
    queryKey: ["tld-prices", tld],
    queryFn: () => fetchTld(tld, fromSnapshot),
    initialData: fromSnapshot ?? undefined,
    initialDataUpdatedAt: 0,
    enabled: valid,
  });

  const page = useMemo(() => (data ? buildTldPage(data) : null), [data]);
  // The <head> keeps the snapshot's numbers so it matches the prerendered HTML.
  const headPage = useMemo(() => (fromSnapshot ? buildTldPage(fromSnapshot) : page), [fromSnapshot, page]);
  const [name, setName] = useState("");

  if (!valid) return <NotFound />;
  if (!page || !headPage) {
    return isPending ? (
      <div className="min-h-screen bg-background">
        <Header />
        <div className="flex flex-col items-center py-20">
          <Loader2 className="h-8 w-8 animate-spin text-aurora" />
          <p className="mt-3 text-sm text-muted-foreground">Loading prices…</p>
        </div>
      </div>
    ) : (
      <NotFound />
    );
  }

  const dot = `.${tld}`;
  /** Does the search offer this extension at all? .gg and .so have price pages but no answer. */
  const searchable = isSearchableTld(tld);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const label = name.trim().toLowerCase().replace(/\s+/g, "").replace(new RegExp(`\\.${tld}$`), "");
    if (label) navigate(`/?q=${encodeURIComponent(`${label}${dot}`)}`);
  };
  const others = FOOTER_TLDS.filter((t) => t !== tld);

  return (
    <div className="min-h-screen bg-background">
      {/* Breadcrumb JSON-LD rides on the route meta (src/seo/tldRoutes.ts) so the
          prerendered head carries it too — it used to appear only after React mounted. */}
      <RouteHead route={tldPageRoute(headPage)} />
      <Header />
      <PageMain>
        <nav aria-label="Breadcrumb" className="mb-2 text-sm text-muted-foreground">
          <Link to="/" className="transition-colors hover:text-foreground">Home</Link>
          <span aria-hidden="true"> / </span>
          <Link to={TLD_HUB_PATH} className="transition-colors hover:text-foreground">Domain prices</Link>
          <span aria-hidden="true"> / </span>
          <span className="text-foreground" aria-current="page">{dot}</span>
        </nav>

        <PageHeader
          eyebrow={<Eyebrow>{page.single ? "One registrar tracked" : `${page.registrarCount} registrars tracked`}</Eyebrow>}
          title={page.h1}
          lede={page.lede}
        >
          {page.rows.length > 0 && (
            <StatGrid cols={3}>
              <Stat
                value={usd(page.lowestReg!.price)}
                label={page.single ? `Registration · ${page.lowestReg!.registrar}` : `Lowest registration · ${page.lowestReg!.registrar}`}
                accent="mint"
                icon={NetworkIcon}
              />
              <Stat
                value={usd(page.lowestRenew!.price)}
                label={page.single ? `Renewal · ${page.lowestRenew!.registrar}` : `Lowest renewal · ${page.lowestRenew!.registrar}`}
                accent="violet"
                icon={StoreIcon}
              />
              <Stat
                value={usd(page.threeYearLow!.price)}
                label={page.single ? "3-year cost" : `Lowest 3-year cost · ${page.threeYearLow!.registrar}`}
                icon={CertificateIcon}
              />
            </StatGrid>
          )}
        </PageHeader>

        {page.rows.length > 0 && (
          <Section
            title={page.single ? `${dot} price` : `${dot} prices by registrar`}
            lede={page.single ? undefined : "Lowest 3-year cost first. Each column is that registrar's own price."}
            aside={page.verifiedLine}
          >
            <DataTable rows={page.rows} rowKey={(r) => r.registrar} columns={columns} minWidth="760px" />
          </Section>
        )}

        {page.trapLine && (
          <Section title="Renewal price">
            <Prose>{page.trapLine}</Prose>
          </Section>
        )}

        {page.hiddenLines.length > 0 && (
          <Section title="Not shown">
            <ul className="max-w-3xl list-disc space-y-1 pl-5 text-base text-muted-foreground">
              {page.hiddenLines.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </Section>
        )}

        <Section title={searchable ? `How availability of ${dot} is checked` : `Availability of ${dot} names`}>
          <Prose>{page.checkLines.join(" ")}</Prose>
        </Section>

        {/* No search box for an extension the search cannot answer for: the form
            would hand the visitor a result page about a different extension. */}
        {searchable && (
        <Section title={`Check a ${dot} name`}>
          <form role="search" onSubmit={submit} className="flex max-w-xl flex-col gap-3 sm:flex-row">
            <div className="relative flex-1">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="yourname"
                aria-label={`Name to check with ${dot}`}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                className="h-10 pr-20"
              />
              <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 font-mono text-sm text-muted-foreground">{dot}</span>
            </div>
            <Button type="submit">Check availability</Button>
          </form>
        </Section>
        )}

        <Section title="Other extensions">
          <ul className="flex flex-wrap gap-2">
            {others.map((t) => (
              <li key={t}>
                <Link to={tldPath(t)} className="surface-card inline-block px-3 py-1.5 font-mono text-sm text-foreground transition-colors hover:text-mint">
                  .{t}
                </Link>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-muted-foreground">
            <Link to={TLD_HUB_PATH} className="font-medium text-foreground hover:underline">All extensions</Link>
            <span aria-hidden="true"> · </span>
            <Link to="/pricing" className="font-medium text-foreground hover:underline">Pricing overview</Link>
          </p>
        </Section>
      </PageMain>
    </div>
  );
};

export default TldPrices;
