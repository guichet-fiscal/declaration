-- Guichet fiscal : mise à jour 12 · Contrats d'achat
--
-- À exécuter une fois dans Supabase → SQL Editor, après la mise à jour 11.
-- Le script peut être relancé sans risque.
--
-- Les contrats sont rangés dans le registre (collection « contrats »). L'Inspection prépare un projet
-- de contrat et peut l'abandonner ; seule la Direction signe, constate la livraison, paie et résilie.
-- Pour tous, Direction comprise : un contrat signé ne se modifie plus (fournisseur, acheteur, lignes,
-- prix, plafond, durée, imputation), ne se supprime plus, ses paiements ne changent pas, et son état
-- n'avance que dans un sens. Deux paiements enregistrés au même moment : le second est arrêté au lieu
-- d'effacer le premier.

-- Une clé absente et une valeur JSON null comptent pour la même chose.
create or replace function public.jn(p jsonb)
returns jsonb
language sql immutable
set search_path = ''
as $$ select coalesce(nullif(p, 'null'::jsonb), 'null'::jsonb) $$;

create or replace function public.verrou_contrat()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  o  jsonb := old.data;
  n  jsonb := new.data;
  so text  := coalesce(old.data->>'statut', 'projet');
  sn text  := coalesce(new.data->>'statut', 'projet');
  po jsonb := coalesce(nullif(old.data->'paiements', 'null'::jsonb), '[]'::jsonb);
  pn jsonb := coalesce(nullif(new.data->'paiements', 'null'::jsonb), '[]'::jsonb);
  k  text;
begin
  if tg_op = 'DELETE' then
    if so not in ('projet', 'annule') or jsonb_array_length(po) > 0 then
      raise exception 'Un contrat signé ou payé ne se supprime pas : résiliez-le.';
    end if;
    return old;
  end if;
  if so not in ('projet', 'annule') then
    foreach k in array array['fournisseurId', 'acheteur', 'type', 'categorie', 'lignes', 'montant', 'prixUnitaire', 'unite',
                             'plafond', 'debut', 'fin', 'passagesAbsents', 'demandeId', 'periode'] loop
      if public.jn(n->k) is distinct from public.jn(o->k) then
        raise exception 'Un contrat signé ne se modifie plus : résiliez-le et faites-en un nouveau.';
      end if;
    end loop;
  end if;
  -- Paiements : la liste ne fait que s'allonger, les paiements déjà enregistrés restent identiques.
  if jsonb_typeof(pn) <> 'array' or jsonb_typeof(po) <> 'array' or jsonb_array_length(pn) < jsonb_array_length(po)
     or (select coalesce(jsonb_agg(e order by i), '[]'::jsonb) from jsonb_array_elements(pn) with ordinality t(e, i) where i <= jsonb_array_length(po)) <> po then
    raise exception 'Un paiement vient d''être enregistré par un autre agent : rouvrez le contrat.';
  end if;
  if jsonb_array_length(pn) > jsonb_array_length(po) and not ((so = 'livre' and sn = 'paye') or (so = 'en_cours' and sn = 'en_cours')) then
    raise exception 'Ce contrat ne peut pas recevoir de paiement dans son état actuel.';
  end if;
  if so <> sn and not (so = 'projet'
                       or (so = 'signe' and sn in ('livre', 'resilie'))
                       or (so = 'livre' and (sn = 'paye' or (sn = 'resilie' and jsonb_array_length(pn) = 0)))
                       or (so = 'en_cours' and sn in ('termine', 'resilie'))) then
    raise exception 'Ce contrat vient de changer d''état : rouvrez-le pour voir où il en est.';
  end if;
  return new;
end
$$;
revoke all on function public.verrou_contrat() from public, anon, authenticated;
drop trigger if exists registre_contrat on public.registre;
create trigger registre_contrat
  before update or delete on public.registre
  for each row
  when (old.collection = 'contrats')
  execute function public.verrou_contrat();

-- Droits d'écriture : ceux de la mise à jour 11, plus les projets de contrat pour l'Inspection.
create or replace function public.ecriture_permise(p_collection text, p_id text, p_data jsonb)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select case public.mon_role()
    when 'direction' then true
    when 'inspecteur' then
      p_collection in ('demandes', 'relances', 'releves')
      or (p_collection = 'prets' and p_data->>'statut' in ('demande', 'annule'))
      or (p_collection = 'vehicules' and public.vehicule_inspection_ok(p_id, p_data))
      or (p_collection = 'convocations' and public.convocation_inspection_ok(p_id, p_data))
      or (p_collection = 'contrats' and coalesce(p_data->>'statut', 'projet') in ('projet', 'annule')
          and nullif(p_data->'signeLe', 'null'::jsonb) is null
          and jsonb_array_length(coalesce(nullif(p_data->'paiements', 'null'::jsonb), '[]'::jsonb)) = 0
          and not exists (select 1 from public.registre r
                          where r.collection = 'contrats' and r.id = p_id and coalesce(r.data->>'statut', 'projet') <> 'projet'))
      or (p_collection = 'attestations' and p_data->>'revoqueeLe' is null)
      or (p_collection = 'controles' and coalesce(p_data->>'statut', '') in ('ouvert', 'propose', 'sans_suite'))
      or (p_collection = 'decisions' and coalesce(p_data->>'statut', '') in ('validee', 'controle'))
      or (p_collection = 'decisions' and p_data->>'statut' = 'rejetee' and coalesce(p_data->>'remplaceePar', '') <> ''
          and not exists (select 1 from public.registre r
                          where r.collection = 'decisions' and r.id = p_id and r.data->>'statut' = 'payee'))
      or (p_collection = 'declarations' and not exists (
            select 1 from public.registre r
            where r.collection = 'decisions' and r.id = p_id and r.data->>'statut' = 'payee'))
    else false
  end
$$;
revoke all on function public.ecriture_permise(text, text, jsonb) from public, anon;
grant execute on function public.ecriture_permise(text, text, jsonb) to authenticated;

-- Notifications (mise à jour 10) : la base prévient aussi le service d'envoi quand un projet de
-- contrat est préparé (à signer). Sans la mise à jour 10, rien n'est fait.
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'notif_registre') then
    drop trigger if exists notif_registre on public.registre;
    create trigger notif_registre
      after insert or update on public.registre
      for each row
      when (new.collection in ('declarations', 'decisions', 'penalites', 'demandes', 'prets', 'controles', 'vehicules', 'convocations', 'contrats'))
      execute function public.notif_registre();
  end if;
end
$$;
