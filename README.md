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
- `manifest.webmanifest`, `sw.js` et `assets/icon-*.png` : ce qui permet d’installer le guichet comme une application
- `supabase/schema.sql` : les tables et les règles d’accès de la base
- `supabase/v2_journal_export.sql` : le journal des actions et l’export vers Google Sheets
- `supabase/v3_discord.sql` : la table privée des salons Discord
- `supabase/v4_inspection_cloture.sql` : le rôle Inspection et le verrou des semaines clôturées
- `supabase/v5_pieces.sql` : l’espace privé des captures d’écran des contrôles fiscaux
- `supabase/v6_direct.sql` : le journal en direct, la présence des agents et les rectificatives saisies par l’Inspection
- `supabase/v7_blanchiment.sql` : les relevés de compte faits par l’Inspection
- `supabase/v8_prets.sql` : les demandes de prêt enregistrées par l’Inspection
- `supabase/v9_vehicules.sql` : le registre des véhicules de société tenu par l’Inspection
- `supabase/v10_notifications.sql` : les abonnements aux notifications et l’appel du service d’envoi
- `supabase/v11_convocations.sql` : les convocations (droits de l’Inspection, verrou contre les décisions prises deux fois)
- `supabase/v12_contrats.sql` : les contrats d’achat (projets de l’Inspection, contrat signé figé, paiements jamais effacés)
- `supabase/v13_conventions.sql` : les conventions de partenariat et les prestations offertes (l’Inspection note, la Direction valide)
- `supabase/v14_amendes.sql` : les amendes versées au Trésor (l’Inspection note, la Direction confirme la réception)
- `supabase/v15_conventions_forfait.sql` : la réduction d’impôt fixe des conventions de partenariat, figée à la signature
- `supabase/v16_contrats_suppression.sql` : la suppression d’un contrat sans paiement par la Direction
- `supabase/v17_budget_mensuel.sql` : le passage du budget des services publics au mois (dossiers déjà enregistrés rangés au mois, plafonds par semaine × 4,33)
- `supabase/v18_payes_pointeuse.sql` : la pointeuse (prise et fin de service à l’heure du serveur) et le rôle d’accès « Pointeuse », qui ne voit que ses propres pointages
- `supabase/v19_pointeuse_paye.sql` : la paye de la semaine sur la pointeuse pour le rôle « Pointeuse » (sa propre fiche et le barème, rien d’autre)
- `supabase/v20_rappel_echeance.sql` : le rappel automatique avant la date limite de déclaration, publié sur Discord la veille
- `supabase/v21_espace_entreprise.sql` : l’espace entreprise (lien personnel du patron, dépôt des déclarations en ligne)
- `supabase/v22_espace_convocations.sql` : l’espace entreprise montre aussi les convocations et l’attestation de régularité
- `supabase/v23_conventions_suppression.sql` : la Direction peut supprimer une convention de partenariat faite par erreur ou pour un essai
- `supabase/functions/notifier/` : le service d’envoi des notifications (Supabase Edge Function)
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
5 bis. Faites de même avec `supabase/v3_discord.sql` (table privée des salons Discord), puis avec `supabase/v4_inspection_cloture.sql` (rôle Inspection et clôture des semaines), `supabase/v5_pieces.sql` (captures des contrôles) `supabase/v6_direct.sql` (journal en direct et présence des agents), `supabase/v7_blanchiment.sql` (relevés de compte), `supabase/v8_prets.sql` (demandes de prêt), `supabase/v9_vehicules.sql` (véhicules de société), `supabase/v10_notifications.sql` (notifications), `supabase/v11_convocations.sql` (convocations), `supabase/v12_contrats.sql` (contrats d’achat), `supabase/v13_conventions.sql` (conventions de partenariat), `supabase/v14_amendes.sql` (amendes versées au Trésor), `supabase/v15_conventions_forfait.sql` (réduction fixe des conventions) `supabase/v16_contrats_suppression.sql` (suppression des contrats sans paiement), `supabase/v17_budget_mensuel.sql` (budget des services au mois) et `supabase/v18_payes_pointeuse.sql` (pointeuse et rôle Pointeuse), `supabase/v19_pointeuse_paye.sql` (paye de la semaine sur la pointeuse), `supabase/v20_rappel_echeance.sql` (rappel avant la date limite), `supabase/v21_espace_entreprise.sql` (espace entreprise), `supabase/v22_espace_convocations.sql` (convocations et attestation dans l’espace), `supabase/v23_conventions_suppression.sql` (suppression des conventions). Toujours dans cet ordre.
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
2. Dans le nouveau site, ouvrez **Réglages → Sauvegardes et export**, choisissez le fichier, puis cliquez **Restaurer**.

---

## Ce que fait le guichet

**Se repérer** : le bandeau a cinq rubriques, et chacune a ses pages juste en dessous.

| Rubrique | Pages |
|---|---|
| Tableau de bord | la vue d’ensemble |
| Dossiers | Entreprises, Saisir une déclaration, Recouvrement, Convocations, Prêts, Véhicules |
| Trésor | Économie, Contrats et partenariats, Amendes |
| Services publics | Demandes, Saisir une demande, Enveloppes, Catalogue des prix |
| Outils | Journal, Modèles Discord, Réglages |

Une rubrique rouvre la dernière page consultée. Le bouton **Nouveau** (à droite du bandeau, ou le bouton rond en bas à droite sur téléphone) réunit toutes les créations, rangées par thème : déclaration, convocation, tournée de collecte, contrôle fiscal, relevé de compte, prêt, véhicule, contrat, convention, versement des amendes, demande de moyens, article du catalogue des prix. Les liens des notifications ouvrent toujours la bonne rubrique.

- **Tableau de bord** : montants déclarés, encaissés et restant dus, puis la carte **À traiter** (ce qui attend une action : déclarations à valider, demandes à arbitrer, contrats et conventions à signer, amendes à confirmer, demandes de prêt, paye de la semaine passée à verser, services ouverts depuis plus de 12 h, véhicules à examiner, convocations à constater), entreprises à surveiller, alertes de fraude possible, enveloppes des services publics et Trésor. Chaque ligne mène à la bonne page, au bon filtre.
- **Services publics** : voir la section du même nom plus bas (demandes article par article, enveloppes du mois, catalogue des prix).
- **Entreprises** : recherche et filtres (en retard, doivent de l’argent, alertes, en contrôle). Chaque nom ouvre une fiche avec l’historique, le total payé, les retards, les alertes et les pénalités.
- **Économie** : chiffre d’affaires du serveur, emplois, masse salariale, recettes, secteurs et plus grosses entreprises, avec des graphiques sur 12 périodes au plus, depuis le début du suivi.
- **Coller un message Discord** (déclaration ou demande de moyens) : le guichet remplit le formulaire même si le modèle est mal suivi. Copiez le message avec son en-tête (« pseudo Nom — Hier à 22:05 ») : l’heure du message devient l’heure de dépôt, et l’auteur sert de déclarant ou de demandeur si le message n’en donne pas de lisible. Il comprend les salariés avec ou sans tiret, le salaire au milieu de la ligne (« Juan 40 000 € (PDG) »), « Déclarant @Nom : », une période écrite « du 12 au 18 octobre », les quantités « x2 », « X 20 », « 2x » ou « (x5) » avant ou après le prix, les prix après « - », « | » ou sans séparateur (« Renault Zoé 100 000 € », « 500k »), et le service sous un autre nom (« Tribunal » → Justice, « Direction des routes » → DIR, « police » → Police nationale). Un prix après un tiret ou une barre est un prix à l’unité ; après deux-points, le total de la ligne. Un objet vague (« achat ») est remplacé par le résumé des articles, et la nature, si elle manque, est devinée d’après les articles. Chaque message collé remplace la saisie précédente : rien ne reste d’une autre entreprise.
- **Avis en image** : chaque avis d’imposition, décision budgétaire et pénalité peut être copié en image pour être collé sur Discord.
- **Émettre les avis en une fois** (Direction et Inspection) : au-dessus du tableau des déclarations à valider, le bouton liste celles qui n’ont ni alerte, ni contrôle, ni rectificative à examiner. Décochez celles à garder ; chaque avis peut partir sur Discord avec la mention du patron. Les autres restent à ouvrir une par une, avec la raison affichée. Une déclaration qu’un contrôle attend a un bouton « Ouvrir » au lieu de « Valider ».
- **Pénalités et paiement en plusieurs fois** : depuis la fiche d’une entreprise ou le dossier d’une déclaration.
- **Recouvrement** : les entreprises qui n’ont pas déclaré, et les avis et pénalités non payés après le délai de paiement. La procédure suit celle du droit réel : relance, mise en demeure, puis taxation d’office, saisie ou transmission à la justice (voir plus bas). Chaque acte reste inscrit au dossier.
- **Publication sur Discord** : les avis, pénalités, décisions budgétaires et relances partent dans le bon salon, avec une mention du patron ou du service.
- **Exonération des entreprises nouvelles** (Réglages) : pendant ses premières périodes (4 semaines par défaut), une entreprise qui ouvre paie moins d’impôt (−100 % par défaut) et de cotisations (−50 % par défaut), éventuellement de façon dégressive. Une entreprise est nouvelle si son activité commence au début du suivi ou après (les entreprises de l’ouverture du serveur en profitent donc aussi) ; la Direction peut aussi accorder ou refuser l’exonération au cas par cas. La réduction est calculée au dépôt, apparaît sur l’avis et sur la fiche, et son coût figure dans l’onglet Économie.
- **Quittances** : chaque encaissement (avis, échéance, pénalité) a sa quittance en image, qui prouve le paiement. Elle peut partir toute seule sur Discord.
- **Attestation de régularité fiscale et sociale** : depuis la fiche d’une entreprise. Elle n’est délivrée qu’à une entreprise qui a déposé toutes ses déclarations échues et payé ce qu’elle doit (un paiement en plusieurs fois respecté est accepté). Elle a un numéro, une date de fin de validité (réglable), et la Direction peut la révoquer. **Entreprises → Vérifier une attestation** contrôle un numéro présenté par une entreprise. Sinon, le site produit l’image de sa situation fiscale à régulariser.
- **Journal** : chaque action est inscrite par la base avec son auteur. Personne ne peut le modifier depuis le site.
- **Corriger une erreur** : une déclaration, une demande, une entreprise (nom, secteur, patron), une pénalité ou le nom d’un agent se modifient sans créer de doublon. Un accord, un refus, un avis émis ou un encaissement (impôt, échéance, pénalité) peut être annulé. Tout reste tracé dans le journal.
- **Début du suivi** (Réglages) : les périodes plus anciennes ne sont plus proposées ni affichées dans les graphiques. Chaque nouvelle semaine s’ajoute toute seule.

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

