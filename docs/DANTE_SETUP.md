# Configuration Dante avec PTT Live

Guide pour intégrer PTT Live avec des équipements Dante (Audinate)

## Vue d'ensemble

Dante (Digital Audio Network Through Ethernet) est un protocole audio professionnel sur IP largement utilisé dans l'événementiel et le broadcast. PTT Live peut s'interfacer avec des équipements Dante via JACK Audio Connection Kit.

### Architecture

```
[Équipements Dante] ←→ [Dante Virtual Soundcard (DVS)] ←→ [JACK] ←→ [PTT Live]
```

---

## Prérequis

### Matériel
- Mac ou PC avec interface réseau Ethernet (Gigabit recommandé)
- Équipements Dante (console, preamps, etc.)
- Switch réseau dédié (VLAN audio recommandé)

### Logiciel
- **Dante Virtual Soundcard** (~300€ licence personnelle)
  - macOS 10.14+ ou Windows 10+
  - Téléchargement : https://www.audinate.com/products/software/dante-virtual-soundcard
- **Dante Controller** (gratuit)
  - Configuration et routing Dante
  - Téléchargement : https://www.audinate.com/products/software/dante-controller
- **JACK Audio Connection Kit**
  - macOS : `brew install jack` ou via JackPilot
  - Linux : voir [install/linux.sh](../install/linux.sh)
  - Windows : https://jackaudio.org/downloads/

---

## Installation

### 1. Installation Dante Virtual Soundcard (DVS)

1. Acheter et télécharger DVS depuis le site Audinate
2. Installer le package (.dmg sur macOS, .exe sur Windows)
3. Redémarrer l'ordinateur
4. Lancer DVS :
   - **macOS** : `/Applications/Dante Virtual Soundcard.app`
   - **Windows** : Menu Démarrer > Dante Virtual Soundcard

### 2. Configuration DVS

#### Paramètres recommandés pour PTT Live

| Paramètre | Valeur | Description |
|-----------|--------|-------------|
| **Latency** | 5-10 ms | Latence réseau (plus bas = moins de buffer) |
| **Sample Rate** | 48 kHz | Standard audio pro (requis par PTT Live) |
| **Encoding** | PCM 24-bit | Qualité maximale |
| **Channels** | 8-32 | Selon besoins (min 2 pour stéréo) |

**Configuration** :
1. Ouvrir Dante Virtual Soundcard
2. Onglet "Settings"
3. Définir les paramètres ci-dessus
4. Cliquer "Start" pour activer la carte virtuelle

### 3. Installation JACK

#### macOS
```bash
# Via Homebrew
brew install jack

# Ou télécharger JackPilot :
# http://www.jackosx.com/
```

#### Linux
```bash
# Ubuntu/Debian
sudo apt install jackd2 jack-tools qjackctl

# Arch Linux
sudo pacman -S jack2 qjackctl
```

#### Windows
Télécharger depuis https://jackaudio.org/downloads/ et installer.

### 4. Configuration JACK

#### Paramètres recommandés

| Paramètre | Valeur |
|-----------|--------|
| **Sample Rate** | 48000 Hz |
| **Buffer Size** | 256-512 samples (5-10ms) |
| **Periods** | 2-3 |

#### Via QjackCtl (GUI)

1. Lancer QjackCtl
2. Cliquer "Setup"
3. Configurer :
   - **Driver** : CoreAudio (macOS), ALSA (Linux), PortAudio (Windows)
   - **Sample Rate** : 48000
   - **Frames/Period** : 256 ou 512
4. Cliquer "OK" puis "Start"

#### Via ligne de commande (macOS)

```bash
jackd -d coreaudio -r 48000 -p 512
```

#### Via ligne de commande (Linux)

```bash
jackd -d alsa -r 48000 -p 512
```

---

## Routing Audio

### 1. Dante Controller - Configuration réseau

1. Lancer Dante Controller
2. Vérifier que DVS apparaît dans la liste des devices (ex: "MacBook-DVS")
3. Configurer le routing Dante :
   - **Sources** : équipements physiques (colonnes)
   - **Destinations** : DVS (lignes)
   - Cocher les cases pour router les canaux

