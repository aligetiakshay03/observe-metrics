import { ok, handler } from "@/lib/api";
import { SESSION_COOKIE } from "@/lib/auth";

export const POST = handler(async () => {
  const res = ok({ loggedOut: true });
  (res.cookies as unknown as { set: (c: object) => void }).set({
    name: SESSION_COOKIE,
    value: "",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
});

export const dynamic = "force-dynamic";
