// Réglages de connexion du guichet fiscal.
// Les deux valeurs se trouvent dans Supabase : Project Settings → API (ou « API Keys »).
//
// La clé publique (« anon » ou « publishable ») peut être publiée sans risque :
// ce sont les règles de la base (fichier supabase/schema.sql) qui protègent les données.
// Ne mettez JAMAIS ici la clé « service_role » ou « secret ».
window.GUICHET_CONFIG = {
  supabaseUrl: "https://xdmhnymirvozmgddmgir.supabase.co",
  supabaseKey: "sb_publishable_nKgcY29nHjw4sc9rccVjYw_jmM08Izt"
};
