-- Guichet fiscal : mise à jour 48 (heures des relevés faits du 6 au 8 novembre par Antoine POISSONNIERS)
--
-- L'« avance de la tablette » (2 h jusqu'au 25 octobre, puis 1 h) venait du navigateur de la Direction, réglé
-- sur UTC : c'est l'écart entre Paris et UTC, la tablette est à l'heure de Paris. Les relevés de la Direction
-- sont donc justes (son navigateur ajoutait l'heure que l'avance retirait). Ceux d'Antoine POISSONNIERS, faits
-- avec un navigateur à l'heure de Paris, ont eu l'heure en trop retirée : ses 34 relevés du 6 au 8 novembre
-- ont leurs mouvements une heure trop tôt (aucun à moins de 63 minutes de la capture, contre 2 minutes pour
-- ceux de la Direction).
--
-- Ce script avance d'une heure les mouvements de ces relevés, note l'avance à 0 h et les marque « heureParis »
-- (le guichet ne les recale plus d'après l'historique de l'avance). L'heure du relevé (capture) ne change pas.
-- Il ne touche pas un relevé déjà corrigé : il peut être exécuté plusieurs fois.
--
-- À exécuter après supabase/v47_taxe_vehicules.sql, et seulement avec le guichet à jour (12 nov. au soir).

begin;

update public.registre r
   set data = r.data || jsonb_build_object(
         'mouvements', (
           select coalesce(jsonb_agg(case when x.m->>'t' ~ '^\d{4}-\d{2}-\d{2}T'
                                          then x.m || jsonb_build_object('t', to_char(((x.m->>'t')::timestamptz + interval '1 hour') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'))
                                          else x.m end order by x.o), '[]'::jsonb)
             from jsonb_array_elements(r.data->'mouvements') with ordinality as x(m, o)),
         'decalageH', 0,
         'decalageInitialH', 1,
         'heureParis', true)
 where r.collection = 'releves'
   and r.data->>'agent' = 'Inspecteur des finances publiques | Antoine POISSONNIERS'
   and r.data->>'decalageH' = '1'
   and coalesce(r.data->>'heureParis', '') = ''
   and jsonb_typeof(r.data->'mouvements') = 'array';

commit;
