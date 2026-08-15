# Аудит точности вердиктов доступности — DigMyName

**Дата:** 2026-08-15 · **HEAD:** `87121db` · **Режим:** только чтение + измерение. Правок кода нет, коммитов/деплоев нет.
**Скоуп:** `supabase/functions/_shared/pipeline.ts`, `_shared/availability-rules.ts`, `check-domains/index.ts`, `public-api/index.ts`, `mcp/src/index.ts`, `_shared/pipeline_test.ts`, `check-domains/index_test.ts`.
**Инвариант:** неподтверждённая доступность никогда не кэшируется и не показывается как `available`; при конфликте источников — честный Unverified.

Endpoint'ы взяты из кода: сайт → `POST {VITE_SUPABASE_URL}/functions/v1/check-domains` (`src/lib/domainData.ts:234` через `supabase.functions.invoke`), API → `{VITE_SUPABASE_URL}/functions/v1/public-api/check?domain=` (прямой origin из `public-api/index.ts:321`), CDN-путь MCP → `https://api.digmyname.com/functions/v1/public-api` (`mcp/src/index.ts:19-21`). Регион edge: `eu-central-1` (заголовок `x-sb-edge-region`); клиент — EU (Прага), латентности репрезентативны.

---

## 0. Сводка находок (P0 сверху)

