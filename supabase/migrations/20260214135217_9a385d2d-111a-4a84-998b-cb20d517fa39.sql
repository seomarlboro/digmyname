
-- Drop the overly permissive policy
DROP POLICY "Service role can manage domain cache" ON public.domain_cache;

-- Only service role (edge functions) can insert
CREATE POLICY "Service role can insert domain cache"
  ON public.domain_cache
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Only service role can update
CREATE POLICY "Service role can update domain cache"
  ON public.domain_cache
  FOR UPDATE
  TO service_role
  USING (true);

-- Only service role can delete (cleanup expired)
CREATE POLICY "Service role can delete domain cache"
  ON public.domain_cache
  FOR DELETE
  TO service_role
  USING (true);
