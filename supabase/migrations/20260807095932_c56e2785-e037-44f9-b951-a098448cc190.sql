alter table public.registrar_prices
  add column if not exists supported boolean not null default true,
  add column if not exists verified_at timestamptz null;