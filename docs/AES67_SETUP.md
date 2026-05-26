# Configuration AES67 avec PTT Live

Guide pour intégrer PTT Live avec des équipements AES67 (alternative open source à Dante)

## Vue d'ensemble

AES67 est un standard ouvert pour le transport audio sur IP (IEEE 1722, IETF RTP). Il est interopérable avec Dante (mode AES67), Ravenna, Livewire, et d'autres protocoles audio-over-IP.

### Avantages vs Dante Virtual Soundcard

| Caractéristique | AES67 | Dante (DVS) |
|----------------|-------|-------------|
| **Coût** | Gratuit | ~300€/licence |
| **Ouverture** | Standard ouvert | Propriétaire Audinate |
| **Complexité** | Configuration CLI | GUI simple |
| **Interopérabilité** | Multi-vendor | Dante + AES67 mode |
| **PTP sync** | Requis | Optionnel |

### Architecture

```
[Équipements AES67] ←→ [RTP Multicast] ←→ [ALSA/JACK] ←→ [PTT Live]
           ↓
      [PTP Clock Sync]
```

---

## Prérequis

### Matériel
- Interface réseau Ethernet Gigabit (obligatoire)
- Switch manageable avec support :
  - IGMP snooping
  - PTP (Precision Time Protocol)
  - QoS/DSCP
  - Jumbo frames (recommandé)

### Système d'exploitation
- **Linux recommandé** : Ubuntu 22.04+, Debian 11+, Arch Linux
- macOS possible (via outils tiers)
- Windows non supporté nativement

### Logiciels
- **PTPd** ou **linuxptp** : synchronisation horloge PTP
- **JACK Audio** : routing audio
- **Merging ALSA RAVENNA/AES67 Driver** (optionnel mais recommandé)
  - https://www.merging.com/products/ravenna/alsa_driver

---

## Installation (Linux)

### 1. Installation des dépendances

#### Ubuntu/Debian

```bash
# Outils réseau et audio
sudo apt update
sudo apt install -y \
    build-essential \
    git \
    jackd2 \
    jack-tools \
    qjackctl \
    linuxptp \
    ptp4l \
    phc2sys \
    ethtool \
    net-tools

# ALSA dev (si compilation driver Merging)
sudo apt install -y \
    libasound2-dev \
    linux-headers-$(uname -r)
```

#### Arch Linux

```bash
sudo pacman -S --needed \
    jack2 \
    qjackctl \
    linuxptp \
    ethtool \
    alsa-lib
```

### 2. Installation Merging ALSA RAVENNA/AES67 Driver

Ce driver crée une carte ALSA virtuelle qui envoie/reçoit des flux AES67 RTP.

#### Téléchargement

```bash
cd /tmp
wget https://www.merging.com/ravenna/ALSA_RAVENNA_1.2.9.tar.gz
tar -xzf ALSA_RAVENNA_1.2.9.tar.gz
cd ALSA_RAVENNA
```

#### Compilation et installation

```bash
# Compilation
make

# Installation
sudo make install

# Chargement du module kernel
sudo modprobe MergingRAVENNA

# Vérification
lsmod | grep Merging
```

#### Configuration persistante

```bash
# Charger le module au démarrage
echo "MergingRAVENNA" | sudo tee -a /etc/modules-load.d/ravenna.conf

# Reboot pour tester
sudo reboot
```

---

## Configuration Réseau

### 1. Configuration interface réseau

AES67 nécessite une configuration réseau spécifique.

#### Trouver l'interface réseau

```bash
ip link show
# Exemple : eth0, enp3s0, etc.
```

#### Configuration IP statique

Éditer `/etc/network/interfaces` (Debian) ou `/etc/netplan/01-netcfg.yaml` (Ubuntu) :

**Netplan (Ubuntu 22.04+)** :

```yaml
network:
  version: 2
  ethernets:
    enp3s0:  # Votre interface
      dhcp4: no
      addresses:
        - 192.168.10.100/24  # IP statique dans VLAN audio
      mtu: 9000              # Jumbo frames
```

Appliquer :

```bash
sudo netplan apply
```

**Interfaces (Debian)** :

