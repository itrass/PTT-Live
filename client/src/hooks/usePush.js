import { useState, useEffect, useCallback } from 'react';

/**
 * Hook pour gérer les notifications Web Push
 * Utilisé pour les appels privés et notifications de groupe
 */
export default function usePush() {
  const [isSupported, setIsSupported] = useState(false);
  const [isPermissionGranted, setIsPermissionGranted] = useState(false);
  const [subscription, setSubscription] = useState(null);

  useEffect(() => {
    // Vérifier si les notifications sont supportées
    const supported = 'Notification' in window && 'serviceWorker' in navigator;
    setIsSupported(supported);

    if (supported) {
      // Vérifier la permission actuelle
      setIsPermissionGranted(Notification.permission === 'granted');
    }
  }, []);

  /**
   * Demander la permission pour les notifications
   */
  const requestPermission = useCallback(async () => {
    if (!isSupported) {
      console.warn('Notifications non supportées sur ce navigateur');
      return false;
    }

    try {
      const permission = await Notification.requestPermission();
      const granted = permission === 'granted';
      setIsPermissionGranted(granted);

      if (granted) {
        console.log('Permission notifications accordée');
      } else {
        console.warn('Permission notifications refusée');
      }

      return granted;
    } catch (error) {
      console.error('Erreur demande permission notifications:', error);
      return false;
    }
  }, [isSupported]);

  /**
   * S'abonner aux notifications push (via service worker)
   */
  const subscribeToPush = useCallback(async () => {
    if (!isSupported || !isPermissionGranted) {
      console.warn('Impossible de s\'abonner : permission non accordée');
      return null;
    }

    try {
      // Attendre que le service worker soit prêt
      const registration = await navigator.serviceWorker.ready;

      // Créer l'abonnement push
      const sub = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(
          // TODO: Remplacer par la vraie clé VAPID du serveur
          import.meta.env.VITE_VAPID_PUBLIC_KEY || ''
        )
      });

      console.log('Abonnement push créé:', sub);
      setSubscription(sub);

      return sub;
    } catch (error) {
      console.error('Erreur abonnement push:', error);
      return null;
    }
  }, [isSupported, isPermissionGranted]);

  /**
   * Se désabonner des notifications push
   */
  const unsubscribeFromPush = useCallback(async () => {
    if (!subscription) {
      return true;
    }

    try {
      await subscription.unsubscribe();
      console.log('Désabonnement push réussi');
      setSubscription(null);
      return true;
    } catch (error) {
      console.error('Erreur désabonnement push:', error);
      return false;
    }
  }, [subscription]);

  /**
   * Envoyer une notification locale (sans push serveur)
   */
  const showNotification = useCallback(async (title, options = {}) => {
    if (!isSupported || !isPermissionGranted) {
      console.warn('Impossible d\'afficher la notification : permission non accordée');
      return;
    }

    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.showNotification(title, {
        icon: '/icon-192x192.png',
        badge: '/badge-72x72.png',
        vibrate: [200, 100, 200],
        ...options
      });
    } catch (error) {
      console.error('Erreur affichage notification:', error);
    }
  }, [isSupported, isPermissionGranted]);

  return {
    isSupported,
    isPermissionGranted,
    subscription,
    requestPermission,
    subscribeToPush,
    unsubscribeFromPush,
    showNotification
  };
}

/**
 * Convertir une clé VAPID base64 en Uint8Array
 */
function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}
