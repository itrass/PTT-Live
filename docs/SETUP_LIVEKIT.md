# Configuration LiveKit pour PTT Live

## Option 1 : LiveKit Cloud (Recommandé pour démarrer)

LiveKit Cloud offre un tier gratuit parfait pour le développement et les tests.

### Étapes :

1. **Créer un compte LiveKit Cloud**
   - Aller sur https://cloud.livekit.io
   - Créer un compte gratuit
   - Créer un nouveau projet

2. **Obtenir les clés API**
   - Dans le dashboard, aller dans "Settings" > "Keys"
   - Copier votre `API Key` et `API Secret`
   - Copier votre `WebSocket URL` (format: `wss://your-project.livekit.cloud`)

3. **Configurer le serveur PTT Live**

   Créer/éditer le fichier `server/.env` :
   ```bash
   # LiveKit Cloud
   LIVEKIT_URL=wss://votre-projet.livekit.cloud
   LIVEKIT_API_KEY=APIxxxxxxxxxx
   LIVEKIT_API_SECRET=xxxxxxxxxxxxxxxxxx

   # Mode
   USE_LOCAL_LIVEKIT=false

   # Server
   NODE_ENV=development
   ```

4. **Redémarrer le serveur**
   ```bash
   cd server
   npm run dev
   ```

5. **Tester**
   - Le serveur devrait afficher : `✓ Mode LiveKit Cloud`
   - Ouvrir http://localhost:5173
   - Se connecter avec un nom et le groupe "Équipe Production"
   - Ouvrir un second onglet/fenêtre pour tester à 2 participants

### Limitations tier gratuit :
- 10 000 minutes/mois
- 50 participants simultanés max
- Parfait pour développement et tests

---

## Option 2 : LiveKit Server Local (Auto-hébergé)

Pour un déploiement en production auto-hébergé.

### Prérequis :
- macOS, Linux ou Windows
- Port 7880 disponible
- Ports 50000-60000 disponibles pour WebRTC

### Installation :

1. **Télécharger le binaire LiveKit Server**

   macOS (ARM64 - Apple Silicon) :
   ```bash
   cd server/bin
   curl -L -o livekit.tar.gz \
     https://github.com/livekit/livekit/releases/download/v1.7.2/livekit_v1.7.2_darwin_arm64.tar.gz
   tar -xzf livekit.tar.gz
   chmod +x livekit-server
   rm livekit.tar.gz
   ```

   macOS (AMD64 - Intel) :
   ```bash
   cd server/bin
   curl -L -o livekit.tar.gz \
     https://github.com/livekit/livekit/releases/download/v1.7.2/livekit_v1.7.2_darwin_amd64.tar.gz
   tar -xzf livekit.tar.gz
   chmod +x livekit-server
   rm livekit.tar.gz
   ```

   Linux (AMD64) :
   ```bash
   cd server/bin
   curl -L -o livekit.tar.gz \
     https://github.com/livekit/livekit/releases/download/v1.7.2/livekit_v1.7.2_linux_amd64.tar.gz
   tar -xzf livekit.tar.gz
   chmod +x livekit-server
   rm livekit.tar.gz
   ```

2. **Générer des clés API**
   ```bash
   # Génération clés aléatoires sécurisées
   API_KEY="APIkey$(openssl rand -hex 16)"
   API_SECRET=$(openssl rand -base64 32)

   echo "API_KEY: $API_KEY"
   echo "API_SECRET: $API_SECRET"
   ```

3. **Configurer server/.env**
   ```bash
   # LiveKit Local
   LIVEKIT_URL=ws://localhost:7880
   LIVEKIT_API_KEY=APIkey...
   LIVEKIT_API_SECRET=...

   # Mode local activé
   USE_LOCAL_LIVEKIT=true

   # Server
   NODE_ENV=development
   ```

4. **Démarrer**
   ```bash
   cd server
   npm run dev
   ```

   Le serveur lancera automatiquement LiveKit Server en local.

### Production HTTPS :

Pour la production, LiveKit Server doit être derrière un reverse proxy HTTPS (nginx, Caddy, Traefik).

Exemple Caddy :
```
your-domain.com {
    reverse_proxy localhost:7880
}
```

---

## Dépannage

### "Connexion impossible. Vérifiez le serveur."

1. Vérifier que le serveur Node.js tourne (`http://localhost:3000/health`)
2. Vérifier les clés dans `server/.env`
3. Vérifier les logs serveur pour erreurs LiveKit
4. En mode Cloud : vérifier que l'URL est bien `wss://` (pas `ws://`)
5. En mode Local : vérifier que le binaire `livekit-server` existe dans `server/bin/`

### "Token generation failed"

- Vérifier que `LIVEKIT_API_KEY` et `LIVEKIT_API_SECRET` sont corrects
- Les clés doivent correspondre entre le serveur Node.js et LiveKit Server

### Permissions microphone (navigateur)

- Chrome/Edge : Aller dans Paramètres > Confidentialité > Microphone
- Firefox : Autoriser quand demandé
- Safari : Préférences > Sites web > Microphone

### Performance réseau

- LiveKit Cloud : latence dépend de votre localisation (serveurs en Europe/US)
- Local : latence minimale sur WiFi local (~20-50ms)

---

## Tests de validation

Checklist pour vérifier que tout fonctionne :

- [ ] Serveur démarre sans erreur
- [ ] Client se connecte (pas d'erreur "Connexion impossible")
- [ ] 2 clients peuvent rejoindre le même groupe
- [ ] Le bouton PTT fonctionne (maintenir pour parler)
- [ ] L'audio est transmis entre les 2 clients
- [ ] La liste des participants s'update en temps réel
- [ ] Le VU-mètre affiche du niveau audio
- [ ] Vibration haptique au press/release (mobile)

---

**Note** : Pour la Phase 1, LiveKit Cloud est recommandé. Le mode local sera nécessaire en Phase 3 pour l'intégration avec le bridge audio CoreAudio/JACK.
