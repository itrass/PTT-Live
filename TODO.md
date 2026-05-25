# TODO.md - Plan de développement PTT Live

**Dernière mise à jour** : 2026-05-24
**Phase actuelle** : PHASE 2 - Fonctionnalités professionnelles (En cours - Phase 2.5 Configuration audio visuelle)

---

## PHASE 1 — Fondations (MVP)

### 🎯 Objectif
Valider la faisabilité technique : 2-4 clients, PTT basique, latence < 150ms, macOS

---

### 1.1 Infrastructure projet

- [x] Structure dossiers (server/, client/, install/)
- [x] package.json serveur (Node.js, Express, LiveKit SDK)
- [x] package.json client (React, Vite, livekit-client)
- [x] Script install/macos.sh (télécharge livekit-server binaire)
- [x] Config YAML basique (1 groupe, 2 canaux)
- [x] .gitignore (node_modules, binaires, .env)

---

### 1.2 Serveur LiveKit + API

- [x] server/index.js : spawn livekit-server binaire
- [x] Configuration LiveKit (ports, clés API)
- [x] API REST : POST /token (génère token client)
- [x] API REST : GET /config (infos groupes)
- [x] Validation : LiveKit démarre (mode cloud pour Phase 1)

---

### 1.3 Bridge audio macOS

#### Backend CoreAudio
- [x] server/bridge/backends/CoreAudioBackend.js
  - [x] Énumération devices (entrée/sortie)
  - [x] Capture audio (48kHz, mono/stereo)
  - [x] Lecture audio (48kHz)
  - [x] Gestion buffer circulaire

#### Codec Opus
- [x] server/bridge/OpusCodec.js
  - [x] Encoder PCM → Opus (configurable 32-320kbps, 20ms frame)
  - [x] Decoder Opus → PCM
  - [x] Configuration bitrate (par groupe ou global)
  - [ ] Tests unitaires codec (différentes qualités)

#### Jitter Buffer
- [x] server/bridge/JitterBuffer.js
  - [x] Buffer FIFO 40ms cible
  - [x] Détection underrun/overrun
  - [x] Statistiques latence

#### Intégration LiveKit
- [x] server/bridge/LiveKitClient.js
  - [x] Connexion room en tant que participant
  - [x] Publish track audio (Opus)
  - [x] Subscribe tracks autres participants
  - [x] Gestion reconnexion

#### Classe principale
- [x] server/bridge/AudioBridge.js
  - [x] Détection backend (CoreAudio pour macOS)
  - [x] Routing : CoreAudio → Opus → LiveKit
  - [x] Routing : LiveKit → Opus → CoreAudio
  - [x] Logs détaillés (latence, drops)

---

### 1.4 Client PWA React

#### Infrastructure
- [x] client/vite.config.js (PWA plugin)
- [x] client/public/manifest.json (via Vite PWA)
- [x] client/public/sw.js (Service Worker auto-généré)
- [x] client/src/main.jsx (setup React)

#### Composants UI
- [x] client/src/App.jsx
  - [x] Layout principal
  - [x] Connexion utilisateur (nom + groupe)
  - [x] Affichage état connexion

- [x] client/src/components/PTTButton.jsx
  - [x] Bouton PTT (maintenir pour parler)
  - [x] États : idle / talking / listening
  - [x] Feedback visuel (couleurs)
  - [x] Feedback haptique (vibration)

- [x] client/src/components/UserList.jsx
  - [x] Liste participants groupe actif
  - [x] Indicateur qui parle (temps réel)

- [x] client/src/components/AudioIndicator.jsx
  - [x] Niveau audio entrant (VU-mètre simple)
  - [x] Niveau micro sortant

#### Hooks WebRTC
- [x] client/src/hooks/useLiveKit.js
  - [x] Connexion room (token serveur)
  - [x] Publish microphone
  - [x] Subscribe participants
  - [x] Gestion événements (participant join/leave)
  - [x] Cleanup disconnect