| # | Prio | Статус | Где (file:line) | Вход → неверный выход |
|---|---|---|---|---|
| F1 | **P0** | **CONFIRMED** (live: `gaming.gg`, `leagueoflegends.gg`) | `pipeline.ts:383-386` (любой HTTP 404 = «свободно»), `:487` + `:526` (доверие 404 агрегатора для всех TLD кроме co/me), `:908-915` | Имя на TLD, которого **нет в IANA-bootstrap** (`.gg`, `.so` из списка сайта; `.de/.ru/.jp/.it/.ch/.es/.eu/.se/.kr/.cn` через API `/search?tlds=`): `bases=[]` → единственный RDAP-пробник — `rdap.org`, который на неподдерживаемый TLD отвечает **404 text/html** на *любое* имя. 404 читается как «not registered» → RDAP «available». Если DNS = NXDOMAIN (зарегистрировано без делегации / на hold / в pendingDelete) → **`available:true`, цена из каталога, buy_url, кэш 6 ч** (tier `rdap`). Репро: `gaming.gg` — whois.gg: *Registered on 25th June 2020, Locked by Registry, no name servers* → сайт **и** API: `available:true, $51.80, buy_url porkbun`. `leagueoflegends.gg` (whois: Active, 2018) → `available:true`. Для `.so` путь идентичен (живой registered-but-NXDOMAIN не найден за отведённое время). Итог: доступность на таких зонах = **один слабый сигнал (DNS NXDOMAIN)**. |
| F1b | **P0** | PLAUSIBLE (механизм подтверждён замерами; живого репро нет) | `pipeline.ts:152` (хедж 250 мс), `:515-537` (первый non-unknown побеждает и **отменяет** остальные), `:526` | `.io`: `bases=[identitydigital]`, `trustAggregator404=true`. Из Франкфурта/EU registry отвечает ~1.0–1.4 с, `rdap.org` — 404 за ~0.13–0.18 с. Хедж стартует на 250 мс → фиктивный 404 агрегатора побеждает гонку (~0.4 с) и `ctl.abort()` **гасит** ответ реестра. Для делегированных имён спасает DNS-has_records; для зарегистрированных-но-NXDOMAIN `.io` (hold, pendingDelete, GlobalBlock — см. F3) → `available:true`. Т.е. на `.io` в типичном случае вердикт «available» = DNS-only. |
| F2 | **P0** | **CONFIRMED** (live: 10 из 16 проверенных имён — все, где Fastly даёт `reserved`: `test.dev/.app/.xyz/.tech/.cloud/.studio/.online/.site/.art`, `mail.dev`) | `pipeline.ts:1115-1126` (предварительный publish Pass-1, строка 1122 публикует `{available:true, likelyPremium:true}`), `public-api/index.ts:145,173-180` (бюджет 900 мс), `:156-159` (`fallback()` отдаёт preliminary как финал, `uncertain:false`), `:243-259` | **API-путь показывает зарезервированные реестром имена как available.** Premium-suspect (`isLikelyPremium`) на cache-miss: Pass-1 = RDAP-404 + NXDOMAIN → preliminary `available:true`; Fastly не успевает к 650 мс, бюджет 900 мс срабатывает → `fallback()` берёт preliminary из `partialSink` и возвращает как окончательный: `available:true, uncertain:false, likely_premium:true, premium_unverified:false`. Сайт (6 с окно) на тех же именах: `available:false, checkedVia:domainr` (Fastly: `reserved`). MCP печатает «AVAILABLE (likely premium — real price may differ)» + `buy_url` (search_url). Замер: `test.dev` API `av=True` / сайт `TAKEN via domainr`; после того как сайт записал L2, повтор API → `TAKEN` — т.е. ошибка живёт до первого прогона сайта. Побочно: тот же класс имён на guardrail-ветке `:1205-1225` (Fastly промахнулся, но pipeline уложился в 900 мс) → `available:true, premiumUnverified:true`, **кэш 600 с** (`:1332`) → 10 минут «available — Check price» на *обоих* путях. Guardrail — принятое ранее решение, но для reserved-имён это ровно «зарезервированное показано как available». |
| F3 | **P0** | **CONFIRMED** (live: `codeium.io`) — известный/принятый tradeoff (owner, 2026-08-11), фиксирую живой экземпляр | `availability-rules.ts:139-143` (эскалация только uncertain / premium-suspect / brand-list), `pipeline.ts:1130-1135`, `:1227` | `codeium.io`: whois.nic.io — *«This name is not available for registration. This name has been blocked by a GlobalBlock service»*. Registry-RDAP на заблокированные имена отвечает **404** (объекта нет), DNS NXDOMAIN → `available:true`; 7 символов, не в `BLOCKED_SLDS` → третий сигнал не спрашивается → **сайт и API: `available:true, $28.12, buy_url`**, кэш 6 ч. Единственный источник, способный это поймать (Fastly `dpml`/`disallowed`), по текущим правилам не вызывается. |
| F4 | **P1** | **CONFIRMED** (код) | `mcp/src/index.ts:132-143` (`cacheSet` на **любой** 200), `:25` (30 с) | MCP кэширует **uncertain** ответы на 30 с наравне с certain. UNKNOWN становится «липким»: пользователь просит «проверь ещё раз» → тот же UNKNOWN из клиентского кэша, хотя API уже отвечает (замер: `.co` первый вызов UNCERTAIN, второй через 6 с — AVAILABLE, см. F5). Нарушает «uncertain никогда не кэшируется» на стороне потребителя. |
| F5 | **P2** | **CONFIRMED** (live 3/3 fresh `.co`, cold-проход: `.co`×2, `.me`×1, `.studio`×1) | `public-api/index.ts:142-148` (deadline 650/780 мс), `pipeline.ts:735-747` (`remaining<150` → тихий skip; abort на дедлайне), `:922-930` (uncertain **без** `uncertainReason`), `:1227` | **Механизм «API UNKNOWN / сайт AVAILABLE».** Для имён, которым третий сигнал *обязателен* (`.co/.me` — база всегда uncertain по `:922`; premium-suspect; brand-list) API-дедлайн Fastly 650/780 мс меньше холодной латентности Fastly (сайт: cold `.co` 1.9–2.6 с vs warm 0.34–0.6 с). Pipeline сам завершается на ~782 мс (Fastly aborted) с базовым uncertain → `uncertain_reason: null` (не `budget_timeout`, хотя это наш дедлайн) → TTL 0 → не кэшируется → каждый следующий вызов повторяет тот же промах. Лечится либо собственным кэшем Fastly (2-й вызов успевает), либо прогоном сайта, который пишет L2. Сайт с 6 с окном резолвит те же имена всегда. Ключи/версия L2 у путей одинаковые (`domain_cache`, `CACHE_VERSION=3`) — расхождение только по бюджету и по тому, кто первым записал L2. |
| F6 | **P2** | **CONFIRMED** (whois + live) | `availability-rules.ts:106-120` (Spec-5 SLD в `BLOCKED_SLDS`), `pipeline.ts:1170-1178` (вердикт Fastly «available» применяется **до** проверки `isLikelyBlocked`), `:1197-1204` | Посылка S3-фикса («Spec-5 имена зарезервированы») **ложна**: whois `nro.xyz`, `ripe.xyz`, `arin.xyz`, `iana.xyz`, `iab.xyz`, `ietf.io`, `ripe.io`, `arin.io`, `icann.io` — зарегистрированы обычными регистрантами (Sav.com, Namecheap, GoDaddy, Dynadot…). Fastly на `afrinic.xyz`/`lacnic.io`/`apnic.app` даёт `inactive`, Porkbun — цену. Итог: сайт → **AVAILABLE** (`via domainr` / `porkbun`), API на первом вызове → **UNCERTAIN(brand_protected)** с бейджем «Trademark». Список работает только когда Fastly *не* ответил (`:1197-1204`), т.е. вердикт зависит от пути, а не от имени. |
| F7 | **P2** | **CONFIRMED** (код) | `public-api/index.ts:371-397`, особенно `:392` | `/fast` возвращает `{available:true, uncertain:true}` на один Cloudflare-DoH NXDOMAIN — единственный endpoint, отдающий `available:true` вместе с `uncertain:true`, вопреки контракту `pipeline.ts:31` («on uncertain → available:false») и тесту `index_test.ts:70`. Сайт корректно держит такие карточки в «Checking» (`DomainSearch.tsx:209-213`); сторонний потребитель, читающий только `available`, увидит «свободно» по DNS-only. |
| F8 | **P2** | PLAUSIBLE (форма ответа DoH подтверждена live) | `pipeline.ts:199-201` (комментарий «только при явном NXDOMAIN» противоречит коду: `return any ? "no_records" : "error"`) | `dohProbe` считает **SERVFAIL/REFUSED/NODATA** за «no_records»: Cloudflare на `dnssec-failed.org` (зарегистрирован, сломан DNSSEC) отдаёт `Status:2` для A и NS → `"no_records"`. Второй сигнал слабее задокументированного; сам по себе не продаёт имя (RDAP реестра говорит taken — live проверено), но в связке с фиктивным RDAP-404 (F1/F1b) превращает `uncertain` (`:934`) в `available` (`:908`). |
| F9 | **P3** | **CONFIRMED** (live: `nyid.dev`, `uiea.studio` в L2: `premium_unverified:true` + `price 8.75/11.84`) | `pipeline.ts:1305-1313` (spread сохраняет `premiumUnverified:true` при добавлении реальной цены), противоречит doc-полю `:51-57` («price MUST stay undefined… never cached with a price») | Guardrail-ветка → Porkbun подтверждает `avail:yes` с обычной ценой → результат `premiumUnverified:true` **и** `price` → кэш ≤600 с. API отдаёт `premium_unverified:true` + `price_usd:8.75` одновременно (`shapeResult` `:247-263`); UI, доверяющий флагу, прячет реальную цену. Вердикт верный, флаги противоречивы. |
| F10 | **P3** | **CONFIRMED** (75/80 запросов `cold;desc="1"`, X-Cache HIT 0/80) | `public-api/index.ts:401-412`, `:201-231`, `pipeline.ts:856-865` | Изолят public-api холодный почти на каждом запросе → L1 hot-cache и shaped-response-cache **никогда** не срабатывают; посылка «shared warm module-level caches» (`pipeline.ts:6-8`) на API-пути не выполняется. Keep-warm не даёт reuse изолята. Латентность держится только на L2 (DB). |
| F11 | **P3** | **CONFIRMED** (код) + PLAUSIBLE (последствие) | `pipeline.ts:1233-1251` (aftermarket NS — повторный DoH-запрос NS, хотя `dohProbe` его уже получил и выбросил `:193`), `:1256-1272` (DB `registrar_prices`), `:1284-1317` + `:570` (Porkbun `AbortSignal.timeout(6000)`) | Три последовательных ожидания на пути ответа после Pass-2 вместо параллели с Pass-2/Pass-1. Сайт cold `apnic.app` = 3958 мс. Fastly-дедлайн (6 с абс.) + Porkbun (до 6 с) > бюджета сайта 8 с → сайт отдаст preliminary из `partialSink` (для reserved premium-suspect — `available:true`, см. F2). Редко, но путь существует. |
| F12 | **P3** | **CONFIRMED** (код), CDN-часть опровергнута | `public-api/index.ts:92-103` (`Cache-Control: public, max-age=60` на **любой** 200, включая uncertain) | На прямом origin (он же указан в OpenAPI `servers` `:321`) uncertain-ответ помечен публично кэшируемым на 60 с. Edge `api.digmyname.com` это исправляет (проверено: uncertain → `no-store`, certain → `public, max-age=60, stale-while-revalidate=180`), но любой промежуточный кэш на прямом URL закрепит UNKNOWN на минуту. |

