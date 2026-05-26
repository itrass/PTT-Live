# Guide de Déploiement Production - PTT Live

Guide complet pour déployer PTT Live en environnement professionnel événementiel.

## Vue d'ensemble

Ce guide couvre le déploiement de PTT Live pour une utilisation en production avec :
- 30+ clients simultanés
- Réseau WiFi dédié
- Cartes son multi-canaux / Dante / AES67
- Optimisations performance et latence
- Monitoring et troubleshooting

---

## Architecture Production Recommandée

```
                           ┌─────────────────┐
                           │  Switch Core    │
                           │  (Manageable)   │
                           └────────┬────────┘
                                    │
              ┌─────────────────────┼─────────────────────┐
              │                     │                     │
     ┌────────▼────────┐   ┌───────▼────────┐   ┌───────▼────────┐
     │  VLAN 10 AUDIO  │   │  VLAN 20 WIFI  │   │  VLAN 30 MGMT  │
     │  (Dante/AES67)  │   │  (Clients PTT) │   │  (Admin/Logs)  │
     └────────┬────────┘   └───────┬────────┘   └───────┬────────┘
              │                    │                     │
     ┌────────▼────────┐   ┌───────▼────────┐   ┌───────▼────────┐
     │  Equipements    │   │  Access Points │   │  Laptop Admin  │
     │  Audio Pro      │   │  WiFi 5/6      │   │  (Monitoring)  │
     │  (Console, etc) │   │  (5GHz)        │   │                │
     └─────────────────┘   └────────────────┘   └────────────────┘
                                    │
                           ┌────────▼────────┐
                           │  Serveur PTT    │
                           │  Live           │
                           │  - LiveKit      │
                           │  - AudioBridge  │
                           │  - API/Admin    │
                           └─────────────────┘
```

---

## Prérequis Matériel

### Serveur PTT Live

**Spécifications minimales** (30 clients) :

| Composant | Minimum | Recommandé |
|-----------|---------|------------|
| **CPU** | 4 cores, 2.5GHz | 8 cores, 3.0GHz+ |
| **RAM** | 8 GB | 16 GB+ |
| **Réseau** | 1 Gbps Ethernet | 10 Gbps ou dual 1Gbps (bonding) |
| **Stockage** | 50 GB SSD | 100 GB NVMe SSD |
| **OS** | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS Server |
| **Audio** | Carte son 8+ canaux | Interface Dante/AES67 |

**Exemples configurations** :
- **Budget** : Mac Mini M1 (2020) - 8GB RAM, 256GB SSD
- **Standard** : Intel NUC i7 - 16GB RAM, 512GB SSD
- **Pro** : Dell R240 Server - Xeon E-2224, 32GB ECC, RAID SSD

### Réseau

#### Switch Core

**Requis** :
- Manageable (VLAN, QoS, IGMP)
- Gigabit minimum (10G recommandé pour Dante/AES67)
- PTP support (si AES67)
- Backplane suffisant (480 Gbps+)
- Redondance alimentation (si critique)

**Modèles testés** :
- Netgear M4300-8X8F (8x 10G + 8x 1G)
- Cisco SG350-28P
- Ubiquiti EdgeSwitch 24

#### Access Points WiFi

**Spécifications** :

| Paramètre | Valeur |
|-----------|--------|
| **Standard** | WiFi 5 (802.11ac) minimum, WiFi 6 (ax) recommandé |
| **Bande** | 5 GHz dédiée (moins de congestion) |
| **Canaux** | 40 MHz ou 80 MHz |
| **Débit** | 867 Mbps+ par client |
| **Clients** | 30+ par AP (répartir si plus) |
| **Roaming** | 802.11r/k/v (fast roaming) |

**Modèles recommandés** :
- Ubiquiti UniFi 6 LR / PRO
- Aruba AP-515 / AP-555
- Cisco Meraki MR46 / MR56

**Déploiement** :
- 1 AP pour 10-15 clients actifs simultanés
- Positionnement stratégique (hauteur, line-of-sight)
- Survey WiFi préalable (éviter interférences)

### Cartes Son / Interfaces Audio

**Options** :

1. **Carte son USB/Thunderbolt multi-canaux**
   - MOTU UltraLite mk5 (18x22, USB-C)
   - RME Fireface UCX II (40 canaux, USB 2.0/3.0)
   - Focusrite Clarett 8PreX (26x28, Thunderbolt)

