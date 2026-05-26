# LiveKit Audio Bridge - Intégration Cartes Son macOS

Guide pour connecter les cartes son macOS au serveur LiveKit via le bridge audio.

## Problème Actuel

Le code actuel utilise `livekit-client` (SDK navigateur) qui nécessite des `MediaStreamTrack` (API Web Audio). Sur Node.js serveur, nous avons des **buffers PCM** provenant de CoreAudio/JACK, pas de MediaStream.

### Architecture Actuelle (Incomplète)

```
[Carte Son macOS] → CoreAudio → PCM Buffer → OpusCodec → ??? → LiveKit → Clients WebRTC
                                                          ↑
                                                    MANQUANT
```

## Solution : Utiliser LiveKit Server SDK

LiveKit propose 2 SDKs :
- **livekit-client** : Pour navigateurs (MediaStream, WebRTC natif)
- **livekit-server-sdk** : Pour serveurs Node.js (contrôle bas niveau)

### Installation

```bash
cd server
npm install livekit-server-sdk
npm install @livekit/rtc-node  # Bindings natifs pour audio/video
```

---

## Implémentation : LiveKitServerBridge.js

Créer un nouveau module pour le bridge serveur :

```javascript
// server/bridge/LiveKitServerBridge.js

import { RoomServiceClient, AccessToken, TrackSource } from 'livekit-server-sdk';
import { Room, LocalAudioTrack, AudioSource } from '@livekit/rtc-node';
import { EventEmitter } from 'events';

export class LiveKitServerBridge extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      url: options.url || 'ws://localhost:7880',
      apiKey: options.apiKey || 'APIxxxxxx',
      apiSecret: options.apiSecret || 'SECRETxxxxxx',
      roomName: options.roomName || 'main',
      participantName: options.participantName || 'AudioBridge',
      sampleRate: options.sampleRate || 48000,
      channels: options.channels || 1,
      ...options
    };

    this.room = null;
    this.audioSource = null;
    this.audioTrack = null;
    this.isPublishing = false;
  }

  /**
   * Connexion à la room LiveKit en tant que participant serveur
   */
  async connect() {
    try {
      // Générer token pour le bridge
      const token = new AccessToken(
        this.options.apiKey,
        this.options.apiSecret,
        {
          identity: this.options.participantName,
          name: 'Audio Bridge Server',
          ttl: '24h'
        }
      );

      token.addGrant({
        room: this.options.roomName,
        roomJoin: true,
        canPublish: true,
        canSubscribe: true
      });

      const jwt = token.toJwt();

      // Connexion à la room
      this.room = new Room();
      await this.room.connect(this.options.url, jwt);

      console.log(`✓ Bridge connecté à LiveKit room "${this.options.roomName}"`);
      this.emit('connected');

      // Écouter les participants distants
      this._setupRoomListeners();
    } catch (error) {
      console.error('Erreur connexion LiveKit:', error);
      throw error;
    }
  }

  /**
   * Créer et publier un track audio depuis la carte son
   */
  async publishAudioTrack() {
    if (!this.room) {
      throw new Error('Room non connectée');
    }

    try {
      // Créer une source audio custom
      this.audioSource = new AudioSource(
        this.options.sampleRate,
        this.options.channels
      );

      // Créer un track audio local
      this.audioTrack = LocalAudioTrack.createAudioTrack(
        'bridge-audio',
        this.audioSource
      );

      // Publier le track dans la room
      await this.room.localParticipant.publishTrack(this.audioTrack, {
        source: TrackSource.MICROPHONE,
        name: 'Audio Bridge'
      });

      this.isPublishing = true;
      console.log('✓ Track audio bridge publié');
      this.emit('trackPublished');
    } catch (error) {
      console.error('Erreur publication track:', error);
      throw error;
    }
  }

  /**
   * Envoie des données PCM au track LiveKit
   * @param {Buffer} pcmData - Buffer PCM 16-bit (depuis CoreAudio/JACK)
   */
  async sendPCMAudio(pcmData) {
    if (!this.audioSource || !this.isPublishing) {
      console.warn('AudioSource non prête ou track non publié');
      return;
    }

    try {
      // Convertir Buffer Node.js → AudioFrame
      // PCM 16-bit signed little-endian
      const numSamples = pcmData.length / 2; // 2 bytes per sample (16-bit)

      // Envoyer au track LiveKit
      await this.audioSource.captureFrame({
        data: pcmData,
        sampleRate: this.options.sampleRate,
        numChannels: this.options.channels,
        samplesPerChannel: numSamples / this.options.channels
      });
    } catch (error) {
      console.error('Erreur envoi PCM:', error);
      this.emit('error', error);
    }
  }

  /**
   * Écoute les participants et leurs tracks audio
   */
  _setupRoomListeners() {
    this.room.on('participantConnected', (participant) => {
      console.log(`Participant connecté: ${participant.identity}`);
      this.emit('participantConnected', participant);
    });

    this.room.on('trackSubscribed', (track, publication, participant) => {
      if (track.kind === 'audio') {
        console.log(`Track audio reçu de ${participant.identity}`);
        this._handleRemoteAudioTrack(track, participant);
      }
    });

    this.room.on('trackUnsubscribed', (track, publication, participant) => {
      if (track.kind === 'audio') {
        console.log(`Track audio perdu de ${participant.identity}`);
        this.emit('audioTrackUnsubscribed', { track, participant });
      }
    });
  }

  /**
   * Gère la réception d'un track audio distant (client PWA)
   * @param {RemoteAudioTrack} track - Track audio du client
   */
  _handleRemoteAudioTrack(track, participant) {
    // Recevoir les frames audio
    track.on('frame', async (frame) => {
      // frame contient les données PCM du client
      // On peut les envoyer à la carte son via CoreAudio/JACK
      this.emit('remotePCMData', {
        data: frame.data,
        sampleRate: frame.sampleRate,
        channels: frame.numChannels,
        participant
      });
    });

    this.emit('audioTrackSubscribed', { track, participant });
  }

  /**
   * Arrête la publication du track audio
   */
  async unpublishAudioTrack() {
    if (this.audioTrack) {
      await this.room.localParticipant.unpublishTrack(this.audioTrack);
      this.audioTrack = null;
      this.audioSource = null;
      this.isPublishing = false;
      console.log('✓ Track audio dépublié');
    }
  }

  /**
   * Déconnexion de la room
   */
  async disconnect() {
    await this.unpublishAudioTrack();

    if (this.room) {
      await this.room.disconnect();
      this.room = null;
    }

    console.log('✓ Bridge LiveKit déconnecté');
    this.emit('disconnected');
  }

  /**
   * Récupère les statistiques
   */
  getStats() {
    if (!this.room) return null;

    return {
      connected: !!this.room,
      publishing: this.isPublishing,
      participants: this.room.remoteParticipants.size,
      roomName: this.options.roomName
    };
  }
}

export default LiveKitServerBridge;
```