Направления (не правил, только для ориентира): F1/F1b — доверять 404 агрегатора только если TLD есть в bootstrap **и** тело — RDAP-JSON (`application/rdap+json` / `errorCode:404`), иначе `unknown`; F2 — публиковать premium-suspect в preliminary как `uncertain`/`premiumUnverified`, а не как `available:true`; F5 — проставлять `uncertainReason:"budget_timeout"` при пропуске/abort третьего сигнала; F4 — не кэшировать `uncertain` в MCP.

---

## 1. Задача 1 — статический разбор: все пути к `available === true`

| # | Путь | file:line | Чем подтверждено | Кэш |
|---|---|---|---|---|
| A1 | `resolveDomain`: RDAP `available` ∧ DNS `no_records` | `pipeline.ts:908-915` | RDAP-404 (реестр по FAST_RDAP/bootstrap **или** rdap.org) + DoH «no_records» (Cloudflare, хедж Google/AdGuard 400 мс). Внимание: 404 агрегатора трактуется как реестровый (F1), «no_records» ≠ NXDOMAIN (F8) | `rdap` 6 ч; без цены — 600 с |
| A2 | Pass-2: Fastly `inactive`/`unregistered` (без taken/aftermarket-токенов) | `pipeline.ts:1170-1178`, `availability-rules.ts:39-54` | Только Fastly. База могла быть **любой** uncertain: `.co/.me` (RDAP unknown + NXDOMAIN, `:922`), RDAP-404 + DNS error (`:934`), heuristic/unknown (`:939-943`). Т.е. для `.co/.me` available = Fastly + DNS-NXDOMAIN; **`isLikelyBlocked` здесь не проверяется** (F6) | `domainr` 24 ч |
| A3 | Pass-2 guardrail: база available ∧ likelyPremium ∧ нет вердикта Fastly | `pipeline.ts:1205-1225` | RDAP-404 + NXDOMAIN; третий сигнал отсутствует (дедлайн / breaker 401-403 на 5 мин `:750-752` / 429 на 60 с `:756-757` / пустой ответ `:772` / bare `undelegated`) → `available:true, premiumUnverified:true`, без цены | ≤600 с (`:1332`) |
| A4 | Pass-2 pass-through: база available, не premium, не blocked | `pipeline.ts:1227` | RDAP-404 + NXDOMAIN (два сигнала). Реестровые блокировки не в списке (GlobalBlock, DPML вне списка) не ловятся (F3) | `rdap` 6 ч |
| A5 | Porkbun `avail:"yes"` перезаписывает `available` | `pipeline.ts:1302-1313` | Только для уже-available premium-кандидатов; не создаёт новый available, но фиксирует `checkedVia:porkbun` и цену; сохраняет `premiumUnverified` (F9) | `porkbun` 24 ч |
| A6 | L1 hot-cache hit | `pipeline.ts:1048-1056` | Что было записано в `:1340-1350` (только `ttl>0`, т.е. никогда uncertain) | — |
| A7 | L2 `domain_cache` hit (`cache_version=3`, `expires_at>now`) | `pipeline.ts:1059-1091` | Строка из прошлого прогона любого из двух путей | — |
| A8 | Preliminary publish (Pass-1 → `partialSink`) | `pipeline.ts:1115-1126` (`:1122`) | RDAP-404 + NXDOMAIN, **до** третьего сигнала; для premium-suspect — без `premiumUnverified`; brand-list уже применён (`:1117-1120`) | не пишется в кэш pipeline; на API попадает в shaped-response-cache 60 с, если `!uncertain` (`public-api:498`) |
| A9 | `/fast`: NXDOMAIN → `available:true, uncertain:true` | `public-api/index.ts:392` | Один DoH-резолвер (F7) | `no-store` |
| A10 | API `/check`/`/search` shaped-response cache | `public-api/index.ts:224-231, 498, 524` | Копия ответа с `!uncertain` (в т.ч. A8) на 60 с в изоляте (практически не срабатывает — F10) | 60 с |

