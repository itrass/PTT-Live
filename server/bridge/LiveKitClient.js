/**
 * LiveKitClient.js
 * Client LiveKit pour le bridge audio serveur
 *
 * Gère :
 * - Connexion à la room en tant que participant "bridge"
 * - Publication de track audio (Opus depuis carte son)
 * - Souscription aux tracks des autres participants (clients PWA)
 * - Reconnexion automatique
 */

import {
  Room,
  RoomEvent,
  RemoteTrack,
  RemoteParticipant,
  LocalAudioTrack,
  TrackPublishOptions,
  AudioPresets
} from 'livekit-client';
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
      audioBitrate: options.audioBitrate || 96000, // 96kbps par défaut
      ...options
    };

    this.room = null;
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
      this.room = new Room({
        adaptiveStream: true,
        dynacast: true,
        reconnectionPolicy: {
          nextRetryDelayInMs: (retryCount) => Math.min(1000 * Math.pow(2, retryCount), 10000)
        }
      });

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
    } catch (error) {
      console.error('Erreur connexion LiveKit:', error);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Configuration des event listeners de la room
   * @private
   */
  _setupEventListeners() {
    if (!this.room) return;

    // Connexion/déconnexion
    this.room.on(RoomEvent.Connected, () => {
      console.log('✓ Room connectée');
      this.isConnected = true;
    });

    this.room.on(RoomEvent.Disconnected, (reason) => {
      console.log('⚠ Room déconnectée:', reason);
      this.isConnected = false;
      this.emit('disconnected', { reason });
    });

    this.room.on(RoomEvent.Reconnecting, () => {
      console.log('🔄 Reconnexion en cours...');
      this.reconnecting = true;
      this.emit('reconnecting');
    });

    this.room.on(RoomEvent.Reconnected, () => {
      console.log('✓ Reconnecté');
      this.reconnecting = false;
      this.emit('reconnected');
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
        this.remoteParticipants.set(participant.sid, {
          participant,
          track,
          publication
        });
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

    // Données audio
    this.room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
      this.emit('audioPlaybackChanged');
    });

    // Erreurs
    this.room.on(RoomEvent.ConnectionQualityChanged, (quality, participant) => {
      this.emit('qualityChanged', { quality, participant });
    });
  }

  /**
   * Publie un track audio local depuis le bridge
   * Note: Pour un bridge serveur, on utilise plutôt publishData pour envoyer Opus directement
   * @param {MediaStreamTrack} mediaStreamTrack - Track audio du microphone
   * @returns {Promise<void>}
   */
  async publishAudioTrack(mediaStreamTrack) {
    if (!this.isConnected) {
      throw new Error('Pas connecté à LiveKit');
    }

    try {
      // Options de publication
      const options = {
        name: 'bridge-audio',
        source: 'microphone',
        audioBitrate: this.options.audioBitrate
      };

      this.localAudioTrack = await this.room.localParticipant.publishTrack(
        mediaStreamTrack,
        options
      );

      console.log('✓ Track audio local publié');
      this.emit('trackPublished', this.localAudioTrack);
    } catch (error) {
      console.error('Erreur publication track:', error);
      this.emit('error', error);
      throw error;
    }
  }

  /**
   * Unpublish le track audio local
   */
  async unpublishAudioTrack() {
    if (this.localAudioTrack) {
      await this.room.localParticipant.unpublishTrack(this.localAudioTrack);
      this.localAudioTrack = null;
      console.log('✓ Track audio local dépublié');
    }
  }

  /**
   * Envoie des données audio Opus directement (pour bridge serveur)
   * Alternative à publishAudioTrack pour contrôle bas niveau
   * @param {Buffer} opusData - Données Opus encodées
   */
  sendAudioData(opusData) {
    // Note: LiveKit ne supporte pas directement l'envoi de données Opus brutes
    // Cette méthode serait implémentée avec un track custom ou DataChannel
    // Pour l'instant, on utilise publishAudioTrack avec un MediaStreamTrack
    console.warn('sendAudioData: Non implémenté, utiliser publishAudioTrack');
  }

  /**
   * Récupère tous les tracks audio distants actifs
   * @returns {Array<Object>} Liste des tracks avec métadonnées
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
   * @param {string} sid - SID du participant
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
        tracksPublished: localParticipant?.trackPublications.size || 0
      },
      remoteParticipants: {
        count: participants.size,
        list: Array.from(participants.values()).map(p => ({
          sid: p.sid,
          identity: p.identity,
          audioTracks: Array.from(p.audioTrackPublications.values()).length,
          connectionQuality: p.connectionQuality
        }))
      }
    };
  }

  /**
   * Déconnexion de la room
   */
  async disconnect() {
    if (this.room) {
      await this.unpublishAudioTrack();
      this.room.disconnect();
      this.room = null;
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
