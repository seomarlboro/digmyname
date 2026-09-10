# First-answer benchmark — UA/VIE, 2026-09-10T21:39:41.531Z, cold visitors n=150

## Stopwatch (first visible verdict), cold visitor

| group | n | p50 | p90 | p95 | max |
|---|---|---|---|---|---|
| all | 150 | 307 | 443 | 485 | 765 |
| first verdict from the browser lane | 131 | 304 | 438 | 479 | 663 |
| first verdict from the edge | 19 | 388 | 677 | 765 | 765 |
| .ai | 8 | 438 | 511 | 511 | 511 |
| .app | 8 | 411 | 502 | 502 | 502 |
| .co | 7 | 412 | 506 | 506 | 506 |
| .com | 75 | 226 | 372 | 431 | 677 |
| .dev | 7 | 403 | 477 | 477 | 477 |
| .io | 8 | 398 | 479 | 479 | 479 |
| .me | 7 | 397 | 471 | 471 | 471 |
| .net | 7 | 281 | 362 | 362 | 362 |
| .org | 8 | 402 | 436 | 436 | 436 |
| .tech | 7 | 230 | 765 | 765 | 765 |
| .xyz | 8 | 293 | 401 | 401 | 401 |

Answered 150/150 (timeouts > 8000 ms: 0); ≤ 1000 ms: 150/150 (100.0 %).
Page load to usable input: p50 374 ms, p95 588 ms.
Headline card at read time: {"available":129,"checking":21}

## Raw probes from this machine (sequential, fresh names)

| probe | n | p50 | p90 | p95 | max | errors |
|---|---|---|---|---|---|---|
| RDAP Verisign .com | 58 | 109 | 159 | 184 | 196 | 2 |
| RDAP PIR .org | 30 | 236 | 286 | 302 | 369 | 0 |
| RDAP Identity Digital .io | 30 | 234 | 293 | 397 | 783 | 0 |
| DoH Cloudflare NS | 30 | 40 | 104 | 119 | 168 | 0 |
| edge only: public API /check, fresh .com | 30 | 382 | 462 | 515 | 614 | 0 |