**Где `available:true` возникает при деградациях**

| Условие | Путь → результат |
|---|---|
| Истечение бюджета (API 900/1000 мс; сайт 8000 мс) | A8: preliminary premium-suspect → `available:true` без `premiumUnverified` (**F2**); не-premium preliminary = финал (2 сигнала, ок) |
| Истечение дедлайна третьего сигнала (650/780; 6000) | A3 → `available:true, premiumUnverified` — в т.ч. для reserved-имён (F2), кэш 600 с; `.co/.me` → uncertain без reason (F5) |
| Ошибка источника: rdap.org 404 на неподдерживаемый TLD | A1 → `available:true` при NXDOMAIN (**F1/F1b**) |
| Ошибка источника: registry RDAP 404 на registry-blocked имя | A4 → `available:true` (**F3**) |
| Ошибка источника: DoH SERVFAIL/REFUSED | `"no_records"` (F8) → в связке с F1 → A1 |
| Circuit breaker Fastly (401/403 5 мин, 429 60 с) | A3 для всех premium-suspect на время breaker'а; brand-list → uncertain; `.co/.me` → uncertain. Не available, кроме A3 (по дизайну) |
| Частичный/пустой ответ Fastly (`out.size===0` → `null`; отсутствие домена в map) | как «нет вердикта» → A3/A4/brand-uncertain |
| Промах кэша | полный прогон → всё выше |
| Bare `undelegated` | `unknown` (`availability-rules.ts:53`, тест `pipeline_test.ts:28`) → как «нет вердикта» → A3/A4. Корректно |
| Холодный каталог цен | цена `undefined`, TTL 600 с (`:1335`); на вердикт не влияет; API `price_usd:null` + `cheapest_registrar` из БД |

