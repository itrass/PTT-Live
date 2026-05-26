/**
 * LiveKitClient.js
 * Client LiveKit pour le bridge audio serveur (Node.js)
 *
 * Utilise @livekit/rtc-node pour :
 * - Connexion à la room en tant que participant "bridge"
 * - Publication de tracks audio (PCM depuis carte son)
 * - Souscription aux tracks des autres participants (clients PWA)
 * - Gestion audio bas niveau (AudioSource/AudioStream)
 * - Reconnexion automatique
 */

import { Room, RoomEvent, AudioSource, AudioFrame } from '@livekit/rtc-node';
import { EventEmitter } from 'events';

export class LiveKitClient extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      url: options.url || 'ws://localhost:7880',
      roomName: options.roomName || 'main',
      participantName: options.participantName || 'AudioBridge',
      token: options.token || null,
      autoSubscribe: options.autoSubscribe !== false,
      sampleRate: options.sampleRate || 48000,
      channels: options.channels || 1, // Mono par défaut pour PTT
      ...options
    };

    this.room = null;
    this.audioSource = null;
    this.localAudioTrack = null;
    this.isConnected = false;
    this.reconnecting = false;

    // Map des participants distants et leurs tracks
    this.remoteParticipants = new Map();
  }

  /**
   * Connexion à la room LiveKit
   * @returns {Promise<void>}
   */
  async connect() {
    if (this.isConnected) {
      console.warn('Déjà connecté à LiveKit');
      return;
    }

    if (!this.options.token) {
      throw new Error('Token LiveKit requis pour la connexion');
    }

    try {
      // Création room
      this.room = new Room();

      // Configuration des event listeners
      this._setupEventListeners();

      // Connexion
      await this.room.connect(this.options.url, this.options.token);

      this.isConnected = true;
      console.log(`✓ Connecté à LiveKit room "${this.options.roomName}" en tant que "${this.options.participantName}"`);

      this.emit('connected', {
        roomName: this.options.roomName,
        participantName: this.options.participantName
      });

      // Création de l'AudioSource pour pouvoir publier de l'audio
      await this._createAudioSource();

    } catch (error) {
      console.error('Erreur connexion LiveKit:', error);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Crée une AudioSource pour la publication audio
   * @private
   */
  async _createAudioSource() {
    try {
      this.audioSource = new AudioSource(
        this.options.sampleRate,
        this.options.channels
      );

      // Publication du track audio
      const options = {
        source: 'microphone' // Simule un microphone pour les clients
      };

      this.localAudioTrack = await this.room.localParticipant.publishTrack(
        this.audioSource,
        options
      );

      console.log('✓ AudioSource créée et track publié');
      this.emit('trackPublished', this.localAudioTrack);

    } catch (error) {
      console.error('Erreur création AudioSource:', error);
      throw error;
    }
  }

  /**
   * Configuration des event listeners de la room
   * @private
   */
  _setupEventListeners() {
    if (!this.room) return;

    // Connexion
    this.room.on(RoomEvent.Connected, () => {
      console.log('✓ Room connectée');
      this.isConnected = true;
    });

    // Déconnexion
    this.room.on(RoomEvent.Disconnected, () => {
      console.log('⚠ Room déconnectée');
      this.isConnected = false;
      this.emit('disconnected');
    });

    // Participants
    this.room.on(RoomEvent.ParticipantConnected, (participant) => {
      console.log(`➕ Participant connecté: ${participant.identity}`);
      this.emit('participantConnected', participant);
    });

    this.room.on(RoomEvent.ParticipantDisconnected, (participant) => {
      console.log(`➖ Participant déconnecté: ${participant.identity}`);
      this.remoteParticipants.delete(participant.sid);
      this.emit('participantDisconnected', participant);
    });

    // Tracks
    this.room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      if (track.kind === 'audio') {
        console.log(`🎵 Track audio souscrit de ${participant.identity}`);

        // Création d'un AudioStream pour recevoir les données PCM
        const stream = new track.AudioStream(
          this.options.sampleRate,
          this.options.channels
        );

        this.remoteParticipants.set(participant.sid, {
          participant,
          track,
          publication,
          stream
        });

        // Lecture des frames audio
        this._startAudioReceive(participant.sid, stream);

        this.emit('audioTrackSubscribed', { track, participant });
      }
    });

    this.room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
      if (track.kind === 'audio') {
        console.log(`🔇 Track audio désouscrit de ${participant.identity}`);
        this.remoteParticipants.delete(participant.sid);
        this.emit('audioTrackUnsubscribed', { track, participant });
      }
    });
  }

  /**
   * Démarre la réception audio d'un participant
   * @private
   */
  async _startAudioReceive(participantSid, stream) {
    try {
      // Lecture continue des frames audio
      for await (const frame of stream) {
        // frame est un AudioFrame avec :
        // - data: Buffer PCM int16
        // - sampleRate: number
        // - numChannels: number
        // - samplesPerChannel: number

        const participant = this.remoteParticipants.get(participantSid);
        if (!participant) break;

        // Émettre les données audio vers AudioBridge
        this.emit('audioData', {
          participantSid,
          participantName: participant.participant.identity,
          pcmData: frame.data,
          sampleRate: frame.sampleRate,
          channels: frame.numChannels,
          samplesPerChannel: frame.samplesPerChannel
        });
      }
    } catch (error) {
      console.error(`Erreur réception audio ${participantSid}:`, error);
    }
  }

  /**
   * Envoie des données audio PCM vers les clients
   * @param {Buffer} pcmData - Données PCM int16 (mono ou multi-canal)
   */
  async sendAudioData(pcmData) {
    if (!this.audioSource) {
      console.warn('AudioSource non initialisée');
      return;
    }

    try {
      // Création d'un AudioFrame
      const samplesPerChannel = pcmData.length / 2 / this.options.channels;

      const frame = new AudioFrame(
        pcmData,
        this.options.sampleRate,
        this.options.channels,
        samplesPerChannel
      );

      // Envoi via AudioSource
      await this.audioSource.captureFrame(frame);

    } catch (error) {
      console.error('Erreur envoi audio:', error);
    }
  }

  /**
   * Récupère tous les tracks audio distants actifs
   * @returns {Array<Object>}
   */
  getRemoteAudioTracks() {
    return Array.from(this.remoteParticipants.values()).map(({ participant, track, publication }) => ({
      participantId: participant.sid,
      participantName: participant.identity,
      track,
      publication,
      isMuted: publication.isMuted,
      isSubscribed: publication.isSubscribed
    }));
  }

  /**
   * Récupère un participant distant par son SID
   * @param {string} sid
   * @returns {Object|null}
   */
  getRemoteParticipant(sid) {
    return this.remoteParticipants.get(sid) || null;
  }

  /**
   * Obtient les statistiques de connexion
   * @returns {Object}
   */
  async getStats() {
    if (!this.room || !this.isConnected) {
      return null;
    }

    const participants = this.room.remoteParticipants;
    const localParticipant = this.room.localParticipant;

    return {
      connected: this.isConnected,
      reconnecting: this.reconnecting,
      roomName: this.options.roomName,
      participantName: this.options.participantName,
      localParticipant: {
        sid: localParticipant?.sid,
        identity: localParticipant?.identity,
        tracksPublished: localParticipant?.trackPublications?.size || 0
      },
      remoteParticipants: {
        count: participants.size,
        list: Array.from(participants.values()).map(p => ({
          sid: p.sid,
          identity: p.identity,
          audioTracks: Array.from(p.audioTrackPublications?.values() || []).length
        }))
      }
    };
  }

  /**
   * Déconnexion de la room
   */
  async disconnect() {
    if (this.room) {
      // Unpublish track
      if (this.localAudioTrack) {
        await this.room.localParticipant.unpublishTrack(this.localAudioTrack.sid);
        this.localAudioTrack = null;
      }

      // Déconnexion
      await this.room.disconnect();
      this.room = null;
      this.audioSource = null;
      this.isConnected = false;
      this.remoteParticipants.clear();
      console.log('✓ Déconnecté de LiveKit');
      this.emit('disconnected');
    }
  }

  /**
   * Détruit le client et libère les ressources
   */
  async destroy() {
    await this.disconnect();
    this.removeAllListeners();
    console.log('✓ LiveKitClient détruit');
  }

  /**
   * Vérifie si le client est connecté
   * @returns {boolean}
   */
  get connected() {
    return this.isConnected && this.room !== null;
  }

  /**
   * Récupère la room LiveKit (accès direct si nécessaire)
   * @returns {Room|null}
   */
  getRoom() {
    return this.room;
  }
}

export default LiveKitClient;
