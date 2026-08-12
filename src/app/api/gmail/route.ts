import { familyContextRequest } from "@/lib/family-context-api";

export async function GET() {
  try {
    const response = await familyContextRequest("/v1/gmail/accounts");
    return Response.json(await response.json());
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not load Gmail accounts." },
      { status: 503 },
    );
  }
}

export async function POST() {
  try {
    const response = await familyContextRequest("/v1/gmail/enrollment/start", {
      method: "POST",
      body: "{}",
    });
    return Response.json(await response.json());
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : "Could not start Gmail enrollment." },
      { status: 503 },
    );
  }
}