- [x] PTT intégré dans PTTButton.jsx
  - [x] Mode PTT : mute/unmute track selon bouton
  - [x] Gestion touch events (mobile)
  - [x] Gestion mouse events (desktop)
  - [x] **Fix iOS/mobile** : audio unlock, HTTPS obligatoire, proxy WSS LiveKit

#### Styles
- [x] CSS mobile-first
- [x] Design bouton PTT (large, accessible)
- [x] Mode sombre (défaut)

---

### 1.5 Tests et validation Phase 1

#### Tests unitaires
- [x] Opus encode/decode (qualité audio)
- [x] Jitter buffer (buffer size stable)
- [ ] CoreAudio device detection (naudiodon crash - à résoudre plus tard)

#### Tests d'intégration
- [x] Serveur démarre sans erreur
- [x] Client obtient token valide
- [x] Client rejoint room LiveKit

#### Tests end-to-end
- [x] **Test 1** : 2 clients, PTT alterné, audio bidirectionnel
- [ ] **Test 2** : Mesure latence (clap → réception < 150ms)
- [ ] **Test 3** : Stabilité 5min sans coupure
- [ ] **Test 4** : Reconnexion après perte WiFi

#### Métriques
- [ ] Logger latence end-to-end moyenne
- [ ] Logger jitter buffer stats
- [ ] Logger packet loss WebRTC

---

## PHASE 2 — Fonctionnalités professionnelles

### 2.1 Groupes et routing
- [x] Config YAML : multi-groupes, multi-canaux
- [x] Routing dynamique serveur (groupe → canaux audio)
- [x] Client : sélecteur groupe (dropdown)
- [x] Client : affichage canaux groupe actif

### 2.2 Modes PTT avancés
- [x] Mode continu : toggle ON/OFF (appui long 3s)
- [x] Vibration + indicateur visuel rouge (lock actif)
- [x] Préférences utilisateur (mode par défaut)

### 2.3 Interface admin
- [x] Page admin web (/admin)
- [x] Gestion groupes (CRUD)
- [x] Gestion utilisateurs connectés
- [x] Monitoring temps réel (latence, qualité)
- [x] Logs serveur (affichage live)

### 2.5 Configuration audio visuelle (PRIORITÉ)
#### Détection et sélection carte son
- [x] API GET /api/audio/devices (énumération cartes son CoreAudio/JACK)
- [x] API POST /api/audio/device (sélection + config sample rate/buffer)
- [x] Page admin : dropdown sélection carte son
- [x] Page admin : affichage infos carte (entrées/sorties, sample rate)
- [x] Backend : reload bridge audio sans redémarrer serveur

#### Nommage des canaux
- [x] API PUT /api/audio/channels/names (sauvegarde noms canaux)
- [x] API GET /api/audio/channels/names (récupération noms)
- [x] Page admin : formulaire nommage canaux (inputs/outputs)
- [x] Page admin : filtre "canaux nommés uniquement"
- [x] Sauvegarde automatique dans config.yaml

#### Matrice de routing (style Dante Controller)
- [x] API GET /api/audio/routing (récupération routing actuel)
- [x] API POST /api/audio/routing (sauvegarde routing)
- [x] Component React : AudioRoutingMatrix.jsx
  - [x] Matrice inputs → groups (checkboxes)
  - [x] Matrice groups → outputs (checkboxes)
  - [ ] Dropdowns gain par route (-12dB à +6dB) - Phase 3
  - [ ] Indicateurs niveaux temps réel (WebSocket) - Phase 3
- [ ] Backend : GroupAudioRouter.js (routing par groupe) - Phase 3
  - [ ] Mix canaux physiques multiples → groupe
  - [ ] Distribution groupe → canaux physiques multiples
  - [ ] Gestion gains individuels
  - [ ] Support canaux partagés (mixage additif)
- [x] Backend : ConfigManager.js (lecture/écriture YAML)
  - [x] Méthodes update pour device/channels/routing
  - [x] Sauvegarde atomique avec backup auto
  - [x] Émission événement config-updated
- [ ] WebSocket audio-levels (monitoring temps réel) - Phase 3
- [ ] Tests : routing multi-canaux, canaux partagés - Phase 3

