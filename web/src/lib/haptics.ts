// A light tap on the phone. iPhone Safari has no vibration API, but a
// switch checkbox ticks with a haptic when it's toggled (iOS 18+), so one
// is toggled out of sight; Android vibrates.
export function haptic() {
  try {
    if (typeof navigator.vibrate === "function" && navigator.vibrate(20)) return;
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.setAttribute("switch", "");
    label.setAttribute("aria-hidden", "true");
    label.style.display = "none";
    label.appendChild(input);
    document.head.appendChild(label);
    label.click();
    label.remove();
  } catch {
    // No haptics here; what's on screen is the feedback.
  }
}
