-- Black Belt Study - Supabase schema
-- Run this in Supabase SQL Editor.
-- After creating your admin Auth user, insert their UUID into admin_users.

create extension if not exists pgcrypto;

create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.official_decks (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  description text not null default '',
  icon text not null default '◈',
  sort_order int not null default 0,
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.official_categories (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null references public.official_decks(id) on delete cascade,
  name text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.official_cards (
  id uuid primary key default gen_random_uuid(),
  deck_id uuid not null references public.official_decks(id) on delete cascade,
  category_id uuid references public.official_categories(id) on delete set null,
  front text not null,
  back text not null,
  notes text not null default '',
  difficulty int not null default 1 check (difficulty between 1 and 5),
  sort_order int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.personal_decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.personal_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  deck_id uuid not null references public.personal_decks(id) on delete cascade,
  front text not null,
  back text not null,
  notes text not null default '',
  category text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists official_categories_deck_idx on public.official_categories(deck_id, sort_order);
create index if not exists official_cards_deck_idx on public.official_cards(deck_id, sort_order);
create index if not exists personal_decks_user_idx on public.personal_decks(user_id, created_at desc);
create index if not exists personal_cards_deck_idx on public.personal_cards(deck_id, created_at desc);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_users a
    where a.user_id = auth.uid()
  );
$$;

alter table public.admin_users enable row level security;
alter table public.official_decks enable row level security;
alter table public.official_categories enable row level security;
alter table public.official_cards enable row level security;
alter table public.personal_decks enable row level security;
alter table public.personal_cards enable row level security;

-- Public read access for published official content.
drop policy if exists "public read published official decks" on public.official_decks;
create policy "public read published official decks"
on public.official_decks for select
using (is_published = true or public.is_admin());

drop policy if exists "public read categories for published decks" on public.official_categories;
create policy "public read categories for published decks"
on public.official_categories for select
using (
  public.is_admin() or exists (
    select 1 from public.official_decks d
    where d.id = deck_id and d.is_published = true
  )
);

drop policy if exists "public read cards for published decks" on public.official_cards;
create policy "public read cards for published decks"
on public.official_cards for select
using (
  public.is_admin() or exists (
    select 1 from public.official_decks d
    where d.id = deck_id and d.is_published = true
  )
);

-- Only admins can create/change official content.
drop policy if exists "admins manage official decks" on public.official_decks;
create policy "admins manage official decks"
on public.official_decks for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins manage official categories" on public.official_categories;
create policy "admins manage official categories"
on public.official_categories for all using (public.is_admin()) with check (public.is_admin());

drop policy if exists "admins manage official cards" on public.official_cards;
create policy "admins manage official cards"
on public.official_cards for all using (public.is_admin()) with check (public.is_admin());

-- Admins can see their own admin row; nobody else needs to.
drop policy if exists "admins read own row" on public.admin_users;
create policy "admins read own row"
on public.admin_users for select using (auth.uid() = user_id);

-- Personal decks/cards: only the owner can read/write them.
drop policy if exists "users manage own personal decks" on public.personal_decks;
create policy "users manage own personal decks"
on public.personal_decks for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "users manage own personal cards" on public.personal_cards;
create policy "users manage own personal cards"
on public.personal_cards for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

-- Starter official decks. Edit/delete these if your own syllabus differs.
insert into public.official_decks (name, slug, description, icon, sort_order)
values
  ('Korean terminology', 'korean-terminology', 'Romanised Korean terms and their English meanings.', '🇰🇷', 10),
  ('Theory', 'theory', 'Black belt theory and knowledge.', '📖', 20),
  ('Techniques', 'techniques', 'Techniques and what you need to know about them.', '🦵', 30),
  ('Patterns', 'patterns', 'Pattern knowledge and revision prompts.', '🥋', 40)
on conflict (slug) do nothing;

insert into public.official_categories (deck_id, name, sort_order)
select d.id, c.name, c.sort_order
from public.official_decks d
join (values
  ('korean-terminology','Commands',10),
  ('korean-terminology','Stances',20),
  ('korean-terminology','Kicks',30),
  ('korean-terminology','Blocks',40),
  ('korean-terminology','General',50),
  ('theory','Tenets',10),
  ('theory','History',20),
  ('theory','Principles',30),
  ('techniques','Kicks',10),
  ('techniques','Blocks',20),
  ('techniques','Hand techniques',30),
  ('patterns','Pattern knowledge',10)
) as c(deck_slug, name, sort_order) on c.deck_slug = d.slug
where not exists (
  select 1 from public.official_categories oc where oc.deck_id = d.id and oc.name = c.name
);

-- Example Korean terms. Replace/add with your exact grading syllabus.
insert into public.official_cards (deck_id, category_id, front, back, notes, sort_order)
select d.id, c.id, x.front, x.back, x.notes, x.sort_order
from public.official_decks d
cross join (values
  ('Charyot','Attention','',10,'Commands'),
  ('Kyong Ye','Bow','',20,'Commands'),
  ('Joonbi','Ready','',30,'Commands'),
  ('Kihap','Spirit shout','',40,'General'),
  ('Kyorugi','Sparring','',50,'General')
) as x(front, back, notes, sort_order, category_name)
left join public.official_categories c on c.deck_id = d.id and c.name = x.category_name
where d.slug = 'korean-terminology'
  and c.id is not null
  and not exists (
    select 1 from public.official_cards oc where oc.deck_id = d.id and oc.front = x.front
  );
