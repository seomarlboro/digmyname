// Parser tests for the free registry authority on .co / .me / .io.
// Every fixture is a real answer captured from the registry on 2026-09-16.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { interpretWhois, WHOIS_SERVERS, whoisServerFor } from "./whois.ts";

const CO_FREE = `The queried object does not exist: DOMAIN NOT FOUND
>>> Last update of WHOIS database: 2026-09-16T14:57:45.0Z <<<`;

const CO_TAKEN = `Domain Name: GOOGLE.CO
Registry Domain ID: D157997-CNIC
Registrar WHOIS Server: whois.markmonitor.com
Registrar URL: http://www.markmonitor.com
Updated Date: 2026-01-28T10:37:02.0Z
Creation Date: 2010-02-25T01:04:59.0Z
Registry Expiry Date: 2027-02-24T23:59:59.0Z`;

const ME_FREE = `Domain not found.
>>> Last update of WHOIS database: 2026-09-16T14:57:46Z <<<
Terms of Use: Access to WHOIS information is provided to assist persons in determining the contents of a domain name registration record in the registry database. The data in this record is provided by Identity Digital or the Registry Operator for informational purposes only, and accuracy is not guaranteed.`;

const ME_TAKEN = `This domain is protected by the Registry Lock service. If you are the registrant and wish to take action on this lock, please contact your registrar.
Domain Name: google.me
Registry Domain ID: REDACTED
Registrar WHOIS Server: whois.markmonitor.com
Updated Date: 2026-08-12T10:02:24Z`;

const IO_FREE = `Domain not found.
>>> Last update of WHOIS database: 2026-09-16T14:57:49Z <<<`;

// GMO retired port-43 WHOIS for .shop on 2026-05-01. The server still answers —
// with a notice and no data. It must never read as either verdict.
const SHOP_RETIRED = `Notice: Effective May 1, 2026, the WHOIS service has been retired in accordance with ICANN's RDAP transition policy. All registration data queries are now served via RDAP. The Registration Data Access Protocol (RDAP) base URL is: https://rdap.gmoregistry.net/rdap/`;

Deno.test("interpretWhois: a registry 'not found' is free", () => {
  assertEquals(interpretWhois(CO_FREE), "free");
  assertEquals(interpretWhois(ME_FREE), "free");
  assertEquals(interpretWhois(IO_FREE), "free");
});

Deno.test("interpretWhois: a registration record is taken", () => {
  assertEquals(interpretWhois(CO_TAKEN), "taken");
  assertEquals(interpretWhois(ME_TAKEN), "taken");
});

Deno.test("interpretWhois: a retired WHOIS service answers nothing, not 'free'", () => {
  assertEquals(interpretWhois(SHOP_RETIRED), "unknown");
});

Deno.test("interpretWhois: rate limits and errors are never read as a verdict", () => {
  for (const body of [
    "WHOIS LIMIT EXCEEDED - SEE WWW.PIR.ORG/WHOIS FOR DETAILS",
    "Query rate limit exceeded. Try again later.",
    "Error processing your query: invalid query",
    "Access denied",
    "",
    "   ",
  ]) {
    assertEquals(interpretWhois(body), "unknown", `should be unknown: ${body.slice(0, 40)}`);
  }
});

Deno.test("interpretWhois: a record wins over 'not found' inside boilerplate", () => {
  // Some registries append a legal notice that contains the words we look for.
  const mixed = `${CO_TAKEN}\n\nNOTICE: if the object does not exist the query returns nothing.`;
  assertEquals(interpretWhois(mixed), "taken");
});

Deno.test("interpretWhois: a bare legal notice with no record and no 'not found' is unknown", () => {
  assertEquals(
    interpretWhois("Terms of Use: Access to WHOIS information is provided to assist persons ..."),
    "unknown",
  );
});

Deno.test("whoisServerFor: only the zones where WHOIS replaces a paid call", () => {
  assertEquals(whoisServerFor("acmeforge.co"), "whois.registry.co");
  assertEquals(whoisServerFor("ACMEFORGE.ME"), "whois.nic.me");
  assertEquals(whoisServerFor("acmeforge.io"), "whois.nic.io");
  // .shop's WHOIS is retired and the Identity Digital gTLDs publish none.
  assertEquals(whoisServerFor("acmeforge.shop"), undefined);
  assertEquals(whoisServerFor("acmeforge.agency"), undefined);
  assertEquals(whoisServerFor("acmeforge.com"), undefined);
  assertEquals(Object.keys(WHOIS_SERVERS).length, 3);
});
