CREATE TABLE public.mcp_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_type TEXT NOT NULL,
  target TEXT,
  referrer TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT INSERT ON public.mcp_events TO anon;
GRANT INSERT ON public.mcp_events TO authenticated;
GRANT ALL ON public.mcp_events TO service_role;

ALTER TABLE public.mcp_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can insert mcp events"
ON public.mcp_events
FOR INSERT
TO anon, authenticated
WITH CHECK (
  event_type IN ('page_view', 'click', 'copy_config')
  AND (target IS NULL OR length(target) <= 64)
  AND (referrer IS NULL OR length(referrer) <= 512)
  AND (user_agent IS NULL OR length(user_agent) <= 512)
);

CREATE INDEX idx_mcp_events_created_at ON public.mcp_events (created_at DESC);
CREATE INDEX idx_mcp_events_type_target ON public.mcp_events (event_type, target);