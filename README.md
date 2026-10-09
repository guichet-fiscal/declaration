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
5 bis. Faites de même avec `supabase/v3_discord.sql` (table privée des salons Discord), puis avec `supabase/v4_inspection_cloture.sql` (rôle Inspection et clôture des semaines), `supabase/v5_pieces.sql` (captures des contrôles) `supabase/v6_direct.sql` (journal en direct et présence des agents), `supabase/v7_blanchiment.sql` (relevés de compte), `supabase/v8_prets.sql` (demandes de prêt) et `supabase/v9_vehicules.sql` (véhicules de société). Toujours dans cet ordre.
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

- **Tableau de bord** : montants déclarés, encaissés et restant dus, entreprises à surveiller, alertes de fraude possible, enveloppes des services publics et Trésor.
- **Entreprises** : recherche et filtres (en retard, doivent de l’argent, alertes, en contrôle). Chaque nom ouvre une fiche avec l’historique, le total payé, les retards, les alertes et les pénalités.
- **Économie** : chiffre d’affaires du serveur, emplois, masse salariale, recettes, secteurs et plus grosses entreprises, avec des graphiques sur 12 périodes au plus, depuis le début du suivi.
- **Avis en image** : chaque avis d’imposition, décision budgétaire et pénalité peut être copié en image pour être collé sur Discord.
- **Pénalités et paiement en plusieurs fois** : depuis la fiche d’une entreprise ou le dossier d’une déclaration.
- **Recouvrement** : les entreprises qui n’ont pas déclaré, et les avis et pénalités non payés après le délai de paiement. La procédure suit celle du droit réel : relance, mise en demeure, puis taxation d’office, saisie ou transmission à la justice (voir plus bas). Chaque acte reste inscrit au dossier.
- **Publication sur Discord** : les avis, pénalités, décisions budgétaires et relances partent dans le bon salon, avec une mention du patron ou du service.
- **Exonération des entreprises nouvelles** (Réglages) : pendant ses premières périodes (4 semaines par défaut), une entreprise qui ouvre paie moins d’impôt (−100 % par défaut) et de cotisations (−50 % par défaut), éventuellement de façon dégressive. Une entreprise est nouvelle si son début d’activité est postérieur au début du suivi ; la Direction peut aussi accorder ou refuser l’exonération au cas par cas. La réduction est calculée au dépôt, apparaît sur l’avis et sur la fiche, et son coût figure dans l’onglet Économie.
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
5. Pour mentionner un service : **Réglages → Services publics**, colonne « Rôle Discord à mentionner », au format `<@&ID du rôle>` (clic droit sur le rôle → Copier l’identifiant).

Le guichet ne mentionne jamais `@everyone` ni `@here` : seuls le patron ou le rôle du service concerné sont notifiés. Les adresses des webhooks ne sont lisibles que par la Direction : elles n’apparaissent ni dans le journal, ni dans les sauvegardes, ni dans Google Sheets. Si une adresse fuite, supprimez le webhook dans Discord et collez-en un nouveau.

Une entreprise est attendue à partir du début du suivi, ou de son **début d’activité** s’il est plus récent (Modifier l’entreprise). Une entreprise ajoutée au registre est attendue à partir de la période en cours : elle n’est jamais relancée pour une semaine où elle n’existait pas.

## Suivi dans Google Sheets

La feuille contient aussi les relances et mises en demeure, les attestations, les semaines clôturées, les contrôles, les saisies, les dossiers transmis à la justice, les relevés de compte, les déclarations de soupçon, les prêts et leurs remboursements, les véhicules de société et les contrôles de police. Après une mise à jour de `google-sheets/export.gs`, recollez-le dans Apps Script.

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

Le rôle Inspection demande d’avoir exécuté `supabase/v4_inspection_cloture.sql`.

Les joueurs n’ont pas besoin d’accès : ils déclarent sur Discord.

Si plus personne n’a le rôle Direction, un propriétaire du projet Supabase peut le redonner dans **Table Editor → agents → Insert row**.

## Contrôle fiscal

