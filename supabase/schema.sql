-- Snippetings database: anonymous posting, kindness rules, reports, optional approval.

create extension if not exists pgcrypto;

create table public.snippets (
  id          uuid primary key default gen_random_uuid(),
  text        text not null check (char_length(text) between 8 and 280),
  setting     text not null default 'Other'
              check (setting in ('Bus','Train','Street','Café','Shop','Waiting room','Pub','Work','Other')),
  place       text check (char_length(place) <= 40),
  heard_when  text check (char_length(heard_when) <= 30),
  status      text not null default 'live' check (status in ('pending','live','hidden')),
  smiles      integer not null default 0,
  reports     integer not null default 0,
  poster_hash text,                       -- one-way hash of IP + daily salt; never shown, only for rate limits
  created_at  timestamptz not null default now()
);
create index snippets_live_idx on public.snippets (status, created_at desc);
create index snippets_poster_idx on public.snippets (poster_hash, created_at desc);

create table public.settings (
  id int primary key default 1 check (id = 1),
  require_approval boolean not null default false,
  hide_after_reports int not null default 3
);
insert into public.settings default values;

create table public.reactions (
  snippet_id  uuid references public.snippets(id) on delete cascade,
  kind        text not null check (kind in ('smile','report')),
  poster_hash text not null,
  created_at  timestamptz not null default now(),
  primary key (snippet_id, kind, poster_hash)
);

-- Lock everything down; the public only reads live snippets and calls the functions below.
alter table public.snippets  enable row level security;
alter table public.settings  enable row level security;
alter table public.reactions enable row level security;

create policy "public reads live snippets" on public.snippets
  for select to anon, authenticated using (status = 'live');

revoke all on public.snippets, public.settings, public.reactions from anon, authenticated;
grant select (id, text, setting, place, heard_when, smiles, created_at, status)
  on public.snippets to anon, authenticated;

-- Who is calling, as an anonymous hash (IP + today's date). Not reversible, rotates daily.
create or replace function public._caller_hash() returns text
language sql stable set search_path = '' as $$
  select encode(extensions.digest(
    coalesce(split_part(current_setting('request.headers', true)::json->>'x-forwarded-for', ',', 1), 'unknown')
    || ':' || current_date::text || ':snippetings', 'sha256'), 'hex');
$$;

create or replace function public._is_unkind(t text) returns boolean
language sql immutable set search_path = '' as $$
  select t ~* '\m(f+u+c+k\w*|sh[i1]t\w*|c+u+n+t\w*|bastard\w*|bitch\w*|wank\w*|twat\w*|prick\w*|dick(head)?s?|arse(hole)?s?|asshole\w*|bollock\w*|piss(ed|ing)?|slag\w*|whore\w*|retard\w*|spastic\w*|spaz\w*|fag\w*|tranny|nigg\w*|paki\w*|chav\w*|fatty|fatso|ugly|stupid|idiot\w*|moron\w*|cretin\w*|tosser\w*|minger\w*)\M'
      or t ~* '(@\w{2,}|\S+@\S+\.\S+|https?://|\+?\d[\d\s-]{7,}\d)';
$$;

create or replace function public.submit_snippet(p_text text, p_setting text, p_place text, p_when text)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  h text := public._caller_hash();
  recent int;
  appr boolean;
  t text := btrim(regexp_replace(p_text, '^["''“‘]+|["''”’]+$', '', 'g'));
begin
  if char_length(t) < 8 then raise exception 'too_short'; end if;
  if char_length(t) > 280 then raise exception 'too_long'; end if;
  if public._is_unkind(t || ' ' || coalesce(p_place,'') || ' ' || coalesce(p_when,'')) then
    raise exception 'unkind';
  end if;
  select count(*) into recent from public.snippets
    where poster_hash = h and created_at > now() - interval '1 hour';
  if recent >= 5 then raise exception 'slow_down'; end if;
  if exists (select 1 from public.snippets where lower(text) = lower(t) and created_at > now() - interval '7 days') then
    raise exception 'duplicate';
  end if;
  select require_approval into appr from public.settings where id = 1;
  insert into public.snippets (text, setting, place, heard_when, status, poster_hash)
  values (t, coalesce(nullif(p_setting,''),'Other'), nullif(btrim(p_place),''), nullif(btrim(p_when),''),
          case when appr then 'pending' else 'live' end, h);
  return case when appr then 'pending' else 'live' end;
end $$;

create or replace function public.react(p_id uuid, p_kind text)
returns void
language plpgsql security definer set search_path = '' as $$
declare h text := public._caller_hash(); lim int;
begin
  if p_kind not in ('smile','report') then raise exception 'bad_kind'; end if;
  insert into public.reactions (snippet_id, kind, poster_hash) values (p_id, p_kind, h)
    on conflict do nothing;
  if not found then return; end if;
  if p_kind = 'smile' then
    update public.snippets set smiles = smiles + 1 where id = p_id and status = 'live';
  else
    select hide_after_reports into lim from public.settings where id = 1;
    update public.snippets set reports = reports + 1,
      status = case when reports + 1 >= lim then 'hidden' else status end
      where id = p_id;
  end if;
end $$;

revoke all on function public.submit_snippet(text,text,text,text), public.react(uuid,text),
  public._caller_hash(), public._is_unkind(text) from public;
grant execute on function public.submit_snippet(text,text,text,text), public.react(uuid,text) to anon, authenticated;
