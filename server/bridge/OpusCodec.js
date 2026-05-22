/**
 * OpusCodec.js
 * Wrapper pour encoder/décoder audio avec Opus
 *
 * Gère :
 * - Encodage PCM 16-bit → Opus
 * - Décodage Opus → PCM 16-bit
 * - Configuration bitrate (32-320 kbps)
 * - Frame size flexible (20ms par défaut)
 */

import OpusScript from 'opusscript';

export class OpusCodec {
  constructor(options = {}) {
    this.options = {
      sampleRate: options.sampleRate || 48000,
      channels: options.channels || 1,
      bitrate: options.bitrate || 96000, // 96kbps par défaut (voix standard)
      frameSize: options.frameSize || 960, // 20ms à 48kHz
      application: options.application || 'voip', // 'voip' | 'audio' | 'restricted_lowdelay'
      ...options
    };

    // Validation
    this._validateOptions();

    // Création des encodeurs/décodeurs Opus
    this.encoder = null;
    this.decoder = null;

    this._initCodecs();

    // Statistiques
    this.stats = {
      encoded: 0,
      decoded: 0,
      encodeErrors: 0,
      decodeErrors: 0
    };
  }

  /**
   * Valide les options
   * @private
   */
  _validateOptions() {
    const validSampleRates = [8000, 12000, 16000, 24000, 48000];
    if (!validSampleRates.includes(this.options.sampleRate)) {
      throw new Error(`Sample rate invalide : ${this.options.sampleRate}. Valeurs acceptées : ${validSampleRates.join(', ')}`);
    }

    if (this.options.channels < 1 || this.options.channels > 2) {
      throw new Error(`Nombre de canaux invalide : ${this.options.channels}. Doit être 1 (mono) ou 2 (stereo)`);
    }

    if (this.options.bitrate < 6000 || this.options.bitrate > 510000) {
      throw new Error(`Bitrate invalide : ${this.options.bitrate}. Doit être entre 6000 et 510000 bps`);
    }

    const validApplications = ['voip', 'audio', 'restricted_lowdelay'];
    if (!validApplications.includes(this.options.application)) {
      throw new Error(`Application invalide : ${this.options.application}. Valeurs acceptées : ${validApplications.join(', ')}`);
    }
  }

  /**
   * Initialise les codecs Opus
   * @private
   */
  _initCodecs() {
    try {
      // Mapping des applications
      const appMapping = {
        'voip': OpusScript.Application.VOIP,
        'audio': OpusScript.Application.AUDIO,
        'restricted_lowdelay': OpusScript.Application.RESTRICTED_LOWDELAY
      };

      // Création encoder
      this.encoder = new OpusScript(
        this.options.sampleRate,
        this.options.channels,
        appMapping[this.options.application]
      );

      // Configuration bitrate
      this.encoder.setBitrate(this.options.bitrate);

      // Création decoder
      this.decoder = new OpusScript(
        this.options.sampleRate,
        this.options.channels,
        appMapping[this.options.application]
      );

      console.log(`✓ Opus codec initialisé : ${this.options.sampleRate}Hz, ${this.options.channels}ch, ${this.options.bitrate / 1000}kbps`);
    } catch (error) {
      console.error('Erreur initialisation codec Opus:', error);
      throw error;
    }
  }

  /**
   * Encode des données PCM en Opus
   * @param {Buffer} pcmData - Données PCM 16-bit signed
   * @returns {Buffer|null} Données Opus encodées ou null en cas d'erreur
   */
  encode(pcmData) {
    if (!this.encoder) {
      console.error('Encoder non initialisé');
      return null;
    }

    try {
      // Conversion Buffer → Int16Array pour OpusScript
      const pcmInt16 = new Int16Array(
        pcmData.buffer,
        pcmData.byteOffset,
        pcmData.byteLength / 2
      );

      // Vérification taille frame
      const expectedSamples = this.options.frameSize * this.options.channels;
      if (pcmInt16.length !== expectedSamples) {
        console.warn(`Taille frame incorrecte : ${pcmInt16.length} samples (attendu ${expectedSamples})`);
        // Padding ou truncate si nécessaire
        const adjusted = new Int16Array(expectedSamples);
        adjusted.set(pcmInt16.slice(0, expectedSamples));
        const opusData = this.encoder.encode(adjusted, this.options.frameSize);
        this.stats.encoded++;
        return Buffer.from(opusData);
      }

      // Encodage
      const opusData = this.encoder.encode(pcmInt16, this.options.frameSize);
      this.stats.encoded++;

      return Buffer.from(opusData);
    } catch (error) {
      console.error('Erreur encodage Opus:', error);
      this.stats.encodeErrors++;
      return null;
    }
  }