Не найдено путей `available:true ∧ uncertain:true` внутри pipeline (только A9 в `/fast`). Тесты (`pipeline_test.ts` — 19/19 ok локально) покрывают правила Pass-2 и `interpretDomainr`, но **не** покрывают `checkRdap`/`dohProbe`/preliminary publish/бюджетный fallback — все P0 в этом отчёте лежат вне покрытия.

---

## 2. Задача 2 — сайт vs API на одном результате pipeline

| Аспект | Сайт `check-domains` | API `public-api` | Следствие |
|---|---|---|---|
| Hard budget | 8000 мс (`index.ts:96`) | 900 мс / 1000 мс если есть `.co/.me` (`index.ts:145`) | API отдаёт preliminary/timeout там, где сайт ждёт финал (F2, F5) |
| Дедлайн Fastly | now+6000 (`:97,104`) | now+650 / +780 (`:148`) | Fastly cold ≈1.5–2.2 с (сайт cold `.co` 1.9–2.6 с vs warm 0.34–0.6) → API систематически без третьего сигнала на первом вызове |
| Fallback при бюджете | `partialSink` ∨ `{checkedVia:"budget", uncertain, budget_timeout}` (`:120-129`); pipeline добивается в `waitUntil` (`:137`) | `partial` ∨ `{checkedVia:"timeout", uncertain, budget_timeout \| brand_protected}` (`:156-170`); без `waitUntil`, но фоновое завершение и запись L2 наблюдались (`uiea.studio` → L2 через ~5 с) | Одинаковый принцип; разница в частоте срабатывания |
| Ключи/версия L2 | `domain_cache`, ключ = domain, `CACHE_VERSION=3` | то же | Расхождений нет; кто первым записал — тот и «прав» для второго пути на TTL |
| L1 / response cache | L1 в изоляте функции | L1 + shaped cache 60 с — оба в изоляте, который холодный ~95% (F10) | «Общие тёплые кэши» между функциями не существуют (разные изоляты) |
| Маппинг uncertain | сырые поля pipeline (`uncertain`, `uncertainReason`, `premiumUnverified`, `sldBlocked`) | `shapeResult` (`:242-284`): `uncertain`, `uncertain_reason` (`?? null`), `sld_blocked` пересчитан, `price_usd` только если `!likely_premium` | Потеря: третий сигнал, пропущенный по нашему дедлайну, приходит без reason (`null`) — потребитель не отличит «наш бюджет» от «источник не знает» (F5) |
| Повторный запрос | нет кэша ответа; L2 | shaped cache только для fully-certain (не срабатывает), CDN edge: certain 60 с / uncertain `no-store` (проверено); MCP: **всё** 30 с (F4) | UNKNOWN липнет только на MCP-клиенте |
| Частичный батч | по одному домену (top-TLD) / батчи 8 | `/search` ≤12 TLD одним `checkDomains`, единый бюджет; один `.co/.me` в списке → 1000/780 всей пачке | В `/search` по умолчанию (`DEFAULT_TLDS` содержит co, me) `.co/.me` всегда UNKNOWN на первом вызове |

**Механизм «API UNKNOWN там, где сайт AVAILABLE» (подтверждён):** (1) имя требует третьего сигнала (`.co/.me` по построению `:922`, premium-suspect, brand-list); (2) API-дедлайн Fastly < холодной латентности Fastly → `checkDomainrBatch` пропускает/абортит (`:741,746`) → базовый uncertain (`.co/.me`) или preliminary/guardrail available (premium); (3) uncertain не кэшируется (TTL 0) → повтор воспроизводит промах; (4) сайт с 6 с окном получает вердикт Fastly и пишет L2 → после этого API «выздоравливает». Замер: 3/3 свежих `.co` — вызов 1 UNCERTAIN (srv 781–783 мс = дедлайн), вызов 2 через 6 с AVAILABLE (Fastly уже прогрел имя), вызов 3 — L2 hit ~100 мс.

---

## 3. Задача 3 — эмпирика

Метод: 40 имён; для каждого имени сайт и API вызывались **одновременно** (оба стартуют с одинаковым состоянием L2), pacing 2.3 с (лимит сайта 30/мин). Проход 1 = cold, проход 2 = warm (те же имена). Время — wall-clock клиента (EU, вкл. TLS ~100–150 мс); для API в скобках `server-timing total;dur` origin. Оговорка: группа «taken» и три имени из «problem» (`gaming.gg`, `leagueoflegends.gg`, `codeium.io`) уже были в L2 до прохода (прошлый трафик / мои ручные пробы) — для них «cold» = «как нашли».

