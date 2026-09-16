# Demo gif/video — scenario for the owner to record

Not recorded here — this is the shot list. Screen recording, ~20–25s total, no voiceover needed (works as a silent gif/mp4 loop for PH/HN/X embeds).

## Scene 1 — the search (0–4s)

Homepage, cold load. Cursor clicks the search field, types a plain name (e.g. `acmeforge`) at natural typing speed. The on-screen stopwatch chip ("First answer under 0.5s · p95") is visible in frame — let it actually tick during the recording rather than cutting around it, since the timer *is* the honesty proof.

## Scene 2 — cards resolving live (4–10s)

Extension cards populate under the search bar as each TLD resolves — AVAILABLE (green), TAKEN (grey), and ideally one card passing through **Unverified** before it settles (this depends on live network conditions and can't be scripted to order — capture a few takes and keep the one where it happens naturally; don't fake it). Zoom/crop tight on the card transition so the status change reads clearly at gif resolution.

## Scene 3 — the renewal trap (10–17s)

Click through to a `/tld/<tld>` page (`.io` or `.xyz` work well — visible renewal-trap ratio) — or click "All .io prices" from a result card. Show the per-registrar table: registration price, renewal price, and the flagged row where renewal exceeds 1.8× the first year. Pause 2–3s on this frame — it's the main hook, give it the most screen time.

## Scene 4 — MCP in an LLM (17–23s)

Cut to a terminal or Claude Desktop/Code window. Type a natural prompt ("is acmeforge.io available and where's it cheapest?"), show the `check_domain` tool call firing, and the plain-text response:

```
acmeforge.io — AVAILABLE
  cheapest: Porkbun $28.12/yr
  buy: https://porkbun.com/checkout/search?q=acmeforge.io
```

## Scene 5 — close (23–25s, optional)

Logo + `digmyname.com`. No extra tagline card needed if scene 1's chip already carried the hedge ("· p95").

## Recording notes

- Record at 2x display scale minimum; PH/HN embeds compress hard.
- Use a domain that is genuinely, verifiably available/taken at record time — don't stage a fake result. If the live verdict for the chosen name changes between scenes, re-record rather than splice mismatched states.
- Keep raw footage (screen recording + a couple of alternate takes for Scene 2) somewhere so the gif can be re-cut once real launch-day traffic patterns give a cleaner "Unverified → resolved" capture, if needed.
