import { redirect } from "next/navigation";

export default function SourcesRedirect() {
  redirect("/?cmd=sources");
}
