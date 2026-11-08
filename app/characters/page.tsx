import { redirect } from "next/navigation";
import { getViewer } from "@/lib/auth";

export default async function CharactersIndex() {
  const v = await getViewer();
  if (v.main) redirect(`/characters/${v.main.slug}`);
  redirect(v.signedIn ? "/sign-in?step=claim" : "/roster");
}
