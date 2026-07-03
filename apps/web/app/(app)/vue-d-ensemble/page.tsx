import { redirect } from "next/navigation";

export default function OverviewRedirect() {
  redirect("/?cmd=overview");
}