Tout se modifie dans **Réglages → Barèmes** : ajouter ou supprimer une tranche, changer un plafond, un taux ou un libellé. Une tranche qui porte un libellé (comme « Surtaxe infraction ») déclenche une alerte quand une entreprise l’atteint. Le barème des salaires peut s’appliquer de trois façons :

- **Chaque salaire séparément** (recommandé) : l’entreprise liste ses salariés avec leur salaire, et chaque salaire a sa propre cotisation. Un petit salaire paie peu, un gros salaire paie plus. Le modèle Discord demande alors un salarié par ligne (`- Nom : salaire`).
- **Masse salariale totale** : le barème s’applique au total des salaires de l’entreprise.
- **Salaire moyen par salarié** : le barème s’applique au salaire moyen, multiplié par le nombre de salariés. Le mode « Taux unique » reste disponible.

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

## Publication sur Discord

1. Si ce n’est pas déjà fait, exécutez `supabase/v3_discord.sql` dans **SQL Editor** (voir la mise en place, étape 2).
2. Dans Discord, pour chaque salon : **Paramètres du salon → Intégrations → Webhooks → Nouveau webhook → Copier l’URL du webhook**.
3. Dans le guichet, **Réglages → Discord** : collez l’adresse du salon des entreprises, du salon des services publics et, si vous voulez, d’un salon des relances, d’un salon de la justice (avec le rôle à mentionner, par exemple `<@&ID du rôle des magistrats>`) et d’un salon de la police (certificats des véhicules de société, registre des plaques, requalifications, avec le rôle de la police à mentionner). Cochez ce qui doit partir tout seul, puis **Enregistrer** et **Envoyer un message d’essai**.
4. Pour mentionner un patron : **Modifier l’entreprise → ID Discord du patron** (clic droit sur le membre → Copier l’identifiant, avec le mode développeur activé).
5. Pour mentionner un service : **Réglages → Services publics**, colonne « Rôle Discord à mentionner ». Collez l’identifiant du rôle (mode développeur, clic droit sur le rôle → Copier l’identifiant du rôle) ou `<@&ID>`. Sous chaque service, le site rappelle le rôle attendu : EM PN, EM GN, Direction APHP (SAMU), Direction BSPP, PREFECTURE, TRIBUNAL. **Essayer les rôles sur Discord** envoie un message qui mentionne chaque rôle une fois, pour vérifier qu’ils sonnent.
   - Le rôle du service est mentionné sur les accusés de réception de ses demandes, ses décisions budgétaires, ses amendes versées, ses contrats et ses conventions de partenariat.
   - Le rôle du service Justice (TRIBUNAL) est mentionné sur les dossiers transmis à la justice et les déclarations de soupçon ; ceux de la police nationale et de la gendarmerie (EM PN, EM GN) dans le salon de la police.
   - Les rôles de la justice et de la police réglés dans **Réglages → Discord** ne servent plus que si ces services n’ont pas de rôle.

Le guichet ne mentionne jamais `@everyone` ni `@here` : seuls le patron ou le rôle du service concerné sont notifiés. Les adresses des webhooks ne sont lisibles que par la Direction et l’Inspection (qui publie aussi), et seule la Direction les modifie : elles n’apparaissent ni dans le journal, ni dans les sauvegardes, ni dans Google Sheets. Si une adresse fuite, supprimez le webhook dans Discord et collez-en un nouveau.

Une entreprise est attendue à partir du début du suivi, ou de son **début d’activité** s’il est plus récent (Modifier l’entreprise). Une entreprise ajoutée au registre est attendue à partir de la période en cours : elle n’est jamais relancée pour une semaine où elle n’existait pas.

## Suivi dans Google Sheets

La feuille contient aussi les relances et mises en demeure, les attestations, les semaines clôturées, les contrôles, les saisies, les dossiers transmis à la justice, les relevés de compte, les déclarations de soupçon, les prêts et leurs remboursements, les véhicules de société, les contrôles de police, les convocations, les contrats d’achat et leurs paiements, les conventions de partenariat et les prestations offertes, les amendes versées au Trésor, les articles des demandes des services (avec la décision article par article), le catalogue des prix, les enveloppes des services mois par mois, les payes de la Préfecture agent par agent, les rappels de salaire, les trop-perçus et les pointages. Après une mise à jour de `google-sheets/export.gs`, recollez-le dans Apps Script.

Une feuille Google Sheets peut recopier tout le registre chaque heure ou chaque lundi. Les admins la consultent sans passer par le site.

1. Créez la feuille **avec un compte Google du serveur**, pas un compte personnel.
2. Dans le guichet, ouvrez **Réglages → Sauvegardes et export → Suivi dans Google Sheets**, donnez un nom à la clé et cliquez **Créer une clé d’export**. Copiez la clé : elle ne sera plus affichée.
3. Dans la feuille, ouvrez **Extensions → Apps Script**. Remplacez tout le contenu par celui de `google-sheets/export.gs` et enregistrez.
4. Rechargez la feuille. Un menu **Guichet fiscal** apparaît.
5. **Guichet fiscal → Enregistrer la clé d’export**, puis collez la clé.
6. **Guichet fiscal → Actualiser maintenant**. Google vous demande d’autoriser le script la première fois.
7. **Guichet fiscal → Actualisation automatique : chaque heure** (ou **chaque lundi**).

La feuille contient les onglets Déclarations, Entreprises, Demandes, Pénalités, Échéanciers, Journal et Résumé. Pour couper l’accès d’une feuille, révoquez sa clé dans les réglages du guichet.

## Donner l’accès à quelqu’un

Dans **Réglages → Accès**, ajoutez son identifiant Discord, son nom et son rôle :

- **Direction** : tout, y compris encaisser, annuler, infliger les pénalités, arbitrer les demandes, clôturer les semaines, restaurer depuis le journal, les réglages et les accès.
- **Inspection** : saisit les déclarations et les demandes, émet les avis, place un dossier en contrôle, relance les entreprises et publie sur Discord. Elle ne peut ni encaisser, ni annuler, ni supprimer, ni arbitrer, ni toucher aux réglages. Ces limites sont appliquées par la base elle-même, pas seulement par le site.
- **Lecture seule** : consulte le registre et télécharge les sauvegardes. C’est le bon rôle pour les administrateurs du serveur.
- **Pointeuse seulement** : la pointeuse et rien d’autre. Pour les fonctionnaires de la Préfecture qui n’ont pas besoin du registre : ils prennent et finissent leur service, voient leurs heures de la semaine, et la base ne leur montre aucun autre dossier (ni le journal, ni les accès, ni les pièces, ni qui est connecté).

Le rôle Inspection demande d’avoir exécuté `supabase/v4_inspection_cloture.sql`, le rôle Pointeuse `supabase/v18_payes_pointeuse.sql`. Tous les rôles ont aussi la pointeuse (Tableau de bord → Pointeuse).

Les joueurs n’ont pas besoin d’accès : ils déclarent sur Discord.

Si plus personne n’a le rôle Direction, un propriétaire du projet Supabase peut le redonner dans **Table Editor → agents → Insert row**.

## Espace entreprise

Chaque entreprise peut recevoir un **lien personnel**, sans compte ni connexion Discord. Son patron y voit ce qui la concerne, et rien d’autre : les déclarations à déposer et leur date limite, ce qu’elle doit (avis, pénalités, échéances de prêt), ses déclarations et leurs avis (en image, avec la quittance une fois payés), les rappels et relances reçus, son exonération, ses convocations (à venir et du dernier mois, en image) et son attestation de régularité en cours de validité, à télécharger (avec `supabase/v22_espace_convocations.sql`). Un avis suspendu par un contrôle s’affiche « En cours d’examen », sans dire lequel.

