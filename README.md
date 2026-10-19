# Quizly

## Lancer
1. `npm install`
2. Copiez `.env.example` en `.env` et collez votre clé d'IA dans `AI_API_KEY`
3. `npm start` puis ouvrez http://localhost:3000 (sur téléphone : l'IP de votre PC, même Wi-Fi)

La clé reste sur le serveur (`server.js`), jamais dans `public/`.
Sans clé ou sans réseau, le jeu utilise ses thèmes sans IA (drapeaux, capitales, calcul…).

## Connexion Google (Firebase)
1. Créez un projet sur console.firebase.google.com et ajoutez une application Web.
2. Copiez sa configuration dans `public/js/config.js`.
3. Authentication > Méthode de connexion : activez **Google**, puis ajoutez votre domaine dans les domaines autorisés.

## Structure
- `server.js` : questions par IA, salles en ligne (WebSocket), notifications, fichiers du site
- `public/index.html`, `public/css/style.css` : l'appli ; `public/tv.html` : l'écran télé
- `public/js/game.js` : le jeu et les écrans ; `online.js` : parties en ligne ; `friends.js` : amis et clubs ;
  `cosmetics.js` : Boutique ; `quests.js` : défis ; `million.js` : Millionnaire ; `impostor.js` : L'Imposteur ;
  `local.js` : questions sans IA ; `questions.js` : thèmes ; `auth.js`, `cloud.js`, `config.js` : compte et sauvegarde
- `docs/index.html` : page qui réveille le serveur Render avant d'ouvrir le jeu
