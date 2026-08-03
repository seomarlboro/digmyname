import { useState, useEffect } from "react";
import { Heart, Moon, Sun, LogOut, User } from "lucide-react";
import ShovelLogo from "@/components/ShovelLogo";
import { Link, useLocation } from "react-router-dom";
import { useTheme } from "next-themes";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import AuthDialog from "@/components/AuthDialog";

const Header = () => {
  const { theme, setTheme } = useTheme();
  const { user, signOut } = useAuth();
  const [authOpen, setAuthOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [searchPinned, setSearchPinned] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const onSearchStickyChange = (event: Event) => {
      setSearchPinned(event instanceof CustomEvent && event.detail === true);
    };
    window.addEventListener("search-sticky-change", onSearchStickyChange);
    return () => window.removeEventListener("search-sticky-change", onSearchStickyChange);
  }, []);

  const usesSharedSearchBackdrop = pathname === "/" && searchPinned;

  return (
    <>
      <header
        className={`sticky top-0 z-50 w-full transition-colors duration-300 ${
          scrolled && !usesSharedSearchBackdrop
            ? "border-b border-border/40 bg-background/80 backdrop-blur-xl"
            : "border-b border-transparent bg-transparent"
        }`}
      >
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link to="/" className="flex items-center gap-2.5">
            <ShovelLogo className="h-8 w-8" />
            <span className="logo-text text-foreground">DigMyName</span>
          </Link>

          <nav className="hidden items-center gap-6 md:flex">
            <Link to="/" className="text-base font-medium text-muted-foreground transition-colors hover:text-foreground">
              Domains
            </Link>
            <Link to="/pricing" className="text-base font-medium text-muted-foreground transition-colors hover:text-foreground">
              Pricing
            </Link>
            <Link to="/how-it-works" className="text-base font-medium text-muted-foreground transition-colors hover:text-foreground">
              How it works
            </Link>
            <Link to="/mcp" className="text-base font-medium text-muted-foreground transition-colors hover:text-foreground">
              MCP
            </Link>
          </nav>

          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="icon"
              className="text-muted-foreground"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            >
              <Sun className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <Moon className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
              <span className="sr-only">Toggle theme</span>
            </Button>

            {user ? (
              <>
                <Button variant="ghost" size="icon" className="text-muted-foreground" asChild>
                  <Link to="/favorites" aria-label="Saved domains">
                    <Heart className="h-5 w-5" />
                  </Link>
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-muted-foreground"
                  onClick={signOut}
                  aria-label="Sign out"
                >
                  <LogOut className="h-5 w-5" />
                </Button>
              </>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                className="gap-1.5 text-muted-foreground"
                onClick={() => setAuthOpen(true)}
              >
                <User className="h-4 w-4" />
                Sign in
              </Button>
            )}
          </div>
        </div>
      </header>
      <AuthDialog open={authOpen} onOpenChange={setAuthOpen} />
    </>
  );
};

export default Header;
