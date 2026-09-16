import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The hero headline is rendered twice: once in index.html as the pre-hydration
 * shell, once in DomainSearch.tsx after React mounts. They have to agree, and
 * the type has to fit the box it sits in.
 *
 * The bug this guards: the ≥sm line "domain search. Fight us." was
 * whitespace-nowrap at a clamp ceiling of 5.7rem (91 px). At that size the line
 * measures ~1042 px inside a max-w-5xl container that gives it 1016 px, so the
 * last word was cut off — on every viewport tall enough to reach the ceiling
 * (min(7vw, 8vh) ≥ 91 px, i.e. roughly vh ≥ 1140: 1440p and 4K displays, and
 * any tall/rotated monitor). Measured in a real browser at 1600×1400 before the
 * fix: 26 px of overflow, clipped.
 *
 * Two things keep it fixed, and both are checked here: a ceiling with real
 * headroom, and no nowrap — so if the line ever still does not fit (Sora fails
 * to load, browser zoom, a user minimum font size), it wraps instead of being
 * silently cut.
 */
const read = (p: string) => readFileSync(resolve(__dirname, "../..", p), "utf8");
const INDEX = read("index.html");
const COMPONENT = read("src/components/DomainSearch.tsx");

/** 1016 px of usable width ÷ the measured 11.43 px of line per 1 px of font. */
const CEILING_REM_MAX = 5.3;

const heroH1 = (src: string) => {
  const m = src.match(/<h1[^>]*class(?:Name)?="([^"]*text-gradient[^"]*)"/);
  return m?.[1] ?? "";
};

describe("hero headline", () => {
  it("the pre-hydration shell and the React component render the same classes", () => {
    const shell = heroH1(INDEX);
    const component = heroH1(COMPONENT);
    expect(shell, "no hero <h1> found in index.html").toBeTruthy();
    expect(component, "no hero <h1> found in DomainSearch.tsx").toBeTruthy();
    // Drift here is a visible jump the moment React takes over.
    expect(component).toBe(shell);
  });

  it("the type ceiling leaves the long line room inside max-w-5xl", () => {
    for (const [name, src] of [["index.html", INDEX], ["DomainSearch.tsx", COMPONENT]] as const) {
      // The last argument of each clamp(), allowing a nested min()/max() before it.
      const ceilings = [...heroH1(src).matchAll(/clamp\(.*?,\s*([\d.]+)rem\s*\)/g)].map((m) => Number(m[1]));
      // Two: the base size and the sm: override. Both must be capped.
      expect(ceilings.length, `${name}: expected both clamp() ceilings, found ${ceilings.length}`).toBe(2);
      for (const rem of ceilings) {
        expect(rem, `${name}: ${rem}rem overflows the 1024 px container`).toBeLessThanOrEqual(CEILING_REM_MAX);
      }
    }
  });

  it("the long line is allowed to wrap rather than be clipped", () => {
    for (const [name, src] of [["index.html", INDEX], ["DomainSearch.tsx", COMPONENT]] as const) {
      const line = src.match(/<span[^>]*class(?:Name)?="([^"]*)"[^>]*>domain search\. Fight us\.<\/span>/);
      expect(line, `${name}: the desktop headline line is missing`).toBeTruthy();
      expect(line![1], `${name}: nowrap on the long line clips it instead of wrapping`).not.toContain("nowrap");
    }
  });

  it("still splits into three short lines below sm, where the long line cannot fit", () => {
    for (const src of [INDEX, COMPONENT]) {
      for (const part of ["World's fastest", "domain search.", "Fight us."]) {
        expect(src).toContain(`sm:hidden">${part}<`);
      }
    }
  });
});
