import { optionalHttpUrl, secretValue } from "@/lib/config";

export const homeContextApi = {
  apiUrl: optionalHttpUrl("LFP_HOME_CONTEXT_API_URL") || "http://lfp-home-context-api:8001",
  apiKey: secretValue("LFP_HOME_CONTEXT_API_KEY", "LFP_HOME_CONTEXT_API_KEY_FILE"),
};