Depuis un dossier, une alerte, la fiche d’une entreprise ou **Recouvrement → Contrôles fiscaux**, le contrôle suit les étapes de la procédure réelle :

1. **Ouverture** : périodes vérifiées, origine (alerte, signalement, contrôle aléatoire), inspecteur. Les avis non payés de ces périodes sont suspendus. L’**avis de vérification** peut partir sur Discord.
2. **Instruction** : constats, notes datées, **pièces**. Les captures d’écran sont réduites et compressées (environ 200 Ko) puis rangées dans un espace privé de Supabase (1 Go gratuit, soit environ 5 000 captures ; l’espace utilisé est affiché). Un lien peut remplacer une capture : prenez le lien du message Discord, pas celui de l’image, qui expire.
3. **Rectifications** : chiffre d’affaires, charges, salaires et salariés retenus par période ; le rappel est recalculé au barème en vigueur. Qualification : bonne foi (0 %), manquement délibéré (40 %), manœuvres frauduleuses (80 %), opposition au contrôle (100 %).
4. **Proposition de rectification** : notifiée avec un délai de réponse (2 jours par défaut, réglable). L’entreprise accepte ou conteste ; sans réponse, elle est réputée accepter.
5. **Mise en recouvrement** (Direction) : l’**avis de mise en recouvrement** crée la somme à payer, suivie comme une pénalité (relances, quittance). Les avis suspendus redeviennent payables. Ou bien **classement sans suite**.

L’Inspection mène le contrôle jusqu’à la proposition ; seule la Direction met en recouvrement et retire une pièce.

## Recouvrement forcé et justice

Le guichet reprend, en plus court, la procédure des impôts et de l’URSSAF. Les délais et taux se règlent dans **Réglages → Recouvrement**.

**Une entreprise qui ne déclare pas**

1. **Rappel de déclaration** (amiable).
2. **Mise en demeure de déclarer** : un délai (2 jours par défaut) pour déposer. Dans la réalité, c’est l’article 1728 du CGI : sans dépôt dans les 30 jours suivant la mise en demeure, la majoration passe de 10 % à 40 %.
3. **Taxation d’office** : une fois le délai écoulé, le bouton ouvre le formulaire de déclaration en mode « taxation d’office ». La Direction saisit les éléments dont elle dispose ; l’avis est émis aussitôt avec la majoration d’office (40 % par défaut). C’est l’article L66 du LPF. Sur une semaine clôturée, il faut d’abord la rouvrir.

**Une entreprise qui ne paie pas**

1. **Relance de paiement** (amiable). Une somme devient exigible à la fin du délai de paiement (2 jours après l’avis par défaut, Réglages → Calendrier et taux). Avant, elle apparaît dans Recouvrement → Impayés, rubrique « Dans le délai de paiement », avec sa date : un **rappel** est déjà possible, la mise en demeure attend l’échéance. Annuler un encaissement ne repousse pas cette date.
2. **Mise en demeure de payer** : un délai (2 jours par défaut). Elle vaut commandement de payer (art. L257-0 A et L258 A du LPF).
3. **Majoration de 10 %** (Direction) sur chaque avis payé en retard, une seule fois, comme l’article 1730 du CGI.
4. **Saisie** (Direction) : **à tiers détenteur** (la banque, l’employeur ou un client verse à la Direction ce qu’il doit à l’entreprise, sans passer par un juge : art. L262 du LPF) ou **saisie-vente** des biens (véhicules, stocks). L’acte part sur Discord. **Saisie exécutée** encaisse les sommes visées et publie les quittances ; **Mainlevée** l’arrête. Le site demande une mise en demeure expirée, sauf si vous cochez « Saisir quand même ». Pendant une saisie, l’attestation de régularité est refusée.
5. **Transmission à la justice** (Direction) : depuis Recouvrement ou la fiche. Choisissez les qualifications (défaut de paiement, fraude fiscale, travail dissimulé, opposition au contrôle, organisation d’insolvabilité) et les mesures demandées (saisie des comptes, saisie des biens, fermeture, poursuites, interdiction de gérer). L’exposé des faits est rédigé tout seul et se corrige. Le site produit un **PDF complet** : identité, créances avec leur date d’exigibilité, chronologie de la procédure (avis, relances, mises en demeure, saisies), contrôles fiscaux avec leurs rectifications, historique des déclarations, mesures, signature, rappel des textes et, en annexe, les captures des contrôles. Le PDF part dans le salon de la justice avec la mention du rôle choisi, et se télécharge. Le dossier suit ensuite ses **suites** : saisie effectuée, condamnation, dette réglée, classement.