1. **Créer le lien** (Direction) : sur la fiche de l’entreprise, section « Espace entreprise », ou dans **Réglages → Entreprises → Espaces entreprise**, où **Créer les N liens manquants** les crée tous d’un coup ; chaque ligne a ensuite son bouton **Copier le message** (« Copié · recopier » une fois fait). Collez chaque message au patron en message privé, jamais dans un salon public. **Nouveau lien** remplace l’ancien, qui ne marche plus ; **Couper l’accès** le supprime. La fiche indique la dernière visite.
   Quand vous changez le patron ou son ID Discord sur la fiche d’une entreprise qui a déjà un lien, le guichet propose **Nouveau lien et copier le message** : l’ancien patron perd l’accès. **Garder le lien actuel** ne change rien (pour corriger une faute de frappe, par exemple).
2. **Déposer** (le patron) : bouton « Déclarer » sur la période. Chiffre d’affaires, charges, salariés et salaires, solde du compte et lien de sa capture, déclarant ; le montant estimé se calcule au barème en vigueur, exonération et majoration de retard comprises. Tant que la déclaration n’est pas enregistrée, il peut la corriger ; l’heure qui compte pour le retard reste celle du premier envoi.
3. **Enregistrer** (Direction ou Inspection) : rubrique **Saisir une déclaration**, carte **Reçues en ligne** (la carte « À traiter » la signale). « Enregistrer » fait le calcul comme une saisie : la déclaration passe à valider, avec l’heure de réception comme heure de dépôt. « Vérifier » remplit le formulaire sans enregistrer. « Refuser » demande un motif, que le patron voit dans son espace avant de renvoyer une déclaration corrigée. « Enregistrer les N » les enregistre toutes.

La saisie depuis le message Discord reste possible : les deux chemins mènent au même formulaire et au même calcul. Une période déjà déclarée, clôturée, future ou antérieure au début d’activité est refusée au dépôt. La base vérifie chaque valeur et limite les envois à 20 par heure et par entreprise. Il faut avoir exécuté `supabase/v21_espace_entreprise.sql`.

## Contrôle fiscal

Depuis un dossier, une alerte, la fiche d’une entreprise ou **Recouvrement → Contrôles fiscaux**, le contrôle suit les étapes de la procédure réelle :

1. **Ouverture** : périodes vérifiées, origine (alerte, signalement, contrôle aléatoire), inspecteur. Les avis non payés de ces périodes sont suspendus. L’**avis de vérification** peut partir sur Discord.
2. **Instruction** : constats, notes datées, **pièces**. Les captures d’écran sont réduites et compressées (environ 200 Ko) puis rangées dans un espace privé de Supabase (1 Go gratuit, soit environ 5 000 captures ; l’espace utilisé est affiché). Un lien peut remplacer une capture : prenez le lien du message Discord, pas celui de l’image, qui expire.
3. **Rectifications** : chiffre d’affaires, charges, salaires et salariés retenus par période ; le rappel est recalculé au barème en vigueur. Quand le barème s’applique à chaque salaire, les salaires se rectifient salarié par salarié (corriger un salaire, retirer un salarié fictif, ajouter un salarié non déclaré) ; si seule la masse est changée, la répartition déclarée entre les salariés est gardée. Qualification : bonne foi (0 %), manquement délibéré (40 %), manœuvres frauduleuses (80 %), opposition au contrôle (100 %).
4. **Proposition de rectification** : notifiée avec un délai de réponse (2 jours par défaut, réglable). L’entreprise accepte ou conteste ; sans réponse, elle est réputée accepter.
5. **Mise en recouvrement** (Direction) : l’**avis de mise en recouvrement** crée la somme à payer, suivie comme une pénalité (relances, quittance). Les avis suspendus redeviennent payables. Ou bien **classement sans suite**.

L’Inspection mène le contrôle jusqu’à la proposition ; seule la Direction met en recouvrement et retire une pièce.

**Clore et transmettre à la justice** (Direction) : un contrôle en cours, même sans déclaration, se clôt avec sa conclusion, puis la fenêtre de transmission à la justice s’ouvre (contrôle, constats, notes et pièces repris dans le PDF). La même fenêtre peut prononcer la **fermeture administrative** de l’établissement par le préfet de police, sur le modèle de l’article L3332-15 du Code de la santé publique (jusqu’à la décision de la justice, ou 1 semaine à 6 mois) : l’entreprise passe inactive, n’est plus attendue ni relancée, son espace en ligne se ferme, et l’arrêté de fermeture part sur Discord avec la mention du patron et de la police (il reste sur la fiche). Pour la rouvrir : Réglages → Entreprises.

**Contrôle avant la déclaration.** Quand des opérations suspectes sont constatées pendant la semaine (par exemple de grosses sommes en liquide versées puis reversées en salaires), le contrôle peut commencer sans attendre la déclaration. C’est le modèle de la flagrance fiscale (art. L16-0 BA du LPF), qui permet à l’administration d’agir avant la date limite de déclaration. À l’ouverture, depuis la fiche de l’entreprise ou **Recouvrement → Contrôles fiscaux**, cochez la semaine en cours, ou la précédente tant que sa date limite n’est pas passée. Rangez les captures du compte dans les pièces. Dès qu’un agent saisit la déclaration de cette semaine, elle rejoint le contrôle et son avis attend la fin du contrôle ; les rectifications et la proposition se font alors sur elle. L’avis de vérification peut partir tout de suite, ou plus tard pour ne pas alerter l’entreprise avant qu’elle déclare. Si la date limite passe sans déclaration, la relance suit son cours (mise en demeure, taxation d’office).

## Recouvrement forcé et justice

Le guichet reprend, en plus court, la procédure des impôts et de l’URSSAF. Les délais et taux se règlent dans **Réglages → Recouvrement**.

**Une entreprise qui ne déclare pas**

0. **Rappel avant la date limite** : la veille de la date limite (le lundi pour une limite le mardi), à 18 h par défaut, un message dans le salon des relances (à défaut, celui des entreprises) rappelle aux entreprises qui n’ont pas encore déclaré la semaine qu’elles doivent le faire, chaque patron mentionné. Il part tout seul une fois `supabase/v20_rappel_echeance.sql` exécuté ; l’heure se règle, et l’envoi se coupe, dans **Réglages → Recouvrement**. Il peut aussi partir à la main : **Dossiers → Recouvrement**, bouton « Rappel avant la date limite » (la carte « À traiter » le signale s’il n’est pas parti). Le rappel est inscrit au dossier de chaque entreprise ; une entreprise n’est jamais rappelée deux fois pour la même semaine.
1. **Rappel de déclaration** (amiable), une fois la date limite passée.
2. **Mise en demeure de déclarer** : un délai (2 jours par défaut) pour déposer. Dans la réalité, c’est l’article 1728 du CGI : sans dépôt dans les 30 jours suivant la mise en demeure, la majoration passe de 10 % à 40 %.
3. **Taxation d’office** : une fois le délai écoulé, le bouton ouvre le formulaire de déclaration en mode « taxation d’office ». La Direction saisit les éléments dont elle dispose ; l’avis est émis aussitôt avec la majoration d’office (40 % par défaut). C’est l’article L66 du LPF. Sur une semaine clôturée, il faut d’abord la rouvrir.

**Une entreprise qui ne paie pas**

1. **Relance de paiement** (amiable). Une somme devient exigible à la fin du délai de paiement (2 jours après l’avis par défaut, Réglages → Calendrier et taux). Avant, elle apparaît dans Recouvrement → Impayés, rubrique « Dans le délai de paiement », avec sa date : un **rappel** est déjà possible, la mise en demeure attend l’échéance. Annuler un encaissement ne repousse pas cette date.
2. **Mise en demeure de payer** : un délai (2 jours par défaut). Elle vaut commandement de payer (art. L257-0 A et L258 A du LPF).
3. **Majoration de 10 %** (Direction) sur chaque avis payé en retard, une seule fois, comme l’article 1730 du CGI.
4. **Saisie** (Direction) : **à tiers détenteur** (la banque, l’employeur ou un client verse à la Direction ce qu’il doit à l’entreprise, sans passer par un juge : art. L262 du LPF) ou **saisie-vente** des biens (véhicules, stocks). L’acte part sur Discord. **Saisie exécutée** encaisse les sommes visées et publie les quittances ; **Mainlevée** l’arrête. Le site demande une mise en demeure expirée, sauf si vous cochez « Saisir quand même ». Pendant une saisie, l’attestation de régularité est refusée.
5. **Transmission à la justice** (Direction) : depuis Recouvrement ou la fiche. Choisissez les qualifications (défaut de paiement, fraude fiscale, travail dissimulé, opposition au contrôle, organisation d’insolvabilité) et les mesures demandées (saisie des comptes, saisie des biens, fermeture, poursuites, interdiction de gérer). L’exposé des faits est rédigé tout seul et se corrige. Le site produit un **PDF complet** : identité, créances avec leur date d’exigibilité, chronologie de la procédure (avis, relances, mises en demeure, saisies), contrôles fiscaux avec leurs rectifications, historique des déclarations, mesures, signature, rappel des textes et, en annexe, les captures des contrôles. Le PDF part dans le salon de la justice avec la mention du rôle choisi, et se télécharge. Le dossier suit ensuite ses **suites** : saisie effectuée, condamnation, dette réglée, classement.

