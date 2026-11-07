import AddAnything from "@/components/AddAnything";
import UploadFilesButton from "@/components/UploadFilesButton";

// A list page's own scan and by-hand routes, folded into the one Add
// button: two buttons per page asking "receipt or invoice?" before the
// work starts was the thing to be rid of. Upload from files stays out in
// the open beside it (Atanas: "underneath the camera button all over you
// should have a button to upload from files straight away").
// `upload={false}` where the page already has its own way in from files
// (Customers: the Bring in card takes photos, PDFs and spreadsheets).
// `big` is the page's one main action: full width, Add on top, Upload under it.
export default function ScanOrAdd({ scanHref, scanLabel, addHref, upload = true, big = false }: { scanHref: string; scanLabel: string; addHref: string; upload?: boolean; big?: boolean }) {
  return (
    <div className={big ? "space-y-2" : "flex flex-wrap items-center gap-2"}>
      <AddAnything
        big={big}
        also={[
          { href: scanHref, label: scanLabel, hint: "Photograph one and fill this page's form from it" },
          { href: addHref, label: "Fill it in by hand" },
        ]}
      />
      {upload && (
        <UploadFilesButton
          href={scanHref.startsWith("/scan") ? "/scan" : scanHref}
          multiple={scanHref.startsWith("/scan")}
          {...(big ? { className: "w-full", buttonClassName: "flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-medium text-neutral-900 shadow-sm" } : {})}
        />
      )}
    </div>
  );
}
