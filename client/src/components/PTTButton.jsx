import { useEffect, useRef, useState } from 'react';
import './PTTButton.css';

/**
 * Bouton PTT principal
 * Gère touch et mouse events pour desktop et mobile
 * Modes :
 * - PTT classique : maintenir pour parler
 * - Mode continu (lock) : glisser vers le haut pendant qu'on parle
 */
export default function PTTButton({ isTalking, onPressStart, onPressEnd }) {
  const buttonRef = useRef(null);
  const isPressingRef = useRef(false);
  const [isLockMode, setIsLockMode] = useState(false);
  const isLockModeRef = useRef(false); // Ref pour accès immédiat dans event handlers

  // Drag tracking
  const dragStartYRef = useRef(null);
  const currentYRef = useRef(null);
  const [dragOffset, setDragOffset] = useState(0); // Offset visuel du drag (en pixels)

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
      const touch = e.touches[0];
      console.log('🖐️ Touch start at Y:', touch.clientY);

      // En mode lock, un tap désactive le mode
      if (isLockModeRef.current) {
        toggleLockMode();
        return;
      }

      // Mode PTT normal : démarrer + init drag
      if (!isPressingRef.current) {
        isPressingRef.current = true;
        dragStartYRef.current = touch.clientY;
        currentYRef.current = touch.clientY;
        onPressStart();
      }
    };

    const handleTouchMove = (e) => {
      e.preventDefault();

      // Pas de drag en mode lock
      if (isLockModeRef.current || !isPressingRef.current) {
        return;
      }

      const touch = e.touches[0];
      currentYRef.current = touch.clientY;

      // Calculer le déplacement vertical (négatif = vers le haut)
      const deltaY = dragStartYRef.current - touch.clientY;

      // Limiter le drag vers le haut (max 100px)
      const offset = Math.max(0, Math.min(100, deltaY));
      setDragOffset(offset);

      console.log('📏 Drag offset:', offset);

      // Si on a glissé de 80px vers le haut, activer le mode lock
      if (offset >= 80) {
        activateLockMode();
      }
    };

    const handleTouchEnd = (e) => {
      e.preventDefault();
      console.log('🖐️ Touch end, dragOffset:', dragOffset);

      // Réinitialiser le drag
      dragStartYRef.current = null;
      currentYRef.current = null;
      setDragOffset(0);

      // En mode lock, ne rien faire (le micro reste actif)
      if (isLockModeRef.current) {
        return;
      }

      // Mode PTT normal : arrêter
      if (isPressingRef.current) {
        isPressingRef.current = false;
        onPressEnd();
      }
    };

    // Mouse events (desktop)
    const handleMouseDown = (e) => {
      e.preventDefault();
      console.log('🖱️ Mouse down at Y:', e.clientY);

      // En mode lock, un clic désactive le mode
      if (isLockModeRef.current) {
        toggleLockMode();
        return;
      }

      if (!isPressingRef.current) {
        isPressingRef.current = true;
        dragStartYRef.current = e.clientY;
        currentYRef.current = e.clientY;
        onPressStart();
      }
    };

    const handleMouseMove = (e) => {
      // Pas de drag en mode lock
      if (isLockModeRef.current || !isPressingRef.current) {
        return;
      }

      currentYRef.current = e.clientY;

      // Calculer le déplacement vertical (négatif = vers le haut)
      const deltaY = dragStartYRef.current - e.clientY;

      // Limiter le drag vers le haut (max 100px)
      const offset = Math.max(0, Math.min(100, deltaY));
      setDragOffset(offset);

      // Si on a glissé de 80px vers le haut, activer le mode lock
      if (offset >= 80) {
        activateLockMode();
      }
    };

    const handleMouseUp = (e) => {
      e.preventDefault();
      console.log('🖱️ Mouse up, dragOffset:', dragOffset);

      // Réinitialiser le drag
      dragStartYRef.current = null;
      currentYRef.current = null;
      setDragOffset(0);

      // En mode lock, ne rien faire
      if (isLockModeRef.current) {
        return;
      }

      if (isPressingRef.current) {
        isPressingRef.current = false;
        onPressEnd();
      }
    };

    const handleMouseLeave = (e) => {
      // Si on quitte le bouton en maintenant, on arrête (sauf en mode lock)
      if (!isLockModeRef.current && isPressingRef.current) {
        // Réinitialiser le drag
        dragStartYRef.current = null;
        currentYRef.current = null;
        setDragOffset(0);

        isPressingRef.current = false;
        onPressEnd();
      }
    };

    // Attacher events
    button.addEventListener('touchstart', handleTouchStart, { passive: false });
    button.addEventListener('touchmove', handleTouchMove, { passive: false });
    button.addEventListener('touchend', handleTouchEnd, { passive: false });
    button.addEventListener('touchcancel', handleTouchEnd, { passive: false });
    button.addEventListener('mousedown', handleMouseDown);
    button.addEventListener('mousemove', handleMouseMove);
    button.addEventListener('mouseup', handleMouseUp);
    button.addEventListener('mouseleave', handleMouseLeave);
    button.addEventListener('contextmenu', preventDefault);

    return () => {
      button.removeEventListener('touchstart', handleTouchStart);
      button.removeEventListener('touchmove', handleTouchMove);
      button.removeEventListener('touchend', handleTouchEnd);
      button.removeEventListener('touchcancel', handleTouchEnd);
      button.removeEventListener('mousedown', handleMouseDown);
      button.removeEventListener('mousemove', handleMouseMove);
      button.removeEventListener('mouseup', handleMouseUp);
      button.removeEventListener('mouseleave', handleMouseLeave);
      button.removeEventListener('contextmenu', preventDefault);
    };
  }, [onPressStart, onPressEnd]);

  // Fonction pour activer le mode lock
  const activateLockMode = () => {
    console.log('🔒 Mode lock activé par drag');
    setIsLockMode(true);
    isLockModeRef.current = true;

    // Réinitialiser le drag
    setDragOffset(0);
    dragStartYRef.current = null;
    currentYRef.current = null;

    // Le micro est déjà actif (onPressStart a été appelé)

    // Vibration pour feedback
    if (navigator.vibrate) {
      navigator.vibrate([100, 50, 100]);
    }
  };

  // Fonction pour basculer le mode lock (appelée par le toggle externe)
  const toggleLockMode = () => {
    const newLockMode = !isLockModeRef.current;
    console.log('🔄 Toggle lock mode:', isLockModeRef.current, '→', newLockMode);

    setIsLockMode(newLockMode);
    isLockModeRef.current = newLockMode;

    if (newLockMode) {
      // Activer le mode lock : démarrer l'audio
      console.log('🔒 Mode lock ON');
      onPressStart();

      // Vibration pour feedback
      if (navigator.vibrate) {
        navigator.vibrate([100, 50, 100]);
      }
    } else {
      // Désactiver le mode lock : couper l'audio
      console.log('🔓 Mode lock OFF');
      onPressEnd();

      // Vibration pour feedback
      if (navigator.vibrate) {
        navigator.vibrate(50);
      }
    }
  };

  return (
    <div className="ptt-container">
      {/* Zone de drag vers le haut (indicateur visuel) */}
      {dragOffset > 0 && !isLockMode && (
        <div className="drag-indicator" style={{ opacity: dragOffset / 80 }}>
          <svg viewBox="0 0 24 24" fill="currentColor" width="32" height="32">
            <path d="M7 14l5-5 5 5H7z"/>
          </svg>
          <span>Glissez pour verrouiller</span>
        </div>
      )}

      {/* Bouton PTT principal */}
      <button
        ref={buttonRef}
        className={`ptt-button ${isTalking ? 'talking' : ''} ${isLockMode ? 'locked' : ''}`}
        type="button"
        style={{
          transform: dragOffset > 0 && !isLockMode ? `translateY(-${dragOffset * 0.3}px)` : 'none'
        }}
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
            ? 'Glissez vers le haut pour verrouiller • Relâchez pour arrêter'
            : 'Appuyez et maintenez pour parler • Glissez vers le haut pour verrouiller'}
      </p>
    </div>
  );
}
