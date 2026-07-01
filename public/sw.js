/* ── Push notifications — the whole service worker just needs these two handlers ── */

self.addEventListener("push", (event) => {
  let data = { title: "Resonance", body: "New message!" };
  try { data = event.data.json(); } catch (_) { /* fall back to the default above */ }
  event.waitUntil(self.registration.showNotification(data.title, { body: data.body }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow("/");
    })
  );
});
