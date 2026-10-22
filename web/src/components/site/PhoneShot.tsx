// A picture of the app on a phone, for the public pages. The pictures are
// taken from the app itself by harness/shots-site.mjs, so retaking them is
// one run, not a design job.
export default function PhoneShot({ src, alt }: { src: string; alt: string }) {
  return (
    <div className="mx-auto w-full max-w-[17rem] overflow-hidden rounded-[2rem] border-[6px] border-neutral-900 bg-white shadow-lg">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt={alt} width={780} height={1560} loading="lazy" className="block h-auto w-full" />
    </div>
  );
}
