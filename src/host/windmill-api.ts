import { optionalHttpUrl, secretValue } from "@/lib/config";

const DEFAULT_WINDMILL_API_URL = "https://windmill.lfpconnect.io";
const DEFAULT_WINDMILL_WORKSPACE = "lfpconnect";

function windmillWorkspace() {
  const workspace = process.env.LFP_WINDMILL_WORKSPACE?.trim() ||
    DEFAULT_WINDMILL_WORKSPACE;
  if (!/^[a-z0-9][a-z0-9_-]{0,62}$/i.test(workspace)) {
    throw new Error(`Invalid LFP_WINDMILL_WORKSPACE: ${workspace}`);
  }
  return workspace;
}

function encodedPath(path: string) {
  if (!/^f\/[a-z0-9_/-]+$/i.test(path)) {
    throw new Error(`Invalid Windmill script path: ${path}`);
  }
  return path.split("/").map(encodeURIComponent).join("/");
}

export const windmillApi = {
  apiUrl: optionalHttpUrl("LFP_WINDMILL_API_URL") || DEFAULT_WINDMILL_API_URL,
  workspace: windmillWorkspace(),
  token: secretValue("LFP_WINDMILL_TOKEN", "LFP_WINDMILL_TOKEN_FILE"),
};

export async function runWindmillScript(
  path: string,
  input: Record<string, unknown>,
  signal?: AbortSignal,
) {
  if (!windmillApi.token) throw new Error("The Windmill API is not configured.");
  const target = new URL(
    `/api/w/${encodeURIComponent(windmillApi.workspace)}/jobs/run_wait_result/p/${encodedPath(path)}`,
    windmillApi.apiUrl,
  );
  const timeout = AbortSignal.timeout(300_000);
  const response = await fetch(target, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${windmillApi.token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(input),
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Windmill ${path} returned ${response.status}: ${detail.slice(0, 500)}`);
  }
  return await response.json() as unknown;
}
