-- Guichet fiscal : mise à jour 39 (onglet Sécurité visible par les ressources humaines)
--
-- Les ressources humaines voient l'onglet Sécurité en lecture : entrées dans la Préfecture, contrôles
-- d'identité avec les photos des pièces, rapports du service de la protection. Elles n'ajoutent, ne
-- modifient et ne suppriment rien (sauf une personne des RH qui serait aussi du service de la protection,
-- selon le grade de sa fiche, comme avant).
--
-- À exécuter après supabase/v38_securite.sql. Il peut être exécuté plusieurs fois.

begin;

-- 1. Registre : lecture de la mise à jour 38, plus les RH pour les trois collections de la sécurité -------
drop policy if exists "registre lecture" on public.registre;
create policy "registre lecture" on public.registre for select to authenticated using (
  (select public.mon_role()) in ('direction', 'inspecteur', 'lecture')
  or ((select public.mon_role()) = 'rh'
      and (collection in ('config', 'fonctionnaires', 'contratsTravail', 'rh', 'messagesAgents', 'agenda', 'absences', 'notesService', 'sanctions', 'demandesAgents', 'entretiens',
                          'securiteEntrees', 'securiteControles', 'securiteRapports')
           or (collection = 'rappels' and data->>'origine' = 'retenue' and coalesce(data->>'sanction', '') <> '')))
  or ((select public.mon_role()) = 'pointeuse' and collection = 'pointages'
      and data->>'discordId' = (select public.mon_discord())
      and now() < timestamptz '2026-11-09 00:00:00 Europe/Paris')
  or (collection in ('securiteEntrees', 'securiteControles', 'securiteRapports') and (select public.ma_protection()) is not null));

-- 2. Photos de l'espace « securite » : lecture pour les RH aussi (ajout et suppression inchangés) ----------
drop policy if exists "securite lecture" on storage.objects;
create policy "securite lecture" on storage.objects for select to authenticated
  using (bucket_id = 'securite' and ((select public.mon_role()) in ('direction', 'rh') or (select public.ma_protection()) is not null));

commit;
