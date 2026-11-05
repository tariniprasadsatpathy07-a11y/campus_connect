-- Public demo identities only. These rows are not Supabase Auth users and
-- must not be used to authorize registrations or access private user data.
create table if not exists public.demo_profiles (
    id uuid primary key default gen_random_uuid(),
    display_name text not null check (char_length(display_name) between 1 and 60),
    created_at timestamptz not null default now()
);

create unique index if not exists demo_profiles_display_name_lower_key
    on public.demo_profiles (lower(display_name));

create table if not exists public.demo_user_preferences (
    device_id uuid primary key,
    demo_profile_id uuid not null references public.demo_profiles(id) on delete cascade,
    updated_at timestamptz not null default now()
);

alter table public.demo_profiles enable row level security;
alter table public.demo_user_preferences enable row level security;

grant select, insert on public.demo_profiles to anon, authenticated;
grant select, insert, update on public.demo_user_preferences to anon, authenticated;

drop policy if exists "Public can read demo profiles" on public.demo_profiles;
create policy "Public can read demo profiles" on public.demo_profiles
    for select to anon, authenticated using (true);

drop policy if exists "Public can add demo profiles" on public.demo_profiles;
create policy "Public can add demo profiles" on public.demo_profiles
    for insert to anon, authenticated with check (true);

drop policy if exists "Public can read demo preferences" on public.demo_user_preferences;
create policy "Public can read demo preferences" on public.demo_user_preferences
    for select to anon, authenticated using (true);

drop policy if exists "Public can add demo preferences" on public.demo_user_preferences;
create policy "Public can add demo preferences" on public.demo_user_preferences
    for insert to anon, authenticated with check (true);

drop policy if exists "Public can update demo preferences" on public.demo_user_preferences;
create policy "Public can update demo preferences" on public.demo_user_preferences
    for update to anon, authenticated using (true) with check (true);

insert into public.demo_profiles (display_name)
select seed.display_name
from (values ('Student'), ('Organizer')) as seed(display_name)
where not exists (
    select 1 from public.demo_profiles p
    where lower(p.display_name) = lower(seed.display_name)
);