2. **Interface Dante**
   - Focusrite RedNet PCIe (32+ canaux)
   - Audinate AVIO Adapter
   - Console avec Dante intégré

3. **AES67 natif**
   - Merging RAVENNA/AES67 (Linux ALSA driver)
   - Lawo mc² Console
   - Calrec Artemis/Apollo

---

## Installation Production

### 1. Préparation Serveur

#### Ubuntu Server 22.04 LTS

```bash
# Mise à jour système
sudo apt update && sudo apt upgrade -y

# Installation dépendances
sudo apt install -y \
    build-essential \
    git \
    curl \
    htop \
    net-tools \
    ethtool \
    iftop \
    iperf3

# Désactiver économie énergie CPU
sudo apt install linux-tools-common linux-tools-generic
sudo cpupower frequency-set -g performance

# Config persistence
echo "performance" | sudo tee /sys/devices/system/cpu/cpu*/cpufreq/scaling_governor
```

#### Optimisations réseau

Éditer `/etc/sysctl.conf` :

```bash
# Buffers réseau
net.core.rmem_max = 134217728
net.core.wmem_max = 134217728
net.core.rmem_default = 16777216
net.core.wmem_default = 16777216

# TCP
net.ipv4.tcp_rmem = 4096 87380 134217728
net.ipv4.tcp_wmem = 4096 65536 134217728
net.ipv4.tcp_congestion_control = bbr

# Multicast
net.ipv4.igmp_max_memberships = 512

# Connections tracking
net.netfilter.nf_conntrack_max = 1000000
net.netfilter.nf_conntrack_tcp_timeout_established = 7200
```

Appliquer :

```bash
sudo sysctl -p
```

#### Firewall

```bash
# UFW (Ubuntu Firewall)
sudo ufw allow 22/tcp          # SSH
sudo ufw allow 3000/tcp        # API PTT Live
sudo ufw allow 5173/tcp        # Client Vite (dev)
sudo ufw allow 7880/tcp        # LiveKit WebSocket
sudo ufw allow 7881/tcp        # LiveKit TURN
sudo ufw allow 50000:60000/udp # LiveKit RTC
sudo ufw enable
```

### 2. Installation PTT Live

```bash
# Clone du repo
cd /opt
sudo git clone https://github.com/votre-user/PTT-Live.git
sudo chown -R $USER:$USER PTT-Live
cd PTT-Live

# Installation selon OS
./install/linux.sh  # Linux
# ou
./install/macos.sh  # macOS
```

### 3. Configuration Audio

#### Option A : Carte son USB (CoreAudio/ALSA)

```bash
# Lister les cartes
aplay -l  # Linux
system_profiler SPAudioDataType  # macOS

# Éditer config PTT Live
nano server/config/config.yaml
```

```yaml
audio:
  backend: auto  # coreaudio (macOS) ou pipewire/jack (Linux)
  sampleRate: 48000
  channels: 8
  inputDeviceId: 0   # ID de la carte (voir logs au démarrage)
  outputDeviceId: 0
```

#### Option B : Dante (via JACK)

Voir [DANTE_SETUP.md](./DANTE_SETUP.md)

#### Option C : AES67 (Linux)

Voir [AES67_SETUP.md](./AES67_SETUP.md)

### 4. Configuration LiveKit

Éditer `server/config/livekit.yaml` :

```yaml
port: 7880
bind_addresses:
  - 0.0.0.0  # Écoute sur toutes les interfaces

rtc:
  port_range_start: 50000
  port_range_end: 60000
  use_external_ip: false  # true si NAT
  # external_ip: "votre.ip.publique"  # Si use_external_ip: true

turn:
  enabled: true
  domain: ""
  tls_port: 5349
  udp_port: 3478

keys:
  # IMPORTANT : Générer des clés uniques en production !
  # Ne PAS utiliser les clés de développement
  api_key: "APIxxxxxxxxxxxxxxxx"  # Générer avec : openssl rand -base64 32
  api_secret: "SECRETxxxxxxxxxxxxxxxx"

logging:
  level: info  # debug, info, warn, error
  sample: true
```

**Générer des clés sécurisées** :