**Exemple** :
- Console Dante (8 canaux) → DVS Input 1-8
- DVS Output 1-8 → Console Dante (8 canaux)

### 2. JACK - Connexion DVS ↔ PTT Live

#### Via QjackCtl (GUI)

1. Lancer PTT Live (voir ci-dessous)
2. Dans QjackCtl, cliquer "Graph" ou "Connections"
3. Connecter les ports :
   - **Capture** : `DVS:capture_1` → `PTTLive:input_1`
   - **Playback** : `PTTLive:output_1` → `DVS:playback_1`

#### Via jack_connect (CLI)

```bash
# Liste des ports disponibles
jack_lsp

# Connexion entrée Dante → PTT Live
jack_connect "DVS:capture_1" "PTTLive:input_1"
jack_connect "DVS:capture_2" "PTTLive:input_2"

# Connexion sortie PTT Live → Dante
jack_connect "PTTLive:output_1" "DVS:playback_1"
jack_connect "PTTLive:output_2" "DVS:playback_2"
```

---

## Démarrage PTT Live avec Dante

### 1. Ordre de démarrage recommandé

```
1. Démarrer le serveur JACK
2. Lancer Dante Virtual Soundcard
3. Configurer le routing dans Dante Controller
4. Démarrer le serveur PTT Live
5. Connecter les ports JACK (DVS ↔ PTT Live)
```

### 2. Lancer PTT Live

```bash
cd server
npm start
```

PTT Live détectera automatiquement JACK comme backend audio (sur Linux/macOS avec JACK actif).

### 3. Vérification

Dans les logs du serveur PTT Live, vous devriez voir :

```
✓ Backend audio : JACK (Linux professionnel)
📻 Devices audio détectés : X
  - JACK System Capture (in:8, out:0)
  - JACK System Playback (in:0, out:8)
```

---

## Configuration Multi-canaux

### Exemple : 8 canaux Dante ↔ 8 groupes PTT Live

#### 1. Configuration réseau Dante

Dans Dante Controller :
- Console OUT 1-8 → DVS Input 1-8
- DVS Output 1-8 → Console IN 1-8

#### 2. Configuration PTT Live

Éditer [server/config/config.yaml](../server/config/config.yaml) :

```yaml
audio:
  backend: jack
  sampleRate: 48000
  channels: 8
  routing:
    inputs:
      - name: "Canal 1 - Régie"
        jackPort: "DVS:capture_1"
        groups: ["regie"]
      - name: "Canal 2 - Scene"
        jackPort: "DVS:capture_2"
        groups: ["scene"]
      # ... etc
    outputs:
      - name: "Retour Régie"
        jackPort: "DVS:playback_1"
        groups: ["regie"]
      - name: "Retour Scene"
        jackPort: "DVS:playback_2"
        groups: ["scene"]
      # ... etc

groups:
  - id: regie
    name: "Régie"
    inputChannels: [0]
    outputChannels: [0]

  - id: scene
    name: "Scène"
    inputChannels: [1]
    outputChannels: [1]

  # ... autres groupes
```

#### 3. Routing JACK automatique

Créer un script [server/scripts/connect-dante.sh](../server/scripts/connect-dante.sh) :

```bash
#!/bin/bash
# Connexion automatique JACK ↔ Dante

echo "Connexion des canaux Dante → PTT Live..."

for i in {1..8}; do
  jack_connect "DVS:capture_$i" "PTTLive:input_$i"
  jack_connect "PTTLive:output_$i" "DVS:playback_$i"
done

echo "✓ Routing JACK configuré"
```

```bash
chmod +x server/scripts/connect-dante.sh
./server/scripts/connect-dante.sh
```

---

## Monitoring et Troubleshooting

### Vérification du statut JACK

```bash
# Ports disponibles
jack_lsp

# Ports DVS (exemple)
DVS:capture_1
DVS:capture_2
DVS:playback_1
DVS:playback_2

# Connexions actives
jack_lsp -c

# Stats serveur JACK
jack_samplerate  # Devrait afficher 48000
jack_bufsize     # Devrait afficher 256 ou 512
```

### Problèmes courants

