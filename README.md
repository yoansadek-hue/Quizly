# Quizly 2.0

## Lancer
1. `npm install`
2. Copiez `.env.example` en `.env` et collez votre clé Anthropic dans `ANTHROPIC_API_KEY`
3. `npm start` puis ouvrez http://localhost:3000 (sur téléphone : l'IP de votre PC, même Wi-Fi)

La clé reste sur le serveur (`server.js`). Ne la mettez jamais dans `public/`.
Sans clé ou sans réseau, le jeu utilise la banque locale.

## Connexion Google / Apple (Firebase Auth)
1. Créez un projet sur console.firebase.google.com, ajoutez une application Web.
2. Copiez sa configuration dans `public/js/config.js`.
3. Authentication > Méthode de connexion : activez **Google** et **Apple**.
4. Authentication > Paramètres > Domaines autorisés : ajoutez votre domaine.
5. Apple exige un compte Apple Developer payant (Services ID, clé privée, Team ID) : suivez l'assistant Firebase.

## Installer sur smartphone
Hébergez en HTTPS (Render, Railway, Fly.io...), ouvrez le site, puis « Ajouter à l'écran d'accueil ».
Ajoutez des icônes 192 et 512 px dans `manifest.webmanifest` pour une icône propre.

## Structure
- `server.js` : proxy IA + fichiers statiques
- `public/index.html`, `css/style.css`
- `public/js/game.js` (jeu), `auth.js` (connexion), `questions.js` (questions), `config.js`
