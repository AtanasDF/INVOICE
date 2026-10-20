// Browser-side half of push notifications: registering the service
// worker, asking permission, and subscribing/unsubscribing via the Push
// API. Storing the resulting subscription is pushSubscriptionsStore's job
// (storage.ts) -- this file only talks to the browser, never Supabase.

import { isStandalone } from "@/lib/install";
import { isIOS } from "@/lib/platform";

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  const output = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i++) output[i] = rawData.charCodeAt(i);
  return output;
}

export function pushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
}

/** iOS Safari only supports push for a site added to the Home Screen, not a plain tab. */
export function isIosNotStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return isIOS() && !isStandalone();
}

export async function getExistingSubscription(): Promise<PushSubscription | null> {
  if (!pushSupported()) return null;
  const reg = await navigator.serviceWorker.getRegistration("/sw.js");
  if (!reg) return null;
  return reg.pushManager.getSubscription();
}

export async function enablePush(): Promise<PushSubscription> {
  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!vapidKey) throw new Error("Push notifications aren't configured on this deployment yet.");
  if (!pushSupported()) throw new Error("This browser doesn't support push notifications.");
  const permission = await Notification.requestPermission();
  if (permission !== "granted") throw new Error("Notifications are turned off for this site. Allow them in the browser's settings for this site, then try again.");
  // Every throw here is shown as written, so the browser's own ("Registration
  // failed - push service error", a DOMException offline) is said plainly.
  try {
    const reg = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    const existing = await reg.pushManager.getSubscription();
    if (existing) return existing;
    return await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey),
    });
  } catch (err) {
    console.error("enablePush", err);
    throw new Error("Couldn't turn notifications on just now. Check your connection and try again.");
  }
}

/** Returns the endpoint that was unsubscribed, so the caller can remove its stored row too. */
export async function disablePush(): Promise<string | null> {
  const sub = await getExistingSubscription();
  if (!sub) return null;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  return endpoint;
}

export function subscriptionToRecord(sub: PushSubscription): { endpoint: string; p256dh: string; authKey: string } {
  const json = sub.toJSON();
  return {
    endpoint: sub.endpoint,
    p256dh: json.keys?.p256dh || "",
    authKey: json.keys?.auth || "",
  };
}
