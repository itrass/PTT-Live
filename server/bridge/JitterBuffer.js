/**
 * JitterBuffer.js
 * Buffer FIFO pour compenser le jitter réseau et garantir lecture fluide
 *
 * Gère :
 * - Buffer circulaire avec cible 40ms
 * - Détection underrun (buffer vide)
 * - Détection overrun (buffer plein)
 * - Statistiques latence et santé buffer
 */

import { EventEmitter } from 'events';

export class JitterBuffer extends EventEmitter {
  constructor(options = {}) {
    super();

    this.options = {
      targetSize: options.targetSize || 2, // Nombre de frames cible (40ms = 2x 20ms frames)
      maxSize: options.maxSize || 10, // Taille max buffer (200ms)
      minSize: options.minSize || 1, // Taille min avant lecture
      adaptiveMode: options.adaptiveMode !== false, // Adaptation automatique
      ...options
    };

    // Buffer de frames
    this.buffer = [];

    // Statistiques
    this.stats = {
      received: 0,
      played: 0,
      underruns: 0,
      overruns: 0,
      dropped: 0,
      avgBufferSize: 0,
      currentBufferSize: 0,
      latencyMs: 0
    };

    // Historique pour adaptation
    this.bufferSizeHistory = [];
    this.historyMaxLength = 100;

    // État
    this.isReady = false;
    this.lastUpdateTime = Date.now();
  }

  /**
   * Ajoute une frame au buffer
   * @param {Buffer} frame - Frame audio (Opus ou PCM)
   * @param {Object} metadata - Métadonnées optionnelles (timestamp, sequence, etc.)
   * @returns {boolean} True si ajouté, false si buffer plein
   */
  push(frame, metadata = {}) {
    const now = Date.now();

    // Vérification buffer plein
    if (this.buffer.length >= this.options.maxSize) {
      this.stats.overruns++;
      this.emit('overrun', {
        bufferSize: this.buffer.length,
        maxSize: this.options.maxSize
      });

      // En mode adaptatif, on drop la frame la plus ancienne
      if (this.options.adaptiveMode) {
        this.buffer.shift();
        this.stats.dropped++;
      } else {
        return false;
      }
    }

    // Ajout de la frame avec timestamp
    this.buffer.push({
      data: frame,
      timestamp: now,
      metadata
    });

    this.stats.received++;
    this.stats.currentBufferSize = this.buffer.length;

    // Mise à jour historique
    this._updateHistory();

    // Vérification si le buffer est prêt pour la lecture
    if (!this.isReady && this.buffer.length >= this.options.minSize) {
      this.isReady = true;
      this.emit('ready', { bufferSize: this.buffer.length });
    }

    return true;
  }

  /**
   * Récupère la prochaine frame du buffer
   * @returns {Buffer|null} Frame audio ou null si buffer vide
   */
  pop() {
    if (this.buffer.length === 0) {
      this.stats.underruns++;
      this.isReady = false;
      this.emit('underrun', {
        bufferSize: 0
      });
      return null;
    }

    // Récupération de la frame la plus ancienne
    const item = this.buffer.shift();
    this.stats.played++;
    this.stats.currentBufferSize = this.buffer.length;

    // Calcul latence (temps passé dans le buffer)
    const latency = Date.now() - item.timestamp;
    this.stats.latencyMs = latency;

    // Mise à jour historique
    this._updateHistory();

    return item.data;
  }

  /**
   * Récupère la prochaine frame sans la retirer du buffer
   * @returns {Buffer|null}
   */
  peek() {
    if (this.buffer.length === 0) {
      return null;
    }
    return this.buffer[0].data;
  }

  /**
   * Vide le buffer
   */
  flush() {
    const flushedCount = this.buffer.length;
    this.buffer = [];
    this.isReady = false;
    this.stats.currentBufferSize = 0;
    this.emit('flush', { flushedCount });
  }

  /**
   * Mise à jour de l'historique des tailles de buffer
   * @private
   */
  _updateHistory() {
    this.bufferSizeHistory.push(this.buffer.length);

    // Limite la taille de l'historique
    if (this.bufferSizeHistory.length > this.historyMaxLength) {
      this.bufferSizeHistory.shift();
    }

    // Calcul moyenne
    const sum = this.bufferSizeHistory.reduce((a, b) => a + b, 0);
    this.stats.avgBufferSize = sum / this.bufferSizeHistory.length;
  }