```
auto eth0
iface eth0 inet static
    address 192.168.10.100
    netmask 255.255.255.0
    mtu 9000
```

Appliquer :

```bash
sudo systemctl restart networking
```

#### Optimisations noyau

Éditer `/etc/sysctl.conf` :

```bash
# Buffers réseau pour audio temps réel
net.core.rmem_max = 134217728
net.core.wmem_max = 134217728
net.core.rmem_default = 16777216
net.core.wmem_default = 16777216

# Multicast
net.ipv4.igmp_max_memberships = 512
```

Appliquer :

```bash
sudo sysctl -p
```

### 2. Configuration Switch

Paramètres switch requis :

| Paramètre | Valeur |
|-----------|--------|
| **VLAN** | 10 (exemple, dédié audio) |
| **IGMP Snooping** | Activé |
| **PTP** | Activé sur tous les ports |
| **QoS/DSCP** | EF (46) pour audio, CS7 (56) pour PTP |
| **Jumbo Frames** | MTU 9000 |
| **Flow Control** | Désactivé |

---

## Configuration PTP (Precision Time Protocol)

AES67 requiert une synchronisation horloge précise (±1µs).

### 1. Configuration ptp4l

Créer `/etc/ptp4l.conf` :

```ini
[global]
dataset_comparison = ieee1588
priority1 = 128
priority2 = 128
domainNumber = 0
slaveOnly 1
two_step 1

# Configuration réseau
network_transport UDPv4
delay_mechanism E2E

# Timers
logAnnounceInterval 0
logSyncInterval -3
logMinDelayReqInterval -3

# Interface réseau (adapter selon votre système)
[enp3s0]
```

### 2. Démarrage PTP

#### Test manuel

```bash
# Lancer ptp4l en mode slave (synchronisé par master du réseau)
sudo ptp4l -i enp3s0 -f /etc/ptp4l.conf -m

# Dans un autre terminal : synchroniser l'horloge système
sudo phc2sys -s enp3s0 -w -m
```

Vous devriez voir :

```
ptp4l[...]: master offset     -2 s2 freq  -15432 path delay       125
phc2sys[...]: enp3s0 sys offset      -4 s2 freq  -12345 delay   1256
```

L'offset doit être < 1000 ns (1µs).

#### Service systemd

Créer `/etc/systemd/system/ptp4l.service` :

```ini
[Unit]
Description=PTP Daemon
After=network.target

[Service]
Type=simple
ExecStart=/usr/sbin/ptp4l -i enp3s0 -f /etc/ptp4l.conf -m
Restart=always

[Install]
WantedBy=multi-user.target
```

Créer `/etc/systemd/system/phc2sys.service` :

```ini
[Unit]
Description=PHC to System Clock Sync
After=ptp4l.service
Requires=ptp4l.service

[Service]
Type=simple
ExecStart=/usr/sbin/phc2sys -s enp3s0 -w -m
Restart=always

[Install]
WantedBy=multi-user.target
```

Activer :

```bash
sudo systemctl daemon-reload
sudo systemctl enable ptp4l phc2sys
sudo systemctl start ptp4l phc2sys
```

Vérifier :

```bash
sudo systemctl status ptp4l
sudo systemctl status phc2sys
```

---

## Configuration JACK + AES67

### 1. Démarrage JACK avec carte ALSA RAVENNA

```bash
# Lister les cartes ALSA
aplay -l

# Devrait afficher quelque chose comme :
# card 2: RAVENNA [Merging RAVENNA], device 0: ...
```

Démarrer JACK avec la carte RAVENNA :

```bash
jackd -d alsa \
    -d hw:RAVENNA \
    -r 48000 \
    -p 256 \
    -n 2 \
    -S \
    -P
```

Paramètres :
- `-d hw:RAVENNA` : carte ALSA RAVENNA
- `-r 48000` : sample rate AES67 standard
- `-p 256` : buffer size (5.3ms @ 48kHz)
- `-n 2` : 2 périodes
- `-S` : soft mode (moins de xruns)
- `-P` : playback + capture

### 2. Configuration QjackCtl (GUI alternative)

1. Lancer `qjackctl`
2. Setup :
   - **Driver** : alsa
   - **Interface** : hw:RAVENNA
   - **Sample Rate** : 48000
   - **Frames/Period** : 256
   - **Periods/Buffer** : 2
