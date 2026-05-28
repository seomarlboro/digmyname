import { supabase } from "@/integrations/supabase/client";

type EventType = "page_view" | "click" | "copy_config";

export async function trackMcpEvent(eventType: EventType, target?: string) {
  try {
    await supabase.from("mcp_events").insert({
      event_type: eventType,
      target: target ?? null,
      referrer: typeof document !== "undefined" ? document.referrer.slice(0, 512) : null,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 512) : null,
    });
  } catch {
    // silent — analytics never breaks UX
  }
}
