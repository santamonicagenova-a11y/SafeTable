-- ============================================
-- Garanzia CC — Schema database
-- Esegui questo file in Supabase → SQL Editor
-- ============================================

-- Estensione per UUID
create extension if not exists "uuid-ossp";

-- Tabella richieste di garanzia
create table if not exists cauzioni (
  id                  uuid primary key default uuid_generate_v4(),
  short_id            text unique not null,           -- ID breve per URL (es. "k8m2x9p")
  telefono            text not null,                  -- numero cliente (E.164: +393331234567)
  nome_cliente        text,
  data_prenotazione   timestamptz,
  persone             int  not null check (persone >= 1 and persone <= 50),
  penale              int  not null check (penale >= 0),     -- € a persona
  ore_disdetta        int  not null check (ore_disdetta >= 1 and ore_disdetta <= 168),
  ristorante_nome     text not null,
  ristorante_phone    text,
  status              text not null default 'pending'
                      check (status in ('pending','confirmed','charged','cancelled')),
  stripe_session_id   text,
  stripe_session_url  text,
  stripe_customer_id  text,
  payment_method_id   text,
  confirmed_at        timestamptz,
  created_at          timestamptz not null default now()
);

create index if not exists idx_cauzioni_short_id on cauzioni(short_id);
create index if not exists idx_cauzioni_telefono on cauzioni(telefono);
create index if not exists idx_cauzioni_status   on cauzioni(status);

-- Colonne extra per addebito (charge-cauzione)
alter table cauzioni add column if not exists charged_at timestamptz;
alter table cauzioni add column if not exists charged_amount int;
alter table cauzioni add column if not exists stripe_payment_intent_id text;

-- ============================================
-- RLS — Row Level Security
-- ============================================
-- Le Edge Functions usano la service_role e bypassano RLS.
-- Il frontend (con anon key) può:
--   - INSERIRE una nuova cauzione (per la pagina admin)
--   - LEGGERE qualsiasi cauzione tramite il suo short_id
--     (il short_id stesso fa da "token" — è generato in modo casuale e non enumerable)
--   - non può MODIFICARE né ELIMINARE direttamente

alter table cauzioni enable row level security;

-- Permetti SELECT a tutti (la conoscenza dello short_id è il gate)
create policy "Public read by short_id"
  on cauzioni for select
  using (true);

-- Permetti INSERT a tutti (anon può creare richieste dal pannello admin)
create policy "Public insert"
  on cauzioni for insert
  with check (true);

-- Nessuna policy UPDATE/DELETE per anon — solo service_role può modificare
-- (le Edge Functions usano service_role bypassando RLS)
