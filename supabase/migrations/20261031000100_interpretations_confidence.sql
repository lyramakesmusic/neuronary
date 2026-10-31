-- Confidence on recipes, and neuron interpretations (the atlas).
--
-- recipes.confidence: the author's own confidence (0-1) that the recipe does what it says. Optional.
--
-- interpretations: what one person (or one import) thinks a neuron does, with a confidence and any readouts they
-- attach (lens reads, top firings, net, heads) as typed blocks in `fields` (see AGENTS.md). One row per author per
-- neuron per model: posting again replaces it. Shown on neuron pages and single-neuron recipes.

alter table public.recipes add column if not exists confidence real check (confidence is null or (confidence >= 0 and confidence <= 1));

create table if not exists public.interpretations (
  id            bigint generated always as identity primary key,
  model         text not null check (length(model) between 1 and 200),
  layer         int  not null check (layer between 0 and 1000),
  neuron        int  not null check (neuron between 0 and 10000000),
  expert        int  check (expert is null or expert between 0 and 100000),
  text          text not null check (length(btrim(text)) between 1 and 1000),
  confidence    real check (confidence is null or (confidence >= 0 and confidence <= 1)),
  fields        jsonb not null default '[]'::jsonb check (jsonb_typeof(fields) = 'array' and pg_column_size(fields) <= 65536),
  source        text check (source is null or length(source) <= 300),
  method        text check (method is null or length(method) <= 300),
  user_id       uuid references auth.users(id) on delete cascade,
  author_handle text not null default '',
  hidden        boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists interpretations_unit on public.interpretations (model, layer, neuron);
create unique index if not exists interpretations_one_per_author on public.interpretations (model, layer, neuron, coalesce(expert, -1), user_id);

create or replace function public.interpretations_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  n int;
  cap int;
  p record;
begin
  if public.is_backend() then return new; end if;
  if auth.uid() is null then raise exception 'sign in first'; end if;
  if tg_op = 'UPDATE' then
    if old.user_id is distinct from auth.uid() and not public.is_admin() then raise exception 'not yours'; end if;
    new.user_id := old.user_id; new.author_handle := old.author_handle; new.created_at := old.created_at;
    new.model := old.model; new.layer := old.layer; new.neuron := old.neuron; new.expert := old.expert;
    if not public.is_admin() then new.hidden := old.hidden; end if;
    new.updated_at := now();
    return new;
  end if;
  new.user_id := auth.uid();
  new.author_handle := public.my_handle();
  if new.author_handle is null then raise exception 'pick a handle first'; end if;
  perform public.check_not_struck(auth.uid());
  new.hidden := false;
  new.created_at := now(); new.updated_at := now();
  -- backstops, same tiers as recipes: whole-model imports go through trusted publishers
  select trusted, is_admin, x_handle into p from public.profiles where id = auth.uid();
  if not coalesce(p.is_admin, false) and not coalesce(p.trusted, false) then
    cap := case when p.x_handle is not null then 1000 else 200 end;
    select count(*) into n from public.interpretations where user_id = auth.uid() and created_at > now() - interval '1 day';
    if n >= cap then raise exception 'rate limit: % interpretations a day (ask for trusted-publisher status to import a whole model)', cap; end if;
  end if;
  return new;
end $$;
drop trigger if exists interpretations_bw on public.interpretations;
create trigger interpretations_bw before insert or update on public.interpretations for each row execute function public.interpretations_before_write();

-- moderation: new interpretations from anyone but trusted publishers and admins (a whole-model import would be
-- hundreds of thousands of calls); edits to the text re-check
create or replace function public.interpretations_after_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.text is not distinct from old.text and new.source is not distinct from old.source then return new; end if;
  if exists (select 1 from public.profiles where id = new.user_id and (trusted or is_admin)) then return new; end if;
  perform public.request_moderation('interpretation', new.id::text);
  return new;
end $$;
drop trigger if exists interpretations_moderate on public.interpretations;
create trigger interpretations_moderate after insert or update on public.interpretations for each row execute function public.interpretations_after_write();

alter table public.interpretations enable row level security;
drop policy if exists "interpretations are public" on public.interpretations;
create policy "interpretations are public" on public.interpretations for select
  using (not hidden or user_id = auth.uid() or public.is_admin());
drop policy if exists "post interpretations" on public.interpretations;
create policy "post interpretations" on public.interpretations for insert to authenticated with check (user_id = auth.uid());
drop policy if exists "edit own interpretations" on public.interpretations;
create policy "edit own interpretations" on public.interpretations for update to authenticated
  using (user_id = auth.uid() or public.is_admin()) with check (user_id = auth.uid() or public.is_admin());
drop policy if exists "delete own interpretations" on public.interpretations;
create policy "delete own interpretations" on public.interpretations for delete to authenticated
  using (user_id = auth.uid() or public.is_admin());

-- moderation_log accepts the new kind
alter table public.moderation_log drop constraint if exists moderation_log_kind_check;
alter table public.moderation_log add constraint moderation_log_kind_check
  check (kind in ('comment', 'recipe', 'reproduction', 'profile', 'interpretation'));