Un dossier peut aussi partir **sans créance**, pour signaler des délits : par exemple du blanchiment constaté pendant la semaine, avant toute déclaration. Le blanchiment est coché d’office quand un contrôle a été ouvert sur la surveillance des comptes. La case **Sommes d’origine suspecte en cause** donne le montant affiché en tête du PDF et dans le message Discord, à la place de « 0 € à recouvrer » ; l’exposé décrit le contrôle, ses constats et la convocation. Mesures possibles en plus : **fermeture définitive** de l’établissement, **dissolution** de l’entreprise (art. 131-39 du Code pénal) et **confiscation du produit** de l’infraction, y compris les sommes reversées en salaires (art. 131-21). Quand la suite enregistrée est une **condamnation**, la case « Fermer l’entreprise au registre » la rend inactive (plus attendue ni relancée) ; elle est cochée d’office si la dissolution ou la fermeture définitive était demandée.

Quand les droits rappelés par un contrôle dépassent 100 000 € avec une majoration de 80 % ou 100 %, le site signale la **dénonciation obligatoire** au procureur (art. L228 du LPF), comme dans la réalité.

Relances et mises en demeure partent de Dossiers → Recouvrement ou, en haut de la fiche de l’entreprise, de la rubrique « Relances et mises en demeure ». La fenêtre « Transmettre à la justice » ne les envoie pas : elle vérifie seulement qu’elles ont été faites. L’Inspection envoie relances et mises en demeure, et peut taxer d’office ; la majoration, la saisie et la transmission à la justice sont réservées à la Direction. Rien de nouveau à exécuter dans Supabase pour cette partie.

## Surveillance des comptes (blanchiment)

Sur le serveur, chaque employé peut déposer chaque jour jusqu’à 10 000 € d’argent sale sur le compte de l’entreprise. La tablette montre le solde du compte et ses 10 derniers mouvements : le guichet rapproche le solde de ce que les déclarations expliquent, et repère les mouvements suspects.

1. **Le solde du compte** : chaque déclaration porte le solde du compte en fin de période, avec une capture (fichier ou lien). Le modèle Discord a deux lignes de plus : « Solde du compte de l’entreprise » et « Capture du compte ». Réglage possible : exiger le solde dans chaque déclaration (sinon, alerte).
2. **Le relevé de compte** : un agent prend le job, affiche le compte, fait une capture (Windows + Maj + S) et la **colle** (Ctrl + V) n’importe où dans le guichet : la fenêtre du relevé s’ouvre, l’entreprise est reconnue à son RIB dès son deuxième relevé, et le solde et les 10 derniers mouvements (date, libellé, montant, sens d’après la pastille rouge ou verte) sont lus automatiquement. Les lignes mal lues sont surlignées : comparez avec la capture, affichée à côté, avant d’enregistrer. On peut aussi coller le texte des mouvements, les recopier, ou ajouter une ligne. La capture devient la pièce du relevé ; l’heure du relevé est prise dans le nom du fichier quand il en a une. Relevez à tout moment, plusieurs fois par semaine : **le relevé fait foi** face au solde déclaré, et chaque relevé complète l’historique du compte. La fenêtre dit aussitôt si le relevé **concorde** avec le précédent (les mouvements lus expliquent toute la différence de solde) ou si des mouvements n’ont pas été vus entre les deux. La Direction peut retirer un relevé erroné.
   - **Solde de fin de période exact** : quand les mouvements d’un relevé remontent jusqu’au dimanche 23 h 59, le solde de fin de semaine est reconstitué exactement, même si le relevé est fait le mardi. Sinon, le relevé le plus proche de la fin de période sert (entre la veille de la fin et le lendemain du délai de dépôt), corrigé des mouvements lus qui suivent la fin de la période.
   - **Solde déclaré inexact** : le solde déclaré est comparé au solde du compte au moment du dépôt de la déclaration, reconstitué avec les mouvements (un solde affiché dans les trois heures qui précèdent convient). Sans mouvements qui remontent jusque-là, il n’est comparé qu’à un relevé fait à moins de 8 heures du dépôt (réglable) : les recettes arrivent surtout le soir.
   - **Mouvements suspects** : gros encaissement en espèces (à partir de l’écart d’alerte, 10 000 €) ; aller-retour (un montant qui entre et ressort, ou sort et revient, dans les 24 heures, hors remboursements) ; dépôts répétés proches du plafond (au moins 3 entrées entre 85 et 100 % du dépôt quotidien possible en 24 heures). Pour la semaine déclarée : salaires vus sur le compte au-delà de la masse salariale déclarée, recettes vues au-delà du chiffre d’affaires déclaré (les mouvements lus n’étant qu’une partie de la semaine, ce qui dépasse est certain). Ils rejoignent les alertes de la déclaration, la fiche (avec les derniers mouvements, les suspects surlignés, et le bouton « Contrôler ces mouvements »), le dossier de justice et la liste « Mouvements suspects » du recouvrement (deux dernières semaines).
3. **Le rapprochement** : solde attendu = solde précédent + chiffre d’affaires − charges − salaires − impôts et pénalités payés entre les deux observations. Au-delà de l’écart fixé (10 000 € par défaut), le guichet signale un **enrichissement inexpliqué**, et précise quand l’écart ressemble à des dépôts de 10 000 € ou approche ce que les employés peuvent déposer dans la période. Il signale aussi les sorties d’argent inexpliquées, un chiffre d’affaires par salarié plus de 3 fois supérieur à la médiane du secteur, et un chiffre d’affaires multiplié d’un coup. Ces signaux rejoignent les alertes habituelles (tableau de bord, fiche, dossier).
4. **Demander des justifications** : ouvre un contrôle fiscal prérempli (origine « Surveillance des comptes »). L’écart est retenu en recettes non déclarées, avec la majoration des manœuvres frauduleuses (80 %), et la **demande de justifications** part sur Discord avec un délai de réponse. Dans la réalité : demande de justifications puis taxation d’office des sommes d’origine indéterminée (art. L16 et L69 du LPF). Après la mise en recouvrement, les montants retenus par le contrôle expliquent l’écart.
5. **Déclaration de soupçon** (Direction) : sur le modèle de TRACFIN (art. L561-15 du Code monétaire et financier), elle part dans le salon de la justice avec la mention du rôle choisi. Le dossier de justice propose alors la qualification **blanchiment** (art. 324-1 du Code pénal : 5 ans et 375 000 € ; 10 ans et 750 000 € s’il est habituel ou en bande organisée, art. 324-2) et la mesure de confiscation, et son PDF ajoute la section « Compte de l’entreprise ».

Un écart classé par la Direction, ou qu’un contrôle a jugé justifié, ne revient plus. Les captures vont dans l’espace privé des pièces (`supabase/v5_pieces.sql`). Réglages → Recouvrement → Surveillance des comptes : activer, écart à partir duquel alerter, dépôt possible par employé et par jour, solde obligatoire, écart maximal entre un relevé sans mouvements et le dépôt. La lecture des captures se fait dans le navigateur (Tesseract, chargé depuis jsDelivr à la première capture, puis gardé en cache) : rien ne part ailleurs que dans l’espace des pièces.

## Prêts aux entreprises

La Préfecture peut prêter l’argent du Trésor à une entreprise pour un objet précis : un véhicule, un local, du stock, de la trésorerie. Dossiers → **Prêts**, ou la fiche de l’entreprise.

1. **La demande** : un agent (Inspection ou Direction) indique l’entreprise, l’objet, le montant, le taux et le remboursement. La simulation affiche aussitôt les intérêts, le total et les dates.
2. **L’accord** (Direction) : **Accorder et verser**. Le capital sort du Trésor, qui doit pouvoir le couvrir, et la **convention de prêt** part sur Discord avec l’échéancier. **Refuser** demande un motif.
3. **Le taux** : 0 % pour un prêt sans intérêts. Sinon, un taux global sur la durée : 10 % sur 20 000 € fait 22 000 € à rembourser. Les intérêts sont répartis à égalité sur les échéances.
4. **Le remboursement** : en une fois, ou par échéances (une par semaine, ou par mois si les déclarations sont mensuelles), avec un délai avant la première. Chaque échéance encaissée remonte au Trésor et publie une quittance.
5. **L’emploi des fonds** : par défaut, l’entreprise doit fournir le **justificatif de l’achat** (capture ou lien de la facture de la concession, par exemple) dans un délai (7 jours par défaut, modifiable pour chaque prêt). Passé ce délai, le prêt affiche « Justificatif manquant ».
6. **L’exigibilité anticipée** (Direction) : si le justificatif manque, si l’argent a servi à autre chose ou si les échéances ne sont pas payées, **Exiger le remboursement** rend tout le capital restant dû immédiatement. Les intérêts à venir ne sont pas réclamés. La notification part sur Discord.
7. **Le remboursement anticipé** : l’entreprise peut tout rembourser avant l’heure. Elle paie le capital restant, sans les intérêts des échéances à venir. Le montant est affiché avant de confirmer ; la Direction peut annuler un remboursement anticipé ou l’encaissement de la dernière échéance en cas d’erreur.