Quand les droits rappelés par un contrôle dépassent 100 000 € avec une majoration de 80 % ou 100 %, le site signale la **dénonciation obligatoire** au procureur (art. L228 du LPF), comme dans la réalité.

Relances et mises en demeure partent de l’onglet Recouvrement ou, en haut de la fiche de l’entreprise, de la rubrique « Relances et mises en demeure ». La fenêtre « Transmettre à la justice » ne les envoie pas : elle vérifie seulement qu’elles ont été faites. L’Inspection envoie relances et mises en demeure, et peut taxer d’office ; la majoration, la saisie et la transmission à la justice sont réservées à la Direction. Rien de nouveau à exécuter dans Supabase pour cette partie.

## Surveillance des comptes (blanchiment)

Sur le serveur, chaque employé peut déposer chaque jour jusqu’à 10 000 € d’argent sale sur le compte de l’entreprise. On ne voit pas les mouvements du compte, seulement son solde : le guichet rapproche donc le solde de ce que les déclarations expliquent.

1. **Le solde du compte** : chaque déclaration porte le solde du compte en fin de période, avec une capture (fichier ou lien). Le modèle Discord a deux lignes de plus : « Solde du compte de l’entreprise » et « Capture du compte ». Réglage possible : exiger le solde dans chaque déclaration (sinon, alerte).
2. **Le relevé de compte** : un agent prend le job, regarde le compte et enregistre le solde, l’heure et une capture (Recouvrement → Surveillance des comptes, ou la fiche). **Le relevé fait foi** face au solde déclaré. Un relevé compte pour la période dont la fin est la plus proche, entre la veille de la fin et le lendemain du délai de dépôt. Si le solde déclaré diffère du relevé fait dans les 24 heures, une alerte le signale. La Direction peut retirer un relevé erroné.
3. **Le rapprochement** : solde attendu = solde précédent + chiffre d’affaires − charges − salaires − impôts et pénalités payés entre les deux observations. Au-delà de l’écart fixé (10 000 € par défaut), le guichet signale un **enrichissement inexpliqué**, et précise quand l’écart ressemble à des dépôts de 10 000 € ou approche ce que les employés peuvent déposer dans la période. Il signale aussi les sorties d’argent inexpliquées, un chiffre d’affaires par salarié plus de 3 fois supérieur à la médiane du secteur, et un chiffre d’affaires multiplié d’un coup. Ces signaux rejoignent les alertes habituelles (tableau de bord, fiche, dossier).
4. **Demander des justifications** : ouvre un contrôle fiscal prérempli (origine « Surveillance des comptes »). L’écart est retenu en recettes non déclarées, avec la majoration des manœuvres frauduleuses (80 %), et la **demande de justifications** part sur Discord avec un délai de réponse. Dans la réalité : demande de justifications puis taxation d’office des sommes d’origine indéterminée (art. L16 et L69 du LPF). Après la mise en recouvrement, les montants retenus par le contrôle expliquent l’écart.
5. **Déclaration de soupçon** (Direction) : sur le modèle de TRACFIN (art. L561-15 du Code monétaire et financier), elle part dans le salon de la justice avec la mention du rôle choisi. Le dossier de justice propose alors la qualification **blanchiment** (art. 324-1 du Code pénal : 5 ans et 375 000 € ; 10 ans et 750 000 € s’il est habituel ou en bande organisée, art. 324-2) et la mesure de confiscation, et son PDF ajoute la section « Compte de l’entreprise ».

Un écart classé par la Direction, ou qu’un contrôle a jugé justifié, ne revient plus. Les captures vont dans l’espace privé des pièces (`supabase/v5_pieces.sql`). Réglages → Recouvrement → Surveillance des comptes : activer, écart à partir duquel alerter, dépôt possible par employé et par jour, solde obligatoire.

