# PTT Live - Application Desktop Server

Application Electron pour gérer le serveur PTT Live avec interface graphique complète.

## 📸 Aperçu

L'application desktop intègre :
- ✅ **Dashboard temps réel** : stats, utilisateurs, QR Code (généré côté Main Process, sans dépendance CDN)
- ✅ **HTTPS automatique** : certificats locaux mkcert installés au premier lancement
- ✅ **Configuration audio** : sélection devices, sample rate, bitrate
- ✅ **Gestion groupes** : CRUD complet avec API
- ✅ **Monitoring** : VU-mètres temps réel via WebSocket, logs filtrables
- ✅ **Contrôle serveur** : démarrage manuel/arrêt avec feedback visuel

---

## 🚀 Démarrage Rapide

```bash
# Depuis la racine du projet
./start-desktop.sh

# OU manuellement
cd electron
npm start
```

Au premier lancement, l'app configure automatiquement les certificats HTTPS locaux (mkcert) — voir [HTTPS et certificats](#-https-et-certificats). Le serveur PTT Live **ne démarre pas automatiquement** : cliquez sur "Démarrer" dans le dashboard pour le lancer.

---

## 📦 Installation

Les dépendances sont déjà installées. Si nécessaire :

```bash
cd electron
npm install
```

---

## 🎯 Utilisation

### 1. Dashboard

**Stats temps réel** :
- Uptime serveur
- Nombre d'utilisateurs connectés
- Groupes actifs
- Total connexions

