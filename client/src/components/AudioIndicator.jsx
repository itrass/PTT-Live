import './AudioIndicator.css';

/**
 * VU-mètre simple pour visualiser le niveau audio
 */
export default function AudioIndicator({ level, isTalking }) {
  // Normaliser niveau 0-100
  const normalizedLevel = Math.min(100, Math.max(0, level));

  return (
    <div className="audio-indicator-container">
      <div className="audio-indicator-label">
        <span>{isTalking ? 'Votre micro' : 'Audio entrant'}</span>
        <span className="audio-level-value">{Math.round(normalizedLevel)}%</span>
      </div>

      <div className="audio-indicator-bar">
        <div
          className={`audio-indicator-fill ${isTalking ? 'talking' : ''}`}
          style={{ width: `${normalizedLevel}%` }}
        />
      </div>

      {/* Bars VU-mètre style */}
      <div className="audio-bars">
        {[...Array(20)].map((_, i) => {
          const threshold = (i + 1) * 5;
          const isActive = normalizedLevel >= threshold;
          const isWarning = i >= 15; // > 75%
          const isDanger = i >= 18; // > 90%

          return (
            <div
              key={i}
              className={`audio-bar ${isActive ? 'active' : ''} ${
                isActive && isDanger ? 'danger' : isActive && isWarning ? 'warning' : ''
              }`}
            />
          );
        })}
      </div>
    </div>
  );
}
