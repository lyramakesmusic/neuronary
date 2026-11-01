-- Fixes from the petal red team (2026-10-31). Numbers match their handoff.

-- 1. The strike check ran before recipes_bi pinned user_id, on the client-supplied user_id: a struck account could post
--    by naming someone else's id. Check the caller unless it's the backend (API posts set user_id themselves).
create or replace function public.posts_not_struck() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := case when public.is_backend() then new.user_id else auth.uid() end;
begin
  if uid is not null then perform public.check_not_struck(uid); end if;
  return new;
end $$;

-- 6. conditional is shown on the recipe page: re-moderate when it changes, and cap its size
create or replace function public.recipes_after_edit() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.origin = 'site' and not new.draft and not old.draft and (
       new.name is distinct from old.name or new.description is distinct from old.description
    or new.tags is distinct from old.tags or new.examples is distinct from old.examples
    or new.notes is distinct from old.notes or new.source is distinct from old.source
    or new.aliases is distinct from old.aliases or new.dose_curve is distinct from old.dose_curve
    or new.conditional is distinct from old.conditional) then
    perform public.request_moderation('recipe', new.id);
  end if;
  return new;
end $$;
alter table public.recipes drop constraint if exists recipes_conditional_size;
alter table public.recipes add constraint recipes_conditional_size check (conditional is null or pg_column_size(conditional) <= 8192) not valid;

-- 7. recipe_stats runs as its owner: without a filter it listed hidden and draft recipe ids and their counts
create or replace view public.recipe_stats as
 SELECT r.id AS recipe_id,
    (COALESCE(v.score, (0)::bigint))::integer AS score,
    (COALESCE(v.ups, (0)::bigint))::integer AS ups,
    (COALESCE(v.downs, (0)::bigint))::integer AS downs,
    (COALESCE(c.n, (0)::bigint))::integer AS comments,
    (COALESCE(p.yes, (0)::bigint))::integer AS reproductions,
    (COALESCE(p.partial, (0)::bigint))::integer AS repro_partial,
    (COALESCE(p.no, (0)::bigint))::integer AS repro_failed
   FROM (((recipes r
     LEFT JOIN ( SELECT votes.recipe_id, sum(votes.value) AS score,
            count(*) FILTER (WHERE (votes.value > 0)) AS ups, count(*) FILTER (WHERE (votes.value < 0)) AS downs
           FROM votes GROUP BY votes.recipe_id) v ON ((v.recipe_id = r.id)))
     LEFT JOIN ( SELECT comments.recipe_id, count(*) AS n FROM comments WHERE (NOT comments.hidden)
           GROUP BY comments.recipe_id) c ON ((c.recipe_id = r.id)))
     LEFT JOIN ( SELECT reproductions.recipe_id,
            count(*) FILTER (WHERE (reproductions.result = 'yes'::text)) AS yes,
            count(*) FILTER (WHERE (reproductions.result = 'partial'::text)) AS partial,
            count(*) FILTER (WHERE (reproductions.result = 'no'::text)) AS no
           FROM reproductions WHERE (NOT reproductions.hidden) GROUP BY reproductions.recipe_id) p ON ((p.recipe_id = r.id)))
  WHERE (NOT r.hidden AND NOT r.draft);

-- 9. free_handle is internal (definer functions call it as owner); PUBLIC still had execute
revoke all on function public.free_handle(text) from public, anon, authenticated;

-- 10. Caps counted live rows, so deleting reset them (and every re-insert cost a moderation call). Count from an
--     insert-only log instead. Interpretation and readout edits count too: each text change is a moderation call.
create table if not exists public.post_log (
  id         bigint generated always as identity primary key,
  user_id    uuid not null,
  kind       text not null,
  created_at timestamptz not null default now()
);
create index if not exists post_log_user_kind on public.post_log (user_id, kind, created_at);
alter table public.post_log enable row level security; -- no policies: only definer functions touch it
revoke all on public.post_log from anon, authenticated;

create or replace function public.log_post() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.user_id is not null then
    insert into public.post_log (user_id, kind) values (new.user_id, tg_argv[0]);
  end if;
  return new;
