/**
 * VUMeter.jsx
 * Composant VU-mètre minimaliste pour affichage niveaux audio temps réel
 */

import React from 'react';
import './VUMeter.css';

/**
 * Convertit une valeur dBFS en pourcentage pour affichage
 * -120dBFS = 0%, 0dBFS = 100%
 */
function dbToPercent(dbFS) {
  const min = -60; // On affiche à partir de -60dBFS
  const max = 0;

  if (dbFS <= min) return 0;
  if (dbFS >= max) return 100;

  return ((dbFS - min) / (max - min)) * 100;
}

/**
 * Détermine la couleur selon le niveau (style VU professionnel)
 */
function getLevelColor(dbFS) {
  if (dbFS >= -3) return '#ff4444'; // Rouge (clipping proche)
  if (dbFS >= -12) return '#ffaa00'; // Orange (niveau élevé)
  return '#44ff44'; // Vert (niveau nominal)
}

function VUMeter({ level, size = 'small', orientation = 'vertical' }) {
  if (!level) {
    level = { rms: -120, peak: 0, clipping: false };
  }

  const rmsPercent = dbToPercent(level.rms);
  const peakPercent = (level.peak || 0) * 100;

  const color = getLevelColor(level.rms);
  const isClipping = level.clipping || level.peak >= 0.99;

  if (size === 'mini') {
    // Version ultra-compacte pour matrice routing
    return (
      <div className={`vu-meter-mini ${isClipping ? 'clipping' : ''}`}>
        <div
          className="vu-meter-mini-bar"
          style={{
            width: `${rmsPercent}%`,
            backgroundColor: color
          }}
        />
      </div>
    );
  }

  if (orientation === 'horizontal') {
    return (
      <div className={`vu-meter-horizontal ${size} ${isClipping ? 'clipping' : ''}`}>
        <div className="vu-meter-bar-container">
          <div
            className="vu-meter-bar-rms"
            style={{
              width: `${rmsPercent}%`,
              backgroundColor: color
            }}
          />
          {level.peak > 0 && (
            <div
              className="vu-meter-bar-peak"
              style={{ left: `${peakPercent}%` }}
            />
          )}
        </div>
      </div>
    );
  }

  // Vertical (défaut)
  return (
    <div className={`vu-meter-vertical ${size} ${isClipping ? 'clipping' : ''}`}>
      <div className="vu-meter-bar-container">
        <div
          className="vu-meter-bar-rms"
          style={{
            height: `${rmsPercent}%`,
            backgroundColor: color
          }}
        />
        {level.peak > 0 && (
          <div
            className="vu-meter-bar-peak"
            style={{ bottom: `${peakPercent}%` }}
          />
        )}
      </div>
    </div>
  );
}

export default VUMeter;
