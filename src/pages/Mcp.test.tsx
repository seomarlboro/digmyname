import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import Mcp from "./Mcp";

const renderPage = () => {
  const qc = new QueryClient();
  return render(
    <QueryClientProvider client={qc}>
      <HelmetProvider>
        <MemoryRouter initialEntries={["/mcp"]}>
          <Mcp />
        </MemoryRouter>
      </HelmetProvider>
    </QueryClientProvider>
  );
};

describe("Mcp page", () => {
  it("renders hero heading", () => {
    renderPage();
    expect(screen.getByRole("heading", { level: 1, name: /Domain availability/i })).toBeInTheDocument();
  });

  it("links to GitHub repo", () => {
    renderPage();
    const links = screen.getAllByRole("link", { name: /View on GitHub|Star on GitHub/i });
    expect(links.length).toBeGreaterThan(0);
    links.forEach((l) => {
      expect(l).toHaveAttribute("href", "https://github.com/seomarlboro/domain-check-skills");
    });
  });

  it("shows MCP config with correct package name", () => {
    renderPage();
    expect(screen.getAllByText(/domain-check-skills-mcp/).length).toBeGreaterThan(0);
  });

  it("shows all three tools", () => {
    renderPage();
    expect(screen.getByText("check_domain")).toBeInTheDocument();
    expect(screen.getByText("search_domains")).toBeInTheDocument();
    expect(screen.getByText("get_registrars")).toBeInTheDocument();
  });
});