end $$;
drop trigger if exists comments_zz_log on public.comments;
create trigger comments_zz_log after insert on public.comments for each row execute function public.log_post('comment');
drop trigger if exists reproductions_zz_log on public.reproductions;
create trigger reproductions_zz_log after insert or update of output, prompt, note on public.reproductions for each row execute function public.log_post('reproduction');
drop trigger if exists interpretations_zz_log on public.interpretations;
create trigger interpretations_zz_log after insert or update of text on public.interpretations for each row execute function public.log_post('interpretation');
drop trigger if exists neuron_readouts_zz_log on public.neuron_readouts;
create trigger neuron_readouts_zz_log after insert or update of block on public.neuron_readouts for each row execute function public.log_post('readout');
drop trigger if exists reports_zz_log on public.reports;
create trigger reports_zz_log after insert on public.reports for each row execute function public.log_post('report');

create or replace function public.posts_since(uid uuid, k text, since interval) returns int
language sql stable security definer set search_path = public as $$
  select count(*)::int from public.post_log where user_id = uid and kind = k and created_at > now() - since;
$$;
revoke all on function public.posts_since(uuid, text, interval) from public, anon, authenticated;
grant execute on function public.posts_since(uuid, text, interval) to service_role;

create or replace function public.comments_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_backend() then return new; end if;
  new.user_id := auth.uid();
  new.author_handle := public.my_handle();
  if new.author_handle is null then raise exception 'pick a handle first'; end if;
  new.hidden := false;
  new.created_at := now();
  if new.parent_id is not null and not exists (
      select 1 from public.comments p where p.id = new.parent_id and p.recipe_id = new.recipe_id and p.parent_id is null) then
    raise exception 'replies go one level deep, on the same recipe';
  end if;
  if not exists (select 1 from public.recipes r where r.id = new.recipe_id and ((not r.hidden and not r.draft) or r.user_id = auth.uid() or public.is_admin())) then
    raise exception 'no such recipe';
  end if;
  if public.posts_since(auth.uid(), 'comment', '1 hour') >= 60 then raise exception 'rate limit: 60 comments an hour'; end if;
  if public.posts_since(auth.uid(), 'comment', '1 day') >= 300 then raise exception 'rate limit: 300 comments a day'; end if;
  return new;
end $$;

create or replace function public.reproductions_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_backend() then return new; end if;
  if auth.uid() is null then raise exception 'sign in first'; end if;
  new.user_id := auth.uid();
  new.author_handle := public.my_handle();
  if new.author_handle is null then raise exception 'pick a handle first'; end if;
  if exists (select 1 from public.recipes r where r.id = new.recipe_id and r.user_id = auth.uid()) then
    raise exception 'reproductions are for other people''s recipes; add an example to your own instead';
  end if;
  if not exists (select 1 from public.recipes r where r.id = new.recipe_id and not r.hidden and not r.draft) then
    raise exception 'no such recipe';
  end if;
  new.hidden := false;
  new.created_at := now();
  if public.posts_since(auth.uid(), 'reproduction', '1 hour') >= 30 then raise exception 'rate limit: 30 reproductions an hour'; end if;
  return new;
end $$;

-- reports: one per person per target, and a backstop of 20 a day (reports cost no model call, only admin attention)
create or replace function public.reports_before_insert() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if public.is_backend() then return new; end if;
  new.user_id := auth.uid();
  if exists (select 1 from public.reports x where x.user_id = auth.uid()
             and x.recipe_id is not distinct from new.recipe_id and x.comment_id is not distinct from new.comment_id
             and x.reproduction_id is not distinct from new.reproduction_id) then
    raise exception 'you already reported this';
  end if;
  if public.posts_since(auth.uid(), 'report', '1 day') >= 20 then raise exception 'rate limit: 20 reports a day'; end if;
  return new;
end $$;
drop trigger if exists reports_bi on public.reports;
create trigger reports_bi before insert on public.reports for each row execute function public.reports_before_insert();

