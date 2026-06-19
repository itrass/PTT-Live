# PTT Live

**Système d'intercom professionnel WebRTC pour techniciens événementiels**

Communiquez via smartphone (PWA) en WiFi, le serveur fait le pont avec l'installation audio professionnelle.

---

## 🚀 Démarrage rapide

### 🖥️ Application Desktop (Nouveau !)

**Interface graphique complète pour gérer le serveur** :

```bash
# Lancer l'application desktop
./start-desktop.sh
```

✨ **Fonctionnalités** :
- Dashboard temps réel (stats, utilisateurs)
- Configuration audio (devices, bitrate)
- Gestion groupes (CRUD)
- QR Code pour connexion clients
- Logs serveur filtrables

📖 **Documentation complète** : [DESKTOP-APP.md](DESKTOP-APP.md)

---

### Installation Automatique (Recommandé)

**Un seul script pour tout installer** (détection automatique macOS/Linux) :

```bash
# 1. Installer dépendances + LiveKit
./install.sh

# 2. Configurer certificats SSL locaux (NOUVEAU - requis pour HTTPS)
./setup-certificates.sh

# 3. Démarrer le système (mode CLI)
./start.sh --dev
```

🔐 **Certificats SSL** : Le script `setup-certificates.sh` génère des certificats **automatiquement approuvés** (pas de warnings navigateur). Voir [SSL-SETUP.md](SSL-SETUP.md)

✨ **L'installeur configure automatiquement** :
- LiveKit Server local (pas besoin de compte cloud)
- Détection et configuration IP réseau
- Backends audio (sox/PipeWire/JACK selon OS)
- Toutes les dépendances

📖 **Guide portable complet** : [README-PORTABLE.md](README-PORTABLE.md)

---

### Installation Manuelle (avec LiveKit Cloud)

**Alternative si vous préférez utiliser LiveKit Cloud**

