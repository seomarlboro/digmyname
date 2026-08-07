import { Badge } from "@/components/ui/badge";
import WaitlistForm from "@/components/WaitlistForm";

/**
 * Shared "Paid tier waitlist" block used on /api and /mcp.
 * The copy is identical on both pages, so this takes no props —
 * if the pages ever genuinely diverge, add a prop then, not before.
 */
export const WaitlistSection = () => (
  <section
    id="waitlist"
    className="surface-card relative mt-14 scroll-mt-24 overflow-hidden p-8 md:p-10"
  >
    <div className="relative grid items-center gap-8 md:grid-cols-2 md:gap-10">
      <div>
        <Badge variant="secondary" className="mb-3">
          Coming soon
        </Badge>
        <h2 className="section-title">Paid tier waitlist</h2>
        <p className="section-lede max-w-2xl">
          Free tier is generous (60 req/min, no key). Need more? Get API keys, higher limits,
          webhooks and an SLA.
        </p>
      </div>
      <div>
        <WaitlistForm />
      </div>
    </div>
  </section>
);

export default WaitlistSection;
