// Faux Supabase des essais : registre en mémoire, rôle et compte Discord lus dans l’adresse (?role=&discord=&nom=).
// Il remplace la bibliothèque Supabase chargée par la page ; rien ne part vers la vraie base.
(() => {
  const q = new URLSearchParams(location.search);
  // L'appli retire la requête de l'adresse : on garde le rôle de l'essai pour les rechargements.
  if (q.get("role")) sessionStorage.setItem("essai", JSON.stringify([q.get("role"), q.get("discord"), q.get("nom")]));
  const [ROLE, DID, NOM] = JSON.parse(sessionStorage.getItem("essai") || '["direction","999","Directeur Test"]');
  const rows = new Map((window.__SEED || []).map(r => [r.collection + "/" + r.id, { collection: r.collection, id: r.id, data: r.data, updated_by: "x" }]));
  window.__rows = rows; window.__rpc = [];
  const listeners = [];
  const ok = data => Promise.resolve({ data, error: null });
  function builder(table) {
    const st = { table, op: "select", filters: [], payload: null, wantSelect: false, range: null };
    const b = {
      select() { if (st.op !== "select") st.wantSelect = true; return b; },
      order() { return b; }, limit() { return b; }, single() { st.one = true; return b; }, maybeSingle() { st.one = true; return b; },
      range(a, z) { st.range = [a, z]; return b; },
      eq(k, v) { st.filters.push([k, v]); return b; }, gte() { return b; }, lte() { return b; }, in() { return b; }, neq() { return b; },
      insert(p) { st.op = "insert"; st.payload = p; return b; }, upsert(p) { st.op = "upsert"; st.payload = p; return b; },
      update(p) { st.op = "update"; st.payload = p; return b; }, delete() { st.op = "delete"; return b; },
      then(res, rej) { return run().then(res, rej); }
    };
    function run() {
      if (table === "rappels_agents") {
        if (window.__rappelsAbsent) return Promise.resolve({ data: null, error: { message: 'relation "public.rappels_agents" does not exist', code: "42P01" } });
        const f = [...rows.values()].find(r => r.collection === "fonctionnaires" && r.data.discordId === DID && r.data.actif !== false), fid = f && f.id;
        window.__rappels = window.__rappels || {};
        if (st.op === "select") return ok(window.__rappels[fid] || null);
        if (st.op === "upsert") { if (st.payload.fid !== fid) return Promise.resolve({ data: null, error: { message: "row-level security" } }); window.__rappels[fid] = JSON.parse(JSON.stringify(st.payload)); return ok(null); }
      }
      if (table === "agenda_perso") {
        if (window.__persoAbsent) return Promise.resolve({ data: null, error: { message: 'relation "public.agenda_perso" does not exist', code: "42P01" } });
        const f = [...rows.values()].find(r => r.collection === "fonctionnaires" && r.data.discordId === DID && r.data.actif !== false), fid = f && f.id;
        window.__perso = window.__perso || [];
        const idf = (st.filters.find(x => x[0] === "id") || [])[1];
        if (st.op === "select") return ok(window.__perso.filter(p => p.fid === fid).sort((a, z) => a.debut.localeCompare(z.debut)));
        if ((st.op === "insert" || st.op === "update") && window.__sans35 && "rappel_min" in st.payload) return Promise.resolve({ data: null, error: { message: "Could not find the 'rappel_min' column of 'agenda_perso' in the schema cache", code: "PGRST204" } });
        if (st.op === "insert") { if (!fid || st.payload.fid !== fid) return Promise.resolve({ data: null, error: { message: 'new row violates row-level security policy for table "agenda_perso"' } }); window.__perso.push(Object.assign({ id: "p" + Date.now(), cree_le: new Date().toISOString() }, st.payload)); return ok(null); }
        if (st.op === "update") { const p = window.__perso.find(p => p.id === idf && p.fid === fid); if (p) Object.assign(p, st.payload); return ok(null); }
        if (st.op === "delete") { window.__perso = window.__perso.filter(p => !(p.id === idf && p.fid === fid)); return ok(null); }
      }
      // Salons Discord de l'essai (window.__discord = { webhooks, auto }) : adresses servies par l'essai lui-même.
      if (table === "parametres_prives" && st.op === "select") return ok(window.__discord ? [{ cle: "discord", valeur: window.__discord }] : []);
      if (table !== "registre") return ok(st.op === "select" ? [] : null);
      if (st.op === "select") { const all = [...rows.values()].sort((a, z) => (a.collection + a.id).localeCompare(z.collection + z.id)); const [a, z] = st.range || [0, 1e9]; return ok(all.slice(a, z + 1)); }
      if (st.op === "upsert" || st.op === "insert") { for (const r of [].concat(st.payload)) rows.set(r.collection + "/" + r.id, Object.assign({ updated_by: "moi" }, r)); return ok(null); }
      if (st.op === "delete") { const c = (st.filters.find(f => f[0] === "collection") || [])[1], id = (st.filters.find(f => f[0] === "id") || [])[1]; const had = rows.delete(c + "/" + id); return ok(had ? [{ id }] : []); }
      return ok(null);
    }
    return b;
  }
  window.supabase = { createClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: { user: { id: "uid-" + DID, user_metadata: { full_name: NOM } }, access_token: "t" } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      signOut: async () => ({ error: null }), signInWithOAuth: async () => ({ error: null })
    },
    rpc: async (name, args) => {
      window.__rpc.push(name);
      const fonc = () => { const r = [...rows.values()].find(r => r.collection === "fonctionnaires" && r.data.discordId === DID && r.data.actif !== false); return r || null; };
      const docs = c => [...rows.values()].filter(r => r.collection === c).map(r => Object.assign({}, r.data, { id: r.id }));
      const iso = () => new Date().toISOString();
      if (name === "mon_acces") { const f = fonc(); return { data: { discord_id: DID, role: ROLE === "agent" ? null : ROLE, nom: ROLE === "agent" ? null : NOM, fonctionnaire: f ? { id: f.id, nom: f.data.nom, grade: f.data.grade } : null }, error: null }; }
      if (name === "mon_espace") {
        const f = fonc(); if (!f) return { data: null, error: null }; const fid = f.id, cfg = (rows.get("config/main") || { data: {} }).data.payes || {};
        const payes = [...rows.values()].filter(r => r.collection === "payes").sort((a, z) => z.id.localeCompare(a.id)).slice(0, 26).map(r => ({ id: r.id, semaine: r.id, statut: r.data.statut, verseeLe: r.data.verseeLe, coef: r.data.coef, coefRappels: r.data.coefRappels,
          lignes: (r.data.lignes || []).filter(l => l.fid === fid), rappels: (r.data.rappels || []).filter(l => l.fid === fid), retenues: (r.data.retenues || []).filter(l => l.fid === fid), saisie: r.data.saisie && r.data.saisie[fid] ? { [fid]: r.data.saisie[fid] } : {} }));
        return { data: { fid, fonctionnaire: Object.assign({}, f.data, { id: fid }), bareme: cfg, contrats: docs("contratsTravail").filter(x => x.fid === fid), payes, rappels: docs("rappels").filter(x => x.fid === fid),
          messages: docs("messagesAgents").filter(x => x.fid === fid).sort((a, z) => String(a.at).localeCompare(String(z.at))),
          agenda: docs("agenda").filter(e => (e.audience || "tous") === "tous" || (e.audience === "agents" && (e.participants || []).includes(fid))),
          notes: docs("notesService").filter(n => !n.retiree), absences: docs("absences").filter(a => a.fid === fid), sanctions: docs("sanctions").filter(x => x.fid === fid && x.statut !== "annulee"),
          // Mise à jour 36 (absente si window.__sans36) : demandes, entretiens partagés, annuaire.
          ...(window.__sans36 ? {} : {
            demandes: docs("demandesAgents").filter(x => x.fid === fid).sort((a, z) => String(z.at).localeCompare(String(a.at))),
            entretiens: docs("entretiens").filter(x => x.fid === fid && x.statut === "partage"),
            annuaire: docs("fonctionnaires").filter(x => x.actif !== false).map(x => ({ id: x.id, nom: x.nom, grade: x.grade, discordId: x.discordId,
              role: (window.__roles || {})[x.discordId] || null, poste: (docs("contratsTravail").find(c => c.fid === x.id) || {}).poste || null })) }) }, error: null };
      }
      if (name === "envoyer_message") { const f = fonc(); const id = "m" + Date.now(); rows.set("messagesAgents/" + id, { collection: "messagesAgents", id, data: { fid: f.id, nom: f.data.nom, discordId: DID, de: "agent", auteur: f.data.nom, texte: args.p_texte, at: iso(), luEquipe: false } }); return { data: { id }, error: null }; }
      if (name === "messages_lus") { const f = fonc(); let n = 0; for (const r of rows.values()) if (r.collection === "messagesAgents" && r.data.fid === f.id && r.data.de === "equipe" && !r.data.luAgent) { r.data = Object.assign({}, r.data, { luAgent: true }); n++; } return { data: n, error: null }; }
      if (name === "faire_demande" || name === "annuler_demande" || name === "voir_entretien") {
        if (window.__sans36) return { data: null, error: { message: `Could not find the function public.${name} in the schema cache` } };
        const f = fonc(); if (!f) return { data: null, error: { message: "Votre compte Discord n'est relié à aucune fiche de fonctionnaire." } };
        if (name === "faire_demande") {
          if (args.p_type === "conge" && (!args.p_du || !args.p_au || args.p_au < args.p_du)) return { data: null, error: { message: "Indiquez les dates du congé (le dernier jour après le premier)." } };
          const id = "da" + Date.now(), data = { fid: f.id, nom: f.data.nom, type: args.p_type, objet: args.p_objet, motif: args.p_motif || "", du: args.p_du || null, au: args.p_au || null, statut: "envoyee", at: iso() };
          rows.set("demandesAgents/" + id, { collection: "demandesAgents", id, data });
          return { data: Object.assign({ id }, data), error: null };
        }
        if (name === "annuler_demande") {
          const r = rows.get("demandesAgents/" + args.p_id);
          if (!r || r.data.fid !== f.id || r.data.statut !== "envoyee") return { data: null, error: { message: "Cette demande n'attend plus de réponse." } };
          r.data = Object.assign({}, r.data, { statut: "annulee", annuleePar: "agent", annuleeLe: iso() }); return { data: Object.assign({ id: r.id }, r.data), error: null };
        }
        const r = rows.get("entretiens/" + args.p_id);
        if (!r || r.data.fid !== f.id || r.data.statut !== "partage") return { data: null, error: { message: "Cet entretien n'existe plus ou ne vous concerne pas." } };
        r.data = Object.assign({}, r.data, { vuParAgentLe: iso(), commentaireAgent: args.p_commentaire || "" }); return { data: Object.assign({ id: r.id }, r.data), error: null };
      }
      if (name === "signer_contrat") {
        if (window.__sans36) return { data: null, error: { message: "Could not find the function public.signer_contrat(p_id, p_nom) in the schema cache" } };
        const f = fonc(), r = rows.get("contratsTravail/" + args.p_id);
        if (!f || !r || r.data.fid !== f.id) return { data: null, error: { message: "Ce contrat n'est pas le vôtre ou n'existe plus." } };
        if (r.data.statut === "signe") return { data: null, error: { message: "Ce contrat est déjà signé." } };
        r.data = Object.assign({}, r.data, { statut: "signe", salarieSigneLe: iso().slice(0, 10), signeEnregistrePar: "l’agent, depuis son espace", signeParAgent: true, signatureNom: args.p_nom, signeA: iso() });
        return { data: Object.assign({ id: r.id }, r.data), error: null };
      }
      if (name === "repondre_agenda") { const f = fonc(); const r = rows.get("agenda/" + args.p_id); r.data = Object.assign({}, r.data, { reponses: Object.assign({}, r.data.reponses || {}, { [f.id]: { r: args.p_reponse, nom: f.data.nom, at: iso() } }) }); return { data: {}, error: null }; }
      if (name === "signaler_absence") { const f = fonc(); if (args.p_au < args.p_du) return { data: null, error: { message: "Dates d'absence invalides : la fin doit suivre le début." } }; const id = "ab" + Date.now(); rows.set("absences/" + id, { collection: "absences", id, data: { fid: f.id, nom: f.data.nom, du: args.p_du, au: args.p_au, motif: args.p_motif, statut: "signalee", par: "agent", auteur: f.data.nom, at: iso() } }); return { data: { id }, error: null }; }
      if (name === "annuler_absence") { const r = rows.get("absences/" + args.p_id); r.data = Object.assign({}, r.data, { statut: "annulee" }); return { data: true, error: null }; }
      if (name === "pointer") return { data: null, error: { message: "pointer appelé", code: "P0001" } };
      return { data: null, error: { message: "indisponible dans l'essai" } };
    },
    from: t => builder(t),
    channel: () => { const c = { on(...a) { listeners.push(a[2]); return c; }, subscribe(cb) { setTimeout(() => cb && cb("SUBSCRIBED"), 0); return c; }, track: async () => "ok", untrack: async () => "ok", presenceState: () => ({}), send: async () => "ok", unsubscribe: async () => "ok" }; return c; },
    removeChannel() {}, realtime: { setAuth() {} },
    storage: { from: () => ({ download: async () => ({ error: { message: "x" } }), upload: async () => ({ error: { message: "x" } }), remove: async () => ({ error: null }) }) },
    functions: { invoke: async () => ({ data: null, error: null }) }
  }) };
})();
