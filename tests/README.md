# Essais du guichet

Les essais ouvrent le guichet dans un vrai navigateur (Chromium), avec un **faux Supabase** (`supabase-factice.js`)
et des données inventées (`jeux/`) : rien ne part vers la vraie base ni vers Discord.

Ils tournent tout seuls sur GitHub à chaque envoi (onglet **Actions** du dépôt, coche verte ou rouge).
En cas d'échec, les captures d'écran des pages en cause sont jointes au lancement.

Pour les lancer sur un ordinateur :

```
cd tests
npm install
npx playwright install chromium
node lancer.js            # tous les essais
node lancer.js agenda     # seulement ceux dont le nom contient « agenda »
```

Un essai est un fichier de `essais/` qui exporte `{ nom, lancer(env, t) }` ; `outils.js` ouvre une page pour un rôle
(`ouvrir(env, { role, discord, nom, hash, avant })`) et `t.ok`, `t.egal`, `t.contient`, `t.sansErreur` vérifient.
