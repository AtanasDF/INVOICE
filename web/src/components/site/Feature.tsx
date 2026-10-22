import type { ReactNode } from "react";
import PhoneShot from "@/components/site/PhoneShot";

// One thing the app does: the words, and the screen it happens on. Pictures
// alternate sides on a wide screen; on a phone the words come first.
export default function Feature({ title, children, shot, alt, flip = false }: { title: string; children: ReactNode; shot: string; alt: string; flip?: boolean }) {
  return (
    <section className="grid items-center gap-8 md:grid-cols-2">
      <div className={flip ? "md:order-2" : ""}>
        <h2 className="text-2xl font-bold">{title}</h2>
        <div className="mt-3 space-y-3 text-lg text-neutral-700">{children}</div>
      </div>
      <PhoneShot src={shot} alt={alt} />
    </section>
  );
}
