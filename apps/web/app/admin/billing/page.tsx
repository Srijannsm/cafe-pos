import { redirect } from "next/navigation";

// The Plan page used to live at /admin/billing, which was easy to confuse
// with bills. Old bookmarks land on the new address.
export default function OldPlanRoute() {
  redirect("/admin/plan");
}
