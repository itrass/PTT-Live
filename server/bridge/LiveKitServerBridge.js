/**
 * LiveKitServerBridge.js
 * Pont entre AudioBridge (cartes son) et LiveKit (clients WebRTC)
 *
 * Agit comme un participant virtuel qui :
 * - Publie l'audio des cartes son vers les clients WebRTC
 * - Reçoit l'audio des clients et le renvoie vers les cartes son
 *
 * Architecture :
 * [Carte Son] → AudioBridge → LiveKitServerBridge → LiveKit SFU → [Clients WebRTC]
 *                                      ↑
 *                            Gère le routing par groupe
 */

import { RoomServiceClient, AccessToken, TrackSource } from 'livekit-server-sdk';
import { EventEmitter } from 'events';

export class LiveKitServerBridge extends EventEmitter {
  constructor(audioBridge, options = {}) {
    super();

    this.audioBridge = audioBridge;

    this.options = {
      url: options.url || 'ws://localhost:7880',
      apiKey: options.apiKey || process.env.LIVEKIT_API_KEY,
      apiSecret: options.apiSecret || process.env.LIVEKIT_API_SECRET,
      roomName: options.roomName || 'main',
      participantName: options.participantName || 'AudioBridge',
      ...options
    };

    this.roomServiceClient = null;
    this.activeGroups = new Map(); // Map<groupName, { participants, audioData }>
    this.isConnected = false;
  }

  /**
   * Initialise la connexion au serveur LiveKit
   */
  async connect() {
    try {
      // Créer le client pour l'API LiveKit
      this.roomServiceClient = new RoomServiceClient(
        this.options.url.replace('ws://', 'http://').replace('wss://', 'https://'),
        this.options.apiKey,
        this.options.apiSecret
      );

      console.log('✓ LiveKitServerBridge : Connexion API établie');

      // Configurer les événements AudioBridge
      this._setupAudioBridgeListeners();

      this.isConnected = true;
      this.emit('connected');
    } catch (error) {
      console.error('Erreur connexion LiveKitServerBridge:', error);
      throw error;
    }
  }

  /**
   * Configure les listeners pour l'AudioBridge
   * @private
   */
  _setupAudioBridgeListeners() {
    // FLUX SORTANT : Carte son → Groupes → LiveKit
    this.audioBridge.on('groupAudioOut', ({ groupName, opusData, pcmBuffer }) => {
      this._handleGroupAudioOut(groupName, opusData, pcmBuffer);
    });

    console.log('✓ LiveKitServerBridge : Listeners AudioBridge configurés');
  }

  /**
   * Gère l'audio sortant d'un groupe vers LiveKit
   * @param {string} groupName - Nom du groupe
   * @param {Buffer} opusData - Données Opus encodées
   * @param {Buffer} pcmBuffer - Données PCM (pour debug)
   * @private
   */
  async _handleGroupAudioOut(groupName, opusData, pcmBuffer) {
    try {
      // Pour l'instant, on stocke les données pour les envoyer via DataChannel
      // ou via un participant virtuel par groupe

      // IMPLÉMENTATION PHASE 3+ :
      // Option A : Utiliser @livekit/rtc-node pour créer un AudioSource par groupe
      // Option B : Utiliser DataChannel pour envoyer Opus directement
      // Option C : Utiliser un participant virtuel par groupe (simple mais plus de ressources)

      // Pour Phase actuelle, on émet un événement pour debug/monitoring
      this.emit('groupAudioProcessed', {
        groupName,
        opusSize: opusData.length,
        pcmSize: pcmBuffer.length
      });

      // TODO: Implémenter l'envoi réel vers LiveKit
      // Voir docs/LIVEKIT_AUDIO_BRIDGE.md pour les 3 approches possibles

    } catch (error) {
      console.error(`Erreur envoi audio groupe ${groupName}:`, error);
      this.emit('error', { groupName, error });
    }
  }

  /**
   * Méthode pour simuler la réception d'audio depuis LiveKit
   * (À connecter avec le vrai système LiveKit via webhook ou polling)
   *
   * @param {string} groupName - Nom du groupe
   * @param {Buffer} pcmBuffer - Audio PCM depuis un client
   */
  injectGroupAudioIn(groupName, pcmBuffer) {
    // Envoyer vers AudioBridge pour routing vers la carte son
    this.audioBridge.emit('groupAudioIn', { groupName, pcmBuffer });
  }

  /**
   * Génère un token d'accès pour un client
   * @param {string} identity - Identité du participant (ex: "user123")
   * @param {string} groupName - Groupe à rejoindre
   * @returns {string} JWT token
   */
  async generateClientToken(identity, groupName) {
    const at = new AccessToken(
      this.options.apiKey,
      this.options.apiSecret,
      {
        identity,
        name: identity,
        ttl: '24h'
      }
    );

    at.addGrant({
      room: groupName, // Chaque groupe = une room LiveKit
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true
    });

    return at.toJwt();
  }

  /**
   * Liste tous les participants actifs dans une room/groupe
   * @param {string} groupName - Nom du groupe
   * @returns {Promise<Array>} Liste des participants
   */
  async listParticipants(groupName) {
    try {
      const participants = await this.roomServiceClient.listParticipants(groupName);
      return participants;
    } catch (error) {
      console.error(`Erreur listing participants ${groupName}:`, error);
      return [];
    }
  }

  /**
   * Vérifie si une room/groupe existe
   * @param {string} groupName - Nom du groupe
   * @returns {Promise<boolean>}
   */
  async roomExists(groupName) {
    try {
      const rooms = await this.roomServiceClient.listRooms();
      return rooms.some(room => room.name === groupName);
    } catch (error) {
      console.error('Erreur vérification room:', error);
      return false;
    }
  }

  /**
   * Crée une room/groupe si elle n'existe pas
   * @param {string} groupName - Nom du groupe
   */
  async ensureRoomExists(groupName) {
    const exists = await this.roomExists(groupName);

    if (!exists) {
      try {
        await this.roomServiceClient.createRoom({
          name: groupName,
          emptyTimeout: 300, // 5 minutes timeout si vide
          maxParticipants: 50
        });
        console.log(`✓ Room créée : ${groupName}`);
      } catch (error) {
        console.error(`Erreur création room ${groupName}:`, error);
      }
    }
  }

  /**
   * Obtient les statistiques du bridge
   */
  getStats() {
    return {
      connected: this.isConnected,
      activeGroups: this.activeGroups.size,
      apiUrl: this.options.url,
      roomName: this.options.roomName
    };
  }

  /**
   * Déconnexion
   */
  async disconnect() {
    if (this.audioBridge) {
      this.audioBridge.removeAllListeners('groupAudioOut');
    }

    this.activeGroups.clear();
    this.isConnected = false;

    console.log('✓ LiveKitServerBridge déconnecté');
    this.emit('disconnected');
  }

  /**
   * Détruit le bridge et libère les ressources
   */
  async destroy() {
    await this.disconnect();
    this.removeAllListeners();
    console.log('✓ LiveKitServerBridge détruit');
  }
}

export default LiveKitServerBridge;
