// Push notifications, and just enough caching to survive no signal.
//
// WHAT THIS DOES AND DOES NOT DO. The app is opened in depots and laid-bys,
// where a phone often has one bar or none. Before this, that meant the
// browser's own "no internet" page -- the app looked broken rather than
// offline.
//
// So: the fingerprinted files that make up the app are cached as they are
// fetched (they are immutable, so serving them from the cache can never be
// wrong), and a page asked for with no signal falls back to /offline, which
// says plainly what works and what does not.
//
// It deliberately does NOT cache anything with figures in it. A stale invoice
// total or a stale "what you're owed" is far worse than an honest "you're
// offline" -- wrong numbers in an accounting record are the one thing this app
// must never do. Scanning while offline is a bigger feature of its own (the
// offline scan queue) and is not attempted here.
const CACHE = "invoiceover-v1";
const OFFLINE = "/offline";

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll([OFFLINE, "/icon-192.png", "/icon-512.png"]))
      .then(() => self.skipWaiting())
      .catch(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  // Never the API, and never anything carrying figures.
  if (url.pathname.startsWith("/api/")) return;

  // The app's own files are content-hashed, so a cached copy is by definition
  // the right one.
  if (url.pathname.startsWith("/_next/static/") || url.pathname.startsWith("/vendor/") || url.pathname.startsWith("/icon-")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) {
              const copy = res.clone();
              caches.open(CACHE).then((c) => c.put(req, copy)).catch(() => {});
            }
            return res;
          }),
      ),
    );
    return;
  }

  // A page: always the network, because what it shows is someone's own
  // records. Only when there is no network at all does the offline page
  // stand in for it.
  if (req.mode === "navigate") {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE).then((hit) => hit || Response.error())));
  }
});

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
