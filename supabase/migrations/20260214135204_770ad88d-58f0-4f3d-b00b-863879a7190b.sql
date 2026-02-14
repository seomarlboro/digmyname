
-- Cache table for domain availability results
CREATE TABLE public.domain_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  domain TEXT NOT NULL UNIQUE,
  available BOOLEAN NOT NULL,
  checked_via TEXT NOT NULL DEFAULT 'dns', -- 'dns' or 'rdap'
  rdap_data JSONB,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '6 hours')
);

-- Index for fast lookups
CREATE INDEX idx_domain_cache_domain ON public.domain_cache (domain);
CREATE INDEX idx_domain_cache_expires ON public.domain_cache (expires_at);

-- Enable RLS (public read, no auth needed for domain checks)
ALTER TABLE public.domain_cache ENABLE ROW LEVEL SECURITY;

-- Allow anyone to read cached results
CREATE POLICY "Anyone can read domain cache"
  ON public.domain_cache
  FOR SELECT
  USING (true);

-- Allow service role to insert/update (edge functions use service role)
CREATE POLICY "Service role can manage domain cache"
  ON public.domain_cache
  FOR ALL
  USING (true)
  WITH CHECK (true);
