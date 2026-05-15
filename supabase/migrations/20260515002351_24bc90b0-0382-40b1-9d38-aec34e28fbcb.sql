-- Invalidate cached entries that the new premium heuristic would reclassify:
-- short SLDs (≤4 chars) currently cached as "available" without a premium flag.
DELETE FROM public.domain_cache
WHERE available = true
  AND length(split_part(domain, '.', 1)) <= 4;