-- Guichet fiscal : mise à jour 16 (suppression des contrats)
--
-- La Direction peut maintenant supprimer un contrat ou un marché déjà signé, livré ou clos, tant
-- qu'aucun paiement n'y est inscrit : un contrat fait par erreur ou clos trop tôt se refait au lieu
-- de rester bloqué. Un contrat qui a reçu un paiement (versé par le Trésor ou à déduire des impôts)
-- ne se supprime toujours pas, puisque ce paiement est entré dans les comptes. La suppression reste
-- réservée à la Direction (règle « registre suppression ») et inscrite au journal.
--
-- Le reste du verrou est celui de la mise à jour 12, inchangé.
--
-- À exécuter après supabase/v12_contrats.sql. Il peut être exécuté plusieurs fois.

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
    if jsonb_typeof(po) <> 'array' or jsonb_array_length(po) > 0 then
      raise exception 'Un contrat déjà payé ne se supprime pas : son paiement est inscrit dans les comptes.';
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
