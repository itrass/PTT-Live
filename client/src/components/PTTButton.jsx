import { useEffect, useRef } from 'react';
import './PTTButton.css';

/**
 * Bouton PTT principal
 * Gère touch et mouse events pour desktop et mobile
 */
export default function PTTButton({ isTalking, onPressStart, onPressEnd }) {
  const buttonRef = useRef(null);
  const isPressingRef = useRef(false);

  useEffect(() => {
    const button = buttonRef.current;
    if (!button) return;

    // Empêcher comportements par défaut
    const preventDefault = (e) => {
      e.preventDefault();
    };

    // Touch events (mobile)
    const handleTouchStart = (e) => {
      e.preventDefault();
      if (!isPressingRef.current) {
        isPressingRef.current = true;
        onPressStart();
      }
    };

    const handleTouchEnd = (e) => {
      e.preventDefault();
      if (isPressingRef.current) {
        isPressingRef.current = false;
        onPressEnd();
      }
    };

    // Mouse events (desktop)
    const handleMouseDown = (e) => {
      e.preventDefault();
      if (!isPressingRef.current) {
        isPressingRef.current = true;
        onPressStart();
      }
    };

    const handleMouseUp = (e) => {
      e.preventDefault();
      if (isPressingRef.current) {
        isPressingRef.current = false;
        onPressEnd();
      }
    };

    const handleMouseLeave = (e) => {
      // Si on quitte le bouton en maintenant, on arrête
      if (isPressingRef.current) {
        isPressingRef.current = false;
        onPressEnd();
      }
    };

    // Attacher events
    button.addEventListener('touchstart', handleTouchStart, { passive: false });
    button.addEventListener('touchend', handleTouchEnd, { passive: false });
    button.addEventListener('touchcancel', handleTouchEnd, { passive: false });
    button.addEventListener('mousedown', handleMouseDown);
    button.addEventListener('mouseup', handleMouseUp);
    button.addEventListener('mouseleave', handleMouseLeave);
    button.addEventListener('contextmenu', preventDefault);

    return () => {
      button.removeEventListener('touchstart', handleTouchStart);
      button.removeEventListener('touchend', handleTouchEnd);
      button.removeEventListener('touchcancel', handleTouchEnd);
      button.removeEventListener('mousedown', handleMouseDown);
      button.removeEventListener('mouseup', handleMouseUp);
      button.removeEventListener('mouseleave', handleMouseLeave);
      button.removeEventListener('contextmenu', preventDefault);
    };
  }, [onPressStart, onPressEnd]);

  return (
    <div className="ptt-container">
      <button
        ref={buttonRef}
        className={`ptt-button ${isTalking ? 'talking' : ''}`}
        type="button"
      >
        <div className="ptt-icon">
          {isTalking ? (
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
            </svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="currentColor">
              <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z"/>
              <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z"/>
              <path d="M19 11h2v2h-2zm-16 0h2v2H3z"/>
            </svg>
          )}
        </div>
        <span className="ptt-label">
          {isTalking ? 'En cours...' : 'Maintenir pour parler'}
        </span>
      </button>

      <p className="ptt-hint">
        {isTalking ? 'Relâchez pour arrêter' : 'Appuyez et maintenez le bouton'}
      </p>
    </div>
  );
}