**QR Code** :
- Généré côté Main Process (lib `qrcode`, pas de CDN externe — fonctionne sans accès Internet sur le WiFi d'un événement)
- IP réseau détectée par le Main Process (même logique que pour les certificats mkcert)
- URL construite à partir du protocole/port réels du serveur (HTTPS par défaut)
- Scanner depuis smartphone pour connexion rapide
- Bouton copier URL
- Placeholder visuel tant que le serveur est arrêté ou qu'aucun QR code n'a été généré

**Utilisateurs** :
- Liste en temps réel
- Groupe de chaque utilisateur
- Heure de connexion

### 2. Configuration Audio

**Périphériques** :
- Sélection input/output depuis dropdown auto-détecté
- Support macOS (CoreAudio), Linux (JACK/PipeWire)
- Appliquer instantanément (bridge audio rechargé)

**Paramètres** :
- Sample Rate : 44.1 / 48 / 96 kHz
- Bitrate par défaut : 32-320 kbps
- Jitter Buffer : 20-100 ms

### 3. Gestion Groupes

- **Créer** : bouton "➕ Nouveau groupe"
- **Modifier** : depuis la liste (nom, bitrate)
- **Supprimer** : confirmation requise
- Sauvegardé automatiquement dans `config.yaml`

### 4. Monitoring

**VU-Mètres** :
- Niveaux audio par canal (input/output) et par groupe
- Temps réel via WebSocket (`/audio-levels`, même port que l'API)
- Reconnexion automatique si la connexion WebSocket tombe

### 5. Logs

- Logs serveur en temps réel
- Filtrage par niveau (error/warn/info/debug)
- Bouton "Effacer"
- Format timestamp + niveau + message

---

## 🏗️ Architecture Technique

```
┌─────────────────────────────────────────────────┐
│           ELECTRON APP (Desktop)                │
│                                                 │
│  ┌───────────────────────────────────────────┐ │
│  │        MAIN PROCESS (Node.js)             │ │
│  │                                           │ │
│  │  • spawn server/index.js                 │ │
│  │  • IPC handlers (start/stop/status)      │ │
│  │  • Tray icon (macOS/Linux)               │ │
│  │  • Logs forwarding → Renderer            │ │
│  └───────────────────────────────────────────┘ │
│                    ↕ IPC                       │
│  ┌───────────────────────────────────────────┐ │
│  │      RENDERER PROCESS (Frontend)          │ │
│  │                                           │ │
│  │  • HTML/CSS/JS (pas de framework)        │ │
│  │  • Fetch API REST :3000/admin/*          │ │
│  │  • WebSocket audio levels (live)         │ │
│  │  • QR Code (data URL via IPC)            │ │
│  └───────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
                    ↕ HTTPS (127.0.0.1, certs mkcert)
┌─────────────────────────────────────────────────┐
│         SERVEUR PTT LIVE (spawned)              │
│                                                 │
│  • LiveKit Server (binaire Go) :7880           │
│  • Audio Bridge Manager                        │
│  • API REST Express :3000 (HTTPS)              │
│  • Proxy HTTP + WS → LiveKit (/livekit/*)      │
│  • WebSocket Audio Levels (/audio-levels)      │
└─────────────────────────────────────────────────┘
```

Le proxy `/livekit/*` (http-proxy natif) permet aux clients de joindre LiveKit via le même port/certificat HTTPS que l'API, sans exposer le port 7880 séparément. Le serveur Express dispatch lui-même les événements `upgrade` (un seul listener) entre le proxy LiveKit et le WebSocket audio-levels, qui partagent le même port.

---

## 🔌 API Consommées

L'interface desktop utilise toutes les routes admin existantes :

| Endpoint | Méthode | Usage |
|----------|---------|-------|
| `/admin/stats` | GET | Dashboard metrics |
| `/admin/users` | GET | Liste utilisateurs |
| `/admin/groups` | GET | Liste groupes |
| `/admin/groups` | POST | Créer groupe |
| `/admin/groups/:id` | PUT | Modifier groupe |
| `/admin/groups/:id` | DELETE | Supprimer groupe |
| `/admin/config` | GET | Config complète |
| `/admin/config/audio` | PUT | Mettre à jour audio |
| `/admin/audio/devices` | GET | Énumérer devices |
| `/admin/audio/device` | POST | Sélectionner device |
| `/admin/devices/list` | GET | Auto-détection (macOS/Linux) |
| `/admin/logs` | GET | Logs serveur |
| `/health` | GET | Health check |
| `/livekit/*` | ALL | Proxy HTTP vers LiveKit Server (port 7880) |

WebSocket :
- `wss://127.0.0.1:3000/audio-levels` → VU-mètres temps réel
- `wss://127.0.0.1:3000/livekit/*` → Proxy WebSocket signaling LiveKit (clients PWA)

---

## 🔒 HTTPS et certificats

L'app est en HTTPS par défaut (`ENABLE_HTTPS=false` pour revenir en HTTP explicitement).

### Setup automatique (premier lancement)

Au premier démarrage, si `certs/localhost.pem` et `certs/localhost-key.pem` sont absents, `electron/setup-helper.js` :
1. Installe `mkcert` automatiquement (Homebrew sur macOS, téléchargement direct sur Linux)
2. Installe la CA locale (`mkcert -install`) dans le trousseau système
3. Détecte l'IP réseau et génère les certificats pour `localhost`, `127.0.0.1` et cette IP
4. Affiche des dialogs de progression/erreur (avec fallback manuel `./setup-certificates.sh`)

### Points d'attention

- **127.0.0.1, pas localhost** : le serveur écoute en IPv4 (`host: 0.0.0.0`), mais le Node embarqué par Electron peut résoudre `localhost` en IPv6 (`::1`) en priorité. `main.js` et `preload.js` utilisent donc `127.0.0.1` pour tous les appels internes (ping, health check) afin d'éviter des échecs silencieux.
- **Ping interne et `rejectUnauthorized`** : le module `https` de Node ne lit pas le trousseau système où mkcert installe sa CA (contrairement à Safari/Chrome/Electron renderer) ; `pingServer()` passe donc `rejectUnauthorized: false` pour son propre ping local.
- **Proxy LiveKit en HTTPS** : LiveKit Server local tourne en HTTP brut (port 7880) ; le proxy Express (`http-proxy`) fait le pont HTTPS ↔ HTTP côté clients.

---

## 📦 Build pour Distribution

### macOS

```bash
cd electron
npm run build:mac
```

Génère :
- `dist/mac/PTT Live Server.app`
- `dist/PTT Live Server-0.3.0.dmg`

### Linux

```bash
cd electron
npm run build:linux
```

Génère :
- `dist/PTT Live Server-0.3.0.deb`
- `dist/PTT Live Server-0.3.0.AppImage`

### Tester le build

```bash
# macOS
open dist/mac/PTT\ Live\ Server.app

# Linux
./dist/PTT\ Live\ Server-0.3.0.AppImage
```

---

## 🎨 Personnalisation

### Icônes

Placer les icônes dans `electron/assets/` :

```
electron/assets/
├── icon.icns       # macOS (512x512 minimum)
├── icon.png        # Linux (512x512)
└── tray-icon.png   # Tray 22x22 ou 44x44 (retina)
```

Générer icônes depuis PNG :

```bash
# macOS .icns
iconutil -c icns assets/icon.iconset

# Linux .png
convert icon.png -resize 512x512 assets/icon.png
```

### Thème

Modifier `electron/ui/styles.css` :

```css
:root {
  --bg-primary: #1a1a1a;
  --accent-primary: #4a9eff;
  /* ... */
}
```

---

## 🐛 Debug

### DevTools

Ouvrir automatiquement en mode dev :

```bash
cd electron
npm run dev
```

Ou manuellement dans `main.js` :

```javascript
mainWindow.webContents.openDevTools();
```

### Logs Console

**Main Process** :
```javascript
console.log('[Main]', ...); // Terminal qui a lancé npm start
```

**Renderer Process** :
```javascript
console.log('[Renderer]', ...); // DevTools → Console
```

**Serveur PTT Live** :
```javascript
// Transmis au Renderer via IPC
window.electronAPI.server.onLog((log) => {
  console.log('[Serveur]', log);
});
```

### Erreurs courantes

**Port 3000 déjà utilisé** :
```bash
# Tuer le process
lsof -i :3000
kill -9 <PID>

# OU changer de port
PORT=3001 npm start
```

**Serveur ne démarre pas** :
- Vérifier que `server/index.js` existe
- Vérifier permissions LiveKit binaire
- Voir logs dans DevTools console

**Certificats SSL manquants / setup mkcert échoue** :
- Exécuter manuellement : `./setup-certificates.sh`
- Ou installer mkcert : https://github.com/FiloSottile/mkcert puis `mkcert -install`
- Vérifier la présence de `certs/localhost.pem` et `certs/localhost-key.pem`

**Statut serveur affiché à tort comme "arrêté"** :
- Vérifier que le ping utilise bien `127.0.0.1` (pas `localhost`, qui peut résoudre en IPv6 alors que le serveur n'écoute qu'en IPv4)
- En HTTPS, le ping interne ignore volontairement les erreurs de certificat (`rejectUnauthorized: false`) puisque Node ne lit pas le trousseau système où mkcert installe sa CA

**QR Code ne s'affiche pas** :
- Vérifier que le serveur tourne (le QR code est réinitialisé tant qu'il est arrêté)
- Le QR code est généré côté Main Process (IPC `qrcode:generate`), pas de dépendance réseau/CDN

---

## 🚧 TODO / Améliorations

### Priorité haute
- [x] **WebSocket VU-mètres** : implémenter connexion `/audio-levels`
- [ ] **Vraies icônes** : icns/png pour macOS/Linux
- [ ] **Tray icon** : avec menu contextuel fonctionnel

### Priorité moyenne
- [ ] **Graphiques monitoring** : Chart.js pour latence/bande passante
- [ ] **Export logs** : bouton télécharger CSV/JSON
- [ ] **Matrice routing** : interface graphique drag & drop
- [ ] **Notifications desktop** : via Electron Notification API

### Priorité basse
- [ ] **Thème toggle** : dark/light mode
- [ ] **Auto-update** : electron-updater pour mises à jour

### Technique
- [ ] **Tests** : Spectron ou Playwright pour Electron
- [ ] **CI/CD** : GitHub Actions pour builds automatiques
- [ ] **Signature code** : macOS notarization + Linux AppImage signature

---

## 📝 Notes de Développement

### Structure Fichiers

```
electron/
├── main.js              # Main Process
│                        # - Spawn serveur
│                        # - IPC handlers
│                        # - Window management
│                        # - Setup SSL au premier lancement
│
├── preload.js           # IPC Bridge sécurisé
│                        # - contextBridge
│                        # - Expose electronAPI
│
├── setup-helper.js      # Installation auto mkcert + génération certificats
│                        # - Détection IP réseau
│
├── package.json         # Config Electron + electron-builder
│
└── ui/                  # Renderer Process (Frontend)
    ├── index.html       # Structure UI
    ├── styles.css       # Styles (dark theme)
    └── app.js           # Logic frontend (QR code reçu via IPC en data URL)
```

### Communication IPC

**Renderer → Main** :

```javascript
// Depuis ui/app.js
const result = await window.electronAPI.server.start();
```

**Main → Renderer** :

```javascript
// Depuis main.js
mainWindow.webContents.send('server:status', { running: true });

// Écouté dans ui/app.js
window.electronAPI.server.onStatus((data) => {
  console.log('Status:', data);
});
```

### Sécurité

- ✅ **contextIsolation: true** : isole Node.js du renderer
- ✅ **nodeIntegration: false** : pas d'accès Node direct
- ✅ **preload.js** : whitelist API exposées via contextBridge
- ⚠️ **CSP manquant** : ajouter Content-Security-Policy en prod

---

## 🤝 Contribution

L'app desktop est modulaire et extensible :

1. **Ajouter une vue** : créer `<div id="view-xxx">` dans `index.html`
2. **Ajouter un handler IPC** : `ipcMain.handle()` dans `main.js`
3. **Exposer au renderer** : `contextBridge.exposeInMainWorld()` dans `preload.js`
4. **Appeler l'API** : fetch dans `ui/app.js`

---

## 📚 Ressources

- **Electron Docs** : https://www.electronjs.org/docs
- **electron-builder** : https://www.electron.build
- **LiveKit Server API** : https://docs.livekit.io
- **QR Code.js** : https://github.com/soldair/node-qrcode

---

## 📄 Licence

Même licence que PTT Live (MIT)

---

**Version** : 0.3.0
**Dernière mise à jour** : 2026-06-30
