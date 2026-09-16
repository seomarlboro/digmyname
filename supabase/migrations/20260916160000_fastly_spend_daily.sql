-- Third-signal spend accounting + the daily cap's counter
-- (docs/DIGMYNAME_ARCHITECTURE.md §13, supabase/functions/_shared/third-signal-budget.ts).
--
-- The Fastly Domain Research API is the only metered dependency in the
-- pipeline (10,000 requests/month free, then $0.001 each). Until now its volume
-- existed only as a `console.log` line in ephemeral edge logs, so neither the
-- owner nor the code could answer "how much have we spent today?" — and nothing
-- could stop a launch-day spike.
--
-- This table is the answer to both: one row per UTC day, counts only. It holds
-- NO domain name, no IP, no session — the same shape rule as `cron_heartbeats`.
--
-- Access: service_role only (the edge functions). The public roles get nothing:
-- call volume is business data, and no visitor-facing feature reads it. Query it
-- from the SQL editor, or grant SELECT to anon later if the health monitor
-- should watch it.
--
-- Idempotent so a re-run (Lovable replaying migrations) is harmless.

CREATE TABLE IF NOT EXISTS public.fastly_spend_daily (
  day DATE PRIMARY KEY,
  -- Paid "Status-Precise" requests actually sent.
  calls INTEGER NOT NULL DEFAULT 0,
  -- The same split the `fastly-escalate` log line already computes, so the
  -- invoice can be attributed without reading a single domain name.
  co_me INTEGER NOT NULL DEFAULT 0,
  premium INTEGER NOT NULL DEFAULT 0,
  brand INTEGER NOT NULL DEFAULT 0,
  other INTEGER NOT NULL DEFAULT 0,
  -- Calls the daily cap refused. > 0 means visitors are seeing the honest
  -- degraded state ("Check price" / "Couldn't verify") instead of a verdict.
  blocked INTEGER NOT NULL DEFAULT 0,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.fastly_spend_daily ENABLE ROW LEVEL SECURITY;

-- Supabase's default privileges hand new public tables to anon/authenticated; take them back.
REVOKE ALL ON public.fastly_spend_daily FROM anon, authenticated;
GRANT ALL ON public.fastly_spend_daily TO service_role;

-- One atomic add, so concurrent isolates cannot lose a count. Returns the new
-- running total for today, which the caller can keep instead of re-reading.
CREATE OR REPLACE FUNCTION public.fastly_spend_add(
  n_calls INTEGER,
  n_co_me INTEGER DEFAULT 0,
  n_premium INTEGER DEFAULT 0,
  n_brand INTEGER DEFAULT 0,
  n_other INTEGER DEFAULT 0,
  n_blocked INTEGER DEFAULT 0
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  total INTEGER;
BEGIN
  INSERT INTO public.fastly_spend_daily AS f (day, calls, co_me, premium, brand, other, blocked, updated_at)
  VALUES ((now() AT TIME ZONE 'utc')::date, n_calls, n_co_me, n_premium, n_brand, n_other, n_blocked, now())
  ON CONFLICT (day) DO UPDATE SET
    calls = f.calls + EXCLUDED.calls,
    co_me = f.co_me + EXCLUDED.co_me,
    premium = f.premium + EXCLUDED.premium,
    brand = f.brand + EXCLUDED.brand,
    other = f.other + EXCLUDED.other,
    blocked = f.blocked + EXCLUDED.blocked,
    updated_at = now()
  RETURNING f.calls INTO total;
  RETURN total;
END;
$$;

REVOKE ALL ON FUNCTION public.fastly_spend_add(INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.fastly_spend_add(INTEGER, INTEGER, INTEGER, INTEGER, INTEGER, INTEGER) TO service_role;
