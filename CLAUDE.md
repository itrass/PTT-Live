# CLAUDE.md - Documentation Développement PTT Live

## Vue d'ensemble du projet

**PTT Live** est un système d'intercom professionnel WebRTC pour techniciens événementiels. Les utilisateurs communiquent via smartphone (PWA) en WiFi, le serveur fait le pont avec l'installation audio professionnelle.

## Contexte de développement

### Environnement
- **Plateforme principale** : macOS (tests et développement)
- **Compatibilité** : Linux (implémentation rapide après macOS)
- **Infrastructure audio** : Carte son multicanaux + Dante disponible
- **Réseau** : WiFi dédié
- **Déploiement** : Auto-hébergé uniquement
- **Licence** : Open Source

### Développeur
- Développeur solo
- Gestion complète par Claude (Node.js, React, WebRTC, audio temps réel)

## Architecture technique

### Stack
```
SERVEUR (Node.js)
├── LiveKit Server (binaire Go, SFU WebRTC)
├── Bridge Audio (Node.js)
│   ├── CoreAudio (macOS natif)
│   ├── JACK (Linux/macOS)
│   ├── libopus (transcodage)
│   └── Jitter buffer
├── API REST (Express)
└── Configuration (YAML)

CLIENT (PWA React)
├── React + Vite
├── livekit-client SDK
├── Web Push API
└── Service Worker
```

### Flux audio
```
[Carte son/Dante] → CoreAudio/JACK → Opus → LiveKit → WebRTC → Client PWA
[Client PWA] → WebRTC → LiveKit → Opus → CoreAudio/JACK → [Carte son/Dante]
```

## Phases de développement

### PHASE 1 — Fondations (MVP)
**Objectif** : Valider la faisabilité technique complète

#### 1.1 Infrastructure serveur
- Installation LiveKit Server (binaire)
- Configuration basique
- API REST minimal

#### 1.2 Bridge audio macOS
- Détection CoreAudio
- Capture/lecture audio
- Encodage/décodage Opus
- Connexion LiveKit

#### 1.3 PWA React
- Interface PTT basique
- Un groupe, connexion simple
- Audio WebRTC bidirectionnel

#### 1.4 Tests validation
- Latence end-to-end < 150ms
- 2-4 clients simultanés
- Stabilité WiFi

### PHASE 2 — Fonctionnalités professionnelles
**Objectif** : Système utilisable en production

#### 2.1 Groupes et routing
- Configuration YAML (groupes, canaux)
- Routing audio dynamique
- Switch groupe côté client

#### 2.2 Modes PTT avancés
- PTT lock (appui 3s)
- Mode continu (toggle)
- Feedback visuel/vibration

#### 2.3 Interface admin
- Gestion groupes/utilisateurs
- Monitoring connexions
- Logs audio

#### 2.4 Notifications
- Web Push (appels privés)
- PWA manifest complet
- Support iOS

### PHASE 3 — Intégrations audio pro
**Objectif** : Compatibilité équipements événementiels

#### 3.1 Support Linux
- Backend JACK/PipeWire
- Script installation
- Tests compatibilité

#### 3.2 Dante
- DVS macOS/Windows
- Routing JACK ↔ Dante
- Documentation setup

#### 3.3 AES67
- RTP multicast (Linux)
- PTP sync
- Interop Dante

#### 3.4 Production
- Scripts install multi-OS
- Tests charge (30+ clients)
- Documentation déploiement

## Décisions techniques

### Pourquoi ces choix ?

#### LiveKit vs alternatives
- **Janus/Mediasoup** : trop bas niveau, complexité inutile
- **LiveKit** : SFU prêt, SDK client mature, self-hosted

#### Pas de Docker
- Latence audio critique (< 10ms jitter)
- JACK/CoreAudio nécessitent accès direct hardware
- Binaires natifs = performances optimales

#### PWA plutôt qu'app native
- Déploiement instantané (pas de stores)
- Cross-platform unifié
- Web Push suffisant pour notifications

#### Opus codec
- Standard WebRTC
- Faible latence (20-60ms frame)
- Qualité audio configurable selon besoin :
  - **Voix économique** : 32-64 kbps (WiFi limité)
  - **Voix standard** : 96 kbps (défaut, bon compromis)
  - **Voix HD** : 128-192 kbps (qualité maximale)
  - **Musique/monitoring** : 256-320 kbps (si besoin événementiel)