#### DVS ne s'affiche pas dans Dante Controller

**Cause** : Firewall ou réseau incorrect

**Solution** :
1. Vérifier que DVS est "Started" dans l'application
2. Désactiver temporairement le firewall
3. Vérifier que l'interface réseau est en Gigabit
4. Brancher sur le même switch que les équipements Dante

#### Latence élevée ou craquements audio

**Cause** : Buffer JACK trop petit ou latence Dante trop faible

**Solution** :
1. Augmenter le buffer JACK : 512 ou 1024 samples
2. Augmenter la latence DVS : 10ms au lieu de 5ms
3. Vérifier le trafic réseau (pas de flood broadcast)

#### Pas de son entre PTT Live et Dante

**Cause** : Ports JACK non connectés

**Solution** :
```bash
# Vérifier les connexions
jack_lsp -c

# Reconnecter manuellement
jack_connect "DVS:capture_1" "PTTLive:input_1"
jack_connect "PTTLive:output_1" "DVS:playback_1"
```

#### PTT Live ne détecte pas JACK

**Cause** : Serveur JACK non démarré avant PTT Live

**Solution** :
1. Arrêter PTT Live
2. Vérifier que JACK tourne : `jack_lsp` (ne doit pas donner d'erreur)
3. Relancer PTT Live

---

## Configuration Réseau Recommandée

### VLAN Audio (optionnel mais recommandé)

Pour isoler le trafic Dante du reste du réseau :

| Paramètre | Valeur |
|-----------|--------|
| **VLAN ID** | 10 (exemple) |
| **Subnet** | 192.168.10.0/24 |
| **QoS/DSCP** | EF (Expedited Forwarding) |
| **IGMP Snooping** | Activé |
| **Jumbo Frames** | Activé (MTU 9000) |

### Switch manageable

Fonctionnalités requises :
- VLAN tagging
- QoS/DSCP
- IGMP snooping
- Gigabit Ethernet (min)

Modèles testés :
- Netgear M4300 series
- Cisco SG350/SG550
- Ubiquiti EdgeSwitch

---

## Latence End-to-End

### Budget latence typique

| Étape | Latence |
|-------|---------|
| Dante network | 5-10 ms |
| DVS | 2-5 ms |
| JACK | 5-10 ms (256 samples @ 48kHz) |
| PTT Live bridge | 20-40 ms (jitter buffer) |
| WebRTC client | 30-100 ms |
| **TOTAL** | **62-165 ms** |

Objectif : < 150ms end-to-end (validé en Phase 1)

### Optimisation

Pour réduire la latence :
1. Dante latency : 2-5ms (au lieu de 10ms)
2. JACK buffer : 128 samples (au lieu de 512)
3. PTT Live jitter buffer : preset "ULTRA_LOW" (20ms au lieu de 40ms)

**Attention** : Latence trop faible = risque de craquements audio si réseau/CPU chargé.

---

## Coût et Licences

| Élément | Prix | Licence |
|---------|------|---------|
| **Dante Virtual Soundcard** | ~300€ | Par poste (licence personnelle) |
| **Dante Controller** | Gratuit | - |
| **JACK** | Gratuit | Open Source (GPL) |
| **PTT Live** | Gratuit | Open Source |

**Note** : Pour un déploiement multi-postes, chaque ordinateur exécutant DVS nécessite sa propre licence.

---

## Alternatives

### AES67 (sans Dante Virtual Soundcard)

Si le budget DVS est un problème, voir [AES67_SETUP.md](./AES67_SETUP.md) pour utiliser le protocole AES67 natif (interopérable avec Dante).

**Avantages** :
- Gratuit (pas de licence DVS)
- Standard ouvert

**Inconvénients** :
- Configuration plus complexe
- Support PTP sync requis
- Moins de GUI (configuration CLI)

---

## Support et Ressources

- **Dante Academy** : https://www.audinate.com/learning/training-certification/dante-certification-program
- **JACK Documentation** : https://jackaudio.org/faq/
- **PTT Live Issues** : https://github.com/username/ptt-live/issues

---

**Dernière mise à jour** : 2026-05-26
**Version PTT Live** : 0.1.0 (Phase 3)
