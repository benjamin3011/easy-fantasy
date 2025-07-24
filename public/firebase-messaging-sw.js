// public/firebase-messaging-sw.js
importScripts('https://www.gstatic.com/firebasejs/9.22.1/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.22.1/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: 'AIzaSyA3WWFEVtzqan9JnYTNJ1WENH4cazYrmlQ',
  authDomain: 'easy-fantasy.firebaseapp.com',
  projectId: 'easy-fantasy',
  storageBucket: 'easy-fantasy.firebasestorage.app',
  messagingSenderId: '1004764027197',
  appId: '1:1004764027197:web:e35143afd55d96538d8d54',
});

const messaging = firebase.messaging();

// Handle background messages
messaging.onBackgroundMessage(function(payload) {
  console.log('[firebase-messaging-sw.js] Received background message ', payload);
  
  const notificationTitle = payload.notification?.title || 'Easy Fantasy';
  const notificationOptions = {
    body: payload.notification?.body || 'You have a new notification',
    icon: '/icons/favicon-96x96.png',
    badge: '/icons/favicon-96x96.png',
    tag: payload.data?.type || 'general',
    requireInteraction: true,
    data: payload.data,
    actions: []
  };

  // Add action buttons for lineup deadline alerts
  if (payload.data?.type === 'lineup_deadline') {
    notificationOptions.actions = [
      {
        action: 'set-lineup',
        title: '⚡ Set Lineup'
      },
      {
        action: 'dismiss',
        title: '❌ Dismiss'
      }
    ];
  }

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Handle notification clicks
self.addEventListener('notificationclick', function(event) {
  console.log('[firebase-messaging-sw.js] Notification click received.');
  
  event.notification.close();
  
  const data = event.notification.data;
  let url = '/';
  
  // Handle different actions
  if (event.action === 'set-lineup') {
    // Navigate to lineup page
    if (data?.leagueId && data?.week) {
      url = `/lineup?league=${data.leagueId}&week=${data.week}`;
    } else {
      url = '/profile'; // Fallback to profile page
    }
  } else if (event.action === 'dismiss') {
    // Just close the notification (already done above)
    return;
  } else {
    // Default click (no specific action button)
    if (data?.type === 'lineup_deadline' && data?.leagueId && data?.week) {
      url = `/lineup?league=${data.leagueId}&week=${data.week}`;
    }
  }
  
  // Open the app
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
      // Check if app is already open
      for (let i = 0; i < clientList.length; i++) {
        const client = clientList[i];
        if (client.url.includes(self.location.origin) && 'focus' in client) {
          client.focus();
          client.navigate(url);
          return;
        }
      }
      
      // If app is not open, open it
      if (clients.openWindow) {
        return clients.openWindow(url);
      }
    })
  );
});