3. Start

### 3. Configuration des flux AES67

Le driver Merging RAVENNA se configure via des fichiers JSON.

#### Configuration RTP streams

Créer `/etc/ravenna/streams.json` :

```json
{
  "sources": [
    {
      "name": "Input_1",
      "sdp": "239.69.1.1:5004",
      "channels": 2,
      "payloadType": 98,
      "sampleRate": 48000
    },
    {
      "name": "Input_2",
      "sdp": "239.69.1.2:5004",
      "channels": 2,
      "payloadType": 98,
      "sampleRate": 48000
    }
  ],
  "sinks": [
    {
      "name": "Output_1",
      "sdp": "239.69.2.1:5004",
      "channels": 2,
      "payloadType": 98,
      "sampleRate": 48000
    }
  ]
}
```

Charger la configuration :

```bash
# Via l'outil Merging (si disponible)
ravenna-daemon -c /etc/ravenna/streams.json
```

---

## Intégration PTT Live

### 1. Démarrer PTT Live

PTT Live détectera automatiquement JACK :

```bash
cd /chemin/vers/PTT\ Live/server
npm start
```

Logs attendus :

```
✓ Backend audio : JACK (Linux professionnel)
📻 Devices audio détectés : 2
  - JACK System Capture (in:8, out:0)
  - JACK System Playback (in:0, out:8)
```

### 2. Routing JACK

Connecter les ports JACK :

```bash
# Liste des ports
jack_lsp

# Exemple de ports disponibles :
# RAVENNA:capture_1
# RAVENNA:capture_2
# RAVENNA:playback_1
# RAVENNA:playback_2
# PTTLive:input_1
# PTTLive:output_1

# Connexion
jack_connect "RAVENNA:capture_1" "PTTLive:input_1"
jack_connect "PTTLive:output_1" "RAVENNA:playback_1"
```

#### Script automatique

Créer `server/scripts/connect-aes67.sh` :

```bash
#!/bin/bash
# Connexion automatique JACK ↔ AES67

echo "Connexion des canaux AES67 → PTT Live..."

for i in {1..8}; do
  jack_connect "RAVENNA:capture_$i" "PTTLive:input_$i" 2>/dev/null
  jack_connect "PTTLive:output_$i" "RAVENNA:playback_$i" 2>/dev/null
done

echo "✓ Routing JACK configuré"
```

```bash
chmod +x server/scripts/connect-aes67.sh
./server/scripts/connect-aes67.sh
```

---

## Monitoring et Diagnostics

### Vérification PTP

```bash
# Status PTP
sudo systemctl status ptp4l

# Offset temps réel (doit être < 1µs)
sudo ptp4l -i enp3s0 -f /etc/ptp4l.conf -m | grep "master offset"
```

### Vérification multicast

```bash
# Afficher les groupes multicast rejoints
netstat -g

# Capture trafic RTP AES67 (exemple)
sudo tcpdump -i enp3s0 -n 'multicast and udp port 5004'
```

### Vérification JACK

```bash
# Statistiques JACK
jack_samplerate  # 48000
jack_bufsize     # 256

# Xruns (buffer underruns)
jack_evmon  # Surveille les xruns en temps réel
```

### Logs driver RAVENNA

```bash
# Kernel messages
sudo dmesg | grep -i ravenna

# Logs système
sudo journalctl -u ravenna-daemon -f
```

---

## Interopérabilité Dante ↔ AES67

Les équipements Dante peuvent basculer en mode AES67 pour communiquer avec des devices AES67 natifs.

### Activation AES67 sur Dante

1. Ouvrir **Dante Controller**
2. Device → sélectionner équipement Dante
3. Device Config → AES67 Config
4. Cocher "Enable AES67"
5. Configurer :
   - **Sample Rate** : 48kHz
   - **Encoding** : L24 (24-bit)
   - **Packet Time** : 1ms
6. Reboot device

### SDP (Session Description Protocol)

AES67 utilise des fichiers SDP pour annoncer les flux.

**Exemple SDP pour un flux stéréo** :