### 2.4 Notifications
- [x] Web Push : appels privés (infrastructure prête)
- [x] Service Worker : gestion notifications
- [x] iOS : message onboarding "Installer sur écran d'accueil"
- [x] Permissions notification au premier lancement

---

## PHASE 3 — Intégrations audio pro

### 3.1 Support Linux
- [ ] Backend JACK (server/bridge/backends/JACKBackend.js)
- [ ] Backend PipeWire (server/bridge/backends/PipeWireBackend.js)
- [ ] Script install/linux.sh
- [ ] Tests Ubuntu 22.04 LTS + Arch Linux

### 3.2 Dante
- [ ] Documentation setup DVS macOS
- [ ] Routing JACK ↔ DVS
- [ ] Tests multi-canaux (8+)
- [ ] Guide configuration réseau Dante

### 3.3 AES67
- [ ] Backend RTP multicast (Linux)
- [ ] PTP sync
- [ ] Tests interop Dante (mode AES67)

### 3.4 Production
- [ ] Script install Windows (install/windows.ps1)
- [ ] Tests charge : 30+ clients simultanés
- [ ] Optimisation réseau (QoS, DSCP)
- [ ] Documentation déploiement complet
- [ ] Guide troubleshooting

---

## Prochaines actions immédiates

### Phase 2 - Suite (PRIORITÉS)
1. ✅ Multi-groupes avec sélection dynamique (2.1)
2. ✅ Mode PTT continu par appui long (2.2)
3. ✅ Interface admin web (/admin) pour gestion groupes (2.3)
4. 🎯 **Configuration audio visuelle (2.5)** ← PRIORITÉ ABSOLUE
   - Détection/sélection carte son via interface admin
   - Nommage canaux (inputs/outputs)
   - Matrice routing style Dante Controller
   - Sauvegarde automatique dans YAML
5. ⏭️ Préférences utilisateur pour mode PTT par défaut (2.2)
6. ⏭️ Web Push notifications pour appels privés (2.4)

### Phase 3 - Préparation
- Support Linux (JACK/PipeWire backends)
- Intégration Dante/AES67
- Tests charge 30+ clients

---

## ⚠️ RÈGLES DE DÉVELOPPEMENT

### 🔄 Workflow obligatoire
1. **Avant une tâche** : Cocher `[x]` dans ce fichier TODO.md
2. **Pendant le travail** : Développer la fonctionnalité
3. **Après la tâche** :
   - ✅ Tester que ça fonctionne
   - ✅ Valider la tâche dans TODO.md
   - ✅ **COMMIT GIT** avec message descriptif
   - ✅ Mettre à jour CLAUDE.md si nécessaire

### 📝 Convention commits
```bash
feat: description      # Nouvelle fonctionnalité
fix: description       # Correction bug
docs: description      # Documentation
refactor: description  # Refactoring
test: description      # Tests
```

**IMPORTANT** : Commiter après chaque tâche complétée, pas à la fin de la journée !

**IMPORTANT** : Interdiction d'utiliser des icônes et émojis.

---

## Notes et décisions

### Décisions techniques Phase 1
- **Audio backend** : CoreAudio natif (pas de JACK Phase 1)
- **Codec Opus** : Configurable 32-320 kbps (défaut 96kbps voix standard)
  - Voix économique : 32-64 kbps
  - Voix standard : 96 kbps (défaut)
  - Voix HD : 128-192 kbps
  - Musique : 256-320 kbps
- **Sample rate** : 48kHz, 20ms frame
- **Jitter buffer** : 40ms cible
- **Client** : PWA React (pas d'app native)

### Risques identifiés
- 🟡 Latence CoreAudio (à mesurer, cible < 50ms)
- 🟡 Permissions micro iOS (PWA)
- 🟡 Reconnexion automatique LiveKit (à tester)

### Questions résolues
- Nombre max participants par groupe Phase 1 ? → **4 clients max**
- Qualité audio configurable ? → **Oui, 32-320 kbps selon besoin**
- HTTPS requis pour PWA local ? → **Oui, self-signed cert dev**

---

**Statut** : Phase 1 prête à démarrer
**Prochaine étape** : Infrastructure projet (1.1)