  /**
   * Décode des données Opus en PCM
   * @param {Buffer} opusData - Données Opus
   * @returns {Buffer|null} Données PCM 16-bit ou null en cas d'erreur
   */
  decode(opusData) {
    if (!this.decoder) {
      console.error('Decoder non initialisé');
      return null;
    }

    try {
      // Décodage
      const pcmInt16 = this.decoder.decode(opusData, this.options.frameSize);
      this.stats.decoded++;

      // Conversion Int16Array → Buffer
      const pcmBuffer = Buffer.from(pcmInt16.buffer);
      return pcmBuffer;
    } catch (error) {
      console.error('Erreur décodage Opus:', error);
      this.stats.decodeErrors++;
      return null;
    }
  }

  /**
   * Change le bitrate de l'encodeur
   * @param {number} bitrate - Nouveau bitrate en bps (6000-510000)
   */
  setBitrate(bitrate) {
    if (bitrate < 6000 || bitrate > 510000) {
      console.error(`Bitrate invalide : ${bitrate}`);
      return;
    }

    if (this.encoder) {
      this.encoder.setBitrate(bitrate);
      this.options.bitrate = bitrate;
      console.log(`✓ Bitrate Opus mis à jour : ${bitrate / 1000}kbps`);
    }
  }

  /**
   * Obtient les statistiques du codec
   * @returns {Object}
   */
  getStats() {
    return {
      ...this.stats,
      config: {
        sampleRate: this.options.sampleRate,
        channels: this.options.channels,
        bitrate: this.options.bitrate,
        frameSize: this.options.frameSize,
        application: this.options.application
      }
    };
  }

  /**
   * Réinitialise les statistiques
   */
  resetStats() {
    this.stats = {
      encoded: 0,
      decoded: 0,
      encodeErrors: 0,
      decodeErrors: 0
    };
  }

  /**
   * Détruit le codec et libère les ressources
   */
  destroy() {
    this.encoder = null;
    this.decoder = null;
    console.log('✓ OpusCodec détruit');
  }

  /**
   * Calcule la taille d'une frame en millisecondes
   * @returns {number} Durée en ms
   */
  getFrameDuration() {
    return (this.options.frameSize / this.options.sampleRate) * 1000;
  }

  /**
   * Calcule le nombre de bytes PCM pour une frame
   * @returns {number} Taille en bytes
   */
  getFrameSizeBytes() {
    // PCM 16-bit = 2 bytes par sample
    return this.options.frameSize * this.options.channels * 2;
  }
}

/**
 * Présets de configuration Opus selon le cas d'usage
 */
export const OpusPresets = {
  // Voix économique (WiFi limité, faible bande passante)
  VOICE_LOW: {
    bitrate: 32000, // 32 kbps
    application: 'voip'
  },

  // Voix économique améliorée
  VOICE_ECONOMY: {
    bitrate: 64000, // 64 kbps
    application: 'voip'
  },

  // Voix standard (défaut, bon compromis)
  VOICE_STANDARD: {
    bitrate: 96000, // 96 kbps
    application: 'voip'
  },

  // Voix HD (qualité maximale voix)
  VOICE_HD: {
    bitrate: 128000, // 128 kbps
    application: 'voip'
  },

  // Voix ultra HD
  VOICE_ULTRA: {
    bitrate: 192000, // 192 kbps
    application: 'audio'
  },

  // Musique/monitoring (si besoin événementiel)
  MUSIC: {
    bitrate: 256000, // 256 kbps
    application: 'audio'
  },

  // Musique haute qualité
  MUSIC_HQ: {
    bitrate: 320000, // 320 kbps
    application: 'audio'
  }
};

export default OpusCodec;
