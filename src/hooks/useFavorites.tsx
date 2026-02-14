import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./useAuth";

export const useFavorites = () => {
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const { data: favorites = [] } = useQuery({
    queryKey: ["favorites", user?.id],
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("domain_favorites")
        .select("domain")
        .eq("user_id", user.id);
      if (error) throw error;
      return data.map((f) => f.domain);
    },
    enabled: !!user,
  });

  const addFavorite = useMutation({
    mutationFn: async (domain: string) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("domain_favorites")
        .insert({ user_id: user.id, domain });
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["favorites"] }),
  });

  const removeFavorite = useMutation({
    mutationFn: async (domain: string) => {
      if (!user) throw new Error("Not authenticated");
      const { error } = await supabase
        .from("domain_favorites")
        .delete()
        .eq("user_id", user.id)
        .eq("domain", domain);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["favorites"] }),
  });

  const isFavorite = (domain: string) => favorites.includes(domain);

  const toggleFavorite = (domain: string) => {
    if (isFavorite(domain)) {
      removeFavorite.mutate(domain);
    } else {
      addFavorite.mutate(domain);
    }
  };

  return { favorites, isFavorite, toggleFavorite };
};
