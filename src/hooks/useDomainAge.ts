import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface DomainAge {
  created: string | null;
  expires: string | null;
}

// Module-level cache + micro-batching so a page full of taken domains results
// in ONE background request instead of dozens.
const cache = new Map<string, DomainAge | null>();
const subscribers = new Map<string, Set<(a: DomainAge | null) => void>>();
let queue = new Set<string>();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

async function flush() {
  flushTimer = null;
  const batch = [...queue].slice(0, 50);
  queue = new Set([...queue].slice(50));
  if (queue.size > 0) flushTimer = setTimeout(flush, 50);
  if (batch.length === 0) return;

  let results: Record<string, DomainAge> = {};
  try {
    const { data, error } = await supabase.functions.invoke("domain-age", {
      body: { domains: batch },
    });
    if (!error && data?.results) results = data.results;
  } catch {
    // silent — age is a nice-to-have enrichment
  }

  for (const domain of batch) {
    const value = results[domain] ?? null;
    cache.set(domain, value);
    subscribers.get(domain)?.forEach((cb) => cb(value));
  }
}

function request(domain: string) {
  if (cache.has(domain)) return;
  queue.add(domain);
  if (!flushTimer) flushTimer = setTimeout(flush, 120);
}

export function useDomainAge(domain: string, enabled: boolean): DomainAge | null {
  const [age, setAge] = useState<DomainAge | null>(() => cache.get(domain) ?? null);

  useEffect(() => {
    if (!enabled) return;
    const cached = cache.get(domain);
    if (cached !== undefined) {
      setAge(cached);
      return;
    }
    let set = subscribers.get(domain);
    if (!set) {
      set = new Set();
      subscribers.set(domain, set);
    }
    const cb = (a: DomainAge | null) => setAge(a);
    set.add(cb);
    request(domain);
    return () => {
      set!.delete(cb);
      if (set!.size === 0) subscribers.delete(domain);
    };
  }, [domain, enabled]);

  return age;
}

export function formatRegisteredSince(age: DomainAge | null): string | null {
  if (!age?.created) return null;
  const year = new Date(age.created).getFullYear();
  if (!Number.isFinite(year) || year < 1985 || year > new Date().getFullYear()) return null;
  return `Since ${year}`;
}