-- interpretations: caps from the log (direct writes and the RPC)
create or replace function public.interpretations_before_write() returns trigger
language plpgsql security definer set search_path = public as $$
declare
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
  else
    new.user_id := auth.uid();
    new.author_handle := public.my_handle();
    if new.author_handle is null then raise exception 'pick a handle first'; end if;
    new.hidden := false;
    new.created_at := now(); new.updated_at := now();
  end if;
  perform public.check_not_struck(auth.uid());
  select trusted, is_admin, x_handle into p from public.profiles where id = auth.uid();
  if not coalesce(p.is_admin, false) and not coalesce(p.trusted, false) then
    cap := case when p.x_handle is not null then 1000 else 200 end;
    if public.posts_since(auth.uid(), 'interpretation', '1 day') >= cap then
      raise exception 'rate limit: % interpretations a day (ask for trusted-publisher status to import a whole model)', cap;
    end if;
  end if;
  return new;
end $$;

create or replace function public.post_interpretations(items jsonb, as_user uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := case when auth.role() = 'service_role' then as_user else auth.uid() end;
  p record;
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
    if public.posts_since(uid, 'interpretation', '1 day') + jsonb_array_length(items) > cap then
      raise exception 'rate limit: % interpretations a day (% left today; ask for trusted-publisher status to import a whole model)',
        cap, greatest(cap - public.posts_since(uid, 'interpretation', '1 day'), 0);
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

-- 5 + 12. readouts: moderated (unless trusted/admin), caps from the log, at most 200 blocks per neuron
alter table public.moderation_log drop constraint if exists moderation_log_kind_check;
alter table public.moderation_log add constraint moderation_log_kind_check
  check (kind in ('comment', 'recipe', 'reproduction', 'profile', 'interpretation', 'readout'));

create or replace function public.readouts_after_write() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.block is not distinct from old.block then return new; end if;
  if exists (select 1 from public.profiles where id = new.user_id and (trusted or is_admin)) then return new; end if;
  perform public.request_moderation('readout', new.id::text);
  return new;
end $$;
drop trigger if exists neuron_readouts_moderate on public.neuron_readouts;
create trigger neuron_readouts_moderate after insert or update on public.neuron_readouts for each row execute function public.readouts_after_write();

create or replace function public.post_readouts(items jsonb, as_user uuid default null) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  uid uuid := case when auth.role() = 'service_role' then as_user else auth.uid() end;
  p record;
  admin boolean;
  n_blocks int;
  written int;
  crowded text;
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
    if public.posts_since(uid, 'readout', '1 day') + n_blocks > 5000 then
      raise exception 'rate limit: 5000 readout blocks a day (ask for trusted-publisher status to import a whole model)';
    end if;
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
  select format('%s L%sN%s', r.model, r.layer, r.neuron) into crowded from public.neuron_readouts r
    where (r.model, r.layer, r.neuron) in (select it->>'model', (it->>'layer')::int, (it->>'neuron')::int from jsonb_array_elements(items) it)
    group by r.model, r.layer, r.neuron, coalesce(r.expert, -1) having count(*) > 200 limit 1;
  if crowded is not null then raise exception 'at most 200 readout blocks per neuron (%)', crowded; end if;
  return jsonb_build_object('written', written, 'skipped', n_blocks - written);
end $$;

-- 11. profiles: rows stay public (author names, avatars, marks), columns don't. name_status, strikes and recipe_limit
--     are for the owner and admins, through profile_private().
revoke select on public.profiles from anon, authenticated;
grant select (id, handle, x_handle, avatar_url, trusted, is_admin, created_at) on public.profiles to anon, authenticated;

create or replace function public.profile_private(uids uuid[])
returns table (id uuid, name_status text, strikes int, recipe_limit int)
language sql stable security definer set search_path = public as $$
  select p.id, p.name_status, p.strikes, p.recipe_limit from public.profiles p
  where p.id = any(uids) and (p.id = auth.uid() or public.is_admin());
$$;
revoke all on function public.profile_private(uuid[]) from public, anon;
grant execute on function public.profile_private(uuid[]) to authenticated;