Une échéance en retard suit le recouvrement habituel : impayés, relance, mise en demeure, saisie, dossier de justice. Elle bloque l’attestation de régularité. Le versement du prêt et ses remboursements entrent dans la surveillance des comptes : l’argent prêté n’est pas un enrichissement inexpliqué.

L’Inspection peut enregistrer une demande et l’annuler tant qu’elle n’est pas accordée. Accorder, refuser, encaisser et exiger le remboursement sont réservés à la Direction, et la base l’impose elle-même (`supabase/v8_prets.sql`). Si un autre agent accorde, refuse ou annule la demande pendant que vous l’examinez, votre clic est arrêté et la fenêtre affiche le nouvel état du prêt.

## Véhicules de société (abus de biens sociaux)

Les entreprises achètent leurs véhicules en concession avec l’argent de leur compte. Un véhicule payé par l’entreprise mais réservé au dirigeant est un **abus de biens sociaux** (art. L241-3 et L242-6 du Code de commerce : 5 ans d’emprisonnement et 375 000 € d’amende). Fiscalement, la dépense n’est pas une charge de l’entreprise (art. 39-1 du CGI) et l’avantage est imposé comme un revenu distribué (art. 111 c du CGI). Dossiers → **Véhicules**, ou la fiche de l’entreprise.

1. **La déclaration d’achat** : le patron poste le modèle « Achat d’un véhicule de société » (onglet Modèles Discord) avec la facture de la concession. L’agent colle le message dans **Enregistrer un véhicule** : plaque, modèle, catégorie, prix, concession, date, usage, conducteurs autorisés, facture. Il indique si l’achat est compté dans les charges déclarées et s’il a été financé par un prêt de la Préfecture. Le **certificat d’affectation** part dans le salon de la police.
2. **La vérification par la police** : la case **Vérifier une plaque** (ou la recherche, Ctrl+K) dit à quelle entreprise appartient le véhicule, qui peut le conduire et à quoi il sert. **Publier le registre pour la police** envoie la liste des plaques dans son salon, où la police peut chercher une plaque. Une plaque inconnue qui roule pour une entreprise est un achat non déclaré : le guichet propose de l’enregistrer.
3. **Le contrôle de police** : l’agent saisit ce que la police a constaté (date, lieu, agent, conducteur, usage conforme, usage personnel, conducteur non autorisé, capture du rapport). Le guichet signale un conducteur qui n’est pas dans la liste.
4. **Les points à examiner** : achat non déclaré par l’entreprise, sportive, voiture de prestige, hélicoptère ou bateau pour un secteur qui n’en a pas l’usage, prix supérieur à la moitié du chiffre d’affaires des quatre dernières périodes, facture absente après 3 jours, achat fait pendant un impayé, contrôle de police défavorable, plus de voitures que de salariés (une de plus est tolérée), revente au dirigeant à moins de la moitié du prix. Réglages → Entreprises → Véhicules de société : délais, seuils et secteurs autorisés à rouler en véhicule de loisir.
5. **Valider l’affectation** (Direction) : l’achat se justifie, avec un motif. La validation ne couvre que ce qu’elle a vu : si le véhicule change ensuite (catégorie, prix) ou si la police fait un nouveau constat, il repasse « À examiner ».
6. **Requalifier** (Direction) : le véhicule devient un véhicule personnel du dirigeant. Le dirigeant rembourse son prix à l’entreprise dans un délai (7 jours par défaut). La requalification part sur Discord et la police est prévenue. Si l’achat était dans les charges, un **contrôle fiscal** prérempli retire son prix des charges de la période (manquement délibéré 40 % ou manœuvres frauduleuses 80 %).
7. **Les suites** : sans remboursement dans le délai, l’attestation de régularité est refusée et le dossier de justice propose la qualification **abus de biens sociaux** et la **confiscation des véhicules**. Le PDF ajoute une section « Véhicules de l’entreprise ». **Remboursement constaté** et **Véhicule saisi** ferment le dossier.

Un prêt « achat de véhicule » est justifié par le véhicule enregistré avec ce prêt et sa facture. Dans la surveillance des comptes, un achat payé par le compte mais absent des charges explique la baisse du solde, et le remboursement du dirigeant explique la hausse. L’Inspection enregistre les véhicules, leurs factures, les contrôles de police et les ventes. Valider, requalifier, marquer saisi et retirer du registre sont réservés à la Direction, et la base l’impose elle-même (`supabase/v9_vehicules.sql`) : l’Inspection ne peut ni effacer un contrôle de police, ni revenir sur une vente. Pour publier automatiquement certificats et requalifications, cochez « Véhicules de société » dans Réglages → Discord.

## Convocations et collecte des impôts

Dossiers → **Convocations**, la fiche de l’entreprise, un contrôle fiscal ou **Recouvrement → Impayés → Collecte**. Une convocation fixe un rendez-vous à une entreprise et part sur Discord avec la mention du patron.

1. **Collecte des impôts** : le transporteur de fonds (Trans’Fond) passe au siège de l’entreprise pour collecter les sommes dues, cochées une à une (avis exigibles ou encore dans leur délai, pénalités, échéances). **Planifier une collecte** convoque plusieurs entreprises à la suite, de 15 en 15 minutes (réglable), et publie un seul **ordre de collecte** sur Discord.
2. **Autres motifs** : contrôle fiscal (relié au contrôle), audition, ou motif libre, au lieu des convocations (la Préfecture par défaut).
3. **Le jour du rendez-vous** : **Présent** (nom et qualité : patron, personne ayant accès au coffre ou autre représentant) ou **Absent**. Pour une collecte, la Direction encaisse dans le même geste les sommes remises au convoyeur : quittances publiées, l’entreprise ne doit plus rien.
4. **Absence** : pour une collecte, majoration de 10 % des sommes encore dues ce jour-là (figée au constat), puis nouvelle convocation qui reprend les sommes et la majoration ; pour un autre motif, amende fixe (5 000 € par défaut). La Direction l’inflige ou en dispense l’entreprise, avec un motif. L’absence et la collecte entrent dans la chronologie du dossier de justice.
5. **Report ou annulation** : avant le rendez-vous, avec un motif ; la nouvelle convocation renvoie à l’ancienne.

Une même somme n’est jamais prévue dans deux collectes : tant qu’une collecte est à venir ou pas encore encaissée, l’entreprise n’est pas reconvoquée pour une collecte. Les taux annoncés sur la convocation restent ceux du jour où elle a été émise. Réglages → Recouvrement → Convocations et collecte : majoration, amende, minutes entre deux passages, transporteur de fonds, lieu des convocations. Discord : cochez « Convocations » dans la publication automatique.

L’Inspection convoque, constate la présence ou l’absence, reporte et annule ; encaisser une collecte, sanctionner ou dispenser et supprimer sont réservés à la Direction. La base l’impose elle-même (`supabase/v11_convocations.sql`), et refuse aussi qu’une convocation déjà traitée change d’état, qu’une sanction décidée change, ou que deux agents encaissent la même collecte en même temps. Pour corriger une erreur, la Direction supprime la convocation et en émet une nouvelle.

## Services publics

Rubrique **Services publics** du bandeau. Les chefs de service postent leur demande sur Discord ; l’Inspection ou la Direction la saisit, et la Direction décide.

