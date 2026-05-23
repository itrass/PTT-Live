import { useEffect, useRef, useState } from 'react';
import './PTTButton.css';

/**
 * Bouton PTT principal
 * Gère touch et mouse events pour desktop et mobile
 * Modes : PTT classique (maintenir) ou mode continu (toggle)
 * Activation mode continu : appui long 3s
 */
export default function PTTButton({ isTalking, onPressStart, onPressEnd }) {
  const buttonRef = useRef(null);
  const isPressingRef = useRef(false);
  const longPressTimerRef = useRef(null);
  const [isLockMode, setIsLockMode] = useState(false);
  const [lockProgress, setLockProgress] = useState(0);

  useEffect(() => {
    const button = buttonRef.current;
    if (!button) return;

    // Empêcher comportements par défaut
    const preventDefault = (e) => {
      e.preventDefault();
    };

    // Démarrer timer pour mode lock
    const startLongPressTimer = () => {
      // Animation de progression (0 → 100 en 3s)
      const duration = 3000;
      const startTime = Date.now();

      const updateProgress = () => {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(100, (elapsed / duration) * 100);
        setLockProgress(progress);

        if (elapsed >= duration) {
          // Mode lock activé
          activateLockMode();
        } else {
          longPressTimerRef.current = requestAnimationFrame(updateProgress);
        }
      };

      longPressTimerRef.current = requestAnimationFrame(updateProgress);
    };

    const cancelLongPressTimer = () => {
      if (longPressTimerRef.current) {
        cancelAnimationFrame(longPressTimerRef.current);
        longPressTimerRef.current = null;
      }
      setLockProgress(0);
    };

    const activateLockMode = () => {
      console.log('🔒 Mode lock activé');
      setIsLockMode(true);
      cancelLongPressTimer();

      // Vibration longue pour feedback
      if (navigator.vibrate) {
        navigator.vibrate([100, 50, 100]);
      }
    };

    const toggleLockMode = () => {
      if (isLockMode) {
        // Désactiver mode lock
        console.log('🔓 Mode lock désactivé');
        setIsLockMode(false);
        onPressEnd();
      } else {
        // En mode normal, un clic simple ne fait rien
        // (il faut maintenir ou activer le mode lock)
      }
    };

    // Touch events (mobile)
    const handleTouchStart = (e) => {
      e.preventDefault();
      console.log('🖐️ Touch start');

      if (isLockMode) {
        // En mode lock, un tap désactive le mode
        toggleLockMode();
      } else {
        // Mode PTT normal : démarrer
        if (!isPressingRef.current) {
          isPressingRef.current = true;
          onPressStart();
          // Démarrer timer pour mode lock
          startLongPressTimer();
        }
      }
    };

    const handleTouchEnd = (e) => {
      e.preventDefault();
      console.log('🖐️ Touch end');

      if (!isLockMode) {
        // Mode PTT normal : arrêter
        if (isPressingRef.current) {
          isPressingRef.current = false;
          onPressEnd();
          // Annuler timer si pas encore 3s
          cancelLongPressTimer();
        }
      }
    };

    // Mouse events (desktop)
    const handleMouseDown = (e) => {
      e.preventDefault();

      if (isLockMode) {
        toggleLockMode();
      } else {
        if (!isPressingRef.current) {
          isPressingRef.current = true;
          onPressStart();
          startLongPressTimer();
        }
      }
    };

    const handleMouseUp = (e) => {
      e.preventDefault();

      if (!isLockMode) {
        if (isPressingRef.current) {
          isPressingRef.current = false;
          onPressEnd();
          cancelLongPressTimer();
        }
      }
    };

    const handleMouseLeave = (e) => {
      // Si on quitte le bouton en maintenant, on arrête (sauf en mode lock)
      if (!isLockMode && isPressingRef.current) {
        isPressingRef.current = false;
        onPressEnd();
        cancelLongPressTimer();
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
        className={`ptt-button ${isTalking ? 'talking' : ''} ${isLockMode ? 'locked' : ''}`}
        type="button"
      >
        {/* Indicateur de progression pour mode lock */}
        {lockProgress > 0 && !isLockMode && (
          <div
            className="lock-progress"
            style={{ width: `${lockProgress}%` }}
          />
        )}

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

        {/* Badge mode lock */}
        {isLockMode && (
          <div className="lock-badge">
            <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16">
              <path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zM9 8V6c0-1.66 1.34-3 3-3s3 1.34 3 3v2H9z"/>
            </svg>
          </div>
        )}

        <span className="ptt-label">
          {isLockMode
            ? 'Mode continu actif'
            : isTalking
              ? 'En cours...'
              : 'Maintenir pour parler'}
        </span>
      </button>

      <p className="ptt-hint">
        {isLockMode
          ? 'Tapez pour désactiver le mode continu'
          : isTalking
            ? lockProgress > 0
              ? 'Maintenez 3s pour mode continu...'
              : 'Relâchez pour arrêter'
            : 'Appuyez et maintenez le bouton • Maintenez 3s pour mode continu'}
      </p>
    </div>
  );
}
