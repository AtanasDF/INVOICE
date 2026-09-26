import type { Metadata } from "next";
import CompanyChecker from "@/components/check-company/CompanyChecker";

export const metadata: Metadata = {
  title: "Check a UK company — free Companies House lookup",
  // NOT "no account needed". It said that, and it is the description a search
  // result shows: every page but the front door, the legal ones and the
  // customer links has been behind sign-in since 2026-09-22 ("nothing should
  // work before the user register"), so this promised something the Gate then
  // refused. Exactly the free-invoice heading that was found three days stale
  // on 2026-09-25, in the one place that is quoted to strangers.
  description: "Check whether a UK company is real, still trading, filing on time and who runs it, straight from the Companies House register.",
};

export default function CheckCompanyPage() {
  return <CompanyChecker />;
}