## Prêts aux entreprises

La Préfecture peut prêter l’argent du Trésor à une entreprise pour un objet précis : un véhicule, un local, du stock, de la trésorerie. Onglet **Prêts**, ou la fiche de l’entreprise.

1. **La demande** : un agent (Inspection ou Direction) indique l’entreprise, l’objet, le montant, le taux et le remboursement. La simulation affiche aussitôt les intérêts, le total et les dates.
2. **L’accord** (Direction) : **Accorder et verser**. Le capital sort du Trésor, qui doit pouvoir le couvrir, et la **convention de prêt** part sur Discord avec l’échéancier. **Refuser** demande un motif.
3. **Le taux** : 0 % pour un prêt sans intérêts. Sinon, un taux global sur la durée : 10 % sur 20 000 € fait 22 000 € à rembourser. Les intérêts sont répartis à égalité sur les échéances.
4. **Le remboursement** : en une fois, ou par échéances (une par semaine, ou par mois si les déclarations sont mensuelles), avec un délai avant la première. Chaque échéance encaissée remonte au Trésor et publie une quittance.
5. **L’emploi des fonds** : par défaut, l’entreprise doit fournir le **justificatif de l’achat** (capture ou lien de la facture de la concession, par exemple) dans un délai (7 jours par défaut, modifiable pour chaque prêt). Passé ce délai, le prêt affiche « Justificatif manquant ».
6. **L’exigibilité anticipée** (Direction) : si le justificatif manque, si l’argent a servi à autre chose ou si les échéances ne sont pas payées, **Exiger le remboursement** rend tout le capital restant dû immédiatement. Les intérêts à venir ne sont pas réclamés. La notification part sur Discord.
7. **Le remboursement anticipé** : l’entreprise peut tout rembourser avant l’heure. Elle paie le capital restant, sans les intérêts des échéances à venir.

Une échéance en retard suit le recouvrement habituel : impayés, relance, mise en demeure, saisie, dossier de justice. Elle bloque l’attestation de régularité. Le versement du prêt et ses remboursements entrent dans la surveillance des comptes : l’argent prêté n’est pas un enrichissement inexpliqué.

L’Inspection peut enregistrer une demande et l’annuler tant qu’elle n’est pas accordée. Accorder, refuser, encaisser et exiger le remboursement sont réservés à la Direction, et la base l’impose elle-même (`supabase/v8_prets.sql`). Si un autre agent accorde, refuse ou annule la demande pendant que vous l’examinez, votre clic est arrêté et la fenêtre affiche le nouvel état du prêt.

## Véhicules de société (abus de biens sociaux)

Les entreprises achètent leurs véhicules en concession avec l’argent de leur compte. Un véhicule payé par l’entreprise mais réservé au dirigeant est un **abus de biens sociaux** (art. L241-3 et L242-6 du Code de commerce : 5 ans d’emprisonnement et 375 000 € d’amende). Fiscalement, la dépense n’est pas une charge de l’entreprise (art. 39-1 du CGI) et l’avantage est imposé comme un revenu distribué (art. 111 c du CGI). Onglet **Véhicules**, ou la fiche de l’entreprise.

