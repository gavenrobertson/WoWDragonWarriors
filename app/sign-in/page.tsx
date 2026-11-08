import type { Metadata } from "next";
import { SignInScreen } from "./SignInScreen";

export const metadata: Metadata = { title: "Sign in" };

export default async function SignInPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return <SignInScreen initialStep={sp.step === "claim" ? "chars" : sp.step === "apply" ? "apply" : "welcome"} error={sp.error} discord={sp.discord} />;
}