- Configuration par groupe ou globale (YAML)

## Structure du code

```
PTT Live/
├── server/
│   ├── index.js                 # Point d'entrée, lance LiveKit + Bridge
│   ├── package.json
│   ├── config/
│   │   └── config.yaml          # Groupes, canaux, routes
│   ├── bridge/
│   │   ├── AudioBridge.js       # Classe principale, détection backend
│   │   ├── OpusCodec.js         # Wrapper libopus
│   │   ├── JitterBuffer.js      # Buffer 40ms
│   │   ├── LiveKitClient.js     # Connexion SFU
│   │   └── backends/
│   │       ├── CoreAudioBackend.js  # macOS natif
│   │       ├── JACKBackend.js       # Linux/macOS
│   │       ├── PipeWireBackend.js   # Linux moderne
│   │       └── WASAPIBackend.js     # Windows (futur)
│   ├── api/
│   │   ├── routes.js            # REST API
│   │   └── admin.js             # Interface admin
│   └── bin/
│       └── livekit-server       # Binaire téléchargé à l'install
│
├── client/
│   ├── package.json
│   ├── vite.config.js
│   ├── public/
│   │   ├── manifest.json        # PWA
│   │   └── sw.js                # Service Worker
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── components/
│       │   ├── PTTButton.jsx    # Bouton principal
│       │   ├── GroupSelector.jsx
│       │   ├── UserList.jsx
│       │   └── AudioIndicator.jsx
│       ├── hooks/
│       │   ├── useLiveKit.js    # WebRTC logic
│       │   ├── usePTT.js        # Modes PTT
│       │   └── usePush.js       # Notifications
│       └── utils/
│           └── audio.js         # Helpers WebRTC
│
├── install/
│   ├── macos.sh                 # Installe deps + binaire LiveKit
│   ├── linux.sh
│   └── windows.ps1
│
├── CLAUDE.md                    # Ce fichier
├── TODO.md                      # Tâches actives
└── README.md                    # Doc utilisateur
```

## Commandes de développement

```bash
# Installation automatique (recommandé)
./install.sh  # Détecte OS, configure tout automatiquement

# Démarrage rapide

# Option 1 : Application Desktop (Interface graphique)
./start-desktop.sh  # Lance l'app Electron avec dashboard

# Option 2 : Mode CLI (deux terminaux)
./start.sh --dev  # Mode développement
./start.sh        # Mode production

# OU manuellement (deux terminaux)
# Serveur
cd server
npm install
npm run dev

# Client
cd client
npm install
npm run dev
```

## Application Desktop (v0.3.0)

### Interface Electron
- **Main Process** : spawn serveur Node.js, IPC handlers
- **Renderer Process** : dashboard HTML/CSS/JS
- **Communication** : IPC sécurisé (contextBridge) + HTTP vers API admin

### Fonctionnalités
- ✅ **Dashboard** : stats temps réel, utilisateurs, QR Code
- ✅ **Configuration** : devices audio, sample rate, bitrate, jitter
- ✅ **Groupes** : CRUD complet via API admin
- ✅ **Monitoring** : logs filtrables (error/warn/info/debug)
- ✅ **Notifications** : toast visuelles avec auto-dismiss
- 🚧 **VU-mètres** : WebSocket audio levels (prévu)

### Structure
```
electron/
├── main.js              # Main Process (spawn serveur)
├── preload.js           # IPC bridge sécurisé
├── package.json         # Config Electron + electron-builder
└── ui/
    ├── index.html       # Interface dashboard
    ├── styles.css       # Dark theme
    └── app.js           # Logic + API calls
```

### Build & Distribution
```bash
cd electron
npm run build:mac    # → dist/PTT Live Server.dmg
npm run build:linux  # → dist/PTT Live Server.AppImage
```

Voir [DESKTOP-APP.md](DESKTOP-APP.md) pour la doc complète.

---

## Fonctionnalités de portabilité (v0.2.1)

