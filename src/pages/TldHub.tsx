import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import Header from "@/components/Header";
import RouteHead from "@/seo/RouteHead";
import { Input } from "@/components/ui/input";
import { DataTable, Eyebrow, PageHeader, PageMain, Section, type DataColumn, type DataRowGroup } from "@/components/PageKit";
import { getRegistrarColor } from "@/lib/registrarColors";
import { cn } from "@/lib/utils";
import { TLD_SNAPSHOT, breadcrumbJsonLd, tldHubRoute } from "@/seo/tldRoutes";
import {
  PRICE_COLUMNS,
  TLD_HUB_PATH,
  buildHub,
  formatDay,
  snapshotFromRows,
  usd,
  type HubEntry,
  type Named,
  type RawPriceRow,
  type TldSnapshot,
} from "@/lib/tldPages";

async function fetchAll(): Promise<TldSnapshot> {
  const { data, error } = await supabase.from("registrar_prices").select(PRICE_COLUMNS);
  if (error) throw error;
  const facts = new Map(TLD_SNAPSHOT.tlds.map((t) => [t.tld, t]));
  return snapshotFromRows((data ?? []) as unknown as RawPriceRow[], (tld) => ({
    registryHost: facts.get(tld)?.registryHost ?? null,
    inIanaBootstrap: facts.get(tld)?.inIanaBootstrap ?? null,
  }));
}

/** One price cell: registrar on top, price below; "from" only when there is more than one registrar to be lower than. */
const PriceCell = ({ best, many }: { best: Named | null; many: boolean }) =>
  best ? (
    <div>
      <span className={cn("text-sm font-medium", getRegistrarColor(best.registrar).text)}>{best.registrar}</span>
      <p className="flex items-baseline gap-1">
        {many && <span className="text-sm text-muted-foreground">from</span>}
        <span className="font-mono text-base font-extrabold tabular-nums text-foreground">{usd(best.price)}</span>
        <span className="text-sm text-muted-foreground">/yr</span>
      </p>
    </div>
  ) : (
    <span className="text-sm text-muted-foreground">—</span>
  );

const columns: DataColumn<HubEntry>[] = [
  {
    header: "Extension",
    width: "1fr",
    cell: (e) => (
      <Link to={e.path} className="font-display text-2xl font-extrabold tracking-tight text-mint hover:underline">
        .{e.tld}
      </Link>
    ),
  },
  { header: "Registrars", width: "0.8fr", cell: (e) => <span className="text-sm text-muted-foreground">{e.registrarCount === 1 ? "1 (no comparison)" : e.registrarCount}</span> },
  { header: "Registration", cell: (e) => <PriceCell best={e.lowestReg} many={e.registrarCount > 1} /> },
  { header: "Renewal", cell: (e) => <PriceCell best={e.lowestRenew} many={e.registrarCount > 1} /> },
  { header: "Verified", width: "0.9fr", cell: (e) => <span className="text-sm text-muted-foreground">{e.newestVerifiedAt ? formatDay(e.newestVerifiedAt) : "—"}</span> },
];

const TldHub = () => {
  const [query, setQuery] = useState("");
  const { data } = useQuery({
    queryKey: ["tld-hub"],
    queryFn: fetchAll,
    initialData: TLD_SNAPSHOT,
    initialDataUpdatedAt: 0,
  });

  const hub = useMemo(() => buildHub(data), [data]);
  // The <head> keeps the snapshot's numbers so it matches the prerendered HTML.
  const headRoute = useMemo(() => tldHubRoute(buildHub(TLD_SNAPSHOT)), []);

  const q = query.trim().replace(/^\./, "").toLowerCase();
  const shown = q ? hub.entries.filter((e) => e.tld.includes(q)) : hub.entries;
  const compared = shown.filter((e) => e.registrarCount > 1);
  const single = shown.filter((e) => e.registrarCount === 1);
  const groups: DataRowGroup[] | undefined =
    compared.length > 0 && single.length > 0
      ? [
          { label: `Tracked at two or more registrars · ${compared.length}`, startIndex: 0 },
          { label: `Tracked at one registrar so far — no comparison yet · ${single.length}`, startIndex: compared.length },
        ]
      : undefined;

  return (
    <div className="min-h-screen bg-background">
      <RouteHead route={headRoute}>
        <script type="application/ld+json">
          {breadcrumbJsonLd([
            { name: "Home", path: "/" },
            { name: "Domain prices", path: TLD_HUB_PATH },
          ])}
        </script>
      </RouteHead>
      <Header />
      <PageMain>
        <PageHeader eyebrow={<Eyebrow>Domain prices</Eyebrow>} title={hub.h1} lede={hub.lede} />

        <div className="sticky top-16 z-30 -mx-4 mb-6 border-y border-border/60 bg-background/85 px-4 py-3 backdrop-blur-xl sm:mx-0 sm:rounded-2xl sm:border">
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filter extensions — try io, ai, shop" aria-label="Filter extensions" className="h-10 pl-9" />
          </div>
        </div>

        <Section
          title="All extensions"
          lede="Lowest registration and renewal among the registrars we track for each extension; the two can come from different registrars. Open an extension for every registrar's price."
        >
          {shown.length === 0 ? (
            <p className="surface-card p-6 text-sm text-muted-foreground">No extensions match “{query}”.</p>
          ) : (
            <DataTable rows={[...compared, ...single]} groups={groups} rowKey={(e) => e.tld} columns={columns} minWidth="720px" />
          )}
          <p className="mt-4 text-sm text-muted-foreground">
            <Link to="/pricing" className="font-medium text-foreground hover:underline">Pricing overview</Link>
            <span aria-hidden="true"> · </span>
            <Link to="/" className="font-medium text-foreground hover:underline">Search a domain</Link>
          </p>
        </Section>
      </PageMain>
    </div>
  );
};

export default TldHub;
