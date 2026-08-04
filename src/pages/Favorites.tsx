import { Helmet } from "react-helmet-async";
import { Heart, Trash2 } from "lucide-react";
import Header from "@/components/Header";
import { useAuth } from "@/hooks/useAuth";
import { useFavorites } from "@/hooks/useFavorites";
import { Button } from "@/components/ui/button";

const Favorites = () => {
  const { user } = useAuth();
  const { favorites, toggleFavorite } = useFavorites();

  return (
    <div className="min-h-screen bg-transparent">
      <Helmet>
        <title>Saved Domains — DigMyName</title>
        <meta name="description" content="Your saved domain shortlist on DigMyName." />
        <link rel="canonical" href="https://digmyname.com/favorites" />
        <meta name="robots" content="noindex" />
      </Helmet>
      <Header />
      <main className="container mx-auto max-w-[968px] xl:max-w-[1200px] 2xl:max-w-[1320px] px-4 py-12">
        <div className="mb-8 flex items-center gap-3">
          <div className="icon-frame icon-frame-accent">
            <Heart />
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-foreground">Saved Domains</h1>
        </div>

        {!user && (
          <p className="text-muted-foreground">Sign in to see your saved domains.</p>
        )}

        {user && favorites.length === 0 && (
          <p className="text-muted-foreground">No saved domains yet. Use the heart icon on search results to save domains.</p>
        )}

        {user && favorites.length > 0 && (
          <div className="rounded-xl border border-border overflow-hidden">
            {favorites.map((domain) => (
              <div
                key={domain}
                className="flex items-center justify-between border-b border-border px-6 py-4 last:border-b-0 transition-colors hover:bg-muted/10"
              >
                <span className="text-lg font-semibold text-foreground">{domain}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="text-destructive hover:text-destructive"
                  onClick={() => toggleFavorite(domain)}
                  aria-label={`Remove ${domain} from favorites`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
};

export default Favorites;
