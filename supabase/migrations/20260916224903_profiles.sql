-- Phase 8 step 2: `profiles` is the one player-facing identity row, created
-- automatically the instant `auth.users` gets a new row (including an
-- anonymous sign-in — Supabase anonymous users are real `auth.users` rows,
-- so this trigger covers guests too, and the row survives guest->permanent
-- account linking since linking preserves `auth.users.id`).
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name extensions.citext unique,
  created_at timestamptz not null default now()
);

comment on table public.profiles is
  'One row per auth.users row (including anonymous guests), created by the on-insert trigger below.';

-- security definer: this runs as the trigger owner (not the inserting role),
-- since anonymous/new-user inserts into auth.users happen outside any RLS
-- context a plain `authenticated`/`anon` policy could grant insert through.
create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id) values (new.id);
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;

create policy "profiles are readable by any authenticated user"
  on public.profiles for select
  to authenticated
  using (true);

create policy "users can update their own profile"
  on public.profiles for update
  to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));
