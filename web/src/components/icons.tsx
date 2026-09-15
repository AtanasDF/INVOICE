// Small shared icon set, same stroke-outline style as the dashboard's
// existing ScanIcon and the camera modal's back arrow -- replaces the
// emoji that were scattered around (📷 📁 🔁 📄 📍), which render
// differently across platforms/browsers and don't match the rest of the
// app's visual language.

type IconProps = { className?: string };

export function CameraIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 8a2 2 0 0 1 2-2h1.7l1-1.6a1 1 0 0 1 .85-.4h6.9a1 1 0 0 1 .85.4l1 1.6H19a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8Z" />
      <circle cx="12" cy="13" r="3.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function FolderIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7Z" />
    </svg>
  );
}

export function RepeatIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 9a7.5 7.5 0 0 1 13-4.5L20 7M20 4v3.5h-3.5" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 15a7.5 7.5 0 0 1-13 4.5L4 17M4 20v-3.5h3.5" />
    </svg>
  );
}

export function DocumentIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M7 3h6l5 5v12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z" />
      <path strokeLinecap="round" strokeLinejoin="round" d="M13 3v5h5" />
    </svg>
  );
}

export function PinIcon({ className = "h-4 w-4" }: IconProps) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={className}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 21s-7-6.1-7-11.5a7 7 0 1 1 14 0C19 14.9 12 21 12 21Z" />
      <circle cx="12" cy="9.5" r="2.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
