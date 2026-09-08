import { describe, it, expect } from "vitest";
import { applyFastVerdict, TLD_LIST, type DomainResult } from "@/lib/domainData";

const tld = TLD_LIST[0]; // com
const row = (over: Partial<DomainResult>): DomainResult => ({
  domain: "example.com",
  tld,
  available: false,
  checking: true,
  ...over,
});

// Live regression (2026-09-08): a /fast chunk landed 0.4-1.3 s AFTER the
// authoritative batch for the same ten names and its NXDOMAIN answer
// (available:true + uncertain:true) overwrote ten confirmed available:true
// cards into "Couldn't verify — sources disagreed". The fast probe is a
// pre-check and must never override a settled row.
describe("applyFastVerdict — the fast DNS probe is a pre-check only", () => {
  it("never touches a row that already carries an authoritative verdict", () => {
    const settled = row({ checking: false, available: true, gdPrice: 5.19, uncertain: false });
    expect(applyFastVerdict(settled, { available: true, uncertain: true })).toBe(settled);
    expect(applyFastVerdict(settled, { available: false, uncertain: false })).toBe(settled);
  });

  it("never touches a row hydrated from the session cache", () => {
    const hydrated = row({ checking: false, provisional: false, available: true });
    expect(applyFastVerdict(hydrated, { available: true, uncertain: true })).toBe(hydrated);
  });

  it("never touches a row the backend called uncertain", () => {
    const uncertain = row({ checking: false, available: false, uncertain: true });
    expect(applyFastVerdict(uncertain, { available: false, uncertain: false })).toBe(uncertain);
  });

  it("keeps a Checking row in Checking on an uncertain (NXDOMAIN) fast answer", () => {
    const checking = row({ checking: true });
    const out = applyFastVerdict(checking, { available: true, uncertain: true });
    expect(out).toBe(checking);
    expect(out.checking).toBe(true);
    expect(out.uncertain).toBeUndefined();
  });

  it("flips a Checking row to a provisional taken on a confident fast answer", () => {
    const out = applyFastVerdict(row({ checking: true }), { available: false, uncertain: false });
    expect(out).toMatchObject({ available: false, uncertain: false, checking: false, provisional: true });
  });

  it("does not re-apply to a row that already left Checking provisionally", () => {
    const provisional = row({ checking: false, provisional: true, available: false });
    expect(applyFastVerdict(provisional, { available: true, uncertain: true })).toBe(provisional);
  });
});
