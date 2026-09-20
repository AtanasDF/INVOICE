import AddAnything from "@/components/AddAnything";

// A list page's own scan and by-hand routes, folded into the one Add
// button: two buttons per page asking "receipt or invoice?" before the
// work starts was the thing to be rid of.
export default function ScanOrAdd({ scanHref, scanLabel, addHref }: { scanHref: string; scanLabel: string; addHref: string }) {
  return (
    <AddAnything
      also={[
        { href: scanHref, label: scanLabel, hint: "Photograph one and fill this page's form from it" },
        { href: addHref, label: "Fill it in by hand" },
      ]}
    />
  );
}