```bash
# API Key
echo "API_KEY=$(openssl rand -base64 24)" | tee -a server/.env

# API Secret
echo "API_SECRET=$(openssl rand -base64 48)" | tee -a server/.env
```

### 5. Configuration Groupes et Routing

Éditer `server/config/config.yaml` :

```yaml
groups:
  - id: regie
    name: "Régie"
    inputChannels: [0, 1]    # Canaux audio physiques (carte son)
    outputChannels: [0, 1]
    opusBitrate: 96000       # 96 kbps (voix standard)

  - id: scene
    name: "Scène"
    inputChannels: [2, 3]
    outputChannels: [2, 3]
    opusBitrate: 96000

  - id: foh
    name: "FOH"
    inputChannels: [4, 5]
    outputChannels: [4, 5]
    opusBitrate: 96000

  - id: broadcast
    name: "Broadcast"
    inputChannels: [6, 7]
    outputChannels: [6, 7]
    opusBitrate: 128000      # 128 kbps (qualité supérieure)

routing:
  # Configuration gains par route (optionnel)
  input_gains:
    regie: 0    # 0 dB (unity)
    scene: -3   # -3 dB
    foh: 0
    broadcast: -6  # -6 dB

  output_gains:
    regie: 0
    scene: 0
    foh: -3
    broadcast: 0
```

---

## Démarrage Production

### Services Systemd

#### Service PTT Live Server

Créer `/etc/systemd/system/pttlive-server.service` :

```ini
[Unit]
Description=PTT Live Server
After=network.target

[Service]
Type=simple
User=pttlive
Group=audio
WorkingDirectory=/opt/PTT-Live/server
Environment="NODE_ENV=production"
EnvironmentFile=/opt/PTT-Live/server/.env
ExecStart=/usr/bin/node index.js
Restart=always
RestartSec=10

# Limites
LimitNOFILE=65536
LimitNPROC=4096

# Logs
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

#### Service PTT Live Client (si servi via Node)

Créer `/etc/systemd/system/pttlive-client.service` :

```ini
[Unit]
Description=PTT Live Client (HTTP Server)
After=network.target

[Service]
Type=simple
User=pttlive
WorkingDirectory=/opt/PTT-Live/client
ExecStart=/usr/bin/npm run preview  # Vite preview (prod build)
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

#### Activation

```bash
# Créer utilisateur dédié
sudo useradd -r -s /bin/false -G audio pttlive
sudo chown -R pttlive:audio /opt/PTT-Live

# Activer services
sudo systemctl daemon-reload
sudo systemctl enable pttlive-server pttlive-client
sudo systemctl start pttlive-server pttlive-client

# Vérifier statut
sudo systemctl status pttlive-server
sudo journalctl -u pttlive-server -f  # Logs temps réel
```

---

## Configuration Réseau Production

### VLAN et QoS

#### Configuration Switch (exemple CLI Cisco/HP)

```bash
# VLAN Audio (Dante/AES67)
vlan 10
  name AUDIO
  qos dscp 46  # EF (Expedited Forwarding)

# VLAN WiFi Clients
vlan 20
  name WIFI_CLIENTS
  qos dscp 34  # AF41 (Assured Forwarding)

# VLAN Management
vlan 30
  name MGMT

# Ports
interface range gigabitethernet 1/0/1-8
  switchport mode access
  switchport access vlan 10
  spanning-tree portfast

interface range gigabitethernet 1/0/9-16
  switchport mode trunk
  switchport trunk allowed vlan 20,30

# QoS global
mls qos
mls qos map dscp-cos 46 to 6  # Audio prioritaire
```

### IGMP Snooping

Pour multicast (Dante/AES67) :

```bash
# Cisco
ip igmp snooping
ip igmp snooping vlan 10 immediate-leave
ip igmp snooping vlan 10 last-member-query-interval 100

# HP/Aruba
vlan 10
  ip igmp
  ip igmp querier
```

### WiFi Optimisations

#### Configuration Access Point (Ubiquiti UniFi)

```json
{
  "networks": [
    {
      "name": "PTT_Live_5G",
      "wlan_band": "5g",
      "wpa_mode": "wpa2",
      "wpa_enc": "ccmp",
      "channel": 36,  // Ou 149 (selon région)
      "channel_width": 80,
      "dtim_mode": "default",
      "fast_roaming_enabled": true,
      "vlan": 20,
      "uapsd_enabled": true,  // Power save
      "multicast_enhance": true,
      "airtime_fairness": true
    }
  ]
}
```

