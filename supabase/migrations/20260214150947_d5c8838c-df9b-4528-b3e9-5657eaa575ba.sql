
-- Registrar pricing data
CREATE TABLE public.registrar_prices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  registrar TEXT NOT NULL,
  tld TEXT NOT NULL,
  reg_price NUMERIC(10,2) NOT NULL,
  renew_price NUMERIC(10,2) NOT NULL,
  transfer_price NUMERIC(10,2),
  icann_fee NUMERIC(10,2) DEFAULT 0,
  promo_code TEXT,
  affiliate_url TEXT,
  whois_privacy BOOLEAN DEFAULT true,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(registrar, tld)
);

-- Public read access
ALTER TABLE public.registrar_prices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read registrar prices"
  ON public.registrar_prices
  FOR SELECT
  USING (true);

CREATE POLICY "Service role can manage registrar prices"
  ON public.registrar_prices
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Index for fast TLD lookups
CREATE INDEX idx_registrar_prices_tld ON public.registrar_prices(tld);
CREATE INDEX idx_registrar_prices_registrar ON public.registrar_prices(registrar);
