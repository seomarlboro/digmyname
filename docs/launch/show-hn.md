# Show HN

Post at: https://news.ycombinator.com/submit (self-post, "Show HN:" prefix required by convention)

## Title (draft, pick one)

- `Show HN: DigMyName – exposes domain renewal traps, admits when it's not sure`
- `Show HN: I priced 54 domain extensions across 6 registrars to expose renewal traps`

First option is shorter (78 chars) and leads with both hooks (traps + honesty). Second leans harder into the pricing angle alone.

## URL to submit

https://digmyname.com

## First comment (post immediately after submitting, from the same account)

Hi HN, I built DigMyName because every domain checker I used either lied about availability under load (a flaky DNS response read as "available", you go to register, it's taken) or hid the renewal price until checkout.

Two things it does differently:

1. Three independent signals — RDAP, DNS-over-HTTPS, and a paid third check reserved for ambiguous names (premium suspects, brand-blocked names, a couple of ccTLDs with no reliable RDAP) — have to agree before it says Available or Taken. When they don't agree, it says **Unverified** instead of guessing, with a retry button, not a fake green checkmark.

2. 54 pages, one per extension, showing what 6 registrars (Namecheap, Cloudflare, Porkbun, GoDaddy, Spaceship, OVHcloud) actually charge to register **and renew** — because a $1 first-year promo that renews at $61 is not a $1 domain. Every price carries its own verification date, and a renewal over 1.8× the first year gets flagged.

It's free, no signup: a no-auth JSON API (60 req/min) and an MCP server (`domain-check-skills-mcp` on npm) so Claude, Cursor or any LLM can check names directly. Frontend is React/Vite, backend is Supabase edge functions (Deno). Everything is MIT-licensed: https://github.com/seomarlboro/digmyname

On speed — I measured it rather than claim it: first answer under 0.5s at p95 for a cold visitor (150 fresh browser sessions each from the US and the EU, method and numbers at /speed). If you find something faster, I'd genuinely like to see it.

Happy to answer questions about the RDAP/DNS-over-HTTPS pipeline, the honesty tradeoffs, or anything else.

## Notes for the owner

- Post Tuesday–Thursday, early US morning (per general HN Show norms) for best visibility — verify current best-practice timing before posting, norms drift.
- Do not vote-manipulate or ask others to upvote; against HN guidelines and it's detectable.
- Be present in the thread for the first few hours to answer questions — this matters more than the title.
- Confirm current HN Show guidelines at https://news.ycombinator.com/showhn.html before posting, in case the format rules changed.
