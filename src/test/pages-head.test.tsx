import { describe, it, expect } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Header from "@/components/Header";
import NotFound from "@/pages/NotFound";

const wrap = (path: string, ui: React.ReactNode) => {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <HelmetProvider>
        <MemoryRouter initialEntries={[path]}>{ui}</MemoryRouter>
      </HelmetProvider>
    </QueryClientProvider>
  );
};

describe("Header", () => {
  it("marks the current page in the primary navigation", () => {
    wrap("/pricing", <Header />);
    const nav = screen.getAllByRole("navigation", { name: "Primary" })[0];
    const current = nav.querySelector('[aria-current="page"]');
    expect(current).not.toBeNull();
    expect(current).toHaveTextContent("Pricing");
    expect(nav.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
  });

  it("treats aliases as the same page", () => {
    wrap("/about", <Header />);
    const nav = screen.getAllByRole("navigation", { name: "Primary" })[0];
    expect(nav.querySelector('[aria-current="page"]')).toHaveTextContent("How it works");
  });

  it("every icon button has an accessible name", () => {
    wrap("/", <Header />);
    for (const btn of screen.getAllByRole("button")) {
      expect(btn).toHaveAccessibleName();
    }
  });
});

describe("NotFound", () => {
  it("keeps the site navigation and asks search engines not to index it", async () => {
    wrap("/no-such-page", <NotFound />);
    expect(screen.getByRole("heading", { level: 1, name: "404" })).toBeInTheDocument();
    expect(screen.getAllByRole("navigation", { name: "Primary" }).length).toBeGreaterThan(0);
    await waitFor(() => {
      expect(document.head.querySelector('meta[name="robots"]')).toHaveAttribute("content", "noindex");
      expect(document.title).toBe("404 — Lost in space | DigMyName");
    });
  });

  it("offers one primary action, not two buttons to the same place", () => {
    wrap("/no-such-page", <NotFound />);
    const main = screen.getByRole("main");
    const ctas = Array.from(main.querySelectorAll('a[href="/"]')).map((l) => l.textContent?.trim());
    expect(ctas).toEqual(["Search a domain"]);
    expect(screen.getByRole("button", { name: /go back/i })).toBeInTheDocument();
  });
});
