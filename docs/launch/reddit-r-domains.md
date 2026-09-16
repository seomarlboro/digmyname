# r/domains

**Check the subreddit's current self-promotion rules before posting** — many domain-focused subreddits restrict or ban tool/product posts, and rules change. If self-promotion is banned outright, don't post; consider asking in a weekly "self-promo" thread if one exists instead.

## Suggested title

`Built a free tool that shows renewal price traps across registrars (and admits when it can't verify availability)`

## Suggested body

Not trying to spam — mods, happy to take this down if it's not welcome here.

I got burned by a "$0.99 .xyz" promo that renewed at $34, and separately by a checker that told me a domain was available when it wasn't (a DNS hiccup, read as free). Built DigMyName to fix both:

- 54 pages, one per extension, showing register + renewal price across 6 registrars (Namecheap, Cloudflare, Porkbun, GoDaddy, Spaceship, OVHcloud) side by side — flagged when renewal runs over 1.8× the first year.
- Availability is checked against RDAP + DNS-over-HTTPS (plus a paid third signal for ambiguous names); if they disagree it says **Unverified** instead of guessing.
- Free, no account. There's also a JSON API and an MCP server if that's useful to you.

https://digmyname.com — genuinely curious whether this sub finds the renewal-trap pages useful, and whether there's a registrar or extension I'm missing pricing for.

## Notes for the owner

- Lead with the value (renewal-trap pricing), not the pitch — this sub will smell a pure ad post and remove/downvote it.
- One post only; don't cross-post the identical text to multiple domain subreddits same-day (looks like spam to mods and to Reddit's own spam filters).
- Answer every comment, including skeptical ones — this audience will stress-test the "Unverified" claim, which is the best possible outcome since it's true.
