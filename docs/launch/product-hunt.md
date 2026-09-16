# Product Hunt

Submit at: https://www.producthunt.com/posts/new

## Title

`DigMyName`

## Tagline (≤60 chars)

`Domain search with renewal traps exposed, no guessing`

(55 chars)

## Description

DigMyName checks domain availability across three independent signals — RDAP, DNS-over-HTTPS, and a paid third check for ambiguous names — and says **Unverified** instead of guessing when they disagree. Compare real registration *and renewal* prices across 6 registrars on 54 extension pages, so a cheap first year doesn't hide an expensive second one. Free JSON API and MCP server included, no signup, no API key.

## First comment (post as the maker, right after the launch goes live)

Hey PH! I'm Kir, built DigMyName solo.

What made me build it: every "is this domain free?" tool I tried would occasionally just be wrong — a flaky DNS response read as available, then you go to register and it's taken. And the "$0.99 domain!" banners never mention the renewal is $60.

So DigMyName cross-checks RDAP + DNS-over-HTTPS (plus a third signal for ambiguous cases) and only commits to Available/Taken when they agree — otherwise it says Unverified, honestly. And every one of the 54 extension pages shows register **and** renew price across 6 registrars, so the trap is visible before you buy, not after.

It's free — no account, no API key. There's also a no-auth JSON API and an MCP server (`domain-check-skills-mcp`) if you want it inside Claude, Cursor, or your own agent.

Would love feedback — especially if you catch it being wrong about something. That's the one thing it's not allowed to be.

## Assets needed (owner to prepare)

- Thumbnail / gallery images: product screenshots (search in progress, a taken-domain result, a /tld/<tld> renewal-trap table). No mockup text that isn't real — PH reviewers and users both call this out.
- Optional gif/video: see [demo-script.md](./demo-script.md).

## Notes for the owner

- Launch at 12:01 AM PT for a full 24h voting window (standard PH advice).
- Topics/categories to select: likely "Developer Tools" and "Artificial Intelligence" (for the MCP angle) — confirm current category list when submitting, PH changes these periodically.
- Do not ask for upvotes in a way that violates PH's guidelines (no vote incentives, no "upvote for upvote").
- Reply to every comment in the first few hours — maker responsiveness is a real ranking factor.
