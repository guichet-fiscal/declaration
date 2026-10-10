-- Guichet fiscal : mise à jour 14 · Amendes versées au Trésor
--
-- À exécuter une fois dans Supabase → SQL Editor, après la mise à jour 13.
-- Le script peut être relancé sans risque.
--
-- Les versements sont rangés dans le registre (collection « versements »). L'Inspection note le
-- versement apporté par le convoi (« à confirmer ») et peut le retirer tant qu'il n'est pas traité ;
-- seule la Direction confirme la réception (la somme comptée entre au Trésor), refuse ou annule.
-- Pour tous, Direction comprise : un versement traité garde ses montants, un versement reçu ne se
-- supprime pas, et sa réception ne s'annule plus une fois le convoi payé au transporteur.

-- Une clé absente et une valeur JSON null comptent pour la même chose (déjà créée par la mise à jour 12).
create or replace function public.jn(p jsonb)
returns jsonb
language sql immutable
set search_path = ''
as $$ select coalesce(nullif(p, 'null'::jsonb), 'null'::jsonb) $$;

create or replace function public.verrou_versement()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  o  jsonb := old.data;
  n  jsonb := new.data;
  so text  := coalesce(old.data->>'statut', 'a_confirmer');
  sn text  := coalesce(new.data->>'statut', 'a_confirmer');
  k  text;
  paye boolean := exists (select 1 from public.registre c, jsonb_array_elements(coalesce(nullif(c.data->'paiements', 'null'::jsonb), '[]'::jsonb)) p
                          where c.collection = 'contrats' and coalesce(p->'versements', '[]'::jsonb) ? old.id);
begin
  if tg_op = 'DELETE' then
    if so = 'confirme' then
      raise exception 'Un versement reçu au Trésor ne se supprime pas : annulez la réception.';
    end if;
    return old;
  end if;
  if so <> 'a_confirmer' then
    foreach k in array array['service', 'periode', 'montant', 'montantRecu', 'motifEcart', 'transporteurId', 'date', 'confirmeLe', 'confirmeParNom'] loop
      if public.jn(n->k) is distinct from public.jn(o->k) then
        raise exception 'Un versement traité ne se modifie plus.';
      end if;
    end loop;
  end if;
  if so in ('refuse', 'annule') then
    foreach k in array array['motif', 'traiteLe', 'traiteParNom'] loop
      if public.jn(n->k) is distinct from public.jn(o->k) then
        raise exception 'Un versement refusé ou annulé ne se modifie plus.';
      end if;
    end loop;
  end if;
  if so <> sn and not ((so = 'a_confirmer' and sn in ('confirme', 'refuse', 'annule')) or (so = 'confirme' and sn = 'annule' and not paye)) then
    raise exception 'Ce versement vient d''être traité par un autre agent, ou son convoi est déjà payé au transporteur : rouvrez-le.';
  end if;
  return new;
end
$$;
revoke all on function public.verrou_versement() from public, anon, authenticated;
drop trigger if exists registre_versement on public.registre;
create trigger registre_versement
  before update or delete on public.registre
  for each row
  when (old.collection = 'versements')
  execute function public.verrou_versement();

-- Paiement d'un marché de transport de fonds : chaque convoi d'amendes payé doit être reçu au Trésor
-- et ne l'être sur aucun autre paiement. Le versement est verrouillé le temps du paiement : une
-- annulation de sa réception au même moment attend, puis voit le paiement (et est refusée).
create or replace function public.verrou_contrat_versements()
returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  po  jsonb := case when tg_op = 'UPDATE' then coalesce(nullif(old.data->'paiements', 'null'::jsonb), '[]'::jsonb) else '[]'::jsonb end;
  pn  jsonb := coalesce(nullif(new.data->'paiements', 'null'::jsonb), '[]'::jsonb);
  deb int;
  vid text;
