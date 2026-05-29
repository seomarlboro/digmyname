const faqs = [
  {
    q: "Is DigMyName free to use?",
    a: "Yes. Search and registrar price comparison are completely free. Sign-in is only needed to save favorite domains.",
  },
  {
    q: "How does the availability check work?",
    a: "DigMyName cross-checks four independent sources — Domainr, the IANA RDAP bootstrap, DNS (Cloudflare DoH), and Porkbun for premium pricing. When sources disagree we label the result Unverified instead of guessing. Full breakdown on the How it works page.",
  },
  {
    q: "Why is .com cheaper than .io or .ai?",
    a: ".com is a commodity TLD with low registry fees. .io and .ai are country-code TLDs with higher registry costs and strong startup demand, which pushes prices higher.",
  },
  {
    q: "What's the difference between registration and renewal price?",
    a: "Registration is the first-year price, often discounted. Renewal is what you pay every year after. Some registrars use $1 first-year promos but charge $20+ renewals — the Pricing page surfaces this.",
  },
  {
    q: "Does DigMyName register domains directly?",
    a: "No. DigMyName is a search and comparison tool. Registration happens at the registrar via the Buy button.",
  },
  {
    q: "Why don't I see a price for taken domains?",
    a: "Taken domains aren't purchasable at the standard rate, so showing a registration price would be misleading. You can still check WHOIS to see who owns it.",
  },
];

const FAQ = () => {
  return (
    <section className="mx-auto max-w-3xl px-4 py-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: faqs.map((f) => ({
              "@type": "Question",
              name: f.q,
              acceptedAnswer: { "@type": "Answer", text: f.a },
            })),
          }),
        }}
      />
      <h2 className="mb-8 text-2xl md:text-3xl font-bold tracking-tight text-foreground">Frequently asked questions</h2>
      <dl className="space-y-6">
        {faqs.map((f) => (
          <div key={f.q} className="rounded-xl border border-border bg-card p-5">
            <dt className="text-base font-semibold text-foreground">{f.q}</dt>
            <dd className="mt-2 text-sm text-muted-foreground leading-relaxed">{f.a}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
};

export default FAQ;