| группа | домен | сайт cold | мс | via | API cold | мс (srv) | сайт warm | мс | API warm | мс (srv) |
|---|---|---|---|---|---|---|---|---|---|---|
| taken | `google.com` | TAKEN | 588 | dns | TAKEN | 563 (158) | TAKEN | 474 | TAKEN | 493 (107) |
| taken | `github.com` | TAKEN | 507 | rdap | TAKEN | 389 (127) | TAKEN | 506 | TAKEN | 507 (135) |
| taken | `wikipedia.org` | TAKEN | 499 | dns | TAKEN | 581 (263) | TAKEN | 356 | TAKEN | 483 (177) |
| taken | `cloudflare.net` | TAKEN | 499 | rdap | TAKEN | 499 (237) | TAKEN | 523 | TAKEN | 610 (83) |
| taken | `notion.so` | TAKEN | 411 | dns | TAKEN | 445 (178) | TAKEN | 447 | TAKEN | 447 (136) |
| taken | `vercel.app` | TAKEN | 427 | dns | TAKEN | 436 (145) | TAKEN | 451 | TAKEN | 485 (123) |
| taken | `deno.dev` | TAKEN | 453 | dns | TAKEN | 468 (208) | TAKEN | 420 | TAKEN | 520 (115) |
| taken | `mozilla.org` | TAKEN | 516 | dns | TAKEN | 465 (146) | TAKEN | 353 | TAKEN | 342 (89) |
| taken | `supabase.io` | TAKEN | 392 | dns | TAKEN | 488 (141) | TAKEN | 511 | TAKEN | 633 (121) |
| taken | `digmyname.com` | TAKEN | 432 | rdap | TAKEN | 459 (196) | TAKEN | 460 | TAKEN | 447 (94) |
| free | `zqaud-5e9u-zs394.com` | AVAILABLE | 592 | rdap | AVAILABLE | 499 (180) | AVAILABLE | 461 | AVAILABLE | 441 (93) |
| free | `zqaud-5e9u-l91k1.net` | AVAILABLE | 520 | rdap | AVAILABLE | 463 (208) | AVAILABLE | 1097 | AVAILABLE | 1387 (57) |
| free | `zqaud-5e9u-91ogf.org` | AVAILABLE | 1259 | rdap | AVAILABLE | 1239 (903) | AVAILABLE | 853 | AVAILABLE | 872 (136) |
| free | `zqaud-5e9u-l1ate.io` | AVAILABLE | 839 | rdap | AVAILABLE | 767 (517) | AVAILABLE | 537 | AVAILABLE | 476 (118) |
| free | `zqaud-5e9u-vucbt.xyz` | AVAILABLE | 606 | rdap | AVAILABLE | 561 (310) | AVAILABLE | 475 | AVAILABLE | 495 (120) |
| free | `zqaud-5e9u-b62ax.dev` | AVAILABLE | 679 | rdap | AVAILABLE | 615 (294) | AVAILABLE | 423 | AVAILABLE | 422 (98) |
| free | `zqaud-5e9u-vj3vc.app` | AVAILABLE | 696 | rdap | AVAILABLE | 650 (392) | AVAILABLE | 408 | AVAILABLE | 440 (90) |
| free | `zqaud-5e9u-0ljsl.co` | AVAILABLE | 2647 | domainr | **UNCERTAIN** | 1142 (782) | AVAILABLE | 338 | AVAILABLE | 340 (91) |
| free | `zqaud-5e9u-pzyhq.me` | AVAILABLE | 2046 | domainr | **UNCERTAIN** | 1113 (784) | AVAILABLE | 460 | AVAILABLE | 433 (80) |
| free | `zqaud-5e9u-bennz.ai` | AVAILABLE | 1215 | rdap | AVAILABLE | 1166 (903) | AVAILABLE | 503 | AVAILABLE | 500 (136) |
| problem | `afrinic.xyz` | AVAILABLE | 1529 | domainr | **UNCERTAIN(brand_protected)** | 915 (656) | AVAILABLE | 349 | AVAILABLE | 440 (121) |
| problem | `lacnic.io` | AVAILABLE | 1779 | domainr | **UNCERTAIN(brand_protected)** | 961 (654) | AVAILABLE | 561 | AVAILABLE | 556 (105) |
| problem | `rfc-editor.dev` | TAKEN | 631 | rdap | TAKEN | 597 (331) | TAKEN | 389 | TAKEN | 350 (112) |
| problem | `apnic.app` | AVAILABLE | 3958 | porkbun | **UNCERTAIN(brand_protected)** | 1021 (653) | AVAILABLE | 432 | AVAILABLE | 491 (120) |
| problem | `gaming.gg` ⚠ registered 2020 | **AVAILABLE** | 432 | rdap | **AVAILABLE** | 296 (61) | AVAILABLE | 469 | AVAILABLE | 478 (135) |
| problem | `leagueoflegends.gg` ⚠ registered 2018 | **AVAILABLE** | 579 | rdap | **AVAILABLE** | 601 (115) | AVAILABLE | 359 | AVAILABLE | 465 (117) |
| problem | `codeium.io` ⚠ GlobalBlock | **AVAILABLE** | 362 | rdap | **AVAILABLE** | 405 (87) | AVAILABLE | 474 | AVAILABLE | 439 (81) |
| problem | `nic.so` | TAKEN | 621 | dns | TAKEN | 424 (142) | TAKEN | 365 | TAKEN | 392 (126) |
| problem | `whois.gg` | TAKEN | 631 | dns | TAKEN | 506 (151) | TAKEN | 453 | TAKEN | 436 (118) |
| problem | `example.xyz` | TAKEN | 427 | domainr | TAKEN | 419 (90) | TAKEN | 344 | TAKEN | 332 (73) |
| long | `e5b9njhqwgaynt.com` | AVAILABLE | 553 | rdap | AVAILABLE | 518 (175) | AVAILABLE | 577 | AVAILABLE | 516 (105) |
| long | `s93a6d29536c4o0x.io` | AVAILABLE | 744 | rdap | AVAILABLE | 737 (457) | AVAILABLE | 461 | AVAILABLE | 585 (127) |
| long | `ewm8zdzjphggu.org` | AVAILABLE | 1217 | rdap | AVAILABLE | 1195 (903) | AVAILABLE | 401 | AVAILABLE | 389 (123) |
| long | `4mvi41vsk2uo.net` | AVAILABLE | 644 | rdap | AVAILABLE | 642 (273) | AVAILABLE | 450 | AVAILABLE | 472 (124) |
| long | `szamna40tsxtf.tech` | AVAILABLE | 958 | rdap | AVAILABLE | 831 (594) | AVAILABLE | 354 | AVAILABLE | 362 (72) |
| long | `6vavj0uwlz9a.studio` | AVAILABLE | 1375 | rdap | **UNCERTAIN(budget_timeout)** | 1270 (902) | AVAILABLE | 383 | AVAILABLE | 351 (85) |
| long | `7kqdjjkuaog7i4.co` | AVAILABLE | 1939 | domainr | **UNCERTAIN** | 1058 (784) | AVAILABLE | 603 | AVAILABLE | 499 (101) |
| long | `fu47qrll4jio.me` | AVAILABLE | 1110 | domainr | AVAILABLE | 945 (671) | AVAILABLE | 458 | AVAILABLE | 393 (91) |
| long | `duc8lon8mkyugzx.cloud` | AVAILABLE | 1011 | rdap | AVAILABLE | 959 (612) | AVAILABLE | 429 | AVAILABLE | 428 (85) |
| long | `j16o6fb1rxkj9.dev` | AVAILABLE | 751 | rdap | AVAILABLE | 747 (394) | AVAILABLE | 502 | AVAILABLE | 499 (149) |

