import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { lazy, Suspense } from "react";
import { AuthProvider } from "@/hooks/useAuth";
import Footer from "@/components/Footer";
import Index from "./pages/Index";

const Pricing = lazy(() => import("./pages/Pricing"));
const Favorites = lazy(() => import("./pages/Favorites"));
const HowItWorks = lazy(() => import("./pages/HowItWorks"));
const Mcp = lazy(() => import("./pages/Mcp"));
const Speed = lazy(() => import("./pages/Speed"));
const Api = lazy(() => import("./pages/Api"));
const Privacy = lazy(() => import("./pages/Privacy"));
const Terms = lazy(() => import("./pages/Terms"));
const NotFound = lazy(() => import("./pages/NotFound"));

const RouteFallback = () => (
  <div className="min-h-screen bg-background" aria-busy="true" />
);

const queryClient = new QueryClient();

// One toast system (Radix, via useToast). Sonner was mounted alongside it but
// never called — it only cost bundle bytes on every page.
const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
            <div className="relative min-h-screen bg-background">
              <Suspense fallback={<RouteFallback />}>
                <Routes>
                  <Route path="/" element={<Index />} />
                  <Route path="/pricing" element={<Pricing />} />
                  <Route path="/favorites" element={<Favorites />} />
                  <Route path="/how-it-works" element={<HowItWorks />} />
                  <Route path="/about" element={<HowItWorks />} />
                  <Route path="/mcp" element={<Mcp />} />
                  <Route path="/skill" element={<Mcp />} />
                  <Route path="/gpt" element={<Mcp />} />
                  <Route path="/speed" element={<Speed />} />
                  <Route path="/api" element={<Api />} />
                  <Route path="/privacy" element={<Privacy />} />
                  <Route path="/terms" element={<Terms />} />
                  {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE — and to src/seo/routes.ts */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>

              <Footer />
            </div>

          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
