// Service Worker personnalisé pour PTT Live
// Gère les notifications push pour les appels privés

self.addEventListener('install', (event) => {
  console.log('Service Worker: Installation');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('Service Worker: Activation');
  event.waitUntil(self.clients.claim());
});

// Écouter les notifications push du serveur
self.addEventListener('push', (event) => {
  console.log('Service Worker: Push reçu');

  let data = {
    title: 'PTT Live',
    body: 'Nouveau message',
    icon: '/pwa-192x192.png',
    badge: '/badge-72x72.png'
  };

  if (event.data) {
    try {
      data = event.data.json();
    } catch (error) {
      console.error('Erreur parsing push data:', error);
    }
  }

  const options = {
    body: data.body,
    icon: data.icon || '/pwa-192x192.png',
    badge: data.badge || '/badge-72x72.png',
    vibrate: [200, 100, 200],
    tag: data.tag || 'ptt-notification',
    requireInteraction: data.requireInteraction || false,
    data: data.data || {}
  };

  event.waitUntil(
    self.registration.showNotification(data.title, options)
  );
});

// Gérer les clics sur les notifications
self.addEventListener('notificationclick', (event) => {
  console.log('Service Worker: Notification cliquée');
  event.notification.close();

  // Ouvrir l'application ou focus si déjà ouverte
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((clientList) => {
        // Si une fenêtre est déjà ouverte, la focus
        for (const client of clientList) {
          if (client.url.includes(self.registration.scope) && 'focus' in client) {
            return client.focus();
          }
        }
        // Sinon ouvrir une nouvelle fenêtre
        if (clients.openWindow) {
          return clients.openWindow('/');
        }
      })
  );
});

// Gérer la fermeture des notifications
self.addEventListener('notificationclose', (event) => {
  console.log('Service Worker: Notification fermée');
});
