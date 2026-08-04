import { useState } from "react";
import { Mail, Check, Loader2 } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { trackMcpEvent } from "@/lib/trackMcpEvent";

const emailSchema = z.string().trim().email("Enter a valid email").max(255);

const WaitlistForm = () => {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setError(parsed.error.errors[0].message);
      return;
    }

    setStatus("loading");
    const referrer = typeof document !== "undefined" ? document.referrer : "";
    const source = referrer.includes("github.com") ? "github_readme" : "mcp_page";

    const { error: insertError } = await supabase.from("waitlist").insert({
      email: parsed.data,
      source,
      user_agent: typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 512) : null,
    });

    if (insertError) {
      if (insertError.code === "23505") {
        setStatus("success");
      } else {
        setStatus("error");
        setError("Something went wrong. Try again.");
      }
      return;
    }

    trackMcpEvent("click", "waitlist_signup");
    setStatus("success");
    setEmail("");
  };

  if (status === "success") {
    return (
      <div className="flex items-center justify-center gap-2 p-6 rounded-xl border border-border text-foreground">
        <Check className="w-5 h-5" />
        <span className="font-medium">You're on the list. We'll email when paid tier launches.</span>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            type="email"
            placeholder="you@company.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={status === "loading"}
            className="pl-10 h-12"
            required
            maxLength={255}
          />
        </div>
        <Button type="submit" variant="gradient" size="lg" disabled={status === "loading"} className="gap-2">
          {status === "loading" ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Join waitlist
        </Button>
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}

    </form>
  );
};

export default WaitlistForm;
