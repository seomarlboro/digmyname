import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { earlyHeadline, isPremiumSuspectSld, sldOf } from "@/lib/searchLanes";

describe("searchLanes", () => {
  it("a label of 1–5 characters is a premium suspect (mirrors the pipeline)", () => {
    expect(isPremiumSuspectSld("acme")).toBe(true);
    expect(isPremiumSuspectSld("acmef")).toBe(true);
    expect(isPremiumSuspectSld("acmefo")).toBe(false);
    expect(sldOf("acmeforge.com")).toBe("acmeforge");
    expect(sldOf("acmeforge")).toBe("acmeforge");
  });

  it("the headline goes early only when it cannot trigger the paid third signal", () => {
    expect(earlyHeadline(["acmeforge.com", "acmeforge.io"])).toBe("acmeforge.com");
    expect(earlyHeadline(["acme.com", "acme.io"])).toBeNull();
    expect(earlyHeadline([])).toBeNull();
  });
});

/**
 * The regression that mattered on prod: the stopwatch used to be React state
 * updated every animation frame, which re-rendered the 53-card list 60× a
 * second and pushed the fast lane from +80 ms to ~+970 ms. This drives the real
 * component with fake timers and asserts the lanes leave on schedule.
 */
const invoke = vi.fn(async (..._args: unknown[]) => ({ data: { results: [] }, error: null }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      insert: vi.fn().mockResolvedValue({ data: null, error: null }),
      select: () => ({ eq: () => ({ order: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }) }),
    }),
    functions: { invoke: (...args: unknown[]) => invoke(...args) },
    auth: {
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      getSession: async () => ({ data: { session: null } }),
    },
  },
}));

describe("DomainSearch lanes", () => {
  const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(JSON.stringify({ results: [] }), { status: 200 }));

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv("VITE_SUPABASE_URL", "https://example.supabase.co");
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockClear();
    invoke.mockClear();
    Object.defineProperty(window, "IntersectionObserver", { writable: true, value: class { observe() {} disconnect() {} } });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("fires the DNS pre-check ~80 ms after the last keystroke and the headline .com check with it", async () => {
    const { default: DomainSearch } = await import("@/components/DomainSearch");
    const { DEFAULT_FILTERS } = await import("@/lib/resultFilters");
    const qc = new QueryClient();
    const { container } = render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <DomainSearch selectedTlds={new Set()} filters={DEFAULT_FILTERS} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const input = container.querySelector('input[aria-label="Search domain name"]') as HTMLInputElement;
    // React's onChange listens to the native input event via the value tracker.
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => {
      setter.call(input, "acmeforge");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });

    const fastCalls = () => fetchMock.mock.calls.filter((c) => String(c[0]).includes("/public-api/fast?")).length;
    const authCalls = () => invoke.mock.calls.filter((c) => c[0] === "check-domains").length;

    // Before the fast debounce: nothing on the wire.
    await act(async () => { vi.advanceTimersByTime(60); });
    expect(fastCalls()).toBe(0);
    expect(authCalls()).toBe(0);

    // At +80 ms: the DNS pre-check chunks AND the early .com authoritative check.
    await act(async () => { vi.advanceTimersByTime(40); });
    expect(fastCalls()).toBeGreaterThan(0);
    expect(authCalls()).toBe(1);
    expect((invoke.mock.calls[0] as unknown[])[1]).toMatchObject({ body: { domains: ["acmeforge.com"] } });

    // The rest of the authoritative wave waits for the 250 ms lane.
    await act(async () => { vi.advanceTimersByTime(100); });
    expect(authCalls()).toBe(1);
    await act(async () => { vi.advanceTimersByTime(100); });
    expect(authCalls()).toBeGreaterThan(1);
  });

  it("a short (premium-suspect) label waits for the authoritative lane", async () => {
    const { default: DomainSearch } = await import("@/components/DomainSearch");
    const { DEFAULT_FILTERS } = await import("@/lib/resultFilters");
    const qc = new QueryClient();
    const { container } = render(
      <QueryClientProvider client={qc}>
        <MemoryRouter>
          <DomainSearch selectedTlds={new Set()} filters={DEFAULT_FILTERS} />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    const input = container.querySelector('input[aria-label="Search domain name"]') as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    await act(async () => {
      setter.call(input, "acme");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => { vi.advanceTimersByTime(120); });
    expect(invoke.mock.calls.filter((c) => c[0] === "check-domains")).toHaveLength(0);
    await act(async () => { vi.advanceTimersByTime(200); });
    expect(invoke.mock.calls.filter((c) => c[0] === "check-domains").length).toBeGreaterThan(0);
  });
});
