import type { Metadata } from "next";
import CompanyChecker from "@/components/check-company/CompanyChecker";

export const metadata: Metadata = {
  title: "Check a UK company — free Companies House lookup",
  description: "Check whether a UK company is real, still trading, filing on time and who runs it, straight from the Companies House register. Free, no account needed.",
};

export default function CheckCompanyPage() {
  return <CompanyChecker />;
}
