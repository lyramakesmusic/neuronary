-- Readouts belong to the neuron, not to an interpretation. A readout is one named block (R lens, activations, net,
-- heads...) for one neuron of one model: pushed with the original upload, added to later when a new lens comes out.
-- Interpretations are like reproductions: many per neuron, each just text + confidence + who.

alter table public.interpretations drop column if exists fields;

create table if not exists public.neuron_readouts (
  id            bigint generated always as identity primary key,
  model         text not null check (length(model) between 1 and 200),
  layer         int  not null check (layer between 0 and 1000),
  neuron        int  not null check (neuron between 0 and 10000000),
  expert        int  check (expert is null or expert between 0 and 100000),
  name          text not null check (length(btrim(name)) between 1 and 80),
  block         jsonb not null check (jsonb_typeof(block) = 'object' and pg_column_size(block) <= 65536),
  source        text check (source is null or length(source) <= 300),
  user_id       uuid references auth.users(id) on delete cascade,
  author_handle text not null default '',
  hidden        boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index if not exists neuron_readouts_one_per_name on public.neuron_readouts (model, layer, neuron, coalesce(expert, -1), lower(name));
create index if not exists neuron_readouts_unit on public.neuron_readouts (model, layer, neuron);

alter table public.neuron_readouts enable row level security;
drop policy if exists "readouts are public" on public.neuron_readouts;
create policy "readouts are public" on public.neuron_readouts for select using (not hidden or user_id = auth.uid() or public.is_admin());
drop policy if exists "delete own readouts" on public.neuron_readouts;
create policy "delete own readouts" on public.neuron_readouts for delete to authenticated using (user_id = auth.uid() or public.is_admin());
-- writes only through post_readouts()

-- items: [{model, layer, neuron, expert?, source?, fields: [{type, name, ...}, ...]}]; each field becomes (or replaces)
-- the neuron's block of that name. Someone else's block of the same name is left alone and reported as skipped.
create or replace function public.post_readouts(items jsonb, as_user uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := case when auth.role() = 'service_role' then as_user else auth.uid() end;
  p record;
  admin boolean;
  n_blocks int;
  n_today int;
  written int;
begin
  if uid is null then raise exception 'sign in first'; end if;
  if jsonb_typeof(items) <> 'array' then raise exception 'items must be a list'; end if;
  if jsonb_array_length(items) > 1000 then raise exception 'at most 1000 neurons per call'; end if;
  select handle, trusted, is_admin, x_handle into p from public.profiles where id = uid;
  if p.handle is null then raise exception 'pick a handle first'; end if;
  perform public.check_not_struck(uid);
  admin := coalesce(p.is_admin, false);
  select count(*) into n_blocks from jsonb_array_elements(items) it, jsonb_array_elements(coalesce(it->'fields', '[]'::jsonb)) f;
  if n_blocks > 10000 then raise exception 'at most 10000 readout blocks per call'; end if;
  if exists (select 1 from jsonb_array_elements(items) it, jsonb_array_elements(coalesce(it->'fields', '[]'::jsonb)) f
             where jsonb_typeof(f) <> 'object' or coalesce(btrim(f->>'name'), '') = '' or coalesce(f->>'type', '') = '') then
    raise exception 'every readout block needs a type and a name';
  end if;
  if not admin and not coalesce(p.trusted, false) then
    if p.x_handle is null then raise exception 'readouts need an account signed in with X (or trusted-publisher status)'; end if;
    select count(*) into n_today from public.neuron_readouts where user_id = uid and updated_at > now() - interval '1 day';
    if n_today + n_blocks > 5000 then raise exception 'rate limit: 5000 readout blocks a day (ask for trusted-publisher status to import a whole model)'; end if;
  end if;
  with x as (
    select it->>'model' as model, (it->>'layer')::int as layer, (it->>'neuron')::int as neuron, (it->>'expert')::int as expert,
           it->>'source' as source, f as block, btrim(f->>'name') as name
    from jsonb_array_elements(items) it, jsonb_array_elements(coalesce(it->'fields', '[]'::jsonb)) f
  ), up as (
    insert into public.neuron_readouts as r (model, layer, neuron, expert, name, block, source, user_id, author_handle)
    select model, layer, neuron, expert, name, block, source, uid, p.handle from x
    on conflict (model, layer, neuron, (coalesce(expert, -1)), (lower(name))) do update
      set block = excluded.block, source = excluded.source, updated_at = now()
      where r.user_id = uid or admin
    returning r.id
  )
  select count(*) into written from up;
  return jsonb_build_object('written', written, 'skipped', n_blocks - written);
end $$;
revoke all on function public.post_readouts(jsonb, uuid) from public, anon;
grant execute on function public.post_readouts(jsonb, uuid) to authenticated, service_role;

-- interpretations: text + confidence only
create or replace function public.post_interpretations(items jsonb, as_user uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := case when auth.role() = 'service_role' then as_user else auth.uid() end;
  p record;
  n_new int;
  n_today int;
  cap int;
  ids bigint[];
begin
  if uid is null then raise exception 'sign in first'; end if;
  if jsonb_typeof(items) <> 'array' then raise exception 'items must be a list'; end if;
  if jsonb_array_length(items) = 0 then return jsonb_build_object('count', 0, 'ids', '[]'::jsonb); end if;
  if jsonb_array_length(items) > 1000 then raise exception 'at most 1000 interpretations per call'; end if;
  select handle, trusted, is_admin, x_handle into p from public.profiles where id = uid;
  if p.handle is null then raise exception 'pick a handle first'; end if;
  perform public.check_not_struck(uid);
  if not coalesce(p.is_admin, false) and not coalesce(p.trusted, false) then
    cap := case when p.x_handle is not null then 1000 else 200 end;
    select count(*) into n_today from public.interpretations where user_id = uid and created_at > now() - interval '1 day';
    n_new := jsonb_array_length(items);
    if n_today + n_new > cap then
      raise exception 'rate limit: % interpretations a day (% left today; ask for trusted-publisher status to import a whole model)', cap, greatest(cap - n_today, 0);
    end if;
  end if;
  perform set_config('neuronary.trusted_write', 'on', true);
  with x as (
    select * from jsonb_to_recordset(items) as t(model text, layer int, neuron int, expert int, text text, confidence real, source text, method text)
  ), up as (
    insert into public.interpretations as i (model, layer, neuron, expert, text, confidence, source, method, user_id, author_handle)
    select x.model, x.layer, x.neuron, x.expert, x.text, x.confidence, x.source, x.method, uid, p.handle from x
    on conflict (model, layer, neuron, (coalesce(expert, -1)), user_id) do update
      set text = excluded.text, confidence = excluded.confidence, source = excluded.source, method = excluded.method,
          author_handle = excluded.author_handle, updated_at = now()
    returning i.id
  )
  select array_agg(id) into ids from up;
  perform set_config('neuronary.trusted_write', 'off', true);
  return jsonb_build_object('count', coalesce(array_length(ids, 1), 0), 'ids', to_jsonb(coalesce(ids, '{}'::bigint[])));
end $$;