1. **La déclaration d’achat** : le patron poste le modèle « Achat d’un véhicule de société » (onglet Modèles Discord) avec la facture de la concession. L’agent colle le message dans **Enregistrer un véhicule** : plaque, modèle, catégorie, prix, concession, date, usage, conducteurs autorisés, facture. Il indique si l’achat est compté dans les charges déclarées et s’il a été financé par un prêt de la Préfecture. Le **certificat d’affectation** part dans le salon de la police.
2. **La vérification par la police** : la case **Vérifier une plaque** (ou la recherche, Ctrl+K) dit à quelle entreprise appartient le véhicule, qui peut le conduire et à quoi il sert. **Publier le registre pour la police** envoie la liste des plaques dans son salon, où la police peut chercher une plaque. Une plaque inconnue qui roule pour une entreprise est un achat non déclaré : le guichet propose de l’enregistrer.
3. **Le contrôle de police** : l’agent saisit ce que la police a constaté (date, lieu, agent, conducteur, usage conforme, usage personnel, conducteur non autorisé, capture du rapport). Le guichet signale un conducteur qui n’est pas dans la liste.
4. **Les points à examiner** : achat non déclaré par l’entreprise, sportive, voiture de prestige, hélicoptère ou bateau pour un secteur qui n’en a pas l’usage, prix supérieur à la moitié du chiffre d’affaires des quatre dernières périodes, facture absente après 3 jours, achat fait pendant un impayé, contrôle de police défavorable, plus de voitures que de salariés (une de plus est tolérée), revente au dirigeant à moins de la moitié du prix. Réglages → Entreprises → Véhicules de société : délais, seuils et secteurs autorisés à rouler en véhicule de loisir.
5. **Valider l’affectation** (Direction) : l’achat se justifie, avec un motif. La validation ne couvre que ce qu’elle a vu : si le véhicule change ensuite (catégorie, prix) ou si la police fait un nouveau constat, il repasse « À examiner ».
6. **Requalifier** (Direction) : le véhicule devient un véhicule personnel du dirigeant. Le dirigeant rembourse son prix à l’entreprise dans un délai (7 jours par défaut). La requalification part sur Discord et la police est prévenue. Si l’achat était dans les charges, un **contrôle fiscal** prérempli retire son prix des charges de la période (manquement délibéré 40 % ou manœuvres frauduleuses 80 %).
7. **Les suites** : sans remboursement dans le délai, l’attestation de régularité est refusée et le dossier de justice propose la qualification **abus de biens sociaux** et la **confiscation des véhicules**. Le PDF ajoute une section « Véhicules de l’entreprise ». **Remboursement constaté** et **Véhicule saisi** ferment le dossier.

Un prêt « achat de véhicule » est justifié par le véhicule enregistré avec ce prêt et sa facture. Dans la surveillance des comptes, un achat payé par le compte mais absent des charges explique la baisse du solde, et le remboursement du dirigeant explique la hausse. L’Inspection enregistre les véhicules, leurs factures, les contrôles de police et les ventes. Valider, requalifier, marquer saisi et retirer du registre sont réservés à la Direction, et la base l’impose elle-même (`supabase/v9_vehicules.sql`) : l’Inspection ne peut ni effacer un contrôle de police, ni revenir sur une vente. Pour publier automatiquement certificats et requalifications, cochez « Véhicules de société » dans Réglages → Discord.

## Cohérence des dossiers

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

## Installer comme une application

Le guichet s’installe sur un ordinateur ou un téléphone et s’ouvre alors dans sa propre fenêtre, avec son icône, sans barre d’adresse.

- **Chrome ou Edge (ordinateur, Android)** : bouton **Installer l’appli** en haut de page, ou l’icône d’installation dans la barre d’adresse.
- **iPhone et iPad** : dans Safari, **Partager → Sur l’écran d’accueil**. Le bouton **Installer l’appli** rappelle la marche à suivre. L’application garde sa propre session : il faut s’y connecter une première fois avec Discord.

L’application se met à jour toute seule : la page vient toujours du réseau d’abord. Si elle reste ouverte longtemps, un bandeau signale qu’une nouvelle version est en ligne, avec un bouton **Recharger**. Un autre bandeau prévient quand internet est coupé ; le registre se remet à jour dès le retour du réseau. Les données du registre, les pièces des contrôles et les adresses Discord ne sont jamais gardées par l’application : seuls la page et ses fichiers (icônes, polices) le sont.

## Restaurer depuis le journal

Dans le **Journal**, chaque action encore réversible porte un bouton : **Restaurer** remet le dossier tel qu’il était avant une modification ou une suppression, **Annuler** retire un dossier ajouté par erreur. Le site montre ce qui va changer avant de confirmer, et propose de restaurer en même temps les dossiers supprimés avec lui (l’avis d’une déclaration supprimée, par exemple). La restauration est elle-même inscrite au journal. Réservé à la Direction.

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
