import { describe, it, expect } from "vitest";
import { TLD_FACTS, operatorBlock, eligibilityBlock, eligibilityQuotes, priceFaq, listOf, hostOf } from "@/lib/tldFacts";
import { buildTldPage, type SnapshotPrice, type SnapshotTld, type TldPriceRow } from "@/lib/tldPages";
import { TLD_SNAPSHOT } from "@/seo/tldRoutes";
import { parseIana } from "../../scripts/tld-facts/fetch-iana.mjs";

const COLLECTED = TLD_FACTS.ianaCollectedAt ?? "";
const ISO = /^\d{4}-\d{2}-\d{2}$/;

const price = (registrar: string, reg: number, renew: number): SnapshotPrice => ({
  registrar,
  reg,
  renew,
  transfer: reg,
  icannFee: 0,
  promo: null,
  whoisPrivacy: true,
  verifiedAt: "2026-09-13T04:00:00.000+00:00",
});
const tld = (name: string, prices: SnapshotPrice[]): SnapshotTld => ({
  tld: name,
  prices,
  quarantined: [],
  registryHost: "rdap.example",
  inIanaBootstrap: true,
});
const NOW = Date.parse("2026-09-16T00:00:00Z");
const rowsFor = (name: string, prices: SnapshotPrice[]): TldPriceRow[] => buildTldPage(tld(name, prices), NOW).rows;

