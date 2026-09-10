# App sport — Bloc 2, séances guidées

PWA statique de prépa physique tennis : séances guidées, timers, suivi des charges.

- 100 % local : les charges sont stockées dans le navigateur du téléphone (aucune donnée envoyée).
- Fonctionne hors ligne (service worker) et s'installe sur l'écran d'accueil.

## Fichiers

| Fichier | Rôle |
| --- | --- |
| `index.html` | l'app complète |
| `manifest.json` | fiche d'installation (nom, icône, plein écran) |
| `sw.js` | mode hors ligne |
| `icon-192.png` / `icon-512.png` | icônes |
| `README.txt` | guide d'installation détaillé (téléphone) |

## Mise en ligne

Settings → Pages → Source : « Deploy from a branch » → Branch : `main`, `/(root)`.
L'app est ensuite accessible sur `https://<pseudo>.github.io/<repo>/`.
