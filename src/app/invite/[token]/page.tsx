import type { Metadata } from "next";
import { getServerAuth } from "@/server/auth/server";
import { InviteAccept } from "./InviteAccept";

export const metadata: Metadata = { title: "Accept invitation", robots: { index: false } };
export const dynamic = "force-dynamic";

export default async function InvitePage({ params }: { params: { token: string } }) {
  const auth = await getServerAuth().catch(() => null);
  const signedIn = !!auth && !auth.user.isGuest;
  return <InviteAccept token={params.token} signedInAs={signedIn ? auth!.user.email : null} />;
}
