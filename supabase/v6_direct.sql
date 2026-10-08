-- Guichet fiscal : mise à jour 6 · Travail à plusieurs en direct
--
-- À exécuter une fois dans Supabase → SQL Editor, après les mises à jour 3, 4 et 5.
-- Le script peut être relancé sans risque.
--
-- Le registre arrive déjà en direct chez chaque agent (schema.sql). Ce script ajoute :
--  1. le journal en direct : l'onglet Journal se remplit tout seul et le site sait
--     quel agent vient de modifier un dossier ;
--  2. la présence : qui est connecté et quel dossier il consulte. Elle passe par un
--     salon privé que seuls les agents du guichet peuvent rejoindre.

-- 1. Journal en direct -----------------------------------------------------
do $$
begin
  alter publication supabase_realtime add table public.journal;
exception when duplicate_object then null;
end
$$;

-- 2. Présence des agents ---------------------------------------------------
-- Le salon « guichet:presence » est privé : Supabase n'y admet que les connexions
-- dont l'agent figure dans la table des accès (quel que soit son rôle).
drop policy if exists "guichet presence lecture" on realtime.messages;
create policy "guichet presence lecture" on realtime.messages
  for select to authenticated
  using (realtime.topic() = 'guichet:presence' and public.mon_role() is not null);

drop policy if exists "guichet presence envoi" on realtime.messages;
create policy "guichet presence envoi" on realtime.messages
  for insert to authenticated
  with check (realtime.topic() = 'guichet:presence' and public.mon_role() is not null);
