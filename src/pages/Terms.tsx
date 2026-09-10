import { Link } from "react-router-dom";
import Header from "@/components/Header";
import RouteHead from "@/seo/RouteHead";
import { PageMain, PageHeader, Eyebrow, Section, FaqList } from "@/components/PageKit";

const UPDATED = "September 10, 2026";

const terms = [
  {
    q: "What DigMyName is",
    a: "A free tool that checks whether a domain name is available and compares registrar prices. It also offers a free JSON API and an open-source MCP server. DigMyName is not a registrar and does not sell, register or transfer domains; every purchase happens on a registrar's own site under that registrar's terms.",
  },
  {
    q: "Availability and prices are provided as-is",
    a: "Answers come from public registry data (RDAP), DNS and third-party lookups, and prices from registrar catalogs. We cross-check three availability signals and label a result Unverified when they disagree, but no lookup is a guarantee: a domain can be registered by someone else between our answer and your checkout, and a registrar can change a price at any time. Confirm on the registrar before relying on a result.",
  },
  {
    q: "Affiliate links",
    a: "Some buy links carry an affiliate tag and may earn DigMyName a commission from the registrar. The tag never changes the price you pay, and the comparison ranks registrars by their price alone — including when a partner is not the cheapest.",
  },
  {
    q: "Fair use of the API and MCP server",
    a: "The public API is free without a key, limited to 60 requests per 60 seconds per IP address. Use it for your own product or agent, cache responsibly, and link back to digmyname.com when you show our data to users. Don't circumvent the rate limit, scrape the site instead of the API, or resell the data as a standalone feed. The MCP server is MIT-licensed; the license file in its repository applies to the code.",
  },
  {
    q: "Accounts",
    a: "An account is optional and only exists to save domains. Keep your sign-in credentials to yourself; you're responsible for what happens under your account. We may close an account used to abuse the service.",
  },
  {
    q: "Liability",
    a: "DigMyName is provided free of charge and without warranty of any kind, to the extent the law allows. We are not liable for a domain that turned out to be taken, a price that changed, downtime, or decisions made on the basis of a lookup. Nothing here limits liability that cannot be limited under applicable consumer law.",
  },
  {
    q: "Changes and contact",
    a: `We may update these terms; the date at the top says when. Continued use after a change means you accept it. Questions go to hello@digmyname.com. These terms are governed by the law of the operator's country of establishment in the European Union, without affecting the mandatory consumer protections of the country you live in. Last updated ${UPDATED}.`,
  },
];

const Terms = () => (
  <div className="min-h-screen bg-background pb-20">
    <RouteHead path="/terms" />
    <Header />
    <PageMain>
      <PageHeader
        eyebrow={<Eyebrow>Terms of use</Eyebrow>}
        title={
          <>
            Short terms for a <span className="text-aurora-gradient">free tool.</span>
          </>
        }
        lede="Seven plain-language sections. They cover the website, the public API and the MCP server. If something here surprises you, tell us — the point is that nothing should."
      />

      <Section title="The terms">
        <FaqList items={terms} />
      </Section>

      <p className="mt-10 text-sm text-muted-foreground">
        See also the <Link to="/privacy" className="text-aurora hover:underline">privacy policy</Link> and{" "}
        <Link to="/api" className="text-aurora hover:underline">API docs</Link>.
      </p>
    </PageMain>
  </div>
);

export default Terms;
