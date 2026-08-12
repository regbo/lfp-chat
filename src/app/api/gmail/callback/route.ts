import { NextResponse } from "next/server";

import { familyContextRequest } from "@/lib/family-context-api";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const destination = new URL("/settings", url.origin);
  const providerError = url.searchParams.get("error");
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  if (providerError || !code || !state) {
    destination.searchParams.set("gmail", "cancelled");
    return NextResponse.redirect(destination);
  }
  try {
    await familyContextRequest("/v1/gmail/enrollment/callback", {
      method: "POST",
      body: JSON.stringify({ code, state }),
    });
    destination.searchParams.set("gmail", "connected");
  } catch {
    destination.searchParams.set("gmail", "failed");
  }
  return NextResponse.redirect(destination);
}
