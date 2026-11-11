-- Guichet fiscal : mise à jour 41 (photo de profil des fonctionnaires)
--
-- Chaque fonctionnaire peut avoir une photo de profil : il la met lui-même depuis Mon espace, ou la
-- Direction et les ressources humaines depuis sa fiche. Elle s'affiche dans Mon espace, sur la fiche,
-- dans l'effectif, l'annuaire et la messagerie.
-- Photos dans l'espace privé « profils » (un fichier par fiche : <identifiant de la fiche>.jpg, carré,
-- ≈ 30 Ko) ; la fiche porte la date de la photo (« photoAt »), qui sert aussi à recharger la nouvelle.
-- Lecture : toute personne qui a un accès au guichet (rôle ou fiche de fonctionnaire en service).
--
-- À exécuter après supabase/v40_demandes_reservees.sql. Il peut être exécuté plusieurs fois.

begin;

-- 1. Espace des photos ------------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('profils', 'profils', false, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "profils lecture"      on storage.objects;
drop policy if exists "profils ajout"        on storage.objects;
drop policy if exists "profils modification" on storage.objects;
drop policy if exists "profils suppression"  on storage.objects;
create policy "profils lecture" on storage.objects for select to authenticated
  using (bucket_id = 'profils' and ((select public.mon_role()) is not null or (select public.mon_fonctionnaire()) is not null));
-- Écriture : la Direction et les RH pour tous ; chacun pour sa propre photo.
create policy "profils ajout" on storage.objects for insert to authenticated
  with check (bucket_id = 'profils' and ((select public.mon_role()) in ('direction', 'rh') or name = (select public.mon_fonctionnaire()) || '.jpg'));
create policy "profils modification" on storage.objects for update to authenticated
  using (bucket_id = 'profils' and ((select public.mon_role()) in ('direction', 'rh') or name = (select public.mon_fonctionnaire()) || '.jpg'))
  with check (bucket_id = 'profils' and ((select public.mon_role()) in ('direction', 'rh') or name = (select public.mon_fonctionnaire()) || '.jpg'));
create policy "profils suppression" on storage.objects for delete to authenticated
  using (bucket_id = 'profils' and ((select public.mon_role()) in ('direction', 'rh') or name = (select public.mon_fonctionnaire()) || '.jpg'));

-- 2. Le fonctionnaire note (ou retire) sa propre photo sur sa fiche ------------------------------------
create or replace function public.ma_photo_profil(p_presente boolean)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  v_fid text := public.mon_fonctionnaire();
  v_at  text := to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
begin
  if v_fid is null then
    raise exception 'Votre compte Discord n''est relié à aucune fiche de fonctionnaire en service.';
  end if;
  update public.registre
     set data = case when p_presente then data || jsonb_build_object('photoAt', v_at) else data - 'photoAt' end
   where collection = 'fonctionnaires' and id = v_fid;
  return case when p_presente then v_at end;
end
$$;
revoke all on function public.ma_photo_profil(boolean) from public, anon;
grant execute on function public.ma_photo_profil(boolean) to authenticated;

-- 3. Les photos de l'équipe, pour l'annuaire de Mon espace (fiche → date de la photo) -------------------
create or replace function public.photos_profils()
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select case when public.mon_role() is null and public.mon_fonctionnaire() is null then '{}'::jsonb
    else coalesce((select jsonb_object_agg(f.id, f.data->>'photoAt')
                   from public.registre f
                   where f.collection = 'fonctionnaires' and coalesce(f.data->>'actif', 'true') <> 'false'
                     and coalesce(f.data->>'photoAt', '') <> ''), '{}'::jsonb) end
$$;
revoke all on function public.photos_profils() from public, anon;
grant execute on function public.photos_profils() to authenticated;

commit;
