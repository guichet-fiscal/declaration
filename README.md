# Guichet fiscal · Préfecture de police

Site de la Préfecture de police (Direction des impôts et cotisations) du serveur Grand Paris RP.
Les entreprises et les services publics déposent leurs déclarations et leurs demandes sur Discord, avec les modèles du site. La Direction les saisit ici, émet les avis, arbitre les demandes et suit le Trésor.

## Qui possède quoi

| Élément | Où il se trouve |
|---|---|
| Le code | Ce dépôt GitHub, dans l’organisation du serveur |
| Les données | Le projet Supabase du serveur |
| Les accès | Connexion Discord, plus la liste des agents gérée dans le site |

**Règle de continuité :** l’organisation GitHub et l’organisation Supabase ont toujours au moins deux propriétaires, dont un administrateur du serveur. Personne ne peut alors partir avec le site.

## Contenu du dépôt

- `index.html` : le site complet
- `config.js` : l’adresse et la clé publique du projet Supabase
- `supabase/schema.sql` : les tables et les règles d’accès de la base
- `supabase/v2_journal_export.sql` : le journal des actions et l’export vers Google Sheets
- `google-sheets/export.gs` : le script à coller dans une feuille Google Sheets pour le suivi des admins

---

## Mise en place (une seule fois, environ 30 minutes)

### 1. Le site sur GitHub Pages

Le code est déjà dans ce dépôt. Le site est publié par **GitHub Pages** depuis la branche `main` (réglage dans **Settings → Pages** : *Deploy from a branch*, branche `main`, dossier `/ (root)`).

Adresse du site : **https://guichet-fiscal.github.io/declaration/**

### 2. Créer la base sur Supabase

1. Dans le projet Supabase, ouvrez **SQL Editor → New query**.
2. Collez tout le contenu de `supabase/schema.sql`.
3. Tout en bas, remplacez `VOTRE_ID_DISCORD` par votre identifiant Discord. Pour l’obtenir : dans Discord, **Paramètres → Avancés → Mode développeur**, puis clic droit sur votre profil → **Copier l’identifiant**.
4. Cliquez **Run**. Le message *Success* doit apparaître.
5. Ouvrez une nouvelle requête, collez le contenu de `supabase/v2_journal_export.sql` et cliquez **Run**. Il ajoute le journal des actions et l’export vers Google Sheets.
6. Ouvrez **Project Settings → API** (ou **API Keys** selon la version de l’interface). Copiez la **Project URL** et la clé **publique** (nommée `anon` ou `publishable`).

### 3. Relier Discord

1. Sur https://discord.com/developers/applications, ouvrez votre application, puis **OAuth2**.
2. Copiez le **Client ID**. Cliquez **Reset Secret** et copiez le **Client Secret**.
3. Dans **Redirects**, ajoutez `https://VOTRE-PROJET.supabase.co/auth/v1/callback`, en remplaçant `VOTRE-PROJET` par l’identifiant visible dans votre Project URL. Cliquez **Save Changes**.
4. Dans Supabase, ouvrez **Authentication → Sign In / Providers** (ou **Providers**), puis **Discord**. Activez-le, collez le Client ID et le Client Secret, et enregistrez.
5. Dans Supabase, ouvrez **Authentication → URL Configuration**. Dans **Site URL**, mettez `https://guichet-fiscal.github.io/declaration/`. Dans **Redirect URLs**, ajoutez `https://guichet-fiscal.github.io/declaration/**`.

### 4. Renseigner `config.js`

Sur GitHub, ouvrez `config.js` et cliquez sur le crayon (**Edit**). Remplacez les deux valeurs par la Project URL et la clé publique, puis cliquez **Commit changes**. Le site se met à jour en une à deux minutes.

> La clé publique peut être publiée sans risque : ce sont les règles de la base qui protègent les données. **Ne mettez jamais la clé `service_role` ou `secret` dans ce dépôt.**

### 5. Premier test

Ouvrez l’adresse du site, cliquez **Se connecter avec Discord** et autorisez l’accès. Vous arrivez sur le tableau de bord avec le rôle Direction.

Si l’écran « Accès pas encore accordé » s’affiche, l’identifiant qu’il indique n’est pas celui que vous avez mis à l’étape 2. Corrigez-le dans Supabase, **Table Editor → agents**.

### 6. Reprendre les données de l’ancien guichet

1. Dans l’ancien guichet (la page Claude), cliquez **Sauvegarder**.
2. Dans le nouveau site, ouvrez **Réglages → Sauvegarde et restauration**, choisissez le fichier, puis cliquez **Restaurer**.

---

## Ce que fait le guichet

- **Tableau de bord** : montants déclarés, encaissés et restant dus, entreprises à surveiller, alertes de fraude possible, enveloppes des services publics et Trésor.
- **Entreprises** : recherche et filtres (en retard, doivent de l’argent, alertes, en contrôle). Chaque nom ouvre une fiche avec l’historique, le total payé, les retards, les alertes et les pénalités.
- **Économie** : chiffre d’affaires du serveur, emplois, masse salariale, recettes, secteurs et plus grosses entreprises, avec des graphiques sur 12 périodes.
- **Avis en image** : chaque avis d’imposition, décision budgétaire et pénalité peut être copié en image pour être collé sur Discord.
- **Pénalités et paiement en plusieurs fois** : depuis la fiche d’une entreprise ou le dossier d’une déclaration.
- **Journal** : chaque action est inscrite par la base avec son auteur. Personne ne peut le modifier depuis le site.

