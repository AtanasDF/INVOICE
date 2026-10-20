// Push notifications, and just enough caching to survive no signal.
//
// WHAT THIS DOES AND DOES NOT DO. The app is opened in depots and laid-bys,
// where a phone often has one bar or none. Before this, that meant the
// browser's own "no internet" page -- the app looked broken rather than
// offline.
//
// So: the fingerprinted files that make up the app are cached as they are
// fetched (they are immutable, so serving them from the cache can never be
// wrong), and a page asked for with no signal falls back to /offline.html, which
// says plainly what works and what does not.
//
// It deliberately does NOT cache anything with figures in it. A stale invoice
// total or a stale "what you're owed" is far worse than an honest "you're
// offline" -- wrong numbers in an accounting record are the one thing this app
// must never do. Scanning while offline is a bigger feature of its own (the
// offline scan queue) and is not attempted here.
// v2 on 2026-10-19: the name never moved, so activate's clean-up never ran
// and every deploy's chunks piled up in v1 for good. Bumping it clears that
// once; trim() keeps it from happening again. v3 on 2026-10-20 for the move
// from /offline to offline.html, so the old copy goes with the old cache. v4
// on 2026-10-20: offline.html's Try again reloads the page asked for.
const CACHE = "invoiceover-v4";
// A plain file, not a page of the app: /offline needed the app's scripts, and
// a few deploys after it was cached those had been trimmed, so with no signal
// it said "Loading..." for ever.
const OFFLINE = "/offline.html";
// Enough for a few builds' worth of what one phone actually fetches (a whole
// build is about 90 files); the oldest go first. Cache keys come back in the
// order they were put, which is what makes the oldest the first ones listed.
const MAX_STATIC = 300;
// One bar: the connection is accepted and never answered, so a fetch with no
// limit never fails and the offline page never comes. Long enough for a cold
// server on a slow line, short enough that somebody isn't left on a blank page.
const NAVIGATE_TIMEOUT_MS = 10000;

function trim(cache) {
  return cache.keys().then((keys) => {
    const old = keys.filter((k) => new URL(k.url).pathname.startsWith("/_next/static/"));
    return Promise.all(old.slice(0, Math.max(0, old.length - MAX_STATIC)).map((k) => cache.delete(k)));
  });
}

function fetchWithin(req, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("no answer")), ms);
    fetch(req).then(
      (res) => { clearTimeout(timer); resolve(res); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

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
              caches.open(CACHE).then((c) => c.put(req, copy).then(() => trim(c))).catch(() => {});
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
    event.respondWith(fetchWithin(req, NAVIGATE_TIMEOUT_MS).catch(() => caches.match(OFFLINE).then((hit) => hit || Response.error())));
    // Put back if the phone cleared it to make room, while there is signal to.
    event.waitUntil(caches.open(CACHE).then((c) => c.match(OFFLINE).then((hit) => hit || c.addAll([OFFLINE]))).catch(() => {}));
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
      // Any open window of the app is taken to the page the notification is
      // about. Matching on the address found every window ("/" is in all of
      // them) and focused it wherever it was.
      const open = windowClients.find((c) => "focus" in c);
      if (open) return (open.navigate ? open.navigate(url).then((c) => c || open, () => open) : Promise.resolve(open)).then((c) => c.focus());
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