```
v=0
o=- 123456 1 IN IP4 192.168.10.50
s=PTT Live Output
c=IN IP4 239.69.2.1/32
t=0 0
m=audio 5004 RTP/AVP 98
a=rtpmap:98 L24/48000/2
a=ptime:1
a=sync-time:0
```

Sauvegarder dans `/etc/ravenna/pttlive-output.sdp` et référencer dans la config du driver.

---

## Optimisation Performance

### Latence typique

| Étape | Latence |
|-------|---------|
| Réseau RTP | 1-5 ms (selon packet time) |
| Driver ALSA RAVENNA | 2-5 ms |
| JACK | 5-10 ms (256 samples @ 48kHz) |
| PTT Live bridge | 20-40 ms |
| WebRTC client | 30-100 ms |
| **TOTAL** | **58-160 ms** |

### Réduction latence

1. **Packet time** : 0.125ms ou 0.25ms (au lieu de 1ms)
2. **JACK buffer** : 128 samples (2.7ms au lieu de 5.3ms)
3. **PTT Live jitter buffer** : preset "ULTRA_LOW"

Configuration JACK basse latence :

```bash
jackd -R -P 70 -d alsa -d hw:RAVENNA -r 48000 -p 128 -n 3
```

- `-R` : mode real-time
- `-P 70` : priorité real-time (nécessite config `/etc/security/limits.conf`)

**Attention** : Risque de xruns si CPU/réseau surchargé.

### Configuration real-time Linux

Éditer `/etc/security/limits.conf` :

```
@audio   -  rtprio     95
@audio   -  memlock    unlimited
```

Ajouter votre utilisateur au groupe audio :

```bash
sudo usermod -a -G audio $USER
```

Reboot requis.

---

## Troubleshooting

### Pas de son

**Vérifications** :
1. PTP synchronisé : `sudo ptp4l -i enp3s0 -f /etc/ptp4l.conf -m` (offset < 1µs)
2. Driver RAVENNA chargé : `lsmod | grep Merging`
3. JACK voit la carte : `jack_lsp | grep RAVENNA`
4. Ports connectés : `jack_lsp -c`
5. Flux RTP visibles : `sudo tcpdump -i enp3s0 -n multicast`

### Xruns JACK

**Causes** :
- Buffer trop petit
- CPU overload
- IRQ conflicts

**Solutions** :
- Augmenter buffer JACK : `-p 512` au lieu de 256
- Désactiver CPU frequency scaling :
  ```bash
  sudo cpupower frequency-set -g performance
  ```
- Isoler CPU cores pour audio (kernel parameter `isolcpus`)

### Offset PTP trop élevé

**Causes** :
- Pas de PTP master sur le réseau
- Switch ne supporte pas PTP

**Solutions** :
- Configurer un device comme PTP master (grandmaster)
- Vérifier config switch (PTP enabled sur tous les ports)
- Utiliser un PTP hardware clock (si carte réseau compatible)

---

## Coût Total

| Élément | Prix |
|---------|------|
| **Switch PTP** | 200-2000€ (selon modèle) |
| **Merging ALSA RAVENNA Driver** | Gratuit |
| **Logiciels Linux** | Gratuit |
| **PTT Live** | Gratuit |
| **TOTAL** | **200-2000€** |

Bien moins cher que Dante DVS (300€/licence) si plusieurs postes.

---

## Alternatives sans RAVENNA Driver

### Utilisation de daemon RTP natif

Si le driver Merging n'est pas disponible, utiliser **trx** ou **rtptools** :

```bash
# Installation trx
git clone https://github.com/x42/trx.git
cd trx
make
sudo make install

# Réception flux RTP
trx --recv 239.69.1.1 5004 -j output_1

# Émission flux RTP
trx --send 239.69.2.1 5004 -j input_1
```

---

## Ressources

- **AES67 Standard** : http://www.aes.org/publications/standards/search.cfm?docID=96
- **Merging RAVENNA** : https://www.merging.com/products/ravenna
- **Linux Audio** : https://wiki.linuxaudio.org/
- **PTP Configuration** : http://linuxptp.sourceforge.net/

---

**Dernière mise à jour** : 2026-05-26
**Version PTT Live** : 0.1.0 (Phase 3)
