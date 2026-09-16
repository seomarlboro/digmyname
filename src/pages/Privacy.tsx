import { Link } from "react-router-dom";
import Header from "@/components/Header";
import RouteHead from "@/seo/RouteHead";
import { PageMain, PageHeader, Eyebrow, Section } from "@/components/PageKit";

const UPDATED = "September 16, 2026";

/** What is stored, keyed by the feature that stores it. Retention is stated per row so nothing is open-ended. */
const records = [
  {
    feature: "Account (optional)",
    data: "Email address and, for Google or Apple sign-in, the identifier the provider sends. A password is stored only as a salted hash by the authentication service.",
    why: "To sign you in and keep your saved domains.",
    keep: "Until you delete the account. Deleting it removes the saved domains with it.",
  },
  {
    feature: "Saved domains",
    data: "The domain names you mark with the heart icon, linked to your account.",
    why: "So the shortlist follows you between devices.",
    keep: "Until you remove them or delete the account.",
  },
  {
    feature: "Paid-tier waitlist",
    data: "Email address, the page you signed up from, and the browser's user-agent string.",
    why: "To email you once when a paid API tier launches, and to size the launch.",
    keep: "Until the launch email is sent, or until you ask to be removed — whichever comes first.",
  },
  {
    feature: "Site usage counts",
    data: "Anonymous events: a search started (only how many characters were typed, whether they ended in an extension we track, and how many names were checked — never the text itself), how long the first answer took and which check delivered it, clicks on Buy, marketplace, Whois and open-site links (the registrar, the extension, the card's position, whether it showed the lowest price on screen, standard or premium), which extensions a finished search listed as available and which registrar each Buy button pointed to, saving a domain, copying an API or MCP snippet (which tab), opening an extension on the pricing page, and on the MCP page: page views with the kind of site you came from (a category from a fixed list such as GitHub, npm or a search engine — never the address), clicks on its links, and paid-tier waitlist sign-ups (that one happened, not the email). Each event also records the page, mobile or desktop (from the window width) and a random ID kept in this tab's session storage, which is gone when the tab closes. These rows never hold the domain name or the text you search, an IP address, a user-agent string, a cookie or an account ID — but they are not the only measurement on the page: our host's visitor analytics, the next row, is a separate system with a wider payload.",
    why: "To learn whether the comparison is useful — how many searches end in a visit to a registrar, and which — before building anything paid.",
    keep: "13 months, then deleted by a daily job. Nothing in these rows identifies you, so there is nothing to delete on request.",
  },
  {
    feature: "Visitor analytics (our host)",
    data:
      "Our hosting provider, Lovable, runs its own visitor-analytics script (/~flock.js) on every page. On each page load it sends the full address of the page you are on, the address you came from, your browser's user-agent string and language, and a country guessed from your browser's time zone; it repeats that with each Core Web Vitals measurement (load and responsiveness timings). It sets one cookie, session-id, to tell one visit from another. The full address matters here: search results normally live at the plain digmyname.com address, but a shared or bookmarked search link carries the name in it (digmyname.com/?q=example) — and on that page the name is part of the address this script sends. We see only the aggregate reports Lovable builds from it: visitors, page views, bounce rate, visit duration, traffic source, device type and country. This is the one measurement on the site that is not ours and not covered by the guarantees above.",
    why: "It ships with the hosting plan and is on by default. It is not something we built or need; the counts we actually use are the row above.",
    keep:
      "Held by Lovable under its own privacy policy and retention, not by us, so we cannot delete an individual reading. If you would rather not be counted, block /~flock.js — the site works fully without it.",
  },
  {
    feature: "Answer cache",
    data: "Checked domain names with their verdict (taken or available, and how it was confirmed). The row holds the name only — nothing about who searched it.",
    why: "So a repeat lookup of the same name is fast and does not hit the registries again.",
    keep: "An answer is used for 10 minutes to 24 hours, depending on the verdict, and a daily job deletes it once it has expired — so a checked name stays in the table for at most about two days.",
  },
  {
    feature: "API and site rate limiting",
    data: "A request counter per IP address, in memory on the edge.",
    why: "To keep the free tier fast for everyone (60 requests per minute).",
    keep: "Minutes. Counters expire on their own and are never written to a database.",
  },
  {
    feature: "Preferences",
    data: "Your light/dark choice and your sign-in session, in your browser's local storage.",
    why: "So the site remembers you on the next visit.",
    keep: "In your browser only, until you clear site data or sign out.",
  },
];