  /**
   * Adaptation automatique de la taille cible du buffer
   * Appelé périodiquement pour ajuster selon les conditions réseau
   */
  adapt() {
    if (!this.options.adaptiveMode) return;

    // Analyse de l'historique pour détecter les tendances
    if (this.bufferSizeHistory.length < 10) return;

    const recent = this.bufferSizeHistory.slice(-10);
    const avg = recent.reduce((a, b) => a + b, 0) / recent.length;

    // Si le buffer est souvent proche du min, augmenter la cible
    if (avg < this.options.targetSize * 0.7 && this.options.targetSize < this.options.maxSize / 2) {
      this.options.targetSize++;
      this.emit('adapted', {
        newTargetSize: this.options.targetSize,
        reason: 'buffer_low',
        avgSize: avg
      });
    }

    // Si le buffer est souvent plein, réduire la cible
    if (avg > this.options.targetSize * 1.5 && this.options.targetSize > this.options.minSize) {
      this.options.targetSize--;
      this.emit('adapted', {
        newTargetSize: this.options.targetSize,
        reason: 'buffer_high',
        avgSize: avg
      });
    }
  }

  /**
   * Obtient les statistiques du buffer
   * @returns {Object}
   */
  getStats() {
    return {
      ...this.stats,
      isReady: this.isReady,
      targetSize: this.options.targetSize,
      maxSize: this.options.maxSize,
      fillPercentage: (this.buffer.length / this.options.maxSize) * 100,
      health: this._getHealthScore()
    };
  }

  /**
   * Calcule un score de santé du buffer (0-100)
   * @returns {number}
   * @private
   */
  _getHealthScore() {
    let score = 100;

    // Pénalité pour underruns
    if (this.stats.played > 0) {
      const underrunRate = this.stats.underruns / this.stats.played;
      score -= underrunRate * 50;
    }

    // Pénalité pour overruns
    if (this.stats.received > 0) {
      const overrunRate = this.stats.overruns / this.stats.received;
      score -= overrunRate * 30;
    }

    // Pénalité si taille actuelle loin de la cible
    const targetDiff = Math.abs(this.buffer.length - this.options.targetSize);
    score -= (targetDiff / this.options.maxSize) * 20;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Réinitialise les statistiques
   */
  resetStats() {
    this.stats = {
      received: 0,
      played: 0,
      underruns: 0,
      overruns: 0,
      dropped: 0,
      avgBufferSize: 0,
      currentBufferSize: this.buffer.length,
      latencyMs: 0
    };
    this.bufferSizeHistory = [];
  }

  /**
   * Vérifie si le buffer est prêt pour la lecture
   * @returns {boolean}
   */
  isReadyToPlay() {
    return this.isReady && this.buffer.length >= this.options.minSize;
  }

  /**
   * Obtient la latence actuelle du buffer en ms
   * @param {number} frameDurationMs - Durée d'une frame en ms
   * @returns {number}
   */
  getCurrentLatency(frameDurationMs) {
    return this.buffer.length * frameDurationMs;
  }

  /**
   * Détruit le buffer et libère les ressources
   */
  destroy() {
    this.flush();
    this.removeAllListeners();
    console.log('✓ JitterBuffer détruit');
  }
}

/**
 * Présets de configuration JitterBuffer selon le cas d'usage
 */
export const JitterBufferPresets = {
  // Très faible latence (réseau local stable)
  ULTRA_LOW_LATENCY: {
    targetSize: 1,
    maxSize: 5,
    minSize: 1,
    adaptiveMode: false
  },

  // Faible latence (WiFi local)
  LOW_LATENCY: {
    targetSize: 2,
    maxSize: 8,
    minSize: 1,
    adaptiveMode: true
  },

  // Latence standard (défaut, bon compromis)
  STANDARD: {
    targetSize: 3,
    maxSize: 10,
    minSize: 2,
    adaptiveMode: true
  },

  // Haute tolérance (réseau instable)
  HIGH_TOLERANCE: {
    targetSize: 5,
    maxSize: 15,
    minSize: 2,
    adaptiveMode: true
  }
};

export default JitterBuffer;