**Доля < 1000 мс (не смешивать):**

| Путь / проход | <1000 мс | p50 | p95 | max |
|---|---|---|---|---|
| Сайт **cold**, wall | **28/40 (70%)** | 631 | 2046 | 3958 |
| API **cold**, wall | **32/40 (80%)** | 601 | 1195 | 1270 |
| API cold, `server-timing` origin | 40/40 (100%) — бюджет 900 мс держит, ценой 7 UNCERTAIN | 294 | 903 | 903 |
| Сайт **warm**, wall | 39/40 (98%) | 458 | 603 | 1097 |
| API **warm**, wall | 39/40 (98%) | 472 | 633 | 1387 |
| API warm, origin | 40/40 (100%) | 115 | 136 | 177 |

По группам (cold, <1000 мс, сайт / API): taken 10/10 · 10/10; free 6/10 · 6/10; problem 7/10 · 9/10; long 5/10 · 7/10. Warm-время обоих путей — это L2 (DB), не L1: `cold;desc="1"` в 38/40 (cold) и 37/40 (warm) API-запросах, `X-Cache: HIT` 0/80.

**Расхождения сайт ≠ API:** cold — 7/40 (все: сайт AVAILABLE, API UNCERTAIN: `.co`×2, `.me`, `.studio`, `afrinic.xyz`, `lacnic.io`, `apnic.app`); warm — 0/40 (API читает L2, записанный сайтом).

