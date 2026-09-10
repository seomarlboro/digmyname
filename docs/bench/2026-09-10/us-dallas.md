# First-answer benchmark — US/DFW, 2026-09-10T21:39:59.257Z, cold visitors n=150

## Stopwatch (first visible verdict), cold visitor

| group | n | p50 | p90 | p95 | max |
|---|---|---|---|---|---|
| all | 150 | 227 | 361 | 386 | 423 |
| first verdict from the browser lane | 136 | 225 | 332 | 385 | 423 |
| first verdict from the edge | 14 | 242 | 388 | 391 | 391 |
| .ai | 8 | 253 | 268 | 268 | 268 |
| .app | 8 | 214 | 303 | 303 | 303 |
| .co | 7 | 373 | 423 | 423 | 423 |
| .com | 75 | 198 | 232 | 250 | 267 |
| .dev | 7 | 220 | 268 | 268 | 268 |
| .io | 8 | 265 | 275 | 275 | 275 |
| .me | 7 | 383 | 391 | 391 | 391 |
| .net | 7 | 194 | 271 | 271 | 271 |
| .org | 8 | 265 | 322 | 322 | 322 |
| .tech | 7 | 227 | 242 | 242 | 242 |
| .xyz | 8 | 362 | 402 | 402 | 402 |

Answered 150/150 (timeouts > 8000 ms: 0); ≤ 1000 ms: 150/150 (100.0 %).
Page load to usable input: p50 456 ms, p95 596 ms.
Headline card at read time: {"available":129,"checking":21}

## Raw probes from this machine (sequential, fresh names)

| probe | n | p50 | p90 | p95 | max | errors |
|---|---|---|---|---|---|---|
| RDAP Verisign .com | 60 | 107 | 108 | 109 | 146 | 0 |
| RDAP PIR .org | 30 | 96 | 103 | 133 | 165 | 0 |
| RDAP Identity Digital .io | 30 | 105 | 114 | 124 | 242 | 0 |
| DoH Cloudflare NS | 30 | 25 | 29 | 32 | 91 | 0 |
| edge only: public API /check, fresh .com | 30 | 536 | 655 | 868 | 1307 | 0 |