begin
  if jsonb_typeof(pn) <> 'array' then
    return new;
  end if;
  deb := case when jsonb_typeof(po) = 'array' then jsonb_array_length(po) else 0 end;
  for vid in
    select v.x
    from jsonb_array_elements(pn) with ordinality t(p, i),
         jsonb_array_elements_text(coalesce(nullif(t.p->'versements', 'null'::jsonb), '[]'::jsonb)) v(x)
    where t.i > deb
  loop
    perform 1 from public.registre r where r.collection = 'versements' and r.id = vid and r.data->>'statut' = 'confirme' for share;
    if not found then
      raise exception 'Un convoi de ce paiement n''est pas reçu au Trésor : rouvrez le marché.';
    end if;
    if exists (select 1 from public.registre c, jsonb_array_elements(coalesce(nullif(c.data->'paiements', 'null'::jsonb), '[]'::jsonb)) p
               where c.collection = 'contrats' and c.id <> new.id and coalesce(p->'versements', '[]'::jsonb) ? vid)
       or (select count(*) from jsonb_array_elements(pn) p, jsonb_array_elements_text(coalesce(nullif(p->'versements', 'null'::jsonb), '[]'::jsonb)) x(v) where x.v = vid) > 1 then
      raise exception 'Un convoi de ce paiement est déjà payé au transporteur : rouvrez le marché.';
    end if;
  end loop;
  return new;
end
$$;
revoke all on function public.verrou_contrat_versements() from public, anon, authenticated;
drop trigger if exists registre_contrat_versements on public.registre;
create trigger registre_contrat_versements
  before insert or update on public.registre
  for each row
  when (new.collection = 'contrats')
  execute function public.verrou_contrat_versements();

-- Ce que l'Inspection peut écrire sur un versement : le noter (« à confirmer », somme positive) ou le
-- retirer tant qu'il n'est pas traité ; jamais la réception elle-même.
create or replace function public.versement_montant_ok(p_data jsonb)
returns boolean
language plpgsql immutable
set search_path = ''
as $$
begin
  return (p_data->>'montant')::numeric > 0;
exception when others then
  return false;
end
$$;
revoke all on function public.versement_montant_ok(jsonb) from public, anon;
grant execute on function public.versement_montant_ok(jsonb) to authenticated;
create or replace function public.versement_inspection_ok(p_id text, p_data jsonb)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce(p_data->>'statut', 'a_confirmer') in ('a_confirmer', 'annule')
     and nullif(p_data->'confirmeLe', 'null'::jsonb) is null
     and nullif(p_data->'montantRecu', 'null'::jsonb) is null
     and public.versement_montant_ok(p_data)
     and not exists (select 1 from public.registre r
                     where r.collection = 'versements' and r.id = p_id and coalesce(r.data->>'statut', 'a_confirmer') <> 'a_confirmer')
$$;
revoke all on function public.versement_inspection_ok(text, jsonb) from public, anon;
grant execute on function public.versement_inspection_ok(text, jsonb) to authenticated;

-- Droits d'écriture : ceux de la mise à jour 13, plus les versements des amendes.
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
      or (p_collection = 'conventions' and coalesce(p_data->>'statut', 'projet') in ('projet', 'annulee')
          and nullif(p_data->'signeLe', 'null'::jsonb) is null
          and not exists (select 1 from public.registre r
                          where r.collection = 'conventions' and r.id = p_id and coalesce(r.data->>'statut', 'projet') <> 'projet'))
      or (p_collection = 'prestations' and public.prestation_inspection_ok(p_id, p_data))
      or (p_collection = 'versements' and public.versement_inspection_ok(p_id, p_data))
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

-- Notifications (mise à jour 10) : la base prévient aussi le service d'envoi quand un versement est
-- noté (à confirmer). Sans la mise à jour 10, rien n'est fait.
do $$
begin
  if exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'notif_registre') then
    drop trigger if exists notif_registre on public.registre;
    create trigger notif_registre
      after insert or update on public.registre
      for each row
      when (new.collection in ('declarations', 'decisions', 'penalites', 'demandes', 'prets', 'controles', 'vehicules', 'convocations', 'contrats', 'conventions', 'prestations', 'versements'))
      execute function public.notif_registre();
  end if;
end
$$;
