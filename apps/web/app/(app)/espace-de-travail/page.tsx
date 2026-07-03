import { redirect } from "next/navigation";

export default function EspaceDeTravailRedirect() {
  redirect("/?cmd=simulate");
}
