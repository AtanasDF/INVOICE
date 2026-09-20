import AddAnything from "@/components/AddAnything";
import UploadFilesButton from "@/components/UploadFilesButton";

// A list page's own scan and by-hand routes, folded into the one Add
// button: two buttons per page asking "receipt or invoice?" before the
// work starts was the thing to be rid of. Upload from files stays out in
// the open beside it (Atanas: "underneath the camera button all over you
// should have a button to upload from files straight away").
export default function ScanOrAdd({ scanHref, scanLabel, addHref }: { scanHref: string; scanLabel: string; addHref: string }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <AddAnything
        also={[
          { href: scanHref, label: scanLabel, hint: "Photograph one and fill this page's form from it" },
          { href: addHref, label: "Fill it in by hand" },
        ]}
      />
      <UploadFilesButton href={scanHref.startsWith("/scan") ? "/scan" : scanHref} multiple={scanHref.startsWith("/scan")} />
    </div>
  );
}