**Дополнительные серии (вне 40):**
- Reserved premium-suspect, API-first → сайт (F2), 16 имён: `test.dev`, `test.app`, `test.xyz`, `test.tech`, `test.cloud`, `test.studio`, `test.online`, `test.site`, `test.art`, `mail.dev` — API `available:true` (srv 901–906 = бюджет) / сайт `TAKEN via domainr`; `test.store`, `qwzx.app` — оба available; `test.io`, `demo.dev`, `abcd.dev`, `news.app` — оба TAKEN.
- Fresh `.co`, только API, 3 имени × 3 вызова (F5): call1 UNCERTAIN (781–783 мс), call2 через 6 с AVAILABLE (438–641 мс), call3 L2 (86–197 мс).
- Premium-suspect свежие: `nyid.dev` call1 available (preliminary, `pu:false`, без цены, 902 мс) → call2 L2 `pu:true` + `price 8.75` (F9); `uiea.studio` call1 UNCERTAIN(budget_timeout, 903 мс) → call2 L2 available `pu:true` + `price 11.84`.
- CDN `api.digmyname.com`, fresh `.co`: call1 uncertain `cache-control: no-store`; call2 available `public, max-age=60, stale-while-revalidate=180`; call3 `cf-cache-status: HIT age=4`.

---

## 4. Опровергнутые гипотезы (выброшены)

| Гипотеза | Почему отвергнута |
|---|---|
| CDN кэширует uncertain-ответы 60 с (по `Cache-Control` origin) | Edge переписывает: uncertain → `no-store`, certain → `public, max-age=60, swr=180` (проверено live). Осталось только замечание про прямой origin (F12, P3) |
| API-pipeline после срабатывания бюджета не дописывает L2 (нет `waitUntil`) | `uiea.studio`: API вернул budget_timeout, через ~5 с L2 уже содержал финал (porkbun-цена). Для `.co/.me` L2 не пишется по другой причине — pipeline сам завершается uncertain (F5) |
| Spec-5 SLD (`afrinic`, `lacnic`, `apnic`, `nro`, `ripe`…) зарезервированы реестрами → показ available = P0 | whois: `nro/ripe/arin/iana/iab.xyz`, `ietf/ripe/arin/icann.io` зарегистрированы третьими лицами; Fastly `inactive`, Porkbun даёт цену → имена регистрируемы; списковая блокировка над-осторожна и путезависима (F6, P2) |
| S3-фикс (`9c2309c`) блокирует `afrinic.xyz` | Только на API-пути при промахе Fastly; на сайте (Fastly отвечает) `pipeline.ts:1170` даёт available. Живой replay: сайт AVAILABLE via domainr |
| DoH «no_records» ⇒ NXDOMAIN (по комментарию `:199`) | Код `:201` возвращает «no_records» и на SERVFAIL/NODATA; live `dnssec-failed.org` Status 2 (F8) |
| `.io` защищён FAST_RDAP от агрегатора | Хедж 250 мс + rdap.org 404 за ~150 мс побеждает реестр (~1.0 с) и отменяет его пробник (F1b, PLAUSIBLE — живой registered-but-NXDOMAIN `.io` не найден за таймбокс) |

---

## 5. Репро (read-only)

```bash
# whois-подтверждение регистрации (F1)
whois -h whois.gg gaming.gg | grep -A3 -iE "Registered on|Domain Status|Name servers"
# rdap.org на неподдерживаемый TLD — 404 text/html на любое имя
curl -sI https://rdap.org/domain/gaming.gg | head -3
# оба пути (ключ — публичный anon из .env)
set -a; source .env; set +a
curl -s "$VITE_SUPABASE_URL/functions/v1/public-api/check?domain=gaming.gg"
curl -s -X POST "$VITE_SUPABASE_URL/functions/v1/check-domains" -H "Content-Type: application/json" \
  -H "Authorization: Bearer $VITE_SUPABASE_PUBLISHABLE_KEY" -H "apikey: $VITE_SUPABASE_PUBLISHABLE_KEY" \
  -d '{"domains":["gaming.gg"]}'
# F2: reserved premium-suspect, сначала API, затем сайт
curl -s "$VITE_SUPABASE_URL/functions/v1/public-api/check?domain=test.tech"
# F3
whois -h whois.nic.io codeium.io
```

Скрипт прогона и сырые JSON обоих проходов: `run_audit.py`, `pass1_cold.json`, `pass2_warm.json`, `audit_names.json` (в scratchpad сессии; при необходимости перенесу).
