// Réglages de connexion du guichet fiscal.
// Les deux valeurs se trouvent dans Supabase : Project Settings → API (ou « API Keys »).
//
// La clé publique (« anon » ou « publishable ») peut être publiée sans risque :
// ce sont les règles de la base (fichier supabase/schema.sql) qui protègent les données.
// Ne mettez JAMAIS ici la clé « service_role » ou « secret ».
window.GUICHET_CONFIG = {
  supabaseUrl: "https://VOTRE-PROJET.supabase.co",
  supabaseKey: "VOTRE_CLE_PUBLIQUE"
};
