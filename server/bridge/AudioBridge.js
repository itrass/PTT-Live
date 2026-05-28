/**
 * AudioBridge.js
 * Classe principale du bridge audio serveur
 *
 * Orchestre :
 * - Détection et initialisation du backend audio (CoreAudio/JACK/etc.)
 * - Routing : CoreAudio → Opus → LiveKit
 * - Routing : LiveKit → Opus → CoreAudio
 * - Jitter buffer pour flux entrants
 * - Logs détaillés et statistiques
 */

import { EventEmitter } from 'events';
import { platform } from 'os';
import CoreAudioBackend from './backends/CoreAudioBackend.js';
import JACKBackend from './backends/JACKBackend.js';
import PipeWireBackend from './backends/PipeWireBackend.js';
import OpusCodec, { OpusPresets } from './OpusCodec.js';
import JitterBuffer, { JitterBufferPresets } from './JitterBuffer.js';
import LiveKitClient from './LiveKitClient.js';
import GroupAudioRouter from './GroupAudioRouter.js';

export class AudioBridge extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      // Configuration audio
      sampleRate: options.sampleRate || 48000,
      channels: options.channels || 1,
      frameSize: options.frameSize || 960, // 20ms à 48kHz

      // Configuration Opus
      opusPreset: options.opusPreset || 'VOICE_STANDARD',
      customOpusBitrate: options.customOpusBitrate || null,

      // Configuration JitterBuffer
      jitterBufferPreset: options.jitterBufferPreset || 'LOW_LATENCY',

      // Configuration LiveKit
      liveKitUrl: options.liveKitUrl || 'ws://localhost:7880',
      liveKitToken: options.liveKitToken || null,
      roomName: options.roomName || 'main',

      // Configuration backend
      inputDeviceId: options.inputDeviceId || null,
      outputDeviceId: options.outputDeviceId || null,

      ...options
    };

    // Composants
    this.audioBackend = null;
    this.opusEncoder = null;
    this.opusDecoder = null;
    this.jitterBuffer = null;
    this.liveKitClients = new Map(); // Map<groupName, LiveKitClient> - un client par groupe
    this.groupAudioRouter = null;

    // État
    this.isRunning = false;
    this.backendType = null;

    // Buffers pour routing multi-canaux
    this.inputChannelBuffers = new Map(); // Map<channelId, Float32Array>
    this.groupBuffersFromLiveKit = new Map(); // Map<groupName, Float32Array>

    // Frame accumulators pour LiveKit (240 samples → 960 samples)
    this.liveKitFrameAccumulators = new Map(); // Map<groupName, { buffer: Float32Array, offset: number }>

    // Pool de buffers pré-alloués pour éviter allocations répétées
    this.bufferPool = {
      float32: [], // Pool de Float32Array réutilisables
      pcm: []      // Pool de Buffer PCM réutilisables
    };
    this.maxPoolSize = 50; // Limite du pool (adapté pour 30+ clients)

    // Statistiques
    this.stats = {
      startTime: null,
      framesCapture: 0,
      framesPlayback: 0,
      bytesEncoded: 0,
      bytesDecoded: 0,
      errors: {
        capture: 0,
        playback: 0,
        encode: 0,
        decode: 0,
        network: 0
      }
    };
  }

  /**
   * Initialise et démarre le bridge audio
   * @returns {Promise<void>}
   */
  async start() {
    if (this.isRunning) {
      console.warn('Bridge audio déjà démarré');
      return;
    }

    console.log('🚀 Démarrage AudioBridge...');

    try {
      // 1. Détection et initialisation du backend audio
      await this._initAudioBackend();

      // 2. Initialisation des codecs Opus
      this._initOpusCodecs();

      // 3. Initialisation du jitter buffer
      this._initJitterBuffer();

      // 4. Initialisation du GroupAudioRouter
      this._initGroupAudioRouter();

      // 5. Connexion à LiveKit
      await this._initLiveKit();

      // 6. Démarrage du routing audio
      await this._startAudioRouting();

      this.isRunning = true;
      this.stats.startTime = Date.now();

      console.log('✅ AudioBridge démarré avec succès');
      this.emit('started');

      // Logs périodiques
      this._startStatsLogger();
    } catch (error) {
      console.error('❌ Erreur démarrage AudioBridge:', error);
      await this.stop();
      throw error;
    }
  }

  /**
   * Détecte et initialise le backend audio approprié
   * @private
   */
  async _initAudioBackend() {
    const os = platform();
    let BackendClass = null;
    let devices = [];

    // macOS : CoreAudio prioritaire
    if (os === 'darwin') {
      if (CoreAudioBackend.isAvailable()) {
        this.backendType = 'CoreAudio';
        BackendClass = CoreAudioBackend;
        console.log('✓ Backend audio : CoreAudio (macOS natif)');
      } else {
        throw new Error('CoreAudio non disponible sur ce système');
      }
    }
    // Linux : PipeWire > JACK (ordre de préférence)
    else if (os === 'linux') {
      // Détection automatique : préfère PipeWire (moderne) puis JACK (pro)
      if (PipeWireBackend.isAvailable() && PipeWireBackend.isServerRunning()) {
        this.backendType = 'PipeWire';
        BackendClass = PipeWireBackend;
        console.log('✓ Backend audio : PipeWire (Linux moderne)');
      } else if (JACKBackend.isAvailable() && JACKBackend.isServerRunning()) {
        this.backendType = 'JACK';
        BackendClass = JACKBackend;
        console.log('✓ Backend audio : JACK (Linux professionnel)');
      } else {
        // Aucun backend disponible
        const pipewireInstalled = PipeWireBackend.isAvailable();
        const jackInstalled = JACKBackend.isAvailable();

        let errorMsg = 'Aucun backend audio disponible sur Linux.\n';

        if (!pipewireInstalled && !jackInstalled) {
          errorMsg += 'Installez PipeWire (recommandé) ou JACK :\n';
          errorMsg += '  Ubuntu/Debian : sudo apt install pipewire pipewire-pulse\n';
          errorMsg += '  Arch Linux : sudo pacman -S pipewire pipewire-pulse\n';
          errorMsg += '  JACK : sudo apt install jackd2 jack-tools';
        } else if (pipewireInstalled && !PipeWireBackend.isServerRunning()) {
          errorMsg += 'PipeWire installé mais non démarré.\n';
          errorMsg += 'Démarrez-le : systemctl --user start pipewire pipewire-pulse';
        } else if (jackInstalled && !JACKBackend.isServerRunning()) {
          errorMsg += 'JACK installé mais serveur non démarré.\n';
          errorMsg += 'Démarrez-le : jackd -d alsa -r 48000';
        }

        throw new Error(errorMsg);
      }
    }
    // Windows : WASAPI (futur)
    else if (os === 'win32') {
      throw new Error('Support Windows non encore implémenté');
    }
    else {
      throw new Error(`Plateforme non supportée : ${os}`);
    }

    // Résoudre les device IDs vers les noms pour CoreAudio/sox
    let inputDeviceName = null;
    let outputDeviceName = null;

    if (this.options.inputDeviceId) {
      const inputDevice = BackendClass.getDevices().find(d => d.id === this.options.inputDeviceId);
      inputDeviceName = inputDevice ? inputDevice.name : this.options.inputDeviceId;
      console.log(`📥 Input device: "${inputDeviceName}" (ID: ${this.options.inputDeviceId})`);
    }

    if (this.options.outputDeviceId) {
      const outputDevice = BackendClass.getDevices().find(d => d.id === this.options.outputDeviceId);
      outputDeviceName = outputDevice ? outputDevice.name : this.options.outputDeviceId;
      console.log(`📤 Output device: "${outputDeviceName}" (ID: ${this.options.outputDeviceId})`);
    }

    // Initialisation du backend sélectionné
    const backendOptions = {
      sampleRate: this.options.sampleRate,
      channels: this.options.channels,
      framesPerBuffer: this.options.frameSize,
      latency: this.options.latency || 20
    };

    // PipeWire utilise targetDevice, CoreAudio utilise inputDeviceName/outputDeviceName
    if (this.backendType === 'PipeWire') {
      // Pour PipeWire, on utilise inputDeviceId directement comme targetDevice
      // (startCapture et startPlayback peuvent avoir des targets différents)
      backendOptions.inputTargetDevice = this.options.inputDeviceId;
      backendOptions.outputTargetDevice = this.options.outputDeviceId;
    } else {
      // CoreAudio et autres backends
      backendOptions.inputDeviceId = this.options.inputDeviceId;
      backendOptions.inputDeviceName = inputDeviceName;
      backendOptions.outputDeviceId = this.options.outputDeviceId;
      backendOptions.outputDeviceName = outputDeviceName;
    }

    this.audioBackend = new BackendClass(backendOptions);

    // Liste des devices disponibles
    devices = BackendClass.getDevices();
    console.log(`📻 Devices audio détectés : ${devices.length}`);
    devices.forEach(d => {
      console.log(`  - ${d.name} (in:${d.maxInputChannels}, out:${d.maxOutputChannels})`);
    });
  }

  /**
   * Initialise les codecs Opus (encoder et decoder)
   * @private
   */
  _initOpusCodecs() {
    // Configuration Opus depuis preset ou custom
    let opusConfig = OpusPresets[this.options.opusPreset] || OpusPresets.VOICE_STANDARD;

    if (this.options.customOpusBitrate) {
      opusConfig = { ...opusConfig, bitrate: this.options.customOpusBitrate };
    }

    const codecOptions = {
      sampleRate: this.options.sampleRate,
      channels: this.options.channels,
      frameSize: this.options.frameSize,
      ...opusConfig
    };

    // Encoder pour capture (CoreAudio → Opus → LiveKit)
    this.opusEncoder = new OpusCodec(codecOptions);

    // Decoder pour lecture (LiveKit → Opus → CoreAudio)
    this.opusDecoder = new OpusCodec(codecOptions);

    console.log(`✓ Codecs Opus : ${opusConfig.bitrate / 1000}kbps, ${this.options.sampleRate}Hz`);
  }

  /**
   * Initialise le jitter buffer
   * @private
   */
  _initJitterBuffer() {
    const bufferConfig = JitterBufferPresets[this.options.jitterBufferPreset] || JitterBufferPresets.LOW_LATENCY;

    this.jitterBuffer = new JitterBuffer(bufferConfig);

    // Events du jitter buffer
    this.jitterBuffer.on('underrun', () => {
      console.warn('⚠️  Jitter buffer underrun');
    });

    this.jitterBuffer.on('overrun', () => {
      console.warn('⚠️  Jitter buffer overrun');
    });

    this.jitterBuffer.on('adapted', ({ newTargetSize, reason }) => {
      console.log(`🔧 Jitter buffer adapté : ${newTargetSize} frames (raison: ${reason})`);
    });

    console.log(`✓ Jitter buffer : cible ${bufferConfig.targetSize} frames`);
  }

  /**
   * Initialise le GroupAudioRouter pour le routing multi-canaux
   * @private
   */
  _initGroupAudioRouter() {
    this.groupAudioRouter = new GroupAudioRouter({
      sampleRate: this.options.sampleRate,
      frameSize: this.options.frameSize,
      maxInputChannels: this.options.maxInputChannels || 32,
      maxOutputChannels: this.options.maxOutputChannels || 32,
      groups: this.options.groups || []
    });

    // Charger la configuration de routing depuis les options
    if (this.options.routing) {
      this.groupAudioRouter.configure(this.options.routing);
    }

    // Events du router
    this.groupAudioRouter.on('configured', (stats) => {
      console.log(`✓ GroupAudioRouter configuré : ${stats.routesActive} routes`);
    });

    console.log('✓ GroupAudioRouter initialisé');
  }

  /**
   * Initialise les connexions LiveKit (une par groupe)
   * @private
   */
  async _initLiveKit() {
    if (!this.options.liveKitTokens || !Array.isArray(this.options.liveKitTokens)) {
      throw new Error('liveKitTokens requis (tableau d\'objets { groupName, groupId, token })');
    }

    console.log(`🔌 Initialisation ${this.options.liveKitTokens.length} connexions LiveKit (une par groupe)...`);

    // Créer un LiveKitClient pour chaque groupe
    for (const { groupName, groupId, token } of this.options.liveKitTokens) {
      const roomName = groupId; // La room porte le nom du groupId (slugifié)

      const client = new LiveKitClient({
        url: this.options.liveKitUrl,
        token,
        roomName,
        participantName: `AudioBridge-${groupId}`,
        sampleRate: this.options.sampleRate,
        channels: this.options.channels,
        audioBitrate: this.opusEncoder.options.bitrate
      });

      // Events LiveKit pour ce groupe
      client.on('connected', () => {
        console.log(`✓ LiveKit connecté pour groupe "${groupName}" (room: ${roomName})`);
      });

      client.on('disconnected', (data) => {
        const reason = data?.reason || 'unknown';
        console.warn(`⚠️  LiveKit déconnecté pour groupe "${groupName}":`, reason);
        this.stats.errors.network++;
      });

      client.on('reconnecting', () => {
        console.log(`🔄 LiveKit reconnexion pour groupe "${groupName}"...`);
      });

      client.on('audioTrackSubscribed', ({ track, participant }) => {
        console.log(`🎵 Nouveau track audio dans groupe "${groupName}": ${participant.identity}`);
      });

      // Réception audio depuis les clients LiveKit de ce groupe
      client.on('audioData', ({ participantName, pcmData, sampleRate, channels }) => {
        // Router vers le bon groupe
        this.emit('groupAudioIn', { groupName: groupId, pcmBuffer: pcmData });
      });

      // Connexion
      await client.connect();

      // Stocker le client par groupId
      this.liveKitClients.set(groupId, client);
    }

    console.log(`✓ ${this.liveKitClients.size} connexions LiveKit établies`);
  }

  /**
   * Démarre le routing audio bidirectionnel complet
   * @private
   */
  async _startAudioRouting() {
    console.log('🔄 Démarrage routing audio bidirectionnel...');

    // ===== FLUX 1 : CAPTURE (Carte Son → Groupes → LiveKit → Clients) =====
    this.audioBackend.on('audioData', (pcmData) => {
      try {
        // Convertir PCM Buffer → Float32Array (pour GroupAudioRouter)
        const float32Data = this._bufferToFloat32(pcmData);

        // Pour l'instant, on assume que l'audio vient du canal 0
        // TODO: Supporter multi-canaux depuis la carte son
        const channelId = this.options.inputDeviceChannel || 0;
        this.inputChannelBuffers.set(channelId, float32Data);

        // ÉTAPE 1 : Inputs physiques → Groupes (via GroupAudioRouter)
        const groupBuffers = this.groupAudioRouter.processInputsToGroups(
          this.inputChannelBuffers
        );

        if (this.stats.framesCapture % 100 === 0) {
          console.log(`[AudioBridge] Frame ${this.stats.framesCapture}: ${this.inputChannelBuffers.size} inputs → ${groupBuffers.size} groupes`);
        }

        // ÉTAPE 2 : Pour chaque groupe, envoyer vers le LiveKitClient correspondant
        groupBuffers.forEach((groupBuffer, groupName) => {
          // Convertir Float32Array → PCM Buffer
          const pcmBuffer = this._float32ToBuffer(groupBuffer);

          // Encoder en Opus
          const opusData = this.opusEncoder.encode(pcmBuffer);

          if (opusData) {
            this.stats.bytesEncoded += opusData.length;

            // Récupérer le client LiveKit pour ce groupe
            const client = this.liveKitClients.get(groupName);

            // Envoi vers LiveKit via sendAudioData (prend du PCM, pas de l'Opus)
            // Note: LiveKit gère lui-même l'encodage Opus en interne
            if (client && client.isConnected) {
              client.sendAudioData(pcmBuffer);
              if (this.stats.framesCapture % 100 === 0) {
                console.log(`[AudioBridge] → LiveKit groupe "${groupName}": ${pcmBuffer.length} bytes`);
              }
            } else {
              if (this.stats.framesCapture % 100 === 0) {
                console.log(`[AudioBridge] ⚠️  LiveKit non connecté pour groupe "${groupName}", audio non envoyé`);
              }
            }

            // Émettre aussi pour monitoring/debug
            this.emit('groupAudioOut', { groupName, opusData, pcmBuffer });
          }
        });

        // ÉTAPE 3 : Loopback local - Groupes → Outputs physiques (sans passer par LiveKit)
        const outputBuffers = this.groupAudioRouter.processGroupsToOutputs(groupBuffers);

        if (this.stats.framesCapture % 100 === 0) {
          console.log(`[AudioBridge] Loopback local: ${groupBuffers.size} groupes → ${outputBuffers.size} outputs`);
        }

        // ÉTAPE 4 : Envoyer chaque output à la carte son
        outputBuffers.forEach((outputBuffer, channelId) => {
          const pcmBuffer = this._float32ToBuffer(outputBuffer);

          // Envoyer à la carte son
          this.audioBackend.queueAudio(pcmBuffer);

          if (this.stats.framesCapture % 100 === 0) {
            console.log(`[AudioBridge] → Output ${channelId}: ${pcmBuffer.length} bytes`);
          }
        });

        this.stats.framesCapture++;
        this.stats.framesPlayback++;
      } catch (error) {
        console.error('Erreur routing capture:', error);
        this.stats.errors.capture++;
      }
    });

    // ===== FLUX 2 : LECTURE (Clients → LiveKit → Groupes → Carte Son) =====

    // Écouter l'audio entrant de LiveKit (sera connecté par LiveKitServerBridge)
    this.on('groupAudioIn', ({ groupName, pcmBuffer }) => {
      try {
        // Convertir PCM Buffer → Float32Array
        const float32Data = this._bufferToFloat32(pcmBuffer);
        const samplesReceived = float32Data.length;

        // Initialiser l'accumulateur pour ce groupe si nécessaire
        if (!this.liveKitFrameAccumulators.has(groupName)) {
          this.liveKitFrameAccumulators.set(groupName, {
            buffer: new Float32Array(960), // Frame size attendu par GroupRouter
            offset: 0
          });
        }

        const accumulator = this.liveKitFrameAccumulators.get(groupName);

        // Copier les samples dans l'accumulateur
        accumulator.buffer.set(float32Data, accumulator.offset);
        accumulator.offset += samplesReceived;

        // Si on a accumulé assez de samples (960), router vers les outputs
        if (accumulator.offset >= 960) {
          // Stocker le buffer complet pour le routing
          this.groupBuffersFromLiveKit.set(groupName, accumulator.buffer);

          // ÉTAPE 3 : Groupes → Outputs physiques (via GroupAudioRouter)
          const outputBuffers = this.groupAudioRouter.processGroupsToOutputs(
            this.groupBuffersFromLiveKit
          );

          // ÉTAPE 4 : Envoyer chaque output à la carte son
          outputBuffers.forEach((outputBuffer, channelId) => {
            const pcmBuffer = this._float32ToBuffer(outputBuffer);
            this.audioBackend.queueAudio(pcmBuffer);
          });

          // Réinitialiser l'accumulateur
          accumulator.offset = 0;
          accumulator.buffer.fill(0);

          this.stats.framesPlayback++;
        }
      } catch (error) {
        console.error('Erreur routing lecture:', error);
        this.stats.errors.playback++;
      }
    });

    // Démarrage des streams audio
    await this.audioBackend.startCapture();
    await this.audioBackend.startPlayback();

    console.log('✓ Routing audio bidirectionnel actif');
    console.log('  → Carte Son → GroupRouter → LiveKit → Clients');
    console.log('  ← Carte Son ← GroupRouter ← LiveKit ← Clients');
  }

  /**
   * Acquiert un Float32Array depuis le pool ou en crée un nouveau
   * @param {number} size - Taille du buffer
   * @returns {Float32Array}
   * @private
   */
  _acquireFloat32Buffer(size) {
    const pooled = this.bufferPool.float32.find(b => b.length === size);
    if (pooled) {
      this.bufferPool.float32.splice(this.bufferPool.float32.indexOf(pooled), 1);
      return pooled;
    }
    return new Float32Array(size);
  }

  /**
   * Retourne un Float32Array au pool pour réutilisation
   * @param {Float32Array} buffer
   * @private
   */
  _releaseFloat32Buffer(buffer) {
    if (this.bufferPool.float32.length < this.maxPoolSize) {
      this.bufferPool.float32.push(buffer);
    }
  }

  /**
   * Acquiert un Buffer PCM depuis le pool ou en crée un nouveau
   * @param {number} size - Taille du buffer
   * @returns {Buffer}
   * @private
   */
  _acquirePcmBuffer(size) {
    const pooled = this.bufferPool.pcm.find(b => b.length === size);
    if (pooled) {
      this.bufferPool.pcm.splice(this.bufferPool.pcm.indexOf(pooled), 1);
      return pooled;
    }
    return Buffer.alloc(size);
  }

  /**
   * Retourne un Buffer PCM au pool pour réutilisation
   * @param {Buffer} buffer
   * @private
   */
  _releasePcmBuffer(buffer) {
    if (this.bufferPool.pcm.length < this.maxPoolSize) {
      this.bufferPool.pcm.push(buffer);
    }
  }

  /**
   * Convertit Buffer PCM 16-bit → Float32Array [-1.0, 1.0]
   * @param {Buffer} buffer - Buffer PCM 16-bit signed
   * @returns {Float32Array}
   * @private
   */
  _bufferToFloat32(buffer) {
    // Convertir en Buffer Node.js si c'est un Uint8Array ou ArrayBuffer
    if (!(buffer instanceof Buffer)) {
      buffer = Buffer.from(buffer);
    }

    const samples = buffer.length / 2; // 2 bytes per sample (16-bit)
    const float32 = this._acquireFloat32Buffer(samples);

    for (let i = 0; i < samples; i++) {
      // Lire 16-bit signed little-endian
      const int16 = buffer.readInt16LE(i * 2);
      // Normaliser vers [-1.0, 1.0]
      float32[i] = int16 / 32768.0;
    }

    return float32;
  }

  /**
   * Convertit Float32Array [-1.0, 1.0] → Buffer PCM 16-bit
   * @param {Float32Array} float32 - Données audio normalisées
   * @returns {Buffer}
   * @private
   */
  _float32ToBuffer(float32) {
    const buffer = this._acquirePcmBuffer(float32.length * 2); // 2 bytes per sample

    for (let i = 0; i < float32.length; i++) {
      // Clamping [-1.0, 1.0]
      const clamped = Math.max(-1.0, Math.min(1.0, float32[i]));
      // Convertir vers 16-bit signed
      const int16 = Math.round(clamped * 32767);
      buffer.writeInt16LE(int16, i * 2);
    }

    return buffer;
  }

  /**
   * Arrête le bridge audio
   */
  async stop() {
    if (!this.isRunning) {
      return;
    }

    console.log('🛑 Arrêt AudioBridge...');

    // Arrêt des composants
    if (this.audioBackend) {
      this.audioBackend.destroy();
      this.audioBackend = null;
    }

    // Déconnecter tous les clients LiveKit
    for (const [groupName, client] of this.liveKitClients.entries()) {
      console.log(`🔌 Déconnexion LiveKit groupe "${groupName}"...`);
      await client.destroy();
    }
    this.liveKitClients.clear();

    if (this.groupAudioRouter) {
      this.groupAudioRouter.destroy();
      this.groupAudioRouter = null;
    }

    if (this.jitterBuffer) {
      this.jitterBuffer.destroy();
      this.jitterBuffer = null;
    }

    if (this.opusEncoder) {
      this.opusEncoder.destroy();
      this.opusEncoder = null;
    }

    if (this.opusDecoder) {
      this.opusDecoder.destroy();
      this.opusDecoder = null;
    }

    // Nettoyer les buffers
    this.inputChannelBuffers.clear();
    this.groupBuffersFromLiveKit.clear();

    // Nettoyer le pool de buffers
    this.bufferPool.float32 = [];
    this.bufferPool.pcm = [];

    this.isRunning = false;

    console.log('✓ AudioBridge arrêté');
    this.emit('stopped');
  }

  /**
   * Logger de statistiques périodiques
   * @private
   */
  _startStatsLogger() {
    const logInterval = 10000; // 10s

    const logger = setInterval(() => {
      if (!this.isRunning) {
        clearInterval(logger);
        return;
      }

      const stats = this.getStats();
      console.log('📊 Statistiques AudioBridge:');
      console.log(`  Uptime: ${Math.floor(stats.uptimeSeconds)}s`);
      console.log(`  Capture: ${stats.framesCapture} frames (${stats.errors.capture} erreurs)`);
      console.log(`  Playback: ${stats.framesPlayback} frames (${stats.errors.playback} erreurs)`);
      console.log(`  Jitter buffer: ${stats.jitterBuffer.currentBufferSize}/${stats.jitterBuffer.maxSize} (santé: ${stats.jitterBuffer.health.toFixed(1)}%)`);
      console.log(`  Codec: enc=${stats.codec.encoded}, dec=${stats.codec.decoded}`);
    }, logInterval);
  }

  /**
   * Récupère les statistiques complètes
   * @returns {Object}
   */
  getStats() {
    const uptime = this.stats.startTime ? (Date.now() - this.stats.startTime) / 1000 : 0;

    return {
      running: this.isRunning,
      backendType: this.backendType,
      uptimeSeconds: uptime,
      framesCapture: this.stats.framesCapture,
      framesPlayback: this.stats.framesPlayback,
      bytesEncoded: this.stats.bytesEncoded,
      bytesDecoded: this.stats.bytesDecoded,
      errors: { ...this.stats.errors },
      audioBackend: this.audioBackend ? this.audioBackend.getStats() : null,
      codec: this.opusEncoder ? this.opusEncoder.getStats() : null,
      jitterBuffer: this.jitterBuffer ? this.jitterBuffer.getStats() : null,
      liveKit: this.liveKitClient ? this.liveKitClient.getStats() : null
    };
  }

  /**
   * Détruit le bridge et libère toutes les ressources
   */
  async destroy() {
    await this.stop();
    this.removeAllListeners();
    console.log('✓ AudioBridge détruit');
  }
}

export default AudioBridge;
