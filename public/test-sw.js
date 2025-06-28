// Test Service Worker for notification testing
console.log('Test Service Worker loaded');

self.addEventListener('notificationclick', function(event) {
    console.log('Notification clicked:', event);
    event.notification.close();
    
    if (event.action === 'set-lineup') {
        console.log('Set Lineup action clicked');
        // In real app, this would open the lineup page
        event.waitUntil(
            clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
                // Check if app is already open
                for (let i = 0; i < clientList.length; i++) {
                    const client = clientList[i];
                    if (client.url.includes(self.location.origin) && 'focus' in client) {
                        client.focus();
                        return client.navigate('/profile');
                    }
                }
                
                // If app is not open, open it
                if (clients.openWindow) {
                    return clients.openWindow('/profile');
                }
            })
        );
    } else if (event.action === 'dismiss') {
        console.log('Dismiss action clicked');
        // Just close the notification (already done above)
        return;
    } else {
        console.log('Default notification click');
        // Default click (no specific action button)
        event.waitUntil(
            clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function(clientList) {
                // Check if app is already open
                for (let i = 0; i < clientList.length; i++) {
                    const client = clientList[i];
                    if (client.url.includes(self.location.origin) && 'focus' in client) {
                        client.focus();
                        return;
                    }
                }
                
                // If app is not open, open it
                if (clients.openWindow) {
                    return clients.openWindow('/profile');
                }
            })
        );
    }
});

self.addEventListener('install', function(event) {
    console.log('Test Service Worker installed');
    self.skipWaiting();
});

self.addEventListener('activate', function(event) {
    console.log('Test Service Worker activated');
    event.waitUntil(self.clients.claim());
}); 