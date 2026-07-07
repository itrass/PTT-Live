# PTT Live Desktop

Application desktop Electron pour gérer le serveur PTT Live.

## 🚀 Démarrage

```bash
# Depuis la racine du projet
./start-desktop.sh

# OU depuis electron/
cd electron
npm start
```

## 📦 Build pour distribution

```bash
cd electron

# macOS
npm run build:mac

# Linux
npm run build:linux

# Les deux
npm run build
```

Les builds seront dans `electron/dist/`.

## 🎨 Fonctionnalités

### Dashboard
- ✅ Stats temps réel (uptime, utilisateurs, connexions)
- ✅ Liste utilisateurs connectés
- ✅ QR Code pour connexion rapide clients
- ✅ Contrôles démarrage/arrêt serveur

### Configuration
- ✅ Sélection périphériques audio (input/output)
- ✅ Paramètres audio (sample rate, bitrate, jitter buffer)
- ✅ Sauvegarde automatique dans config.yaml

### Groupes
- ✅ Liste groupes configurés
- ✅ Ajout/modification/suppression groupes
- ✅ Configuration bitrate par groupe

### Monitoring
- 🚧 VU-mètres temps réel (WebSocket)
- 🚧 Graphiques latence
- 🚧 Stats réseau par client

### Logs
- ✅ Logs serveur en temps réel
- ✅ Filtrage par niveau (error/warn/info/debug)
- ✅ Export logs

## 🏗️ Architecture

```
electron/
├── main.js          # Main Process (Node.js)
│                    # - Spawn serveur PTT Live
│                    # - IPC avec renderer
│                    # - Gestion tray icon
│
├── preload.js       # Bridge sécurisé IPC
│
└── ui/              # Renderer Process (Frontend)
    ├── index.html   # Interface dashboard
    ├── styles.css   # Styles
    └── app.js       # Logic frontend
                     # - Consomme API admin (/admin/*)
                     # - Met à jour UI
```

## 🔌 Communication

```
┌─────────────────────────────────────────┐
│         MAIN PROCESS (Node.js)          │
│  ┌──────────────────────────────────┐   │
│  │  Serveur PTT Live (spawn)        │   │
│  │  - LiveKit Server                │   │
│  │  - Audio Bridge                  │   │
│  │  - API REST :3000                │   │
│  └──────────────────────────────────┘   │
│              ↕ IPC                      │
│  ┌──────────────────────────────────┐   │
│  │  Electron Window                 │   │
│  └──────────────────────────────────┘   │
└─────────────────────────────────────────┘
              ↕ HTTP
┌─────────────────────────────────────────┐
│      RENDERER PROCESS (Frontend)        │
│  - Fetch API admin                      │
│  - WebSocket audio levels               │
│  - Interface dashboard                  │
└─────────────────────────────────────────┘
```

## 🛠️ API Utilisées

Toutes les routes de l'API admin serveur :

```
GET  /admin/stats              → Dashboard metrics
GET  /admin/users              → Utilisateurs connectés
GET  /admin/groups             → Liste groupes
POST /admin/groups             → Créer groupe
PUT  /admin/groups/:id         → Modifier groupe
DELETE /admin/groups/:id       → Supprimer groupe
GET  /admin/config             → Config complète
PUT  /admin/config/audio       → Mettre à jour config audio
GET  /admin/audio/devices      → Énumérer devices
POST /admin/audio/device       → Sélectionner device
GET  /admin/audio/routing      → Config routing
POST /admin/audio/routing      → Mettre à jour routing
GET  /admin/devices/list       → Auto-détection devices
GET  /admin/logs               → Logs serveur
WS   /audio-levels             → WebSocket VU-mètres
```

## 🔧 TODO

- [ ] Implémenter QR Code canvas (bibliothèque qrcode.js)
- [ ] WebSocket audio levels pour VU-mètres
- [ ] Notifications desktop (toast)
- [ ] Tray icon avec vraie icône
- [ ] Graphiques monitoring (Chart.js)
- [ ] Export logs (CSV/JSON)
- [ ] Auth admin (optionnel)
- [ ] Thème dark/light toggle
- [ ] Auto-update (electron-updater)

## 📝 Notes de développement

- **Main Process** : Gère le cycle de vie de l'app et spawn le serveur
- **Renderer Process** : Interface web, appelle l'API REST du serveur
- **IPC** : Communication sécurisée via contextBridge
- **Serveur** : Tourne dans un process child_process, logs transmis au renderer
- **Port** : 3000 par défaut (configurable via PORT env)

## 🐛 Debug

Ouvrir DevTools : automatique en mode `--dev`

```bash
npm run dev
```

Logs dans la console :
- `[Serveur]` : logs du serveur PTT Live
- `[Serveur Error]` : erreurs serveur
- `✅/❌` : statut démarrage/arrêt

## 📦 Packaging

electron-builder crée :
- **macOS** : `.dmg` + `.app` dans `dist/mac/`
- **Linux** : `.deb` + `.AppImage` dans `dist/`

Tester le build :

```bash
npm run build:mac
open dist/mac/PTT\ Live\ Server.app
```
