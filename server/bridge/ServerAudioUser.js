/**
 * ServerAudioUser.js
 * Utilisateur audio géré côté serveur : participant LiveKit indépendant
 * avec un canal physique d'entrée dédié et un canal physique de sortie dédié.
 *
 * Chaque instance :
 * - Publie son canal physique d'entrée comme track LiveKit
 * - Reçoit l'audio de tous les autres participants (mix-minus naturel)
 * - Émet 'outputReady' avec le mix Float32 quand une frame complète est prête
 */

import { EventEmitter } from 'events';
import LiveKitClient from './LiveKitClient.js';

class ServerAudioUser extends EventEmitter {
  constructor(options) {
    super();

    this.name = options.name;
    this.inputChannel = (options.inputChannel !== null && options.inputChannel !== undefined)
      ? parseInt(options.inputChannel, 10)
      : null;
    this.outputChannel = (options.outputChannel !== null && options.outputChannel !== undefined)
      ? parseInt(options.outputChannel, 10)
      : null;
    this.publish = options.publish !== false; // false = écoute seule
    this.groupId = options.groupId;
    this.frameSize = options.frameSize || 960;
    this.sampleRate = options.sampleRate || 48000;

    this.client = new LiveKitClient({
      url: options.liveKitUrl,
      token: options.token,
      roomName: options.groupId,
      participantName: `server-${options.name}`,
      sampleRate: this.sampleRate,
      channels: 1,
    });

    // Accumulateurs PCM par participant distant (pour pouvoir mixer leurs frames)
    this.participantAccumulators = new Map(); // Map<participantSid, { buffer: Float32Array, offset: number }>

    // Dernier mix calculé (prêt à être envoyé vers le canal physique de sortie)
    this.mixedOutput = null; // Float32Array de frameSize samples

    this._setupClientEvents();
  }

  _setupClientEvents() {
    this.client.on('connected', () => {
      const mode = this.publish ? `in:${this.inputChannel} → out:${this.outputChannel ?? 'aucune'}` : `écoute → out:${this.outputChannel ?? 'aucune'}`;
      console.log(`[ServerAudioUser:${this.name}] Connecté à room "${this.groupId}" (${mode})`);
      this.emit('connected');
    });

    this.client.on('disconnected', (data) => {
      console.warn(`[ServerAudioUser:${this.name}] Déconnecté:`, data?.reason || 'unknown');
      this.emit('disconnected', data);
    });

    // Réception audio depuis les autres participants → accumulation et mix
    this.client.on('audioData', ({ participantSid, pcmData }) => {
      this._accumulate(participantSid, pcmData);
    });

    // Nettoyage des buffers quand un participant quitte
    this.client.on('participantDisconnected', (participant) => {
      this.participantAccumulators.delete(participant.sid);
    });
  }

  /**
   * Démarre la connexion LiveKit
   */
  async start() {
    await this.client.connect();
  }

  /**
   * Envoie les données audio du canal d'entrée physique vers LiveKit.
   * Appelé par AudioBridge à chaque frame de capture.
   * @param {Float32Array} float32Data - Données PCM normalisées [-1.0, 1.0]
   */
  sendAudio(float32Data) {
    if (!this.publish || !this.client.isConnected) return;

    const pcmBuffer = this._float32ToBuffer(float32Data);
    this.client.sendAudioData(pcmBuffer);
  }

  /**
   * Retourne le dernier mix calculé, ou null si aucune frame reçue.
   * @returns {Float32Array|null}
   */
  getMixedOutput() {
    return this.mixedOutput;
  }

  /**
   * Accumule les frames PCM reçues d'un participant.
   * Quand une frame complète est disponible, calcule le mix.
   * @private
   */
  _accumulate(participantSid, pcmData) {
    const float32 = this._bufferToFloat32(pcmData);

    if (!this.participantAccumulators.has(participantSid)) {
      this.participantAccumulators.set(participantSid, {
        buffer: new Float32Array(this.frameSize),
        offset: 0
      });
    }

    const acc = this.participantAccumulators.get(participantSid);
    const toCopy = Math.min(float32.length, this.frameSize - acc.offset);

    if (toCopy > 0) {
      acc.buffer.set(float32.subarray(0, toCopy), acc.offset);
      acc.offset += toCopy;
    }

    if (acc.offset >= this.frameSize) {
      this._computeMix();
      acc.offset = 0;
      acc.buffer.fill(0);
    }
  }

  /**
   * Calcule le mix additif de tous les participants et émet 'outputReady'.
   * @private
   */
  _computeMix() {
    const mix = new Float32Array(this.frameSize);

    for (const { buffer } of this.participantAccumulators.values()) {
      for (let i = 0; i < this.frameSize; i++) {
        mix[i] += buffer[i];
      }
    }

    // Clamp
    for (let i = 0; i < mix.length; i++) {
      mix[i] = Math.max(-1.0, Math.min(1.0, mix[i]));
    }

    this.mixedOutput = mix;
    this.emit('outputReady', mix);
  }

  /**
   * Convertit Buffer/Int16Array PCM 16-bit → Float32Array [-1.0, 1.0]
   * @private
   */
  _bufferToFloat32(buffer) {
    if (buffer instanceof Int16Array) {
      const f = new Float32Array(buffer.length);
      for (let i = 0; i < buffer.length; i++) f[i] = buffer[i] / 32768.0;
      return f;
    }
    if (!(buffer instanceof Buffer)) buffer = Buffer.from(buffer);
    const samples = buffer.length / 2;
    const f = new Float32Array(samples);
    for (let i = 0; i < samples; i++) {
      f[i] = buffer.readInt16LE(i * 2) / 32768.0;
    }
    return f;
  }

  /**
   * Convertit Float32Array [-1.0, 1.0] → Buffer PCM 16-bit
   * @private
   */
  _float32ToBuffer(float32) {
    const buf = Buffer.alloc(float32.length * 2);
    for (let i = 0; i < float32.length; i++) {
      const clamped = Math.max(-1.0, Math.min(1.0, float32[i]));
      buf.writeInt16LE(Math.round(clamped * 32767), i * 2);
    }
    return buf;
  }

  /**
   * Arrête l'utilisateur et libère les ressources.
   */
  async stop() {
    await this.client.destroy();
    this.participantAccumulators.clear();
    this.mixedOutput = null;
    this.removeAllListeners();
  }
}

export default ServerAudioUser;
