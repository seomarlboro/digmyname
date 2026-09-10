# First-answer benchmark — results and how to take part

The number on [digmyname.com/speed](https://digmyname.com/speed) is not a best run. It is the 95th percentile of what a **cold visitor** sees on the on-page stopwatch: a fresh browser with no cache and no open connections loads the home page, pauses like a reader, types a name nobody has checked before, and the clock stops the moment the first verdict paints.

## Results

| Date | Location | n | p50 | p90 | p95 | max | Files |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-09-10 | US · Dallas (GitHub-hosted runner) | 150 | 227 ms | 361 ms | **386 ms** | 423 ms | [summary](2026-09-10/us-dallas.md) · [raw](2026-09-10/us-dallas.json) |
| 2026-09-10 | EU · Vienna (residential) | 150 | 307 ms | 443 ms | **485 ms** | 765 ms | [summary](2026-09-10/eu-vienna.md) · [raw](2026-09-10/eu-vienna.json) |

Every raw file lists each visit: the typed name, the stopwatch reading, which lane answered first (the browser's own registry query or the edge), the headline card's state, and the raw registry / DoH / API probes from the same machine.

## Reproduce it

```bash
mkdir bench && cd bench && npm init -y && npm i playwright && npx playwright install chromium
cp ../scripts/bench/first-answer.mjs . && BENCH_N=150 node first-answer.mjs
```

Or run the `bench-first-answer` workflow in this repository's Actions tab: same script, a US runner, results attached to the run.

## The challenge

Show a public domain-availability lookup that answers a cold visitor faster, measured the same way — first visible verdict after the last keystroke, fresh browser, names nobody has checked, at least 100 visits, p95 — and it goes to the top of the /speed page with full credit and a link back.

Submit it as a [GitHub issue](https://github.com/seomarlboro/digmyname/issues/new?title=Faster%20lookup%3A%20%3Ctool%3E&labels=speed-challenge&body=Tool%3A%0AWhere%20measured%20(city%2C%20network)%3A%0AVisits%3A%0Ap50%20%2F%20p95%3A%0AHow%20you%20measured%20(script%2C%20video%20or%20HAR)%3A%0A) with the numbers and how you measured them (the script above, a screen recording or a HAR file all work). We re-run it before publishing, and we publish either way — faster or not.
