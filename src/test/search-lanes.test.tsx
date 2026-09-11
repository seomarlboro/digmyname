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
  // Registry / DoH calls of the browser lane answer 500 (→ "unknown") unless a
  // test routes them, so the lane cannot decide anything by accident here.
  const isRegistry = (url: string) => /rdap\.|dns-query|dns\.google/.test(url);
  const fetchMock = vi.fn(async (input: RequestInfo | URL, _init?: RequestInit) =>
    isRegistry(String(input)) ? new Response("", { status: 500 }) : new Response(JSON.stringify({ results: [] }), { status: 200 }),
  );

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

  it("a late answer for the previous prefix never stops the new query's stopwatch", async () => {
    // Every authoritative call is held until released, so the test controls
    // which answer lands when. The first keystroke's headline answer arrives
    // only after the user has typed more; the new query's clock must keep running.
    type Resolver = (v: { data: { results: { domain: string; available: boolean }[] }; error: null }) => void;
    const pending: Resolver[] = [];
    invoke.mockImplementation(() => new Promise((resolve) => { pending.push(resolve as Resolver); }));
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
    const type = async (text: string) => {
      await act(async () => {
        setter.call(input, text);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    };
    await type("acmeforge");
    await act(async () => { vi.advanceTimersByTime(100); });
    expect(pending).toHaveLength(1); // headline acmeforge.com

    await type("acmeforgex");
    // Stale answer lands 20 ms after the new keystroke — inside the old 80 ms window.
    await act(async () => {
      vi.advanceTimersByTime(20);
      pending[0]({ data: { results: [{ domain: "acmeforge.com", available: true }] }, error: null });
      await Promise.resolve();
    });
    // The new run starts at +80 ms and issues its own headline check.
    await act(async () => { vi.advanceTimersByTime(80); });
    expect(pending.length).toBeGreaterThanOrEqual(2);
    const pill = () => container.querySelector('a[title^="How we measure"]');
    expect(pill()).not.toBeNull();
    expect(pill()!.getAttribute("aria-live")).toBe("off"); // still running: the stale answer was ignored

    // The new query's own headline answer stops it.
    await act(async () => {
      pending[1]({ data: { results: [{ domain: "acmeforgex.com", available: true }] }, error: null });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(pill()!.getAttribute("aria-live")).toBe("polite");
    invoke.mockImplementation(async (..._args: unknown[]) => ({ data: { results: [] }, error: null }));
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

  it("the browser lane answers the headline card from the registry before the server does", async () => {
    // Server lane held forever; the registry (RDAP 404) and DoH (NXDOMAIN) answer at once.
    invoke.mockImplementation(() => new Promise(() => {}));
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("rdap.verisign.com/com/v1/domain/acmeforge.com")) return new Response("", { status: 404 });
      if (url.includes("dns-query") || url.includes("dns.google")) return new Response(JSON.stringify({ Status: 3, Answer: [] }), { status: 200 });
      if (isRegistry(url)) return new Response("", { status: 500 });
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    });
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
      setter.call(input, "acmeforge");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const pill = () => container.querySelector('a[title^="How we measure"]');
    const headlineCard = () => [...container.querySelectorAll("h3")].find((h) => h.textContent === "acmeforge.com")!.closest(".card-hover")!;

    // At +80 ms the registry query leaves with the fast lane.
    await act(async () => { vi.advanceTimersByTime(80); });
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("rdap.verisign.com/com/v1/domain/acmeforge.com"))).toBe(true);
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("dns-query?name=acmeforge.com"))).toBe(true);

    // Its answer lands: the card leaves Checking and the stopwatch stops — the server has not answered.
    await act(async () => { for (let i = 0; i < 6; i++) await Promise.resolve(); });
    expect(headlineCard().querySelector(".animate-spin")).toBeNull();
    expect(pill()!.getAttribute("aria-live")).toBe("polite");
    expect(invoke.mock.calls.length).toBeGreaterThan(0); // the server lane was still asked, as the authority
  });

  it("a registry answer the browser cannot trust leaves the card checking and the clock running", async () => {
    invoke.mockImplementation(() => new Promise(() => {}));
    // RDAP 404 for a premium-suspect label: the browser may not call it available.
    fetchMock.mockImplementation(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("rdap.verisign.com")) return new Response("", { status: 404 });
      if (url.includes("dns-query") || url.includes("dns.google")) return new Response(JSON.stringify({ Status: 3, Answer: [] }), { status: 200 });
      if (isRegistry(url)) return new Response("", { status: 500 });
      return new Response(JSON.stringify({ results: [] }), { status: 200 });
    });
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
    await act(async () => { vi.advanceTimersByTime(80); for (let i = 0; i < 6; i++) await Promise.resolve(); });
    // The browser did ask (a "taken" would have been fine to show) …
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("rdap.verisign.com/com/v1/domain/acme.com"))).toBe(true);
    // … but an "available" for a premium suspect is not its call: still checking, clock still running.
    const card = [...container.querySelectorAll("h3")].find((h) => h.textContent === "acme.com")!.closest(".card-hover")!;
    expect(card.querySelector(".animate-spin")).not.toBeNull();
    expect(container.querySelector('a[title^="How we measure"]')!.getAttribute("aria-live")).toBe("off");
  });

  it("a typed TLD outside the top list is still the headline: server lane and browser lane both leave at +80 ms", async () => {
    invoke.mockImplementation(() => new Promise(() => {}));
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
      setter.call(input, "acmeforge.tech");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => { vi.advanceTimersByTime(80); });
    expect((invoke.mock.calls[0] as unknown[])[1]).toMatchObject({ body: { domains: ["acmeforge.tech"] } });
    expect(fetchMock.mock.calls.some((c) => String(c[0]).includes("rdap.radix.host/rdap/domain/acmeforge.tech"))).toBe(true);
  });

  it("after the wave settles, the typed card gets one premium-verify request; suspects and taken names don't", async () => {
    invoke.mockImplementation(async (_name: unknown, options: unknown) => {
      const body = (options as { body: { domains: string[]; verifyPremium?: boolean } }).body;
      return { data: { results: body.domains.map((d) => ({ domain: d, available: !d.startsWith("takenname") })) }, error: null };
    });
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
    const type = async (text: string) => {
      await act(async () => {
        setter.call(input, text);
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
    };
    const verifyCalls = () => invoke.mock.calls.filter((c) => (c[1] as { body: { verifyPremium?: boolean } }).body.verifyPremium === true);
    const settle = async () => {
      // fast debounce, authoritative wave, then the verify delay — flushing promises between timer hops
      for (const step of [80, 170, 50, 800, 50]) await act(async () => { vi.advanceTimersByTime(step); for (let i = 0; i < 8; i++) await Promise.resolve(); });
    };

    await type("reputation");
    await settle();
    expect(verifyCalls()).toHaveLength(1);
    expect((verifyCalls()[0][1] as { body: unknown }).body).toEqual({ domains: ["reputation.com"], verifyPremium: true });

    invoke.mockClear();
    await type("acme"); // a premium suspect: the wave already escalated it, no second ask
    await settle();
    expect(verifyCalls()).toHaveLength(0);

    invoke.mockClear();
    await type("takenname"); // taken: nothing to price
    await settle();
    expect(verifyCalls()).toHaveLength(0);
  });
});
