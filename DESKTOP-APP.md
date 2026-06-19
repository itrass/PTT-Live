# PTT Live - Application Desktop Server

Application Electron pour gérer le serveur PTT Live avec interface graphique complète.

## 📸 Aperçu

L'application desktop intègre :
- ✅ **Dashboard temps réel** : stats, utilisateurs, QR Code
- ✅ **Configuration audio** : sélection devices, sample rate, bitrate
- ✅ **Gestion groupes** : CRUD complet avec API
- ✅ **Monitoring** : VU-mètres (prévu), logs filtrables
- ✅ **Contrôle serveur** : démarrage/arrêt avec feedback visuel

---

## 🚀 Démarrage Rapide

```bash
# Depuis la racine du projet
./start-desktop.sh

# OU manuellement
cd electron
npm start
```

L'application démarre automatiquement le serveur PTT Live au lancement.

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
- Généré automatiquement avec l'IP réseau
- Scanner depuis smartphone pour connexion rapide
- Bouton copier URL

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

**VU-Mètres** (à venir) :
- Niveaux audio par canal (input/output)
- Temps réel via WebSocket
- Détection clipping

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
│  │  • WebSocket audio levels (prévu)        │ │
│  │  • QR Code (qrcode.js)                   │ │
│  └───────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
                    ↕ HTTP
┌─────────────────────────────────────────────────┐
│         SERVEUR PTT LIVE (spawned)              │
│                                                 │
│  • LiveKit Server (binaire Go)                 │
│  • Audio Bridge Manager                        │
│  • API REST Express :3000                      │
│  • WebSocket Audio Levels                      │
└─────────────────────────────────────────────────┘
```

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

WebSocket (prévu) :
- `ws://localhost:3000/audio-levels` → VU-mètres temps réel

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

**QR Code ne s'affiche pas** :
- Vérifier que le serveur tourne
- Voir console : "✅ QR Code généré"
- Script CDN chargé ?

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
- [ ] **Auth admin** : mot de passe pour accès dashboard
- [ ] **Thème toggle** : dark/light mode
- [ ] **Auto-update** : electron-updater pour mises à jour
- [ ] **I18n** : français/anglais

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
│
├── preload.js           # IPC Bridge sécurisé
│                        # - contextBridge
│                        # - Expose electronAPI
│
├── package.json         # Config Electron + electron-builder
│
└── ui/                  # Renderer Process (Frontend)
    ├── index.html       # Structure UI
    ├── styles.css       # Styles (dark theme)
    ├── app.js           # Logic frontend
    └── qrcode.min.js    # QR Code library
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
**Dernière mise à jour** : 2026-06-19
