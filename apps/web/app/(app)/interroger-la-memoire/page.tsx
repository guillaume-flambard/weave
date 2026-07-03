import { redirect } from "next/navigation";

export default function InterrogerRedirect() {
  redirect("/?cmd=ask");
}
