// Minimal service worker: exists only to receive push events and show a
// notification, and to focus/open the app when one's clicked. No caching,
// no offline support -- that's a separate, bigger feature this doesn't
// attempt.

self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: "Invoiceover", body: event.data ? event.data.text() : "" };
  }

  const title = data.title || "Invoiceover";
  const options = {
    body: data.body || "",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: { url: data.url || "/" },
  };

  // The daily reminder carries the count for the home-screen icon.
  const badge =
    typeof data.badge !== "number" || !self.navigator.setAppBadge
      ? Promise.resolve()
      : (data.badge > 0 ? self.navigator.setAppBadge(data.badge) : self.navigator.clearAppBadge()).catch(() => {});
  event.waitUntil(Promise.all([self.registration.showNotification(title, options), badge]));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.includes(url) && "focus" in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
