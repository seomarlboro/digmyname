/// <reference types="node" />
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// Read from disk: Vitest's CSS handling does not hand `?raw` stylesheet imports through as text.
const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");

/** First declaration of a custom property = the light (:root) theme. */
const lightToken = (name: string) => {
  const m = new RegExp(`^\\s*--${name}:\\s*([^;]+);`, "m").exec(css);
  if (!m) throw new Error(`--${name} not found`);
  return m[1].trim();
};

describe("light theme mint text", () => {
  // Owner decision 2026-09-16: domain extensions use the same green as the "available" count.
  // The 4.5:1 dark green was rejected; this is ~2.7:1 on white — a known, accepted contrast exception.
  it("is the --available green, not a separately invented shade", () => {
    expect(lightToken("mint-text")).toBe(lightToken("available"));
  });
});
