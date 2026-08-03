DELETE FROM public.registrar_prices WHERE tld IN ('code', 'startup');
DELETE FROM public.domain_cache WHERE domain LIKE '%.code' OR domain LIKE '%.startup';