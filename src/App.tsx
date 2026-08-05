import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
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
const NotFound = lazy(() => import("./pages/NotFound"));

const RouteFallback = () => (
  <div className="min-h-screen bg-background" aria-busy="true" />
);

const queryClient = new QueryClient();


const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
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
                  {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
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