describe("the facts file", () => {
  const entries = Object.entries(TLD_FACTS.tlds);

  it("has a collection date and at least one record", () => {
    expect(COLLECTED).toMatch(ISO);
    expect(entries.length).toBeGreaterThan(0);
  });

  it("every IANA block carries its source URL and a date no older than the collection date", () => {
    for (const [name, rec] of entries) {
      if (!rec.iana) continue;
      expect(rec.iana.sourceUrl, name).toBe(`https://www.iana.org/domains/root/db/${name}.html`);
      expect(rec.iana.checkedAt, name).toMatch(ISO);
      expect(rec.iana.checkedAt >= COLLECTED, `${name}: checked ${rec.iana.checkedAt} < collected ${COLLECTED}`).toBe(true);
      expect(rec.iana.type, name).toBeTruthy();
      expect(rec.iana.manager, name).toBeTruthy();
    }
  });

  it("every registry fact carries a value, an https source and a check date", () => {
    for (const [name, rec] of entries) {
      for (const [key, fact] of Object.entries(rec.registry ?? {})) {
        const where = `${name}.${key}`;
        expect(fact.value?.trim(), where).toBeTruthy();
        expect(fact.sourceUrl, where).toMatch(/^https:\/\//);
        expect(fact.checkedAt, where).toMatch(ISO);
        expect(fact.checkedAt >= COLLECTED, `${where}: checked ${fact.checkedAt} < collected ${COLLECTED}`).toBe(true);
      }
    }
  });

  it("no registry fact cites Wikipedia — it is CC BY-SA, and a derivative work is not a source", () => {
    for (const [name, rec] of entries) {
      for (const [key, fact] of Object.entries(rec.registry ?? {})) {
        expect(fact.sourceUrl, `${name}.${key}`).not.toMatch(/wikipedia|wikimedia|dbpedia/i);
      }
    }
  });

  it("a quote, where given, is not the same string as our summary of it", () => {
    for (const [name, rec] of entries) {
      for (const [key, fact] of Object.entries(rec.registry ?? {})) {
        if (fact.quote) expect(fact.quote, `${name}.${key}`).not.toBe(fact.value);
      }
    }
  });
});

describe("rendered prose", () => {
  const BANNED = /\b(best|popular|perfect|trusted|leading|premier|top choice|most secure|great choice|ideal|must-have|world-class|cutting-edge)\b/i;

  it("carries no evaluation — the registries' marketing does not survive the trip", () => {
    for (const name of Object.keys(TLD_FACTS.tlds)) {
      const text = [operatorBlock(name), eligibilityBlock(name)]
        .filter(Boolean)
        .flatMap((b) => b!.sentences)
        .join(" ");
      expect(text, name).not.toMatch(BANNED);
    }
  });

  it("every rendered block shows at least one source the reader can open", () => {
    for (const name of Object.keys(TLD_FACTS.tlds)) {
      for (const block of [operatorBlock(name), eligibilityBlock(name)]) {
        if (!block) continue;
        expect(block.sources.length, `${name}/${block.title}`).toBeGreaterThan(0);
        for (const src of block.sources) {
          expect(src.url, `${name}/${block.title}`).toMatch(/^https:\/\//);
          expect(src.checkedAt, `${name}/${block.title}`).toMatch(ISO);
        }
      }
    }
  });

  it("each block is 2–4 sentences", () => {
    for (const name of Object.keys(TLD_FACTS.tlds)) {
      for (const block of [operatorBlock(name), eligibilityBlock(name)]) {
        if (!block) continue;
        expect(block.sentences.length, `${name}/${block.title}`).toBeGreaterThanOrEqual(2);
        expect(block.sentences.length, `${name}/${block.title}`).toBeLessThanOrEqual(4);
      }
    }
  });

  it("an extension with no facts renders nothing rather than filler", () => {
    expect(operatorBlock("no-such-tld")).toBeNull();
    expect(eligibilityBlock("no-such-tld")).toBeNull();
    expect(eligibilityQuotes("no-such-tld")).toEqual([]);
  });

  it("names the operator and the delegation year from the record, not from memory", () => {
    const org = operatorBlock("org")!;
    expect(org.sentences[0]).toContain("Public Interest Registry");
    expect(org.sentences[0]).toContain("1985");
    expect(org.sources[0].url).toBe("https://www.iana.org/domains/root/db/org.html");

    const io = operatorBlock("io")!;
    expect(io.sentences[0]).toContain("ccTLD manager");
    expect(io.sentences[0]).toContain("British Indian Ocean Territory");
  });

  it("a shared source page is linked once, without one clause's label standing for all of them", () => {
    const io = eligibilityBlock("io")!;
    expect(io.sources).toHaveLength(1);
    expect(io.sources[0].url).toBe("https://www.nic.io/rules.htm");
    expect(io.sources[0].label).toBe("NIC.IO rules for domain names");
    // The precise clauses survive where they belong: next to the quotes.
    expect(eligibilityQuotes("io").map((q) => q.label)).toEqual([
      "NIC.IO rules for domain names, clause 3.1",
      "NIC.IO rules for domain names, clause 5",
      "NIC.IO rules for domain names, clause 4.1",
    ]);
  });

  it("quotes the registry verbatim and links the page the quote is on", () => {
    const io = eligibilityQuotes("io");
    expect(io[0].quote).toBe("An applicant may reside in any legal jurisdiction.");
    expect(io[0].url).toBe("https://www.nic.io/rules.htm");
  });
});

describe("FAQ", () => {
  it("answers all three questions from the rows on the page", () => {
    const rows = rowsFor("io", [price("Porkbun", 28.12, 51.8), price("Cloudflare", 40, 50)]);
    const faq = priceFaq("io", rows, "verified 13 Sep 2026");
    expect(faq).toHaveLength(3);
    expect(faq[0].a).toContain("$50.00");
    expect(faq[0].a).toContain("Cloudflare");
    expect(faq[0].a).toContain("verified 13 Sep 2026");
    expect(faq[2].a).toContain("2 of the six registrars");
    expect(faq[2].a).toContain("Porkbun");
  });

  it("calls a renewal trap only when the row is flagged as one, and says so plainly otherwise", () => {
    const trapped = priceFaq("shop", rowsFor("shop", [price("Spaceship", 0.9, 31.25), price("Porkbun", 30, 31)]), null);
    expect(trapped[1].a).toContain("Spaceship sells the first year at $0.90 and renews at $31.25");

    const clean = priceFaq("link", rowsFor("link", [price("Porkbun", 7.72, 7.72), price("OVHcloud", 8, 8)]), null);
    expect(clean[1].a).toContain("none of the 2 renews");
  });

  it("reads as English when only one registrar sells the extension, and says one is not a comparison", () => {
    const solo = priceFaq("build", rowsFor("build", [price("Porkbun", 26.26, 26.26)]), "verified 13 Sep 2026");
    expect(solo[0].a).toContain("Porkbun, the one registrar we track for .build, renews it at $26.26 a year.");
    expect(solo[1].a).toContain("One registrar is not a comparison");
    expect(solo[2].a).toContain("One of the six registrars in our price table: Porkbun.");
    // "the 1 registrar", "none of the 1" — the digit-one phrasings, not "1.8×".
    for (const item of solo) expect(item.a).not.toMatch(/\bthe 1 [a-z]|\bof the 1\b(?!\.)/);
  });

  it("asks nothing when there is no price data to answer with", () => {
    expect(priceFaq("io", [], null)).toEqual([]);
  });

  it("agrees with the table: the trap count matches the page's own flags", () => {
    for (const snap of TLD_SNAPSHOT.tlds) {
      const page = buildTldPage(snap, NOW);
      if (!page.faq.length) continue;
      const claimsTrap = !/^Not at /.test(page.faq[1].a);
      expect(claimsTrap, snap.tld).toBe(page.traps.length > 0);
    }
  });
});

describe("the IANA parser", () => {
  // A trimmed copy of the real delegation-record markup: same tags, same order.
  const sample = `
    <main>
    <h1>Delegation Record for .EXAMPLE</h1>
    <p>(Generic top-level domain)</p>
    <h2>Sponsoring Organisation</h2>
    <b>Example Registry Ltd</b><br/>
    1 Example Street<br>Exampleton<br/>
    United States of America (the)<br/>
    <h2>Administrative Contact</h2>
    <b>Someone Else</b><br/>
    <h2>Registry Information</h2>
    <b>URL for registration services:</b> <a href="https://nic.example/">https://nic.example/</a><br/>
    <p>Record last updated 2026-03-10.</p>
    <p>Registration date 2014-01-09.</p>
    </main>`;

  it("reads type, manager, country, registration URL and both dates", () => {
    expect(parseIana(sample)).toEqual({
      type: "Generic top-level domain",
      manager: "Example Registry Ltd",
      managerCountry: "the United States of America",
      registrationServicesUrl: "https://nic.example/",
      delegatedYear: 2014,
      delegatedDate: "2014-01-09",
      recordUpdated: "2026-03-10",
    });
  });

  it("keeps IANA's \"(the)\" marker as a definite article instead of dropping it", () => {
    expect(parseIana(sample).managerCountry).toBe("the United States of America");
    const noArticle = sample.replace("United States of America (the)", "Germany");
    expect(parseIana(noArticle).managerCountry).toBe("Germany");
  });

  it("reads a ccTLD manager block too", () => {
    const cc = sample
      .replace("(Generic top-level domain)", "(Country-code top-level domain)")
      .replace("Sponsoring Organisation", "ccTLD Manager");
    expect(parseIana(cc).type).toBe("Country-code top-level domain");
    expect(parseIana(cc).manager).toBe("Example Registry Ltd");
  });

  it("omits what it cannot find instead of guessing", () => {
    expect(parseIana("<main><h1>Delegation Record for .NOTHING</h1></main>")).toEqual({});
  });
});

describe("helpers", () => {
  it("lists registrars in readable English", () => {
    expect(listOf(["A"])).toBe("A");
    expect(listOf(["A", "B"])).toBe("A and B");
    expect(listOf(["A", "B", "C"])).toBe("A, B and C");
  });

  it("shortens a source URL to its host", () => {
    expect(hostOf("https://www.nic.io/rules.htm")).toBe("nic.io");
    expect(hostOf("not a url")).toBe("not a url");
  });
});
