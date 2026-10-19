-- MATHEMA persistence schema with per-user isolation (Row Level Security).
-- Apply in the Supabase SQL editor. Every table is owned by auth.uid(); no row is readable by other accounts.

create table if not exists public.models (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  version int not null default 1,
  title text not null,
  kind text not null,
  body jsonb not null,            -- full MathModel document (variables, equations, spec, validation...)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.model_versions (
  id bigserial primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  model_id text not null references public.models(id) on delete cascade,
  version int not null,
  summary text,
  snapshot jsonb not null,
  created_at timestamptz not null default now()
);
create table if not exists public.conversations (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.messages (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  conversation_id text not null references public.conversations(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  mode text not null,
  body jsonb not null,
  created_at timestamptz not null default now()
);
create table if not exists public.sources (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null, kind text not null, body jsonb not null,
  created_at timestamptz not null default now()
);
create table if not exists public.experiments (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  model_id text not null references public.models(id) on delete cascade,
  body jsonb not null,
  created_at timestamptz not null default now()
);
create table if not exists public.relations (
  id text primary key,
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  from_id text not null, to_id text not null, type text not null,
  justification text not null, status text not null default 'proposed',
  created_at timestamptz not null default now()
);

do $$
declare t text;
begin
  foreach t in array array['models','model_versions','conversations','messages','sources','experiments','relations'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "owner only" on public.%I', t);
    execute format('create policy "owner only" on public.%I for all using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
  end loop;
end $$;
