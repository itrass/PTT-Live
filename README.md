# Résumé Projet - Intercom WebRTC Événementiel

## Concept

Système d'intercom professionnel pour techniciens événementiels. Les utilisateurs communiquent via leur smartphone (navigateur web / PWA) en WiFi. Le serveur fait le pont avec l'installation audio professionnelle existante.

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