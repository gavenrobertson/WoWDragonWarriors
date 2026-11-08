import type { Metadata } from "next";
import { SignInScreen } from "../sign-in/SignInScreen";

export const metadata: Metadata = { title: "Apply to join" };

export default function ApplyPage() {
  return <SignInScreen initialStep="apply" />;
}
