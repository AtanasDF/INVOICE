// Safari lets a tap write the clipboard or open a window only until the
// handler's first await; after a network call the same line is refused (the
// clipboard) or blocked as a pop-up (window.open), and nothing says so. Both
// helpers take the thing still being fetched as a promise and start the
// write or the window inside the tap, before anything is awaited.

export function copyText(text: string | Promise<string>): Promise<boolean> {
  const clipboard = typeof navigator === "undefined" ? undefined : navigator.clipboard;
  if (!clipboard) return Promise.resolve(false);
  if (typeof text === "string") return clipboard.writeText(text).then(() => true, () => false);
  if (typeof ClipboardItem !== "undefined" && clipboard.write) {
    const blob = text.then((t) => new Blob([t], { type: "text/plain" }));
    return clipboard.write([new ClipboardItem({ "text/plain": blob })]).then(
      () => true,
      () => text.then((t) => clipboard.writeText(t)).then(() => true, () => false)
    );
  }
  return text.then((t) => clipboard.writeText(t)).then(() => true, () => false);
}

// A blocked window falls back to opening the address here, which leaves the
// page but always works; no address closes the window it opened.
export async function openWhenReady(url: Promise<string | null>): Promise<boolean> {
  const win = window.open("", "_blank");
  if (win) win.opener = null;
  let href: string | null = null;
  try {
    href = await url;
  } finally {
    if (!href) win?.close();
  }
  if (!href) return false;
  if (win) win.location.href = href;
  else window.location.assign(href);
  return true;
}
