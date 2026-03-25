-- Website Liker global community votes schema (Supabase SQL Editor)

create table if not exists public.site_vote_counts (
  site_key text primary key,
  likes bigint not null default 0 check (likes >= 0),
  dislikes bigint not null default 0 check (dislikes >= 0),
  updated_at timestamptz not null default now()
);

create table if not exists public.site_votes (
  site_key text not null,
  install_id uuid not null,
  vote text not null check (vote in ('like', 'dislike')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (site_key, install_id),
  constraint site_votes_site_key_fkey
    foreign key (site_key)
    references public.site_vote_counts(site_key)
    on delete cascade
);

create index if not exists site_votes_site_key_idx on public.site_votes(site_key);
create index if not exists site_votes_updated_at_idx on public.site_votes(updated_at desc);

alter table public.site_vote_counts enable row level security;
alter table public.site_votes enable row level security;

-- Read-only public access to aggregate counts.
drop policy if exists "Public can read vote counts" on public.site_vote_counts;
create policy "Public can read vote counts"
  on public.site_vote_counts
  for select
  to anon, authenticated
  using (true);

create or replace function public.get_site_vote_counts(p_site_key text)
returns table (
  site_key text,
  likes bigint,
  dislikes bigint
)
language sql
security definer
set search_path = public
as $$
  select
    p_site_key as site_key,
    coalesce((select svc.likes from public.site_vote_counts svc where svc.site_key = p_site_key), 0) as likes,
    coalesce((select svc.dislikes from public.site_vote_counts svc where svc.site_key = p_site_key), 0) as dislikes;
$$;

create or replace function public.submit_site_vote(
  p_site_key text,
  p_install_id uuid,
  p_vote text
)
returns table (
  site_key text,
  likes bigint,
  dislikes bigint,
  user_vote text
)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  existing_vote text;
begin
  if p_site_key is null or btrim(p_site_key) = '' then
    raise exception 'p_site_key is required';
  end if;

  if p_install_id is null then
    raise exception 'p_install_id is required';
  end if;

  if p_vote not in ('like', 'dislike', 'neutral') then
    raise exception 'p_vote must be like, dislike, or neutral';
  end if;

  insert into public.site_vote_counts(site_key, likes, dislikes, updated_at)
  values (p_site_key, 0, 0, now())
  on conflict on constraint site_vote_counts_pkey do nothing;

  perform 1
  from public.site_vote_counts svc
  where svc.site_key = p_site_key
  for update;

  select sv.vote
  into existing_vote
  from public.site_votes sv
  where sv.site_key = p_site_key and sv.install_id = p_install_id
  for update;

  if existing_vote = 'like' then
    update public.site_vote_counts as svc
    set likes = greatest(svc.likes - 1, 0), updated_at = now()
    where svc.site_key = p_site_key;
  elsif existing_vote = 'dislike' then
    update public.site_vote_counts as svc
    set dislikes = greatest(svc.dislikes - 1, 0), updated_at = now()
    where svc.site_key = p_site_key;
  end if;

  if p_vote = 'neutral' then
    delete from public.site_votes sv
    where sv.site_key = p_site_key and sv.install_id = p_install_id;
  else
    insert into public.site_votes(site_key, install_id, vote, created_at, updated_at)
    values (p_site_key, p_install_id, p_vote, now(), now())
    on conflict on constraint site_votes_pkey
    do update set vote = excluded.vote, updated_at = now();

    if p_vote = 'like' then
      update public.site_vote_counts as svc
      set likes = svc.likes + 1, updated_at = now()
      where svc.site_key = p_site_key;
    else
      update public.site_vote_counts as svc
      set dislikes = svc.dislikes + 1, updated_at = now()
      where svc.site_key = p_site_key;
    end if;
  end if;

  return query
  select
    svc.site_key,
    svc.likes,
    svc.dislikes,
    coalesce(
      (select sv.vote from public.site_votes sv where sv.site_key = p_site_key and sv.install_id = p_install_id),
      'neutral'
    ) as user_vote
  from public.site_vote_counts svc
  where svc.site_key = p_site_key;
end;
$$;

grant execute on function public.get_site_vote_counts(text) to anon, authenticated;
grant execute on function public.submit_site_vote(text, uuid, text) to anon, authenticated;
