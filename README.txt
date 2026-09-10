BLOC 2 — SÉANCES GUIDÉES
Installation sur ton téléphone (app locale, hors ligne, charges conservées)
=========================================================================

CE DOSSIER CONTIENT
  index.html      l'app complète
  manifest.json   fiche d'installation (nom, icône, plein écran)
  sw.js           mode hors ligne
  icon-192.png / icon-512.png   icônes
  README.txt      ce guide

ÉTAPE 1 — METTRE L'APP EN LIGNE AVEC GITHUB PAGES (une seule fois, 3 minutes)
  1. Dézippe ce dossier.
  2. Sur github.com : bouton « New repository » → nom : bloc2-app → Public → Create.
     (Public est nécessaire pour Pages en gratuit. Aucun souci : le site ne
     contient aucune donnée personnelle, tes charges restent sur ton téléphone.)
  3. Dans le dépôt : « Add file » → « Upload files » → glisse les 5 fichiers
     index.html, manifest.json, sw.js, icon-192.png, icon-512.png
     (les FICHIERS, pas le zip) → « Commit changes ».
  4. Settings → Pages → Source : « Deploy from a branch » → Branch : main, /(root) → Save.
  5. Attends 1-2 minutes, recharge la page Settings → Pages : l'adresse apparaît :
     https://TONPSEUDO.github.io/bloc2-app/
  Alternative sans GitHub : https://app.netlify.com/drop (compte gratuit obligatoire,
  sinon le site est effacé après 24 h).

ÉTAPE 2 — INSTALLER SUR LE TÉLÉPHONE
  Android (Chrome) : ouvre l'adresse → menu ⋮ → « Installer l'application »
                     (ou « Ajouter à l'écran d'accueil »)
  iPhone (Safari)  : ouvre l'adresse → bouton Partager → « Sur l'écran d'accueil »
  → L'icône « Bloc 2 » apparaît. L'app s'ouvre en plein écran, sans barre
    d'adresse, fonctionne sans réseau, et garde tes charges sur le téléphone.

ÉTAPE 3 — VÉRIFIER
  À l'ouverture, le chip sous le titre doit afficher :
  « Charges sauvegardées dans ton navigateur ✓ »

MISES À JOUR DU PROGRAMME
  Quand Claude te livre une nouvelle version de l'app :
  1. Sur GitHub, dans ton dépôt : « Add file » → « Upload files » → glisse le
     nouveau index.html (il remplace l'ancien) → « Commit changes ».
  2. L'app se met à jour à la prochaine ouverture en ligne (1-2 min après le commit).
  Tes charges sont conservées : elles vivent dans le téléphone, pas dans le fichier.

SÉCURITÉ / VIE PRIVÉE
  L'adresse est publique mais introuvable sans le lien. Le site ne contient
  aucune donnée personnelle : les charges restent uniquement sur ton téléphone.
  Tu peux les exporter à tout moment (« Copier mes charges » sur l'accueil).

EN CAS DE CHANGEMENT DE TÉLÉPHONE
  Ancien téléphone : accueil → « Copier mes charges » → envoie-toi le texte.
  Nouveau téléphone : installe l'app → colle dans « Restaurer ».
