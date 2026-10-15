# Lune – suivi de cycle menstruel

Web app installable (PWA) pour iPhone : règles, saignement, douleurs, humeurs, symptômes, prévisions et rappels.
Aucune dépendance, aucun serveur : les données restent dans le téléphone.

## Structure

```
index.html            Interface (4 onglets + fiche du jour)
css/styles.css        Styles (mode clair / sombre automatique)
js/cycle.js           Logique pure : moyennes, prévisions, fenêtre fertile, fichier .ics
js/store.js           Stockage local (localStorage)
js/app.js             Interface et interactions
sw.js                 Service worker (hors ligne)
manifest.webmanifest  Métadonnées d'installation
icons/                Icônes
tests/                Tests de la logique (node --test tests/cycle.test.mjs)
```

## Déployer sur GitHub Pages (gratuit, HTTPS)

1. Crée un dépôt sur GitHub, par exemple `lune` (public, ou privé avec GitHub Pro).
2. Envoie le contenu du dossier :
   ```bash
   cd lune
   git init && git add . && git commit -m "Lune v1"
   git branch -M main
   git remote add origin https://github.com/<ton-pseudo>/lune.git
   git push -u origin main
   ```
   (ou glisse les fichiers dans « Add file → Upload files » sur github.com)
3. Sur GitHub : **Settings → Pages → Source : Deploy from a branch → `main` / `/ (root)` → Save**.
4. Après 1 à 2 minutes, l'app est en ligne sur `https://<ton-pseudo>.github.io/lune/`.

Alternatives équivalentes : Netlify, Cloudflare Pages ou Vercel (glisser-déposer le dossier). Le HTTPS est obligatoire pour l'installation et le mode hors ligne.

## Installer sur l'iPhone

1. Ouvre l'adresse dans **Safari** (pas Chrome).
2. Bouton **Partager** → **Sur l'écran d'accueil** → **Ajouter**.
3. Lance Lune depuis son icône. Toutes tes saisies se font dans l'app installée (ses données sont séparées de celles de Safari).

## Notifications

- **Rappels Calendrier (recommandé)** : Réglages → « Ajouter les rappels au Calendrier » → « Ajouter tous ». L'iPhone t'alerte avant le début prévu et à la fin prévue, même app fermée. Refais-le après quelques cycles pour mettre à jour les prévisions (supprime d'abord les anciens événements « 🌙 » si les dates ont bougé).
- **Notifications de l'app** (iOS 16.4+, app installée) : Réglages → « Activer les notifications de l'app ». Elles s'affichent quand tu ouvres l'app à l'approche ou à la fin des règles.

## Mettre à jour l'app

Modifie les fichiers, change `VERSION` dans `sw.js` (ex. `lune-v2`), puis `git push`. L'iPhone récupère la nouvelle version à la prochaine ouverture (parfois deux ouvertures).

## Sauvegarde

Réglages → « Exporter une sauvegarde » (fichier JSON, à garder dans Fichiers / iCloud Drive). « Importer » pour restaurer, par exemple sur un nouveau téléphone.

> Les prévisions sont des estimations (moyenne des 6 derniers cycles, ovulation estimée 14 jours avant les règles suivantes). Elles ne remplacent ni un avis médical ni une contraception.