### Installation zéro-config
- **Script multi-OS** : `install.sh` détecte automatiquement macOS/Linux
- **Auto-détection IP** : Génère les `.env` avec l'IP réseau du serveur
- **Devices audio** : API `/admin/devices/list` pour énumérer devices disponibles
- **Templates** : `.env.example` pour serveur et client

### QR Code terminal
- **Affichage automatique** au démarrage du serveur
- **Scan rapide** depuis smartphone (connexion en 5s)
- **URL adaptative** : dev (5173) ou prod (3000) selon build client

### HTTPS automatique
- **Vite dev server** : HTTPS par défaut (certificat self-signed)
- **Redirection HTTP → HTTPS** en mode développement
- **Production** : utiliser reverse proxy (nginx/Caddy) pour HTTPS

### Configuration dynamique
- **LIVEKIT_URL: AUTO** dans config.yaml → détection IP runtime
- **Vite loadEnv()** pour variables d'environnement dynamiques
- **Serveur statique** : Express sert `client/dist/` en production

## Tests et validation

### Métriques critiques
- **Latence end-to-end** : < 150ms (WiFi local)
- **Jitter buffer** : 40ms cible
- **Qualité audio** : Opus configurable (32-320 kbps), 48kHz
  - Défaut : 96kbps (voix standard)
  - Configurable par groupe dans config.yaml
- **Clients simultanés** : 30+ (Phase 3)

### Scénarios de test Phase 1
1. ✅ 2 clients, PTT basique, même groupe
2. ✅ Latence < 150ms mesurée
3. ✅ Pas de coupures sur 5min
4. ✅ Reconnexion après perte WiFi

---

## Tests unitaires

### Philosophie
Tester uniquement la logique pure (pas le hardware audio, pas le réseau WebRTC, pas LiveKit). Toute fonction qui transforme des données, valide une entrée ou calcule un état est un candidat. Les backends audio (CoreAudio, JACK, PipeWire) et LiveKitClient ne se testent pas en unitaire — trop couplés au matériel/réseau.

### Frameworks

**Serveur** — Node.js test runner natif (déjà configuré : `"test": "node --test"`)
- Pas de dépendance à installer
- Fichiers de test : `server/tests/*.test.js`

**Client** — Vitest + Testing Library (à installer si pas présent)
```bash
cd client && npm install -D vitest @testing-library/react @testing-library/user-event jsdom
```
- Fichiers de test : co-localisés avec la source (`*.test.jsx` ou `*.test.js`)
- Config dans `client/vite.config.js` : ajouter `test: { environment: 'jsdom' }`

### Commandes
```bash
# Serveur
cd server && node --test

# Client
cd client && npm test
```

### Ce qu'il faut tester

#### Serveur — logique pure (aucun mock requis)

**`bridge/JitterBuffer.js`** — le module le plus critique à tester
- `push()` : ajoute des frames, retourne false si buffer plein (maxSize)
- `pop()` : retourne null si buffer vide (underrun), frame sinon
- `stats.underruns` / `stats.overruns` : incrémentés correctement
- `getHealth()` : score entre 0-100 selon remplissage et historique
- Comportement adaptatif : targetSize s'ajuste selon l'historique

**`bridge/OpusCodec.js`** — validation des options Opus
- Options invalides levées à la construction (bitrate hors plage, sampleRate non supporté)
- Presets bitrate : valeurs attendues pour `voice`, `voice-hd`, `music`
- Taille de frame : cohérence frameSize/sampleRate

**`config/ConfigManager.js`** — la fonction `slugify` (extraire et exporter)
- Accents → ASCII : `"Scène"` → `"scene"`
- Espaces → tirets, minuscules, caractères spéciaux supprimés
- Génération d'ID de groupe/canal à partir des noms YAML

**`config/DeviceProfileManager.js`** — CRUD profils (mocker `fs` pour éviter le disque)
- `getProfile(deviceId)` : retourne null si inconnu
- `saveProfile()` / `deleteProfile()` : état interne cohérent

#### Serveur — avec mock léger

**`websocket/AudioLevelsServer.js`** — extraire les calculs audio comme fonctions pures exportées
- `calculateRMS(buffer)` : valeur RMS correcte sur un buffer PCM connu
- `calculatePeak(buffer)` : pic maximal d'amplitude

#### Client — composants React (Vitest + jsdom)