const Privacy = () => (
  <div className="min-h-screen bg-background pb-20">
    <RouteHead path="/privacy" />
    <Header />
    <PageMain>
      <PageHeader
        eyebrow={<Eyebrow>Privacy</Eyebrow>}
        title={
          <>
            What we store, <span className="text-aurora-gradient">and what we don't.</span>
          </>
        }
        lede={`DigMyName is a free domain search. Nothing we store links a name you searched to you: none of our own records hold the text you type. What is stored — an optional account, a waitlist email, anonymous usage counts, a cache of answers keyed by domain name, a per-IP rate-limit counter — is listed below with the reason and how long it lasts, together with the one measurement that is not ours: the visitor analytics our host runs on every page. Last updated ${UPDATED}.`}
      />

      <Section title="Searching a domain">
        <div className="surface-card p-6">
          <ul className="list-body">
            <li>The names you type are sent to our availability service and to public registry and DNS resolvers (RDAP servers, Cloudflare, Google and AdGuard DNS-over-HTTPS, Fastly Domain Research, Porkbun's price catalog) to answer the query. For the popular extensions your browser also asks the registry's public RDAP server and Cloudflare / Google DNS-over-HTTPS directly, so those services see your IP address together with the name, as they would for any website you visit. None of it is linked to you by us.</li>
            <li>Confident answers are cached so a repeat lookup is fast: for up to 60 seconds at the edge, and in our database as described under "Answer cache" below. Both caches are keyed by the domain name only. Unverified answers are never cached.</li>
            <li>There are no advertising trackers, no ad networks and nothing that follows you to other sites. The usage counts we built are our own, go to our own database, and never include the names you check or the text you type. One measurement is not ours: our host runs its own visitor-analytics script on every page — what it sends, and the one case where a shared search link puts the name into it, is spelled out under "Visitor analytics (our host)" below.</li>
          </ul>
        </div>
      </Section>

      <Section title="What is stored" lede="One row per feature. Nothing is stored that isn't on this list.">
        <div className="space-y-4">
          {records.map((r) => (
            <div key={r.feature} className="surface-card p-5">
              <h3 className="card-title">{r.feature}</h3>
              <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[110px_1fr]">
                <dt className="font-semibold uppercase tracking-[0.1em] text-muted-foreground text-[11px] sm:pt-0.5">What</dt>
                <dd className="text-foreground/90">{r.data}</dd>
                <dt className="font-semibold uppercase tracking-[0.1em] text-muted-foreground text-[11px] sm:pt-0.5">Why</dt>
                <dd className="text-foreground/90">{r.why}</dd>
                <dt className="font-semibold uppercase tracking-[0.1em] text-muted-foreground text-[11px] sm:pt-0.5">How long</dt>
                <dd className="text-foreground/90">{r.keep}</dd>
              </dl>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Who processes it" lede="The services that run DigMyName. Each acts under a data-processing agreement and only on our instructions.">
        <div className="surface-card p-6">
          <ul className="list-body">
            <li><span className="font-semibold text-foreground">Lovable</span> hosts and serves the site, and runs the visitor-analytics script described above; it receives the page address, referrer, user-agent, language and a time-zone country for every page view, and holds those readings under its own privacy policy.</li>
            <li><span className="font-semibold text-foreground">Supabase</span> (via Lovable Cloud) hosts the database, authentication and the availability functions. Like any web host, it keeps request logs that include the IP address of each request; nothing from those logs is copied into the tables above.</li>
            <li><span className="font-semibold text-foreground">Cloudflare</span> serves the site and the API edge cache and provides DNS-over-HTTPS answers.</li>
            <li><span className="font-semibold text-foreground">Google</span> and <span className="font-semibold text-foreground">Apple</span> handle sign-in only if you choose them; they receive nothing from us beyond the sign-in request.</li>
            <li>Two directory badges in the footer (CodeTrendy, Sell With Boost) are images loaded from those sites, so they see the IP address that fetched them, as any image host does. They set no cookies here.</li>
            <li>Buy links open the registrar's own site. Today they carry no affiliate tag and no referrer, so the registrar is not told the visit came from DigMyName; the registrar's privacy policy applies from that point on. If that changes, this line changes with it.</li>
          </ul>
        </div>
      </Section>

      <Section title="Your rights">
        <div className="surface-card p-6">
          <p className="text-muted-foreground leading-relaxed">
            Under the GDPR you can ask for a copy of what we hold about you, have it corrected or deleted, receive it in a portable format, or object to a use. Email{" "}
            <a href="mailto:hello@digmyname.com" className="text-aurora hover:underline">hello@digmyname.com</a> from the address in question and we answer within 30 days; that is also how you delete an account or leave the waitlist. If you believe a request was not handled properly, you may complain to the data-protection authority in your country of residence.
          </p>
          <p className="mt-4 text-muted-foreground leading-relaxed">
            The controller for this processing is the operator of DigMyName, established in the European Union, reachable at the address above. This page is updated when the processing changes; the date at the top tells you when.
          </p>
        </div>
      </Section>

      <p className="mt-10 text-sm text-muted-foreground">
        See also the <Link to="/terms" className="text-aurora hover:underline">terms of use</Link> and{" "}
        <Link to="/how-it-works" className="text-aurora hover:underline">how availability is verified</Link>.
      </p>
    </PageMain>
  </div>
);

export default Privacy;
