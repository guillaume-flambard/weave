import { redirect } from "next/navigation";

export default function GouvernanceRedirect() {
  redirect("/?cmd=govern");
}
