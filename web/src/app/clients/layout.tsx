// Its own title, so a screen reader is told when you arrive here: Next
// announces the title on a client-side move and only when it CHANGES.
export const metadata = { title: { absolute: "Customers & suppliers \u00b7 Invoiceover" } };

export default function Layout({ children }: { children: React.ReactNode }) {
  return children;
}
