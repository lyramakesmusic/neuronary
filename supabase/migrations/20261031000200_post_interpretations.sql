-- One write path for interpretations, used by the site (as the signed-in user) and the API (service role, as_user):
-- upserts up to 1000 at a time (one per author per neuron per model), with the strike check and daily backstops.
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
    select * from jsonb_to_recordset(items) as t(model text, layer int, neuron int, expert int, text text, confidence real, fields jsonb, source text, method text)
  ), up as (
    insert into public.interpretations as i (model, layer, neuron, expert, text, confidence, fields, source, method, user_id, author_handle)
    select x.model, x.layer, x.neuron, x.expert, x.text, x.confidence, coalesce(x.fields, '[]'::jsonb), x.source, x.method, uid, p.handle from x
    on conflict (model, layer, neuron, (coalesce(expert, -1)), user_id) do update
      set text = excluded.text, confidence = excluded.confidence, fields = excluded.fields,
          source = excluded.source, method = excluded.method, author_handle = excluded.author_handle, updated_at = now()
    returning i.id
  )
  select array_agg(id) into ids from up;
  perform set_config('neuronary.trusted_write', 'off', true);
  return jsonb_build_object('count', coalesce(array_length(ids, 1), 0), 'ids', to_jsonb(coalesce(ids, '{}'::bigint[])));
end $$;
revoke all on function public.post_interpretations(jsonb, uuid) from public, anon;
grant execute on function public.post_interpretations(jsonb, uuid) to authenticated, service_role;