### Les barèmes par tranches

Par défaut, l’impôt et les cotisations sont calculés par tranches, comme un vrai barème progressif : chaque tranche est taxée à son propre taux, et seule la part qui dépasse un seuil paie le taux supérieur. Une petite entreprise ne paie donc que les premières tranches.

| Impôt sur les bénéfices nets | Taux |
|---|---|
| Jusqu’à 20 000 € | 0 % |
| De 20 000 € à 100 000 € | 12 % |
| De 100 000 € à 300 000 € | 22 % |
| De 300 000 € à 600 000 € | 30 % |
| De 600 000 € à 1 000 000 € | 38 % |
| Au-delà de 1 000 000 € | 45 % |

| Cotisations sur les salaires | Taux |
|---|---|
| Jusqu’à 20 000 € | 0 % |
| De 20 000 € à 60 000 € | 18 % |
| De 60 000 € à 100 000 € | 32 % |
| De 100 000 € à 130 000 € | 38 % |
| De 130 000 € à 150 000 € | 44 % |
| Au-delà de 150 000 € | 80 % (surtaxe infraction) |

Tout se modifie dans **Réglages → Barèmes par tranches** : ajouter ou supprimer une tranche, changer un plafond, un taux ou un libellé. Une tranche qui porte un libellé (comme « Surtaxe infraction ») déclenche une alerte quand une entreprise l’atteint. Le barème des salaires peut s’appliquer à la masse salariale totale ou au salaire moyen de chaque salarié. Le mode « Taux unique » reste disponible.

Chaque déclaration garde le détail du calcul au moment de sa saisie : changer le barème ne modifie pas les avis déjà émis.

### Les alertes

Une déclaration est signalée quand :

- son chiffre d’affaires tombe à moins de la moitié de la moyenne de ses trois déclarations précédentes ;
- son résultat est négatif deux périodes de suite ;
- elle déclare des salariés sans salaires, ou des salaires sans salarié ;
- son salaire moyen est sous le minimum fixé dans les réglages ;
- ses charges dépassent 90 % du chiffre d’affaires ;
- elle n’a aucun chiffre d’affaires alors qu’elle a des salariés ;
- l’entreprise a été en retard au moins deux fois sur ses quatre dernières déclarations.

Une alerte n’est pas une preuve : c’est une raison de faire un contrôle en RP.

## Suivi dans Google Sheets

Une feuille Google Sheets peut recopier tout le registre chaque heure ou chaque lundi. Les admins la consultent sans passer par le site.

1. Créez la feuille **avec un compte Google du serveur**, pas un compte personnel.
2. Dans le guichet, ouvrez **Réglages → Suivi dans Google Sheets**, donnez un nom à la clé et cliquez **Créer une clé d’export**. Copiez la clé : elle ne sera plus affichée.
3. Dans la feuille, ouvrez **Extensions → Apps Script**. Remplacez tout le contenu par celui de `google-sheets/export.gs` et enregistrez.
4. Rechargez la feuille. Un menu **Guichet fiscal** apparaît.
5. **Guichet fiscal → Enregistrer la clé d’export**, puis collez la clé.
6. **Guichet fiscal → Actualiser maintenant**. Google vous demande d’autoriser le script la première fois.
7. **Guichet fiscal → Actualisation automatique : chaque heure** (ou **chaque lundi**).

La feuille contient les onglets Déclarations, Entreprises, Demandes, Pénalités, Échéanciers, Journal et Résumé. Pour couper l’accès d’une feuille, révoquez sa clé dans les réglages du guichet.

## Donner l’accès à quelqu’un

Dans **Réglages → Accès au guichet**, ajoutez son identifiant Discord, son nom et son rôle :

- **Direction** : saisit les dossiers, décide et gère les accès.
- **Lecture seule** : consulte le registre et télécharge les sauvegardes. C’est le bon rôle pour les administrateurs du serveur.

Les joueurs n’ont pas besoin d’accès : ils déclarent sur Discord.

Si plus personne n’a le rôle Direction, un propriétaire du projet Supabase peut le redonner dans **Table Editor → agents → Insert row**.

## Continuité et sauvegardes

- Cliquez **Sauvegarder** chaque semaine et déposez le fichier dans un salon réservé au staff.
- Toutes les données restent consultables dans Supabase, **Table Editor → registre** : une ligne par dossier, contenu dans la colonne `data`.
- Avec l’offre gratuite de Supabase, un projet sans activité pendant une semaine est mis en pause. Il se relance depuis le tableau de bord Supabase (**Restore project**).

## Adresse personnalisée (facultatif)

Pour utiliser par exemple `impots.grandparisrp.fr` :

1. Sur GitHub, ouvrez **Settings → Pages → Custom domain**, saisissez l’adresse et enregistrez.
2. Chez le gestionnaire du domaine, créez un enregistrement **CNAME** `impots` qui pointe vers `guichet-fiscal.github.io`.
3. Dans Supabase, remplacez l’ancienne adresse par la nouvelle dans **Site URL** et **Redirect URLs**.

## Modifier le site

Toute modification passe par ce dépôt. GitHub garde l’historique de chaque changement, et on peut revenir à une version précédente à tout moment.
