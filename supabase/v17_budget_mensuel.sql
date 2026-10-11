-- Guichet fiscal : mise à jour 17 (budget des services publics au mois)
--
-- Le budget des services publics se compte maintenant au mois, et plus à la semaine. Ce script range au
-- mois les dossiers déjà enregistrés :
--  - une demande de moyens rattachée à une semaine passe au mois de cette semaine (celui de son jeudi,
--    comme pour les semaines ISO : les semaines 41 et 42 de 2026 vont en octobre 2026). Une demande saisie
--    sans période va au mois de son accord, ou à défaut de sa réception ;
--  - une commande passée pour un service et rattachée à une semaine passe au mois de cette semaine. Le
--    verrou des contrats est coupé le temps de la transaction, puisqu'un contrat signé ne change
--    d'habitude plus de période ;
--  - les plafonds réglés par semaine deviennent des plafonds par mois, multipliés par 4,33. Si plusieurs
--    semaines tombent dans le même mois, la plus récente l'emporte. Les plafonds déjà réglés par mois sur
--    le site sont gardés tels quels.
--
-- Rien d'autre ne change : montants, décisions, paiements, déclarations des entreprises (toujours à la
-- semaine). Le site fonctionne avant comme après ce script : il fait la même conversion à l'affichage.
--
-- À exécuter après supabase/v16_contrats_suppression.sql. Il peut être exécuté plusieurs fois.

begin;

-- Demandes rattachées à une semaine « 2026-S41 » : mois du jeudi de cette semaine, « 2026-10 ».
update public.registre
set data = jsonb_set(data, '{periode}', to_jsonb(to_char(to_date(substr(data->>'periode', 1, 4) || '-' || substr(data->>'periode', 7, 2), 'IYYY-IW') + 3, 'YYYY-MM')))
where collection = 'demandes' and data->>'periode' ~ '^\d{4}-S\d{2}$';

-- Demandes sans période : mois de l'accord, sinon de la réception.
update public.registre d
set data = jsonb_set(d.data, '{periode}', to_jsonb(to_char(coalesce(
    (select nullif(a.data->>'at', '')::timestamptz from public.registre a
      where a.collection = 'arbitrages' and a.id = d.id and a.data->>'statut' in ('accordee', 'partielle')),
    nullif(d.data->>'recueAt', '')::timestamptz,
    nullif(d.data->>'createdAt', '')::timestamptz) at time zone 'Europe/Paris', 'YYYY-MM')))
where d.collection = 'demandes' and coalesce(d.data->>'periode', '') = ''
  and coalesce(nullif(d.data->>'recueAt', ''), nullif(d.data->>'createdAt', '')) is not null;

-- Commandes des services rattachées à une semaine.
alter table public.registre disable trigger registre_contrat;
update public.registre
set data = jsonb_set(data, '{periode}', to_jsonb(to_char(to_date(substr(data->>'periode', 1, 4) || '-' || substr(data->>'periode', 7, 2), 'IYYY-IW') + 3, 'YYYY-MM')))
where collection = 'contrats' and data->>'periode' ~ '^\d{4}-S\d{2}$';
alter table public.registre enable trigger registre_contrat;

-- Plafonds : « enveloppesSemaines » (par semaine) devient « enveloppesMois » (par mois, × 4,33).
update public.registre r
set data = (r.data - 'enveloppesSemaines') || jsonb_build_object('enveloppesMois',
  coalesce((
    select jsonb_object_agg(x.m, x.caps)
    from (
      select distinct on (m) m, caps
      from (
        select to_char(to_date(substr(w.k, 1, 4) || '-' || substr(w.k, 7, 2), 'IYYY-IW') + 3, 'YYYY-MM') as m, w.k,
               coalesce((select jsonb_object_agg(e.s, round((e.v #>> '{}')::numeric * 4.33))
                         from jsonb_each(w.val) as e(s, v)
                         where jsonb_typeof(e.v) = 'number' and (e.v #>> '{}')::numeric > 0), '{}'::jsonb) as caps
        from jsonb_each(r.data->'enveloppesSemaines') as w(k, val)
        where w.k ~ '^\d{4}-S\d{2}$' and jsonb_typeof(w.val) = 'object'
      ) s
      order by m, k desc
    ) x), '{}'::jsonb)
  || coalesce(case when jsonb_typeof(r.data->'enveloppesMois') = 'object' then r.data->'enveloppesMois' end, '{}'::jsonb))
where r.collection = 'config' and r.id = 'main' and jsonb_typeof(r.data->'enveloppesSemaines') = 'object';

commit;