**Paramètres clés** :
- **Fast Roaming (802.11r)** : Activé (handoff < 50ms)
- **Band Steering** : Désactivé (forcer 5GHz)
- **Multicast Enhancement** : Activé (convertit multicast → unicast)
- **Airtime Fairness** : Activé (évite qu'un client lent ralentisse tous)
- **DTIM** : 1-3 (compromis latence/batterie)

---

## Monitoring et Logs

### Monitoring Système

#### Prometheus + Grafana (optionnel mais recommandé)

```bash
# Installation Prometheus
sudo apt install prometheus prometheus-node-exporter

# Installation Grafana
sudo apt install -y software-properties-common
sudo add-apt-repository "deb https://packages.grafana.com/oss/deb stable main"
wget -q -O - https://packages.grafana.com/gpg.key | sudo apt-key add -
sudo apt update
sudo apt install grafana

sudo systemctl enable grafana-server prometheus
sudo systemctl start grafana-server prometheus
```

Accès Grafana : `http://serveur:3000` (admin/admin)

**Métriques à surveiller** :
- CPU usage
- RAM usage
- Network throughput (RX/TX)
- JACK xruns (si JACK)
- LiveKit room stats (participants, bitrate)
- Audio latency

#### Dashboard Grafana PTT Live

Créer un dashboard avec :
- Participants actifs par groupe
- Bitrate audio moyen
- Packet loss WebRTC
- Latence end-to-end (si sonde)

### Logs Centralisés

#### rsyslog vers serveur central (optionnel)

```bash
# /etc/rsyslog.d/50-pttlive.conf
if $programname == 'pttlive-server' then @@log-server:514
& stop
```

---

## Tests de Charge

### Outils

1. **LoadBot** (LiveKit officiel)
   ```bash
   # Installation
   go install github.com/livekit/livekit-cli/cmd/livekit-load-tester@latest

   # Test 30 participants
   livekit-load-tester \
     --url ws://serveur:7880 \
     --api-key APIxxxxxx \
     --api-secret SECRETxxxxxx \
     --room test-room \
     --publishers 30 \
     --duration 10m
   ```

2. **iperf3** (test bande passante réseau)
   ```bash
   # Serveur
   iperf3 -s

   # Client
   iperf3 -c serveur -t 60 -P 10  # 10 streams parallèles, 60s
   ```

### Scénarios de Test

#### Test 1 : Connexion 30 clients

**Objectif** : Tous les clients se connectent et rejoignent des groupes différents.

**Métriques** :
- Temps de connexion < 2s par client
- CPU serveur < 60%
- RAM < 8GB

#### Test 2 : PTT simultanés (10 clients parlent en même temps)

**Objectif** : Vérifier que le serveur gère 10 flux audio upstream simultanés.

**Métriques** :
- Latence audio < 150ms
- Packet loss < 1%
- Pas de xruns JACK

#### Test 3 : Endurance (4 heures)

**Objectif** : Stabilité longue durée.

**Métriques** :
- Pas de memory leak (RAM stable)
- Pas de crash
- Reconnexion automatique si perte WiFi

---

## Troubleshooting Production

### Problème : Latence élevée (> 200ms)

**Diagnostics** :
```bash
# Latence réseau (ping)
ping -i 0.2 serveur  # < 5ms attendu en WiFi local

# Traceroute
traceroute serveur

# Jitter
iperf3 -c serveur -u -b 1M  # Jitter < 5ms
```

**Causes possibles** :
- WiFi congestionné (trop de clients/AP)
- Buffer JACK trop grand
- Jitter buffer PTT Live trop conservateur
- CPU serveur saturé

**Solutions** :
- Réduire buffer JACK : 256 → 128 samples
- PTT Live jitter buffer : preset "ULTRA_LOW"
- Ajouter un AP WiFi (répartir charge)

### Problème : Coupures audio

**Diagnostics** :
```bash
# JACK xruns
jack_evmon

# Logs PTT Live
sudo journalctl -u pttlive-server -f | grep -i error

# Stats réseau
iftop -i eth0
```

**Causes** :
- Xruns JACK (CPU overload)
- Packet loss réseau
- Buffer underrun

**Solutions** :
- Augmenter buffer JACK : 256 → 512
- Vérifier trafic réseau (pas de broadcast storm)
- Isoler CPU cores (kernel parameter `isolcpus=2,3`)

### Problème : Clients ne se connectent pas

**Diagnostics** :
```bash
# Firewall
sudo ufw status

# Ports LiveKit
sudo netstat -tulpn | grep 7880

# Logs LiveKit
sudo journalctl -u pttlive-server | grep livekit
```

**Solutions** :
- Vérifier firewall (ports 7880, 50000-60000)
- Vérifier clés API (`.env` correct)
- Tester en local : `curl http://localhost:3000/api/health`

---

## Sécurité

### HTTPS (obligatoire pour PWA)

#### Certificat auto-signé (dev/LAN)

```bash
# Générer certificat
openssl req -x509 -newkey rsa:4096 -keyout key.pem -out cert.pem -days 365 -nodes

# Configurer Node.js (serveur API)
# Éditer server/index.js
import https from 'https';
import fs from 'fs';

const options = {
  key: fs.readFileSync('key.pem'),
  cert: fs.readFileSync('cert.pem')
};

https.createServer(options, app).listen(3443);
```

#### Certificat Let's Encrypt (production Internet)

```bash
sudo apt install certbot

# Domaine public requis
sudo certbot certonly --standalone -d pttlive.votredomaine.com

# Certificats dans /etc/letsencrypt/live/pttlive.votredomaine.com/
```

### Authentification

#### Tokens JWT

Éditer `server/api/auth.js` :

```javascript
import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET;  // Générer avec openssl rand -base64 64

function generateToken(user) {
  return jwt.sign(
    { id: user.id, name: user.name, groups: user.groups },
    SECRET,
    { expiresIn: '24h' }
  );
}

function verifyToken(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });

  jwt.verify(token, SECRET, (err, decoded) => {
    if (err) return res.status(403).json({ error: 'Invalid token' });
    req.user = decoded;
    next();
  });
}
```

---

## Checklist Pré-Événement

### 24h avant

- [ ] Mise à jour système serveur (`apt update && apt upgrade`)
- [ ] Vérifier espace disque (`df -h`, > 20% libre)
- [ ] Test connexion tous les équipements audio
- [ ] Survey WiFi (vérifier pas d'interférences)
- [ ] Backup config (`cp -r /opt/PTT-Live/server/config /backup/`)

### 2h avant

- [ ] Démarrer serveur PTT Live
- [ ] Vérifier logs (`journalctl -u pttlive-server`)
- [ ] Test connexion 2 clients (1 par groupe minimum)
- [ ] Test PTT bidirectionnel
- [ ] Mesurer latence (< 150ms)
- [ ] Charger smartphones clients (100% batterie)

### Pendant l'événement

- [ ] Monitoring CPU/RAM (Grafana ou `htop`)
- [ ] Logs temps réel (`journalctl -f`)
- [ ] Laptop admin disponible (SSH serveur)
- [ ] Smartphone de secours (backup PTT)

---

## Performances Attendues

### Charge Serveur (30 clients)

| Métrique | Valeur Typique |
|----------|----------------|
| CPU Usage | 30-50% (8 cores) |
| RAM Usage | 4-6 GB |
| Network RX | 5-10 Mbps (upstream audio) |
| Network TX | 50-150 Mbps (downstream audio broadcast) |
| JACK Xruns | 0 (toléré : < 1/heure) |

### Latence End-to-End

| Composant | Latence |
|-----------|---------|
| WiFi (client → serveur) | 5-20 ms |
| WebRTC encode/decode | 20-60 ms |
| Jitter buffer | 20-40 ms |
| Audio backend (JACK/CoreAudio) | 5-10 ms |
| Dante/AES67 (si utilisé) | 5-10 ms |
| **TOTAL** | **55-140 ms** ✅ |

Objectif validé : < 150ms

---

## Support et Ressources

- **Documentation** : `/opt/PTT-Live/docs/`
- **Issues GitHub** : https://github.com/votre-user/ptt-live/issues
- **LiveKit Docs** : https://docs.livekit.io/
- **JACK Audio** : https://jackaudio.org/faq/

---

**Dernière mise à jour** : 2026-05-26
**Version** : 0.1.0 (Phase 3)
