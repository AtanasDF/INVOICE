"use client";

import { ReactNode, useState } from "react";
import type { CapturedFile } from "@/components/DocumentCapture";
import { readScannerMode, useIsIOS } from "@/lib/platform";
import { downscaleImageDataUrl } from "@/lib/imageDownscale";

// iOS Safari only opens the camera from a file input activated inside
// the user's own tap, so on the native-camera path the trigger IS the
// input (label-wrapped, like the dashboard tile) rather than a button
// that mounts DocumentCapture and needs a second "Take a photo" tap.
export default function CaptureButton({ onCapture, onOpen, beforeOpen, className, disabled, children, accept }: {
  onCapture: (file: CapturedFile) => void;
  onOpen: () => void;
  beforeOpen?: () => boolean;
  className?: string;
  disabled?: boolean;
  children: ReactNode;
  accept?: string;
}) {
  const isIOS = useIsIOS();
  const [busy, setBusy] = useState(false);

  if (!isIOS || readScannerMode() !== "native") {
    return (
      <button
        type="button"
        className={className}
        disabled={disabled}
        onClick={() => {
          if (beforeOpen && !beforeOpen()) return;
          onOpen();
        }}
      >
        {children}
      </button>
    );
  }

  function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Cleared so retaking the same photo re-fires change.
    e.target.value = "";
    if (!file) return;
    setBusy(true);
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const dataUrl = await downscaleImageDataUrl(reader.result as string);
        onCapture({ dataUrl, mediaType: file.type.startsWith("image/") ? "image/jpeg" : file.type });
      } catch {
        onOpen();
      } finally {
        setBusy(false);
      }
    };
    reader.onerror = () => {
      setBusy(false);
      onOpen();
    };
    reader.readAsDataURL(file);
  }

  return (
    <label className={disabled ? `${className} opacity-50` : className} aria-disabled={disabled} aria-busy={busy}>
      {children}
      <input
        type="file"
        accept={accept ?? "image/*"}
        capture="environment"
        disabled={disabled || busy}
        // No beforeOpen here: a confirm() inside the tap can cost the user
        // gesture iOS needs to open the camera, and the current document is
        // only replaced once the new photo actually arrives.
        onChange={onChange}
        className="hidden"
      />
    </label>
  );
}
