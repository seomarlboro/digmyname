import { describe, it, expect } from "vitest";
import { parseMs, relativeWidths, type BenchmarkRow } from "@/components/BenchmarkChart";

const rows = (...ms: string[]): BenchmarkRow[] => ms.map((m, i) => ({ name: `row ${i}`, note: "", ms: m, us: i % 2 === 0, tag: "t" }));

describe("BenchmarkChart scale", () => {
  it("parses the numeric part of a display string", () => {
    expect(parseMs("~170 ms")).toEqual({ prefix: "~", value: 170, suffix: " ms" });
    expect(parseMs("47 ms")).toEqual({ prefix: "", value: 47, suffix: " ms" });
    expect(parseMs("n/a")).toEqual({ prefix: "", value: null, suffix: "n/a" });
  });

  it("derives bar length from latency: fastest = 100 %, others proportional", () => {
    expect(relativeWidths(rows("~170 ms", "~47 ms", "~70 ms", "~370 ms"))).toEqual([28, 100, 67, 13]);
  });

  it("a faster row always gets the longer bar", () => {
    const [slow, fast] = relativeWidths(rows("~170 ms", "~70 ms"));
    expect(fast).toBeGreaterThan(slow);
  });

  it("rows without a number get an empty bar and don't break the scale", () => {
    expect(relativeWidths(rows("n/a", "~100 ms", "~200 ms"))).toEqual([0, 100, 50]);
    expect(relativeWidths(rows("n/a"))).toEqual([0]);
  });
});
