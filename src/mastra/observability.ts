import { ArizeExporter } from "@mastra/arize";
import { Observability } from "@mastra/observability";

import { serverConfig } from "@/lib/config";

/** Phoenix tracing is opt-in: a blank collector endpoint leaves Mastra untouched. */
export function createObservability() {
  const { apiKey, collectorEndpoint, projectName, serviceName } =
    serverConfig.phoenix;
  if (!collectorEndpoint) return undefined;

  return new Observability({
    configs: {
      phoenix: {
        serviceName,
        exporters: [
          new ArizeExporter({
            endpoint: collectorEndpoint,
            projectName,
            ...(apiKey ? { apiKey } : {}),
          }),
        ],
      },
    },
  });
}
