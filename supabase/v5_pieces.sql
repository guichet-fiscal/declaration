-- =====================================================================
-- Guichet fiscal : mise à jour 5 · Pièces des contrôles fiscaux
-- Crée l'espace de stockage privé « pieces » pour les captures d'écran.
-- À exécuter après v4_inspection_cloture.sql :
-- SQL Editor → New query → coller → Run. Le script peut être relancé.
-- =====================================================================

-- Espace privé : 5 Mo par fichier au plus (le site compresse chaque
-- capture à environ 200 Ko), images seulement. L'offre gratuite de
-- Supabase comprend 1 Go de stockage, soit environ 5 000 captures.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pieces', 'pieces', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Lecture : toute personne ayant accès au guichet. Ajout : Direction et
-- Inspection. Suppression : Direction seulement.
drop policy if exists "pieces lecture"     on storage.objects;
drop policy if exists "pieces ajout"       on storage.objects;
drop policy if exists "pieces suppression" on storage.objects;
create policy "pieces lecture" on storage.objects for select to authenticated
  using (bucket_id = 'pieces' and public.mon_role() is not null);
create policy "pieces ajout" on storage.objects for insert to authenticated
  with check (bucket_id = 'pieces' and public.mon_role() in ('direction', 'inspecteur'));
create policy "pieces suppression" on storage.objects for delete to authenticated
  using (bucket_id = 'pieces' and public.mon_role() = 'direction');
