import { serverConfig } from "@/lib/config";

export async function familyContextRequest(path: string, init: RequestInit = {}) {
  if (!serverConfig.familyContextApiUrl || !serverConfig.familyContextApiKey) {
    throw new Error("The family context API is not configured.");
  }
  const response = await fetch(new URL(path, serverConfig.familyContextApiUrl), {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "X-LFP-Context-Key": serverConfig.familyContextApiKey,
      ...init.headers,
    },
    signal: AbortSignal.timeout(300_000),
  });
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { detail?: string };
    throw new Error(payload.detail || `Family context request failed with HTTP ${response.status}.`);
  }
  return response;
}
