// A signed-in browser for the camera suites, without a database: the Free
// page's scanner asks for a sign-in since 2026-09-22 (every read costs a
// call), and these suites test the camera, not the account. The session
// goes into localStorage the way the app stores it, fetches to Supabase
// are answered in the page itself (the user, an empty table), and a
// suite's localStorage.clear() puts the session straight back.
import { fakeSession, fakeUser } from "./mockdb.mjs";

export const AUTH_KEY = "sb-wecfwjxzyzzrcwbwnwpo-auth-token";

export async function installFakeSession(page) {
  await page.evaluateOnNewDocument((key, session, user) => {
    localStorage.setItem(key, JSON.stringify(session));
    const clear = localStorage.clear.bind(localStorage);
    localStorage.clear = () => { clear(); localStorage.setItem(key, JSON.stringify(session)); };
    const realFetch = window.fetch.bind(window);
    const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
    window.fetch = (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (/\/auth\/v1\/user/.test(url)) return Promise.resolve(json(user));
      if (/\/auth\/v1\/token/.test(url)) return Promise.resolve(json(session));
      if (/\/rest\/v1\//.test(url)) return Promise.resolve(json([]));
      return realFetch(input, init);
    };
  }, AUTH_KEY, fakeSession(), fakeUser());
}
