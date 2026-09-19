import type { SupabaseClient } from "@supabase/supabase-js";
import webpush from "web-push";

// A push notification to every device the owner has subscribed. Best
// effort: nothing that calls it should fail because a push couldn't go.
export async function pushToOwner(admin: SupabaseClient, userId: string, message: { title: string; body: string; url: string }) {
  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY;
  if (!vapidPublic || !vapidPrivate) return;
  try {
    const { data: subs } = await admin.from("push_subscriptions").select("endpoint, p256dh, auth_key").eq("user_id", userId);
    webpush.setVapidDetails("https://invoice-omega-rust.vercel.app", vapidPublic, vapidPrivate);
    const payload = JSON.stringify(message);
    await Promise.all(
      (subs ?? []).map((s) => webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth_key } }, payload).catch(() => {}))
    );
  } catch {
    // Best effort.
  }
}
