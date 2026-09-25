import { vatChecksStore, type VatCheck } from "./storage";
import { sameVatNumber } from "./vatCheckRules";
import type { VerifiedCheck } from "@/components/VatNumberInput";

// Keeping HMRC's reference must never cost somebody their contact.
//
// The reference is a nice-to-have on top of saving a customer; the save is
// the thing they asked for. So this swallows its own failure -- a database
// without vat_checks yet, a grant not applied, a connection lost between
// the two calls -- rather than turning a saved contact into a red error
// message about something the person never asked about.
//
// It is called after the contact exists, so the check is attached to it.
// Checks made before there was a contact to attach keep client_id null and
// are still found by number.
export async function keepVatCheck(check: VerifiedCheck | null, clientId: string | null, stillTyped: string): Promise<VatCheck | null> {
  // They may have typed a different number after HMRC answered about the
  // first one. Keeping a reference for a number the contact no longer
  // carries would be worse than keeping none.
  if (!check || !sameVatNumber(stillTyped, check.vatNumber)) return null;
  try {
    return await vatChecksStore.recordDaily({
      clientId,
      vatNumber: check.vatNumber,
      registered: true,
      name: check.name,
      address: check.address,
      consultationNumber: check.consultationNumber,
      checkedAt: check.checkedAt,
    });
  } catch {
    // Deliberately silent: see above.
    return null;
  }
}
