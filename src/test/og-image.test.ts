import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The social card is the one surface nobody re-reads, so it drifts silently.
 *
 * It had drifted twice over: the file was 1536×1024 while index.html declared
 * 1200×630, so platforms that trust the declared size cropped it — and the
 * artwork still advertised "AI-powered ideas", a claim removed from every other
 * surface in e0e8062 because the feature is five hard-coded prefixes.
 *
 * Nothing here can read pixels, so it checks the two things that are checkable:
 * the real file matches what the page promises, and every sentence the
 * generator paints onto the card still exists on the site.
 */
const root = (p: string) => resolve(__dirname, "../..", p);
const INDEX = readFileSync(root("index.html"), "utf8");
const GENERATOR = readFileSync(root("scripts/og-image.mjs"), "utf8");
const JPEG = readFileSync(root("public/og-image.jpg"));

/** Width and height off the JPEG's own SOF marker. */
function jpegSize(buf: Buffer): { width: number; height: number } {
  let i = 2; // skip SOI
  while (i < buf.length) {
    if (buf[i] !== 0xff) {
      i++;
      continue;
    }
    const marker = buf[i + 1];
    // SOF0/1/2/9/10 carry the frame header; the rest are skipped by length.
    if ([0xc0, 0xc1, 0xc2, 0xc9, 0xca].includes(marker)) {
      return { height: buf.readUInt16BE(i + 5), width: buf.readUInt16BE(i + 7) };
    }
    if (marker === 0xd8 || marker === 0xd9) {
      i += 2;
      continue;
    }
    i += 2 + buf.readUInt16BE(i + 2);
  }
  throw new Error("no SOF marker: not a JPEG?");
}

const declared = (prop: string) =>
  Number(INDEX.match(new RegExp(`property="${prop}" content="(\\d+)"`))?.[1]);

describe("the social card", () => {
  it("is the size index.html says it is", () => {
    const { width, height } = jpegSize(JPEG);
    expect(width, "og:image:width does not match the file").toBe(declared("og:image:width"));
    expect(height, "og:image:height does not match the file").toBe(declared("og:image:height"));
  });

  it("is 1200×630 — the ratio every platform crops to", () => {
    expect(jpegSize(JPEG)).toEqual({ width: 1200, height: 630 });
  });

  it("stays under the 300 KB most scrapers will fetch", () => {
    expect(JPEG.length).toBeLessThan(300_000);
  });

  it("paints no claim the site does not make", () => {
    // Every string the generator draws, minus the wordmark and the URL.
    const painted = [...GENERATOR.matchAll(/^\s*(?:d\.text\(\([^)]*\),\s*|gradient_text\(\([^)]*\),\s*)"([^"]{8,})"/gm)]
      .map((m) => m[1])
      .concat([...GENERATOR.matchAll(/chips = \[([^\]]+)\]/g)].flatMap((m) =>
        [...m[1].matchAll(/"([^"]+)"/g)].map((c) => c[1]),
      ))
      .filter((s) => s !== "DigMyName" && s !== "digmyname.com");

    expect(painted.length, "the generator's copy could not be read").toBeGreaterThanOrEqual(4);

    // A number or phrase on the card must be defensible from the live copy.
    const site = INDEX + readFileSync(root("src/seo/routes.ts"), "utf8") +
      readFileSync(root("src/components/DomainSearch.tsx"), "utf8");
    const mustAppear = ["World's fastest", "under 0.5 s", "6 registrars"];
    for (const phrase of mustAppear) {
      expect(painted.join(" "), `the card should carry "${phrase}"`).toContain(phrase);
      expect(site, `"${phrase}" is on the card but not on the site`).toContain(phrase);
    }

    // The claim that sent us here in the first place.
    expect(painted.join(" ").toLowerCase()).not.toContain("ai-powered");
    expect(painted.join(" ").toLowerCase()).not.toContain("ai suggestion");
  });
});