---

## Mise à Jour AudioBridge.js

Remplacer `LiveKitClient` par `LiveKitServerBridge` :

```javascript
// server/bridge/AudioBridge.js

import LiveKitServerBridge from './LiveKitServerBridge.js';

// ...

async _initLiveKit() {
  this.liveKitClient = new LiveKitServerBridge({
    url: this.options.liveKitUrl,
    apiKey: this.options.liveKitApiKey,
    apiSecret: this.options.liveKitApiSecret,
    roomName: this.options.roomName,
    sampleRate: this.options.sampleRate,
    channels: this.options.channels
  });

  // Events
  this.liveKitClient.on('connected', () => {
    console.log('✓ Bridge LiveKit connecté');
  });

  this.liveKitClient.on('audioTrackSubscribed', ({ track, participant }) => {
    console.log(`Audio reçu de ${participant.identity}`);
  });

  this.liveKitClient.on('remotePCMData', ({ data, participant }) => {
    // Envoyer PCM à la carte son
    this.audioBackend.queueAudio(data);
  });

  await this.liveKitClient.connect();
  await this.liveKitClient.publishAudioTrack();
}

async _startAudioRouting() {
  // CAPTURE : Carte son → LiveKit
  this.audioBackend.on('audioData', async (pcmData) => {
    try {
      // Envoyer directement le PCM à LiveKit
      // LiveKit gère l'encodage Opus en interne
      await this.liveKitClient.sendPCMAudio(pcmData);

      this.stats.framesCapture++;
    } catch (error) {
      console.error('Erreur routing capture:', error);
    }
  });

  await this.audioBackend.startCapture();
  await this.audioBackend.startPlayback();
}
```