**`components/UserList.jsx`**
- Affiche la liste de participants correctement
- Badge "speaking" visible quand `isSpeaking: true`
- Icône mute visible quand `isMuted: true`
- Cas vide : message ou liste vide sans crash

**`components/VUMeter.jsx`**
- Rendu stable à 0%, 50%, 100% de niveau
- Indicateur de clipping visible au-dessus du seuil (ex: > 0.95)
- Props `rms` et `peak` distinctes bien représentées

**`components/AudioIndicator.jsx`**
- Rendu en mode `capturing`, `playing`, état neutre

**`components/Settings.jsx`** — fonctions utilitaires localStorage
- `loadSettings()` : valeurs par défaut si localStorage vide
- `saveSettings()` / `loadSettings()` : persistance aller-retour

### Ce qu'il ne faut PAS tester en unitaire
- `CoreAudioBackend`, `JACKBackend`, `PipeWireBackend` — hardware
- `LiveKitClient`, `ServerAudioUser`, `AudioBridge` — réseau/WebRTC
- `index.js` — orchestration globale
- `App.jsx`, `Admin.jsx` — trop d'intégrations simultanées
- `useLiveKit.js` — trop couplé à l'API LiveKit

### Quand écrire des tests
- Modification de `JitterBuffer.js`, `OpusCodec.js`, `ConfigManager.js` → mettre à jour les tests existants
- Bug corrigé dans un module testable → ajouter un test de régression avant de merger
- Nouveau module à logique pure → écrire les tests dans la même PR

## Points d'attention

### macOS spécifique
- CoreAudio : permissions microphone (Info.plist si empaquété)
- Pas de JACK requis pour Phase 1 (natif CoreAudio suffit)
- JACK optionnel pour Dante/AES67

### Dante
- DVS macOS supporté officiellement
- Routing DVS → JACK → Bridge (Phase 3)
- Licence ~300€ (à budgéter)

### iOS PWA
- Support depuis iOS 16.4+
- **Impératif** : installer sur écran d'accueil pour notifications
- Message d'onboarding à implémenter

### Réseau
- QoS/DSCP recommandé pour flux audio
- VLAN dédié si possible
- Tests charge WiFi en Phase 3

## Ressources et dépendances

### NPM packages serveur
- `livekit-server-sdk` : connexion SFU
- `@opus/opusscript` ou `node-opus` : codec
- `express` : API REST
- `yaml` : config
- `node-coreaudio` : backend macOS (natif addon)
- `jack-connector` : JACK (Phase 3)

### NPM packages client
- `react` + `react-dom`
- `livekit-client` : WebRTC SDK
- `vite` : bundler
- `workbox` : Service Worker PWA

### Binaires externes
- `livekit-server` (Go) : téléchargé par script install
- JACK (optionnel macOS, requis Linux Phase 3)

## Workflow Git

### ⚠️ IMPORTANT : Commits et validation

**Règle stricte** : Commiter après chaque modification significative ou fonctionnalité complétée.

```bash
# Branches
main              # Production stable
develop           # Intégration continue
feature/xxx       # Fonctionnalités
fix/xxx           # Corrections

# Convention commits
feat: description
fix: description
docs: description
refactor: description
test: description
```

### Processus de développement

1. **Avant de coder** : Cocher la tâche en cours dans [TODO.md](TODO.md) (mettre `[x]`)
2. **Après chaque tâche complétée** :
   - ✅ Valider la tâche dans [TODO.md](TODO.md)
   - 🔄 Commiter avec message descriptif en français
   - 📝 Mettre à jour CLAUDE.md si nécessaire sans écrire "🤖 Generated with Claude Code Co-Authored-By: Claude noreply@anthropic.com"
   - Ne pas créer de fichiers récapitulatifs markdown.

**Exemple workflow** :
```bash
# 1. Tâche complétée
# 2. Valider dans TODO.md
# 3. Commit
git add .
git commit -m "feat: implement CoreAudio backend for macOS"

# 4. Passer à la tâche suivante
```

## Prochaines étapes

Voir [TODO.md](TODO.md) pour le plan détaillé.

---

**Dernière mise à jour** : 2026-07-07
**Version** : 0.2.1 (Portable + QR Code)
