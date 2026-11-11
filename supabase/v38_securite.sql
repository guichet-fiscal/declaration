-- Guichet fiscal : mise à jour 38 (espace Sécurité du service de la protection)
--
-- Les agents et les responsables du service de la protection ont, en plus de Mon espace, un onglet
-- « Sécurité » : registre des entrées dans la Préfecture, contrôles d'identité avec la photo de la pièce,
-- rapports. Ces dossiers sont dans le registre (collections securiteEntrees, securiteControles,
-- securiteRapports : journal et sauvegardes comme le reste) ; les photos dans l'espace privé « securite ».
--
-- Qui : la fiche de fonctionnaire en service dont le grade est celui du service de la protection
-- (« Agent service de la protection », « Responsable (adjoint) service de la protection », ou un grade
-- « agent de sécurité », « directeur / responsable / chef … sécurité »). Responsable : grade qui commence
-- par Responsable, Directeur, Directrice ou Chef.
--   - agents : lisent tout le service ; ajoutent et modifient les entrées et les contrôles (n'importe
--     lequel peut noter une sortie) ; ajoutent et modifient leurs propres rapports ;
--   - responsables : en plus, modifient tous les rapports (« lu ») et suppriment ;
--   - Direction : tout, comme pour le reste du registre ; Inspection et Lecture seule lisent le registre.
--
-- À exécuter après supabase/v37_suivi.sql. Il peut être exécuté plusieurs fois.

begin;

-- 1. Place dans le service de la protection : « agent », « responsable » ou rien ---------------------------
create or replace function public.ma_protection()
returns text
language sql stable security definer
set search_path = ''
as $$
  select case
           when f.data->>'grade' !~* '(service de la protection|agent de s[ée]curit[ée]|(responsable|directeur|directrice|chef).*s[ée]curit[ée])' then null
           when btrim(f.data->>'grade') ~* '^(responsable|directeur|directrice|chef)' then 'responsable'
           else 'agent'
         end
  from public.registre f
  where f.collection = 'fonctionnaires' and f.id = public.mon_fonctionnaire()
    and coalesce(f.data->>'actif', 'true') <> 'false'
  limit 1
$$;
revoke all on function public.ma_protection() from public, anon;
grant execute on function public.ma_protection() to authenticated;

-- 2. Écriture des dossiers de la sécurité par le service --------------------------------------------------
create or replace function public.ecriture_securite(p_collection text, p_data jsonb)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select p_collection in ('securiteEntrees', 'securiteControles', 'securiteRapports')
     and public.ma_protection() is not null
     and (p_collection <> 'securiteRapports'
          or public.ma_protection() = 'responsable'
          or p_data->>'fid' = public.mon_fonctionnaire())
$$;
revoke all on function public.ecriture_securite(text, jsonb) from public, anon;
grant execute on function public.ecriture_securite(text, jsonb) to authenticated;

drop policy if exists "registre ajout"        on public.registre;
drop policy if exists "registre modification" on public.registre;
create policy "registre ajout" on public.registre for insert to authenticated
  with check (public.ecriture_permise(collection, id, data) or public.ecriture_securite(collection, data));
create policy "registre modification" on public.registre for update to authenticated
  using (public.ecriture_permise(collection, id, data) or public.ecriture_securite(collection, data))
  with check (public.ecriture_permise(collection, id, data) or public.ecriture_securite(collection, data));

-- Suppressions : comme la mise à jour 29, plus les responsables de la protection pour leurs dossiers.
drop policy if exists "registre suppression" on public.registre;
create policy "registre suppression" on public.registre for delete to authenticated using (
  (select public.mon_role()) = 'direction'
  or ((select public.mon_role()) = 'rh' and collection = 'contratsTravail' and coalesce(data->>'statut', '') <> 'signe')
  or (collection in ('securiteEntrees', 'securiteControles', 'securiteRapports') and (select public.ma_protection()) = 'responsable'));

-- 3. Lecture : comme la mise à jour 36, plus le service de la protection pour ses dossiers -----------------
drop policy if exists "registre lecture" on public.registre;
create policy "registre lecture" on public.registre for select to authenticated using (
  (select public.mon_role()) in ('direction', 'inspecteur', 'lecture')
  or ((select public.mon_role()) = 'rh'
      and (collection in ('config', 'fonctionnaires', 'contratsTravail', 'rh', 'messagesAgents', 'agenda', 'absences', 'notesService', 'sanctions', 'demandesAgents', 'entretiens')
           or (collection = 'rappels' and data->>'origine' = 'retenue' and coalesce(data->>'sanction', '') <> '')))
  or ((select public.mon_role()) = 'pointeuse' and collection = 'pointages'
      and data->>'discordId' = (select public.mon_discord())
      and now() < timestamptz '2026-11-09 00:00:00 Europe/Paris')
  or (collection in ('securiteEntrees', 'securiteControles', 'securiteRapports') and (select public.ma_protection()) is not null));

-- 4. Photos : espace privé « securite » (5 Mo par fichier au plus ; le guichet les réduit à ~200 Ko) --------
-- Lecture et ajout : la Direction et le service ; suppression : la Direction, les responsables, et chacun
-- pour les photos qu'il a envoyées (photo remplacée dans un dossier).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('securite', 'securite', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "securite lecture"     on storage.objects;
drop policy if exists "securite ajout"       on storage.objects;
drop policy if exists "securite suppression" on storage.objects;
create policy "securite lecture" on storage.objects for select to authenticated
  using (bucket_id = 'securite' and ((select public.mon_role()) = 'direction' or (select public.ma_protection()) is not null));
create policy "securite ajout" on storage.objects for insert to authenticated
  with check (bucket_id = 'securite' and ((select public.mon_role()) = 'direction' or (select public.ma_protection()) is not null));
create policy "securite suppression" on storage.objects for delete to authenticated
  using (bucket_id = 'securite' and ((select public.mon_role()) = 'direction' or (select public.ma_protection()) = 'responsable'
                                     or owner = (select auth.uid())));

commit;