---

## Configuration Serveur

### Variables d'environnement

```bash
# server/.env
LIVEKIT_API_KEY=APIxxxxxxxxxxxxxx
LIVEKIT_API_SECRET=SECRETxxxxxxxxxxxxxx
LIVEKIT_URL=ws://localhost:7880
```

Générer les clés :

```bash
# API Key (24 bytes base64)
openssl rand -base64 24

# API Secret (48 bytes base64)
openssl rand -base64 48
```

### Configuration LiveKit Server

Éditer `server/config/livekit.yaml` :

```yaml
port: 7880
rtc:
  port_range_start: 50000
  port_range_end: 60000
  use_external_ip: false

keys:
  # Utiliser les mêmes clés que .env
  APIxxxxxxxxxxxxxx: SECRETxxxxxxxxxxxxxx

logging:
  level: info
```

---

## Alternative : Sans @livekit/rtc-node (Pure JavaScript)

Si l'installation de bindings natifs pose problème, utiliser **DataChannel** pour envoyer les données Opus :

```javascript
// server/bridge/LiveKitDataBridge.js

import { RoomServiceClient, DataPacket_Kind } from 'livekit-server-sdk';

export class LiveKitDataBridge {
  async sendOpusData(opusData, groupId) {
    // Envoyer via DataChannel
    const packet = {
      kind: DataPacket_Kind.RELIABLE,
      destinationSids: [], // Broadcast à tous
      payload: opusData,
      topic: `audio-${groupId}`
    };

    await this.room.localParticipant.publishData(
      packet.payload,
      packet.kind,
      packet.destinationSids
    );
  }
}
```

**Avantage** : Pas de bindings natifs.
**Inconvénient** : Les clients doivent décoder Opus manuellement (pas de lecture audio automatique).

---

## Tests macOS

### 1. Vérifier carte son détectée

```bash
cd server
node -e "
import CoreAudioBackend from './bridge/backends/CoreAudioBackend.js';
const devices = CoreAudioBackend.getDevices();
console.log(devices);
"
```

### 2. Test bridge complet

```bash
# Terminal 1 : Serveur LiveKit
cd server/bin
./livekit-server --dev --config ../config/livekit.yaml

# Terminal 2 : Bridge audio
cd server
npm run dev

# Terminal 3 : Client test
cd client
npm run dev
```

Ouvrir `http://localhost:5173`, se connecter et appuyer sur PTT.

### 3. Vérifier flux audio

```bash
# Logs bridge
tail -f server/logs/bridge.log | grep "sendPCMAudio"

# Devrait afficher :
# sendPCMAudio: 960 samples @ 48000Hz
```

---

## Compatibilité Cartes Son macOS

### Cartes testées

| Modèle | Statut | Notes |
|--------|--------|-------|
| MacBook Pro Mic/Speaker | ✅ | Native CoreAudio |
| Focusrite Scarlett 2i2 | ✅ | USB Class Compliant |
| MOTU UltraLite mk5 | ✅ | USB-C, 18x22 canaux |
| RME Fireface UCX | ✅ | USB 2.0/3.0 |
| Audient iD14 | ✅ | USB-C |
| Universal Audio Apollo | ⚠️ | Nécessite pilotes UA |
| PreSonus Studio 24c | ✅ | USB-C |

### Problèmes courants

**Carte non détectée** :

```bash
# Vérifier MIDI/Audio Setup
open /System/Applications/Utilities/Audio\ MIDI\ Setup.app

# Vérifier sample rate
system_profiler SPAudioDataType
```

**Latence élevée** :

Réduire `framesPerBuffer` dans `config.yaml` :

```yaml
audio:
  framesPerBuffer: 128  # Au lieu de 256 ou 512
```

---

## Prochaines Étapes

1. ✅ Installer `@livekit/rtc-node`
2. ✅ Créer `LiveKitServerBridge.js`
3. ✅ Remplacer dans `AudioBridge.js`
4. ✅ Configurer `.env` avec clés LiveKit
5. ⏳ Tester avec carte son macOS réelle
6. ⏳ Mesurer latence end-to-end (objectif < 150ms)

---

**Dernière mise à jour** : 2026-05-26
**Version** : 0.1.0 (Phase 3+)