1. **Saisir une demande** : le service, l’objet, l’unité et le numéro du bon de commande s’il existe, puis **les articles, un par ligne** (désignation, quantité, prix à l’unité ; le total se calcule seul). Collez le message Discord ou le bon de commande tel quel : le site repère les articles ligne par ligne, qu’ils soient écrits « 40 plaques : 1 200 000 € » (total de la ligne), « 4 × Moniteur – 25 000 € » (prix à l’unité) ou « Kit de soins ( 200 ) » (quantité seule). Un article sans prix reste « à chiffrer » : la Direction fixera son prix. Le modèle Discord (Outils → Modèles Discord) a une ligne par article.
2. **Le mois du budget** : chaque demande appartient à un mois, proposé d’après sa date de réception. Les crédits accordés sont imputés sur l’enveloppe du service pour ce mois ; la Direction peut changer le mois au moment de décider.
3. **Demandes** : la file des demandes, par état (à arbitrer, à l’étude, accordées, refusées), avec la recherche (article, objet, demandeur, numéro) et les filtres par service et par mois. Les cartes du bas ouvrent la **fiche de chaque service** : son enveloppe du mois, toutes ses demandes, ses achats sous contrat, ses amendes versées et son rôle Discord.
4. **Décider article par article** (Direction) : pour chaque ligne, la quantité accordée et le prix retenu (**Tout**, **Refuser**, **Prix réf.** pour revenir au prix du catalogue), avec un motif si besoin. Le total accordé, le reste de l’enveloppe du mois et le solde du Trésor se mettent à jour à chaque changement. **Accorder** enregistre un accord complet ou partiel ; **Tout refuser**, un refus. La décision en image et le texte Discord montrent chaque article : accordé, réduit ou refusé. **La décision part sur Discord** dans le salon des services, avec le rôle du service : la case « Publier la décision sur Discord » est cochée d’office quand « Décisions budgétaires » est coché dans Réglages → Discord, et se décoche pour une décision à ne pas annoncer. Une mise à l’étude n’est jamais publiée.
5. **Accusé de réception** : l’image de la demande avec le tableau des articles, à poster à la main pour confirmer au service qu’elle est enregistrée, après avoir relu la saisie. La publication automatique (« Demandes de moyens reçues » dans Réglages → Discord) est déconseillée : une saisie peut contenir des erreurs.
6. **Faire le contrat d’achat** : depuis une demande accordée, le contrat est prérempli avec le service, la demande qui le finance et les articles accordés.
7. **Enveloppes** : le budget de chaque service se compte au mois. Choisissez le mois (flèches ou liste) : plafond, crédits accordés, achats sous contrat, demandes en attente et reste. La Direction règle les plafonds du mois directement dans le tableau ; un mois sans plafonds propres reprend ceux du dernier mois réglé (**Revenir aux plafonds précédents** efface le réglage d’un mois). Le suivi sur six mois croise services et mois.
8. **Catalogue des prix** (Direction) : les prix de référence des articles. À la saisie, le prix d’un article du catalogue se remplit seul ; au moment de décider, un prix demandé plus élevé est signalé (« +20 % »). **Reprendre les articles des demandes** propose d’un coup les articles chiffrés des demandes déjà reçues ; **Inscrire au catalogue** le fait depuis une demande.

9. **Payes** : la paye des fonctionnaires de la Préfecture, ci-dessous.

Une demande saisie avant le détail par article compte pour un seul montant : **Détailler les articles** la rouvre avec les articles repérés dans sa justification, à vérifier et chiffrer. Les demandes et les plafonds rattachés à des semaines passent au mois de leur semaine : `supabase/v17_budget_mensuel.sql` les range dans la base (semaines 41 et 42 → octobre 2026 ; plafonds par semaine × 4,33) ; le site fait déjà la même conversion avant ce script.

## Payes de la Préfecture et pointeuse

**Services publics → Payes**. La Préfecture paie elle-même ses fonctionnaires, à l’heure de service.

- **Fonctionnaires** : chaque agent a une fiche avec son grade et, s’il pointe, son compte Discord. **Ajouter un fonctionnaire** peut lui donner en même temps l’accès « Pointeuse ». Un agent qui part est **retiré des effectifs** : ses payes passées restent.
- **Pointeuse** (Tableau de bord → Pointeuse, pour tous les rôles) : **Prendre mon service** en arrivant, **Finir mon service** en partant. L’heure est celle du serveur. Un service de plus de 12 h est signalé « à vérifier ». La Direction corrige, clôt, ajoute ou annule un pointage depuis la fiche de l’agent, avec un motif gardé au dossier.
- **Paye de la semaine** : heures pointées × taux horaire du grade, au plus 20 h payées et 100 000 € par semaine (barème de 3 000 €/h pour un agent de sécurité à 5 000 €/h pour le préfet). Pour un agent sans pointeuse, ou pour corriger, la Direction tape les heures retenues dans le tableau (12 h 30, 12:30 ou 12,5).
- **Budget lissé** : 3,5 M par mois pour les payes, comptés dans l’enveloppe de la Préfecture. Chaque semaine a droit à ce qui reste du mois, divisé par les semaines qui restent (en cas d’urgence, la Direction peut lui donner plus). Si les payes dues dépassent ce budget, **toutes baissent du même pourcentage** (prorata) et ce qui manque à chacun devient un **rappel**.
- **Rappels de salaire** : ceux nés d’un prorata, et ceux saisis à la main (**Ajouter un rappel**) pour des heures non payées d’une semaine passée, calculés à l’heure dans la limite de 20 h et 100 000 € pour cette semaine-là. Ils sont proposés sur la paye suivante et versés avec ce qui reste du budget après les payes de la semaine. Un rappel payé hors d’une paye (virement direct) se note **Versé à part** sur sa fiche : la somme compte dans le budget des payes du mois du versement et sort du Trésor, et le rappel n’est plus proposé. **Annuler** sert seulement à un rappel qui n’est plus dû.
- **Trop-perçus** : une somme versée en trop à un agent pour une semaine payée (**Ajouter un trop-perçu**). Elle est **retenue toute seule sur ses payes suivantes** (sur ce qu’il touche chaque semaine, le reste attend), ou il la rembourse directement (**Noter un remboursement** : la somme revient au budget du mois concerné et au Trésor).
- **Régulariser la semaine** (sur une paye versée) : ramène la paye de chaque agent à une même base d’heures (10 h par exemple), au taux de son grade. Ce qu’il a touché en plus devient un trop-perçu, ce qui lui manque un rappel ; relancer ne compte rien deux fois.
- **Verser la paye** : fige la semaine, l’impute sur l’enveloppe de la Préfecture du mois de la semaine et la sort du Trésor. L’**état de paye** et le **bulletin** de chaque agent se publient en image. **Annuler le versement** remet la semaine en préparation (impossible si ses rappels ont déjà été versés plus tard).
- **Barème et budget** : grades et taux horaires, budget des payes par mois, heures et paye maximum par semaine, enveloppe imputée.
- **Salaires déjà versés par une demande** « budget salaires » de la Préfecture : le bandeau **Reprendre dans les payes** rattache chaque salaire à son agent et à sa semaine. La demande reste au dossier mais ne compte plus sur l’enveloppe ni dans le Trésor : la paye compte à sa place, une seule fois.

**Prévision** : sous la paye de la semaine, la carte « Prévision » montre ce que coûterait une semaine si chaque agent actif faisait son plafond d’heures, le budget de la semaine, le rythme de la semaine en cours (ce qui est dû à ce jour, prolongé jusqu’à dimanche sans dépasser le plafond de chacun) et le mois entier au maximum. Elle prévient quand un prorata devient probable au rythme actuel, ou possible si tous faisaient le maximum ; le détail par grade se déplie.

La pointeuse demande `supabase/v18_payes_pointeuse.sql` ; sans ce script, les payes fonctionnent avec des heures saisies à la main. Sur la pointeuse, chacun voit **sa paye de la semaine** (heures pointées × taux de son grade, dans la limite de 20 h et 100 000 €), qui monte à la seconde pendant le service, avec la durée du service en heures, minutes et secondes. C’est un montant brut indicatif : la paye versée tient compte aussi du budget de la semaine et des retenues. Pour les agents qui n’ont que l’accès « Pointeuse », il faut `supabase/v19_pointeuse_paye.sql`.

## Contrats d’achat

Trésor → **Contrats et partenariats**, ou la fiche de l’entreprise fournisseur. La Préfecture achète auprès des entreprises du serveur, pour elle-même ou pour un service public : véhicules à la concession, armes à l’armurerie, équipement, dépannages, transport de fonds.

1. **Commande** : des lignes (désignation, quantité, prix). Pour un service, elle est imputée sur son enveloppe du mois choisi dès la signature, ou financée par une demande de moyens déjà accordée (sans compter deux fois). Puis **Constater la livraison** et **Payer** : le Trésor verse la somme et un **ordre de paiement** part sur Discord. Une livraison non conforme peut être refusée tant que rien n’est payé : le contrat est résilié et l’enveloppe libérée.
2. **Marché à prix unitaire** : un prix par prestation (intervention, collecte…), une durée et, si besoin, un plafond. Chaque paiement est imputé sur l’enveloppe du service le mois où il est fait ; un dépassement demande une confirmation.
3. **Transport de fonds** : **Marché de transport de fonds** prépare le marché avec Trans’Fond, payé par collecte. Les collectes encaissées depuis le début du marché, et les convois des amendes reçus au Trésor, apparaissent d’eux-mêmes ; **Payer les collectes** les règle en une fois. Une collecte payée ne l’est jamais une deuxième fois, même sur un autre marché ; celles qui dépasseraient le plafond restent signalées. Une case permet de payer aussi les passages où l’entreprise était absente.

4. **Payer par déduction sur ses impôts** : quand le Trésor n’a pas les fonds (ou par choix), la Direction choisit au moment de payer « Déduction sur ses impôts et cotisations » au lieu de « Versement du Trésor ». Rien ne sort du Trésor : la somme est due à l’entreprise et se retire toute seule de ce qu’elle doit sur ses prochaines déclarations, impôt et cotisations compris (pas la majoration de retard), sans plafond, jusqu’à épuisement. L’avis indique « Réglé par compensation » et le reste à payer ; un avis entièrement couvert est réglé d’emblée. L’ordre de paiement porte la mention « À déduire ». La fiche de l’entreprise et le solde du Trésor (tableau de bord) montrent ce qui reste dû. Possible pour tous les contrats et marchés, Trans’Fond compris, sauf ceux financés par une demande de moyens déjà accordée. Une déclaration rejetée rend sa part ; une rectificative recalcule la sienne.

