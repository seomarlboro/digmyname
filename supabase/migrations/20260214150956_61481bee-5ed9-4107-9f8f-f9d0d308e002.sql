
-- Replace overly permissive ALL policy with service-role-only write policies
DROP POLICY "Service role can manage registrar prices" ON public.registrar_prices;

-- Only service role (via edge functions) can insert/update/delete
CREATE POLICY "Service role can insert registrar prices"
  ON public.registrar_prices
  FOR INSERT
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "Service role can update registrar prices"
  ON public.registrar_prices
  FOR UPDATE
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role can delete registrar prices"
  ON public.registrar_prices
  FOR DELETE
  USING (auth.role() = 'service_role');
