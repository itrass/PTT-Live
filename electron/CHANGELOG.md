# PTT Live Desktop - Changelog

## v0.3.0 - 2026-06-19

### 🎉 Première version de l'application desktop Electron

#### ✨ Nouvelles Fonctionnalités

**Interface Electron**
- Application desktop native (macOS/Linux)
- Main Process spawn serveur Node.js automatiquement
- IPC sécurisé via contextBridge (preload.js)
- Démarrage/arrêt serveur depuis l'interface
- Tray icon placeholder (à compléter)

**Dashboard**
- Stats temps réel (uptime, utilisateurs, connexions)
- Liste utilisateurs connectés avec groupes
- Génération QR Code automatique (détection IP réseau)
- Bouton copier URL clients
- Polling automatique toutes les 2 secondes

**Configuration Audio**
- Sélection devices input/output (auto-détectés)
- Configuration sample rate (44.1/48/96 kHz)
- Bitrate par défaut (32-320 kbps)
- Jitter buffer (20-100 ms)
- Sauvegarde dans config.yaml

**Gestion Groupes**
- Liste groupes existants
- Création nouveau groupe (nom + bitrate)
- Modification/suppression (via API admin)
- Synchronisation config.yaml

**Monitoring**
- Logs serveur en temps réel
- Filtrage par niveau (error/warn/info/debug)
- Bouton effacer logs
- Format timestamp + niveau + message

**Notifications**
- Toast visuelles (success/error/warning/info)
- Auto-dismiss 5 secondes
- Bouton fermeture manuelle
- Animation slide-in

#### 🛠️ Technique

**Stack**
- Electron 28.0.0
- electron-builder 24.9.1
- qrcode 1.5.3 (via CDN)
- HTML/CSS/JS vanilla (pas de framework)

**Architecture**
- Main Process : spawn serveur, IPC handlers
- Renderer Process : dashboard, fetch API admin
- Communication : IPC + HTTP vers localhost:3000

**API Utilisées**
- `GET /admin/stats` : dashboard metrics
- `GET /admin/users` : utilisateurs
- `GET /admin/groups` : groupes
- `POST /admin/groups` : créer groupe
- `GET /admin/config` : config complète
- `PUT /admin/config/audio` : config audio
- `GET /admin/devices/list` : auto-détection devices
- `POST /admin/audio/device` : sélectionner device
- `GET /health` : health check

**Build**
- electron-builder configuré
- macOS : .dmg + .app
- Linux : .deb + .AppImage
- Scripts : `npm run build:mac` / `build:linux`

#### 📝 Documentation

- [DESKTOP-APP.md](DESKTOP-APP.md) : doc complète (architecture, API, debug)
- [QUICKSTART.md](QUICKSTART.md) : guide démarrage rapide
- [README.md](README.md) : intégration Electron dans README principal
- [CLAUDE.md](../CLAUDE.md) : section Application Desktop ajoutée

#### 🚧 TODO / Limitations

**À implémenter** :
- [ ] WebSocket audio levels (VU-mètres temps réel)
- [ ] Vraies icônes (icon.icns / icon.png)
- [ ] Tray icon fonctionnel avec menu
- [ ] Graphiques monitoring (Chart.js)
- [ ] Export logs (CSV/JSON)
- [ ] Matrice routing audio (drag & drop)
- [ ] Auth admin (mot de passe)
- [ ] Thème dark/light toggle
- [ ] Auto-update (electron-updater)
- [ ] Tests (Spectron/Playwright)

**Limitations connues** :
- QR Code utilise CDN (pas de lib locale)
- Pas de CSP (Content-Security-Policy)
- Pas de signature code (notarization macOS)
- Tray icon pas implémenté (commenté dans main.js)

#### 🔧 Installation

```bash
# Depuis la racine du projet
./start-desktop.sh

# OU depuis electron/
cd electron
npm install
npm start
```

#### 🏗️ Structure Fichiers

```
electron/
├── package.json         # Config Electron
├── main.js              # Main Process (585 lignes)
├── preload.js           # IPC bridge (40 lignes)
├── README.md            # Doc technique
├── QUICKSTART.md        # Guide démarrage
├── CHANGELOG.md         # Ce fichier
└── ui/
    ├── index.html       # Interface (185 lignes)
    ├── styles.css       # Styles (557 lignes)
    └── app.js           # Logic frontend (627 lignes)
```

---

## Prochaine version (v0.3.1)

### 🎯 Priorités

1. **VU-mètres WebSocket** : connexion `/audio-levels`
2. **Icônes** : créer icon.icns + icon.png + tray-icon.png
3. **Tray menu** : implémenter menu contextuel
4. **Tests** : premiers tests Electron

### 💡 Idées

- Graphiques latence/bande passante (Chart.js)
- Notifications desktop (Electron Notification API)
- Matrice routing visuelle
- Export config (JSON/YAML)

---

**Développé avec Claude Code**