Les sommes versées sont déduites du solde du Trésor et comptées dans le suivi des enveloppes ; une somme payée par déduction compte dans l’enveloppe du service, pas dans le solde. Si une entreprise déclare un chiffre d’affaires inférieur à ce que la Préfecture lui a payé sur la période, une alerte le signale. Discord : cochez « Contrats » dans la publication automatique.

L’Inspection prépare et modifie des projets, et peut les abandonner ; signer, constater une livraison, payer, résilier, clore un marché et supprimer sont réservés à la Direction. La base l’impose elle-même (`supabase/v12_contrats.sql`, complété par `supabase/v16_contrats_suppression.sql`) : un contrat signé ne se modifie plus, un paiement enregistré n’est jamais réécrit ni effacé, deux paiements simultanés ne s’écrasent pas, et l’état d’un contrat n’avance que dans un sens. Pour changer un contrat signé, résiliez-le et faites-en un nouveau.

**Supprimer** : un contrat ou un marché fait par erreur, ou clos trop tôt, se supprime depuis sa fenêtre (Direction), quel que soit son état, tant qu’aucun paiement n’y est inscrit. L’enveloppe du service ou les crédits de la demande sont libérés ; la suppression reste au journal ; le message Discord déjà publié s’efface à la main. Un contrat qui a reçu un paiement ne se supprime pas : son paiement est entré dans les comptes.

## Conventions de partenariat

Trésor → **Contrats et partenariats**, partie **Conventions de partenariat**, ou la fiche de l’entreprise. Une entreprise (dépanneur, garage, restaurant…) s’engage à servir les services publics gratuitement ou à prix réduit pendant une durée ; en échange, la convention fixe un montant déduit de son impôt chaque semaine. Rien n’est à noter au fil des prestations.

1. **La convention** : l’entreprise, la personne qui signe pour elle, les services publics bénéficiaires (tous ou certains), les avantages consentis (gratuit, remise en %, prix fixe), le début, la fin, des conditions libres et la **réduction d’impôt par semaine** (vide : aucune). L’Inspection prépare le projet, la Direction le signe : la convention part sur Discord. À son terme, **Renouveler** prépare la suivante avec la même réduction.
2. **La réduction d’impôt** : chaque semaine où la convention est en vigueur (depuis sa signature, jusqu’à sa fin ou sa résiliation), le montant fixé est déduit tout seul de l’impôt de l’entreprise. Il porte sur l’impôt seulement, jamais sur les cotisations ni sur une imposition d’office, et au plus le plafond par semaine (20 000 € par défaut). Si l’impôt de la semaine est plus faible que la réduction, la part non utilisée est reportée sur les semaines suivantes ; si la réduction ne couvre pas tout l’impôt, le reste se paie normalement. La réduction figure sur l’aperçu du calcul, l’avis et Discord. Réglages → Avantages fiscaux : plafond par semaine, ou désactiver la réduction.
3. **Anciennes conventions à prestations** : celles signées avant la réduction fixe gardent leurs prestations notées et leur réduction au taux figé à la signature ; leur registre reste consultable dans la convention.
4. **Supprimer une convention** (Direction) : une convention faite par erreur ou pour un essai se supprime depuis sa fiche, même signée ou résiliée. Elle disparaît du registre et ne compte plus pour la réduction d’impôt ; la suppression reste au journal. Les déclarations pas encore validées de l’entreprise sont recalculées sans elle ; les avis déjà émis gardent leur montant (modifiez la déclaration pour retirer la réduction). Une convention qui a des prestations validées ne se supprime pas : annulez-les, ou résiliez la convention. Il faut avoir exécuté `supabase/v23_conventions_suppression.sql`.

Discord : cochez « Conventions de partenariat signées » dans la publication automatique. La base protège les conventions (`supabase/v13_conventions.sql`, complété par `supabase/v15_conventions_forfait.sql`) : une convention signée ne se modifie plus, montant de la réduction compris, et ne se supprime que par la Direction et sans prestation validée (`supabase/v23_conventions_suppression.sql`) ; les états n’avancent que dans un sens.

## Amendes versées au Trésor

Trésor → **Amendes**. Chaque semaine, la police, la gendarmerie et les autres services qui encaissent des amendes en remettent le produit au Trésor par un convoi du transporteur de fonds (Trans’Fond).

1. **À l’arrivée du convoi**, **Nouveau versement** : le service, la semaine des amendes, la somme annoncée, le nombre d’amendes, le n° de bordereau, l’heure d’arrivée, le transporteur, le convoyeur, l’agent qui a remis les fonds et un lien de capture. Un deuxième versement du même service pour la même semaine demande une confirmation.
2. **La Direction compte** : **Confirmer la réception** avec la somme comptée. Un écart avec la somme annoncée doit être expliqué ; il reste visible sur le reçu et dans le tableau (« Écarts »). La somme entre alors au Trésor et le reçu part sur Discord, dans le salon des services publics. Noté par la Direction, un versement est reçu aussitôt. **Refuser** si rien n’est arrivé.
3. **Semaine par semaine** : le tableau montre ce que chaque service a versé pour les six dernières semaines ; un tiret signale qu’un service n’a rien remis.
4. **Le convoi est payé** au transporteur comme une collecte : il apparaît dans **Payer les collectes** de son marché de transport de fonds, au même prix, une seule fois. Une fois payé, la réception ne s’annule plus.

L’Inspection note et peut retirer un versement tant qu’il n’est pas confirmé ; confirmer, refuser et annuler sont réservés à la Direction. La base l’impose (`supabase/v14_amendes.sql`) : un versement traité garde ses montants, un versement reçu ne se supprime pas. Discord : cochez « Amendes reçues au Trésor » dans la publication automatique.

## Cohérence des dossiers

- **Attestation de régularité** : une somme encore dans son délai de paiement ne l’empêche pas (comme dans la réalité), mais elle y figure comme « pas encore payée », avec sa date limite.
- **Entreprise retirée du registre** : ses rappels, relances et mises en demeure peuvent être supprimés avec elle. Dans Recouvrement → Relances envoyées, la Direction supprime une relance (deux clics) ou toutes celles d’entreprises retirées.

Chaque statut suit la vie du dossier, partout (tableau de bord, Entreprises, Recouvrement, fiche, recherche, attestation, PDF de justice) :

- **Semaine clôturée sans déclaration** : plus de relance ni de mise en demeure, puisque rien ne peut plus y être déposé. Elle apparaît « clôturée » dans les déclarations manquantes, bloque l’attestation, et la Direction choisit : **Sanctionner le défaut** (une imposition estimée sur les dernières déclarations, majorée comme une taxation d’office, inscrite en pénalité) ou rouvrir la semaine pour taxer d’office.
- **Alertes de fraude possible** : elles disparaissent quand un contrôle porte sur la déclaration, quelle que soit son issue, ou quand la Direction les **classe** avec un motif. Payer ce qu’on a déclaré ne suffit pas : la question est de savoir si la déclaration est sincère. Si une correction fait apparaître d’autres alertes, elles reviennent.
- **Contrôle mis en recouvrement** : il devient **Soldé** quand le redressement est payé, **Dégrevé** s’il est annulé.
- **Relances et mises en demeure** : « Régularisée » dès que la déclaration est déposée ou la somme payée. Une saisie ne s’appuie que sur une mise en demeure qui portait sur les mêmes sommes.
- **Saisies et justice** : une somme sous saisie n’est ni relancée ni saisie une seconde fois. Si tout est payé autrement, la saisie affiche « Sommes réglées · à lever » et le dossier de justice « Dette réglée ? ».
- **Déclaration rectificative** : elle remplace la précédente de la même semaine, qui est rejetée ; ce qui avait été payé est repris en avoir (et un trop-perçu est signalé). Après une taxation d’office, la majoration d’office demeure. Si la déclaration d’origine était déjà payée et que la rectificative vient de l’Inspection, la Direction valide le remplacement depuis le dossier (**Remplacer DF-…**). Rejeter la rectificative rétablit l’originale.
- **Paiement en plusieurs fois** : seules les échéances passées sont exigibles (relance, majoration, saisie) ; encaisser le solde marque les échéances restantes comme payées.
- **Fin d’un contrôle** : chaque avis suspendu retrouve exactement son état d’avant ; une déclaration qui n’avait pas encore d’avis reçoit le sien, publié normalement.
- **Pénalités** : une seule pénalité de retard par déclaration, aucune en taxation d’office (sa majoration la remplace) ; les majorations d’un avis rejeté ou remis à valider sont annulées.

Les **Réglages** sont rangés en rubriques (Calendrier et taux, Barèmes, Exonération, Recouvrement, Entreprises, Services publics, Discord, Accès, Sauvegardes et export) ; la dernière ouverte est retenue. La recherche rapide trouve aussi une rubrique (« webhook », « enveloppe »…).

