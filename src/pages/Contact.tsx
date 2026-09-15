import { Link } from "react-router-dom";
import Header from "@/components/Header";
import RouteHead from "@/seo/RouteHead";
import { PageMain, PageHeader, Eyebrow, Section } from "@/components/PageKit";

const EMAIL = "hello@digmyname.com";
const SITE_ISSUES = "https://github.com/seomarlboro/digmyname/issues/new";
const MCP_ISSUES = "https://github.com/seomarlboro/domain-check-skills/issues/new";

const Contact = () => (
  <div className="min-h-screen bg-background pb-20">
    <RouteHead path="/contact" />
    <Header />
    <PageMain>
      <PageHeader
        eyebrow={<Eyebrow>Contact</Eyebrow>}
        title={
          <>
            Something looks wrong? <span className="text-aurora-gradient">Tell us.</span>
          </>
        }
        lede="One address for questions, feedback and privacy requests, and a public issue tracker for anything you are happy to report in the open."
      />

      <Section title="Email">
        <div className="surface-card p-6">
          <p className="text-muted-foreground leading-relaxed">
            <a href={`mailto:${EMAIL}`} className="font-semibold text-aurora hover:underline">{EMAIL}</a> — questions,
            feedback, API and MCP questions, and requests about your data (see the{" "}
            <Link to="/privacy" className="text-aurora hover:underline">privacy policy</Link> for what we hold and how
            those requests are handled).
          </p>
        </div>
      </Section>

      <Section
        title="Report a wrong status or price"
        lede="A registered name shown as Available, or a price that does not match the registrar, is a bug we want to fix."
      >
        <div className="surface-card p-6">
          <p className="text-muted-foreground leading-relaxed">Please include:</p>
          <ul className="list-body mt-3">
            <li>the domain name;</li>
            <li>what DigMyName showed — Available, Taken or Unverified, or the price and the registrar;</li>
            <li>what the registrar or the registry shows instead, ideally with a screenshot;</li>
            <li>roughly when you searched.</li>
          </ul>
          <p className="mt-4 text-muted-foreground leading-relaxed">
            Send it to <a href={`mailto:${EMAIL}`} className="text-aurora hover:underline">{EMAIL}</a>, or open an issue on{" "}
            <a href={SITE_ISSUES} target="_blank" rel="noopener noreferrer" className="text-aurora hover:underline">GitHub</a>.
            Everything in a GitHub issue is public, including the domain name.
          </p>
          <p className="mt-4 text-muted-foreground leading-relaxed">
            A name can be registered by someone else between our answer and your checkout, and registrars change prices at any
            time; we still want to hear about it, but that alone is not a wrong answer.
          </p>
        </div>
      </Section>

      <Section title="MCP server">
        <div className="surface-card p-6">
          <p className="text-muted-foreground leading-relaxed">
            Bugs and feature requests for the npm package go to its{" "}
            <a href={MCP_ISSUES} target="_blank" rel="noopener noreferrer" className="text-aurora hover:underline">GitHub repository</a>.
            The HTTP API is documented on the <Link to="/api" className="text-aurora hover:underline">API page</Link>.
          </p>
        </div>
      </Section>

      <p className="mt-10 text-sm text-muted-foreground">
        See also the <Link to="/privacy" className="text-aurora hover:underline">privacy policy</Link> and{" "}
        <Link to="/terms" className="text-aurora hover:underline">terms of use</Link>.
      </p>
    </PageMain>
  </div>
);

export default Contact;
