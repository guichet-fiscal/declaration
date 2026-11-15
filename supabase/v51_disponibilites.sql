-- Guichet fiscal : mise à jour 51 (disponibilités des fonctionnaires)
--
-- Chaque fonctionnaire indique depuis Mon espace ses plages de disponibilité : chaque semaine (jour, de, à ;
-- une plage peut passer minuit) et, en plus, des plages ponctuelles datées (60 jours). La Direction, l'Inspection
-- et les RH les voient dans Personnel → Disponibilités et en fixant un rendez-vous de l'agenda (qui est
-- disponible à l'heure choisie, créneaux communs aux invités). Rangées dans la collection « rh » du registre
-- (document « dispo-<fiche> »), que la Direction et les RH lisent déjà ; le fonctionnaire ne les lit et ne les
-- écrit que par mes_disponibilites().
--
-- À exécuter après supabase/v30_espace_agents.sql. Il peut être exécuté plusieurs fois.

begin;

create or replace function public.mes_disponibilites(p_data jsonb default null)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_fid  text := public.mon_fonctionnaire();
  v_f    jsonb;
  v_cur  jsonb;
  v_h    jsonb := '[]'::jsonb;
  v_p    jsonb := '[]'::jsonb;
  v_x    jsonb;
  v_new  jsonb;
  v_hh   text := '^([01][0-9]|2[0-3]):[0-5][0-9]$';
  v_auj  date := (now() at time zone 'Europe/Paris')::date;
  v_m    text := to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  if v_fid is null then
    raise exception 'Votre compte n’est relié à aucune fiche de fonctionnaire en service.' using errcode = '28000';
  end if;
  select r.data into v_cur from public.registre r where r.collection = 'rh' and r.id = 'dispo-' || v_fid;
  if p_data is null then
    return coalesce(v_cur, '{}'::jsonb);
  end if;
  if jsonb_typeof(coalesce(p_data->'hebdo', '[]'::jsonb)) <> 'array' or jsonb_typeof(coalesce(p_data->'ponctuelles', '[]'::jsonb)) <> 'array' then
    raise exception 'Disponibilités illisibles.';
  end if;
  if jsonb_array_length(coalesce(p_data->'hebdo', '[]'::jsonb)) > 28 then
    raise exception 'Au plus 28 plages chaque semaine (4 par jour).';
  end if;
  if jsonb_array_length(coalesce(p_data->'ponctuelles', '[]'::jsonb)) > 30 then
    raise exception 'Au plus 30 plages ponctuelles.';
  end if;
  for v_x in select e.value from jsonb_array_elements(coalesce(p_data->'hebdo', '[]'::jsonb)) e loop
    if coalesce(v_x->>'j', '') !~ '^[1-7]$' or coalesce(v_x->>'de', '') !~ v_hh or coalesce(v_x->>'a', '') !~ v_hh or v_x->>'de' = v_x->>'a' then
      raise exception 'Plage de la semaine incomplète : un jour, une heure de début et une heure de fin différentes.';
    end if;
    v_h := v_h || jsonb_build_array(jsonb_build_object('j', (v_x->>'j')::int, 'de', v_x->>'de', 'a', v_x->>'a'));
  end loop;
  for v_x in select e.value from jsonb_array_elements(coalesce(p_data->'ponctuelles', '[]'::jsonb)) e loop
    if coalesce(v_x->>'date', '') !~ '^\d{4}-\d{2}-\d{2}$' or coalesce(v_x->>'de', '') !~ v_hh or coalesce(v_x->>'a', '') !~ v_hh or v_x->>'de' = v_x->>'a' then
      raise exception 'Plage ponctuelle incomplète : une date, une heure de début et une heure de fin différentes.';
    end if;
    if (v_x->>'date')::date < v_auj - 1 or (v_x->>'date')::date > v_auj + 60 then
      continue; -- passée ou trop lointaine : non gardée
    end if;
    v_p := v_p || jsonb_build_array(jsonb_build_object('date', v_x->>'date', 'de', v_x->>'de', 'a', v_x->>'a'));
  end loop;
  select r.data into v_f from public.registre r where r.collection = 'fonctionnaires' and r.id = v_fid;
  v_new := jsonb_build_object('type', 'disponibilites', 'fid', v_fid, 'nom', coalesce(v_f->>'nom', ''),
    'hebdo', v_h, 'ponctuelles', v_p, 'note', left(btrim(coalesce(p_data->>'note', '')), 300), 'majLe', v_m);
  insert into public.registre (collection, id, data) values ('rh', 'dispo-' || v_fid, v_new)
    on conflict (collection, id) do update set data = excluded.data;
  return v_new;
end
$$;
revoke all on function public.mes_disponibilites(jsonb) from public, anon;
grant execute on function public.mes_disponibilites(jsonb) to authenticated;

commit;