1. **Prérequis**
   - Node.js 20+ ([télécharger](https://nodejs.org))
   - Compte LiveKit Cloud gratuit ([créer ici](https://cloud.livekit.io))

2. **Installer les dépendances**
   ```bash
   cd server && npm install
   cd ../client && npm install
   ```

3. **Configurer LiveKit Cloud**

   - Créer compte sur https://cloud.livekit.io
   - Créer un projet
   - Copier vos clés API

   Créer `server/.env` :
   ```bash
   LIVEKIT_URL=wss://votre-projet.livekit.cloud
   LIVEKIT_API_KEY=APIxxxxxxxxxx
   LIVEKIT_API_SECRET=xxxxxxxxxxxxxxxxxx
   USE_LOCAL_LIVEKIT=false
   ```

4. **Démarrer**

   Terminal 1 :
   ```bash
   cd server && npm run dev
   ```

   Terminal 2 :
   ```bash
   cd client && npm run dev
   ```

5. **Tester** : https://localhost:5173

   - Se connecter avec votre nom
   - Ouvrir second onglet avec autre nom
   - Maintenir bouton PTT pour parler !

📖 **Guide LiveKit Cloud** : [docs/SETUP_LIVEKIT.md](docs/SETUP_LIVEKIT.md)

---

## 📱 Utilisation

- **Bouton PTT** : Maintenir pour parler, relâcher pour écouter
- **Desktop** : Clic maintenu / **Mobile** : Appui tactile maintenu
- **Feedback** : Vibration + couleur rouge quand vous parlez
- **VU-mètre** : Visualisation niveau audio en temps réel

---

---

## 🐛 Dépannage : "Connexion impossible"

**Cause** : Clés LiveKit non configurées ou invalides.

**Solution** :
1. Vérifier que `server/.env` existe avec vos vraies clés LiveKit Cloud
2. L'URL doit être en `wss://` (pas `ws://`)
3. Redémarrer le serveur après modification
4. Vérifier que le serveur tourne : `curl http://localhost:3000/health`

Voir le guide complet : [docs/SETUP_LIVEKIT.md](docs/SETUP_LIVEKIT.md)

---

## 📚 Documentation

- **[README-PORTABLE.md](README-PORTABLE.md)** - 🆕 **Guide déploiement portable** (zéro config)
- **[NETWORK_SETUP.md](NETWORK_SETUP.md)** - Configuration réseau multi-appareils
- **[docs/SETUP_LIVEKIT.md](docs/SETUP_LIVEKIT.md)** - Configuration LiveKit (Cloud + Local)
- **[CLAUDE.md](CLAUDE.md)** - Documentation développement complète
- **[TODO.md](TODO.md)** - Progression des phases

---

## 🎯 État du projet

- ✅ **Phase 1** : MVP fonctionnel (WebRTC + PTT)
- ✅ **Phase 2** : Fonctionnalités avancées (groupes, routing, admin)
- 🆕 **Portable** : Installation zéro-config macOS/Linux
- ⏳ **Phase 3** : Intégrations audio pro (Dante, AES67)

**Version actuelle** : 0.2.0 (Portable - production-ready)

---

## Architecture

```
AUDIO PRO                        CLIENTS MOBILES
(selon option)                   (navigateurs PWA)

Option 1 : Carte son externe ┐   ┌── 📱 Réalisateur
Option 2 : Dante (DVS/PCIe)  ├───┤── 📱 Cadreur
Option 3 : AES67 (RTP)       ┘   ├── 📱 Ingé son
                                  └── 📱 Régisseur
              ↕
        [ SERVEUR ]
        Bridge Audio
        LiveKit SFU
        API + PWA
```

---

## Fonctionnalités

### Groupes
- Un utilisateur = un groupe actif à la fois
- Un groupe = un ou plusieurs canaux audio
- Croiser deux équipes = créer un groupe dédié

### Modes de transmission
```
PTT classique   → Maintenir pour parler
Mode continu    → Toggle ON/OFF (configurable par user)
```

### Notifications
- Son + vibration (appels privés)
- Web Push via PWA
- iOS : PWA obligatoire (iOS 16.4+)

---

## Options Audio

### Option 1 — Carte son externe USB/PCIe
```
✅ Simple, multi-OS, pas de licence
✅ Idéal pour développement et petites installations
✅ Brancher → fonctionne
⚠️  Limité en canaux (8-32 selon modèle)
⚠️  Nécessite câblage physique vers la régie

Exemples : MOTU 16A, RME AIO, Focusrite Scarlett 18i20
```

### Option 2 — Dante
```
✅ Standard pro événementiel
✅ 512+ canaux sur réseau IP
✅ Latence < 1ms sur LAN dédié
⚠️  DVS : licence ~300€, support Linux non officiel
⚠️  Nécessite macOS ou Windows pour DVS
⚠️  Alternative : carte PCIe Brooklyn II (plus stable)

Implémentation : Dante Virtual Soundcard → JACK → Bridge
```

### Option 3 — AES67 (RTP multicast)
```
✅ Standard ouvert, pas de licence
✅ Compatible Linux natif
✅ Interopérable avec Dante (mode AES67)
⚠️  Configuration réseau plus complexe (PTP, multicast)
⚠️  Moins d'équipements compatibles que Dante pur

Implémentation : RTP multicast → PipeWire/JACK → Bridge
```

---

## Stack Technique

```
SERVEUR
────────────────────────────────
LiveKit Server   binaire Go, SFU WebRTC self-hosted
Bridge Audio     Node.js, cœur du système
JACK / PipeWire  abstraction audio OS (Linux/macOS)
CoreAudio        backend macOS natif
WASAPI / ASIO    backend Windows
libopus          transcodage PCM ↔ Opus
Config           YAML (groupes, routes, canaux)

CLIENT
────────────────────────────────
PWA React        interface mobile
livekit-client   SDK WebRTC
Web Push API     notifications
```

---

## Bridge Audio

```
[Source audio]  →  JACK/PipeWire/CoreAudio
                →  Jitter Buffer (cible 40ms)
                →  Encodage Opus (96kbps voix)
                →  LiveKit Room

[LiveKit Room]  →  Décodage Opus
                →  Mix si groupe multi-canaux
                →  JACK/PipeWire/CoreAudio
                →  [Sortie audio]
```

---

## Déploiement

```
PAS DE DOCKER — binaires natifs uniquement

$ git clone ...
$ ./install/linux.sh     # ou macos.sh / windows.ps1
$ node server/index.js

✅ LiveKit SFU démarré     (port 7880)
✅ Bridge audio actif
✅ Interface web servie    (port 3000)
```

```
Structure de lancement
──────────────────────
index.js
 ├── spawn livekit-server   (binaire Go téléchargé à l'install)
 ├── AudioBridge.start()    (backend détecté automatiquement)
 └── express static         (sert la PWA)
```

---

## Structure du Projet

```
project/
├── server/
│   ├── index.js              # Point d'entrée unique
│   ├── livekit-server        # Binaire (téléchargé à l'install)
│   ├── bridge/
│   │   ├── audio.js          # Détection + abstraction
│   │   ├── backends/
│   │   │   ├── jack.js
│   │   │   ├── pipewire.js
│   │   │   ├── coreaudio.js
│   │   │   └── wasapi.js
│   │   ├── livekit.js
│   │   ├── opus.js
│   │   └── jitter.js
│   ├── api/                  # Admin REST
│   └── config/
│       └── config.yaml
│
├── client/                   # PWA React
│   └── src/
│       ├── components/
│       │   ├── PTTButton.jsx
│       │   ├── GroupSelector.jsx
│       │   └── UserList.jsx
│       └── hooks/
│           ├── useLiveKit.js
│           └── usePush.js
│
└── install/
    ├── linux.sh
    ├── macos.sh
    └── windows.ps1
```

---

## Phases de Développement

```
PHASE 1 — Fondations
─────────────────────
→ LiveKit server (binaire local)
→ Bridge basique Option 1 (carte son USB)
→ PWA React : PTT, un groupe, deux clients
→ Valider latence WebRTC WiFi

PHASE 2 — Fonctionnalités
──────────────────────────
→ Groupes multiples + routing YAML
→ PTT lock + mode continu
→ Interface admin
→ Notifications push

PHASE 3 — Intégrations audio
──────────────────────────────
→ Option 2 : Dante (DVS ou PCIe)
→ Option 3 : AES67 (Linux natif)
→ Scripts install multi-OS
→ Tests charge WiFi (30+ clients)
```

---

## Points de Vigilance

```
🔴 Dante + Linux   → DVS non supporté officiellement
                     Prévoir macOS/Windows ou AES67

🔴 iOS             → PWA obligatoire pour notifications
                     À communiquer dès la connexion

🟡 JACK / Xruns   → Kernel RT recommandé en production
                     (PREEMPT_RT sur Linux)

🟡 Réseau WiFi    → AP dédié recommandé
                     QoS/DSCP sur flux audio
                     Tester avec charge réelle
```