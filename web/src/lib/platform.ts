// Standard (if inescapably UA-sniffing) iOS detection -- there's no
// reliable feature-detection alternative, since Apple's App Store policy
// forces every iOS browser onto WebKit, so they share the same
// getUserMedia/Permissions API limitations regardless of vendor.
// iPadOS 13+ Safari reports itself as a Mac by default (desktop-site
// spoofing), distinguished from a real Mac only by multi-touch support.
export function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent;
  if (/iPad|iPhone|iPod/.test(ua)) return true;
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}