## Clôturer une semaine

Une fois le délai de dépôt passé, **Tableau de bord → Clôturer la semaine** (ou **Recouvrement → Clôture des semaines**) affiche le bilan de la période puis la verrouille. Une semaine clôturée ne reçoit plus de déclaration, ses déclarations ne peuvent plus être modifiées ni supprimées, et le montant de ses avis est figé. Les encaissements, échéanciers, pénalités et relances restent possibles. Le verrou est posé par la base : il tient même si quelqu’un contourne le site. La Direction peut rouvrir la semaine à tout moment ; le bilan au jour de la clôture reste disponible en image.

## Travailler à plusieurs, en direct

Plus besoin de recharger la page : ce que fait un autre agent apparaît tout seul, dans les listes, le tableau de bord et la fenêtre que vous avez ouverte.

- **Fenêtre ouverte** (fiche, déclaration, demande, contrôle, saisie, dossier de justice, bilan de semaine) : elle se met à jour sur place, sans perdre votre position, et indique qui vient de la changer. Si vous étiez en train d’écrire dedans, rien n’est effacé : un bandeau prévient, et **Afficher sa version** recharge la fenêtre quand vous êtes prêt.
- **Deux agents sur le même dossier** : un enregistrement qui écraserait le travail de l’autre est arrêté. Le bandeau propose de voir sa version ou d’**Enregistrer quand même**. Les notes, pièces et suites s’ajoutent à celles de l’autre au lieu de les remplacer.
- **Qui est en ligne** : le bouton en haut de page (« 2 autres en ligne ») liste les agents connectés et ce qu’ils consultent ; une fenêtre affiche « Léa consulte aussi ce dossier ». Le **Journal** se remplit en direct.
- **Pied de page** : « En direct » quand tout va bien. Si le direct décroche (veille, réseau), le site relit le registre toutes les 15 secondes jusqu’à son retour, puis rattrape ce qui a été manqué.

La présence, le journal en direct et le remplacement d’une déclaration par une rectificative saisie par l’Inspection demandent d’avoir exécuté `supabase/v6_direct.sql`. Sans lui, le reste marche déjà.

## Recherche rapide

**Rechercher** en haut de page, ou **Ctrl + K** (⌘ + K sur Mac), ou la touche **/** : un seul champ pour retrouver une entreprise (par son nom, son secteur, son patron ou l’identifiant Discord du patron), une semaine, ou n’importe quel dossier par son numéro : déclaration `DF-`, quittance `QT-`, pénalité `PN-`, redressement `AMR-`, contrôle `CF-`, attestation `AT-`, relance `RL-`, mise en demeure `MED-`, saisie `SA-`, dossier de justice `TJ-`, demande `DM-`. Les six derniers caractères du numéro suffisent, les accents et majuscules ne comptent pas. **Entrée** ouvre le premier résultat, les flèches parcourent la liste, **Échap** ferme.

## Notifications sur téléphone et ordinateur

Chaque agent choisit ce qu’il reçoit, appareil par appareil, avec la **cloche** du bandeau : déclaration déposée, paiement encaissé par un autre agent, demande de moyens, demande de prêt, contrôle fiscal (réponse, proposition, mise en recouvrement), véhicules de société (contrôle de police défavorable, véhicule non déclaré ou requalifié), convocations (absence à sanctionner, collecte à encaisser), contrats et partenariats (projet de contrat ou de convention à signer), amendes versées (versement à confirmer), délais (mises en demeure, réponses aux contrôles, avis devenus exigibles, échéances de prêt, rendez-vous de l’heure à venir, conventions arrivées à terme, vérifiés chaque heure). On ne reçoit jamais la notification de sa propre action. Un clic sur la notification ouvre le dossier. **Envoyer un essai** vérifie que tout fonctionne.

Sur iPhone et iPad (iOS 16.4 ou plus récent), installez d’abord le guichet sur l’écran d’accueil (Safari → Partager → « Sur l’écran d’accueil ») et ouvrez-le depuis son icône : Apple ne permet les notifications qu’aux applications installées. Sur Android et sur ordinateur, Chrome, Edge, Firefox et Safari les reçoivent directement.

Mise en place, une seule fois :

1. Dans Supabase, **SQL Editor** : exécutez `supabase/v10_notifications.sql`. Il crée la table des abonnements, prévient le service d’envoi quand le registre change et programme le passage horaire des délais. `supabase/v11_convocations.sql` y ajoute les convocations, `supabase/v12_contrats.sql` les contrats, `supabase/v13_conventions.sql` les conventions, `supabase/v14_amendes.sql` les amendes.
2. Dans Supabase, **Edge Functions → Deploy a new function → Via Editor** : nommez-la `notifier`, collez `supabase/functions/notifier/index.ts` puis ajoutez le fichier `regles.ts` du même dossier, et déployez. Dans les réglages de la fonction, désactivez **Verify JWT** (la base s’authentifie avec sa propre clé). Après une mise à jour de ces deux fichiers (comme celles des convocations et des contrats), ouvrez la fonction `notifier` → **Code**, remplacez leur contenu et redéployez.
3. Dans le guichet, cloche du bandeau → **Activer sur cet appareil** → **Envoyer un essai**.

Aucune clé n’est à copier : la clé qui protège le service et les clés d’envoi sont créées toutes seules et restent dans une table que seuls la base et le service lisent.

## Apparence et mode sombre

Le bouton rond du bandeau, à côté de votre rôle, change le thème : **comme l’appareil** (clair le jour, sombre si le téléphone ou l’ordinateur est réglé en sombre), **clair** ou **sombre**. Le choix est gardé sur cet appareil. Sur téléphone, les fenêtres s’ouvrent comme des volets depuis le bas de l’écran, et la barre d’onglets se fait défiler du doigt (un fondu indique qu’il reste des onglets).

## Installer comme une application

Le guichet s’installe sur un ordinateur ou un téléphone et s’ouvre alors dans sa propre fenêtre, avec son icône, sans barre d’adresse.

- **Chrome ou Edge (ordinateur, Android)** : bouton **Installer l’appli** en haut de page, ou l’icône d’installation dans la barre d’adresse.
- **iPhone et iPad** : dans Safari, **Partager → Sur l’écran d’accueil**. Le bouton **Installer l’appli** rappelle la marche à suivre. L’application garde sa propre session : il faut s’y connecter une première fois avec Discord.

L’application se met à jour toute seule : la page vient toujours du réseau d’abord. Si elle reste ouverte longtemps, un bandeau signale qu’une nouvelle version est en ligne, avec un bouton **Recharger**. Un autre bandeau prévient quand internet est coupé ; le registre se remet à jour dès le retour du réseau. Les données du registre, les pièces des contrôles et les adresses Discord ne sont jamais gardées par l’application : seuls la page et ses fichiers (icônes, polices) le sont.

## Restaurer depuis le journal

Dans le **Journal**, chaque action encore réversible porte un bouton : **Restaurer** remet le dossier tel qu’il était avant une modification ou une suppression, **Annuler** retire un dossier ajouté par erreur. Le site montre ce qui va changer avant de confirmer, et propose de restaurer en même temps les dossiers supprimés avec lui (l’avis d’une déclaration supprimée, par exemple). La restauration est elle-même inscrite au journal. Réservé à la Direction.

## Continuité et sauvegardes

- Cliquez **Sauvegarder** chaque semaine et déposez le fichier dans un salon réservé au staff. Le fichier contient tout le registre, payes, rappels, fonctionnaires et pointages compris.
- Toutes les données restent consultables dans Supabase, **Table Editor → registre** : une ligne par dossier, contenu dans la colonne `data`.
- Avec l’offre gratuite de Supabase, un projet sans activité pendant une semaine est mis en pause. Il se relance depuis le tableau de bord Supabase (**Restore project**).

## Adresse personnalisée (facultatif)

Pour utiliser par exemple `impots.grandparisrp.fr` :

Il faut un nom de domaine : celui du serveur s’il en a un (un administrateur ajoute l’enregistrement ci-dessous), ou un domaine acheté (quelques euros par an chez OVH, Gandi, Cloudflare…).

1. Chez le gestionnaire du domaine, créez un enregistrement **CNAME** `impots` qui pointe vers `guichet-fiscal.github.io`.
2. Sur GitHub, ouvrez **Settings → Pages → Custom domain**, saisissez `impots.grandparisrp.fr` et enregistrez. Attendez la coche verte (quelques minutes à quelques heures), puis cochez **Enforce HTTPS**.
3. Dans Supabase, **Authentication → URL Configuration** : remplacez l’ancienne adresse par la nouvelle dans **Site URL** et ajoutez-la dans **Redirect URLs**. Rien à changer dans l’application Discord : son adresse de retour reste celle de Supabase.

L’ancienne adresse redirige vers la nouvelle. Ceux qui ont installé le guichet comme une application la réinstallent depuis la nouvelle adresse.

## Modifier le site

Toute modification passe par ce dépôt. GitHub garde l’historique de chaque changement, et on peut revenir à une version précédente à tout moment.
