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

import { Room, RoomEvent, AudioSource, AudioFrame, LocalAudioTrack, TrackSource, AudioStream, TrackKind } from '@livekit/rtc-node';
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
      // Conversion explicite en int32 pour l'API LiveKit
      const sampleRate = parseInt(this.options.sampleRate, 10);
      const channels = parseInt(this.options.channels, 10);

      // Création de l'AudioSource
      this.audioSource = new AudioSource(sampleRate, channels);

      // Création du LocalAudioTrack depuis l'AudioSource
      const localTrack = LocalAudioTrack.createAudioTrack('bridge-audio', this.audioSource);

      // Publication du track
      const options = {
        source: TrackSource.SOURCE_MICROPHONE // Simule un microphone pour les clients
      };

      this.localAudioTrack = await this.room.localParticipant.publishTrack(
        localTrack,
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
    this.room.on(RoomEvent.Disconnected, (reason) => {
      console.log('⚠ Room déconnectée:', reason);
      this.isConnected = false;
      this.emit('disconnected', { reason: reason || 'unknown' });
    });

    // Participants
    this.room.on(RoomEvent.ParticipantConnected, async (participant) => {
      console.log(`➕ Participant connecté: ${participant.identity}`);

      // Parcourir les tracks publiés par ce participant et s'y abonner manuellement
      for (const [trackSid, publication] of participant.trackPublications) {
        console.log(`  📝 Track disponible: ${publication.kind} (${trackSid}), muted: ${publication.muted}`);

        if (publication.kind === TrackKind.KIND_AUDIO && publication.track) {
          console.log(`  ⚡ Souscription manuelle au track audio ${trackSid}...`);
          await this._handleAudioTrack(publication.track, publication, participant);
        }
      }

      this.emit('participantConnected', participant);
    });

    this.room.on(RoomEvent.ParticipantDisconnected, (participant) => {
      console.log(`➖ Participant déconnecté: ${participant.identity}`);
      this.remoteParticipants.delete(participant.sid);
      this.emit('participantDisconnected', participant);
    });

    // Tracks - Debug tous les événements
    this.room.on(RoomEvent.TrackPublished, async (publication, participant) => {
      console.log(`📢 Track publié par ${participant.identity}: ${publication.kind} (${publication.sid}), muted: ${publication.muted}`);

      // Si c'est un track audio, s'y abonner immédiatement
      if (publication.kind === TrackKind.KIND_AUDIO && publication.track) {
        console.log(`  ⚡ Track audio détecté, souscription...`);
        await this._handleAudioTrack(publication.track, publication, participant);
      } else if (publication.kind === TrackKind.KIND_AUDIO && !publication.track) {
        console.log(`  ⚠️  Track audio publié mais track object non disponible encore`);
      }
    });

    this.room.on(RoomEvent.TrackSubscribed, async (track, publication, participant) => {
      console.log(`🎵 Track souscrit de ${participant.identity}: ${track.kind} (${publication.sid})`);

      if (track.kind === TrackKind.KIND_AUDIO) {
        console.log(`🎵 Track AUDIO souscrit de ${participant.identity} (événement TrackSubscribed)`);
        await this._handleAudioTrack(track, publication, participant);
      }
    });

    this.room.on(RoomEvent.TrackUnsubscribed, (track, publication, participant) => {
      if (track.kind === TrackKind.KIND_AUDIO) {
        console.log(`🔇 Track audio désouscrit de ${participant.identity}`);
        this.remoteParticipants.delete(participant.sid);
        this.emit('audioTrackUnsubscribed', { track, participant });
      }
    });
  }

  /**
   * Gère un track audio (création AudioStream et lecture)
   * @private
   */
  async _handleAudioTrack(track, publication, participant) {
    console.log(`🎧 Création AudioStream pour ${participant.identity}...`);

    // Création d'un AudioStream pour recevoir les données PCM
    const stream = new AudioStream(
      track,
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

    if (!this.isConnected || !this.localAudioTrack) {
      // Silently drop frames si pas encore connecté
      return;
    }

    try {
      // Création d'un AudioFrame (conversion en int32 explicite)
      const samplesPerChannel = Math.floor(pcmData.length / 2 / this.options.channels);

      const frame = new AudioFrame(
        pcmData,
        parseInt(this.options.sampleRate, 10),
        parseInt(this.options.channels, 10),
        samplesPerChannel
      );

      // Envoi via AudioSource
      await this.audioSource.captureFrame(frame);

    } catch (error) {
      // Ne logger que les erreurs non-InvalidState pour éviter le spam
      if (!error.message.includes('InvalidState')) {
        console.error('Erreur envoi audio:', error);
      }
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
        try {
          await this.room.localParticipant.unpublishTrack(this.localAudioTrack.sid);
        } catch (error) {
          // Ignorer l'erreur si le track n'existe plus (shutdown rapide)
          if (!error.message?.includes('track not found')) {
            console.warn('⚠️  Erreur unpublish track:', error.message);
          }
        }
        this.localAudioTrack = null;
      }

      // Déconnexion
      await this.room.disconnect();
      this.room = null;
      this.audioSource = null;
      this.isConnected = false;
      this.remoteParticipants.clear();
      console.log('✓ Déconnecté de LiveKit');
      this.emit('disconnected', { reason: 'manual' });
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
