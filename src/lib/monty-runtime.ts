import { CollectStreams, Monty } from "@pydantic/monty";

import { truncateToolText, truncateToolValue } from "@/lib/tool-output";

const globalForMonty = globalThis as typeof globalThis & {
  lfpMontyPool?: Promise<Monty>;
};

export function getMontyPool() {
  return (
    globalForMonty.lfpMontyPool ??=
      Monty.create({
        minProcesses: 1,
        // Persisted tools may compose other Monty tools. The runtime bounds
        // nesting separately; enough workers prevents a nested checkout stall.
        maxProcesses: 8,
        checkoutTimeout: 5,
        requestTimeout: 15,
        maxCheckoutsPerWorker: 100,
      }).catch((error) => {
        globalForMonty.lfpMontyPool = undefined;
        throw error;
      })
  );
}

export async function executeMontyCode(
  code: string,
  options: {
    inputs?: Record<string, unknown>;
    externalLookup?: Record<string, unknown>;
    maxDurationSecs?: number;
  } = {},
) {
  const pool = await getMontyPool();
  await using session = await pool.checkout({
    limits: {
      maxDurationSecs: options.maxDurationSecs ?? 5,
      maxMemory: 100 * 1024 * 1024,
      maxRecursionDepth: 200,
    },
  });
  const streams = new CollectStreams(1024 * 1024);
  const result = await session.feedRun(code, {
    ...(options.inputs ? { inputs: options.inputs } : {}),
    ...(options.externalLookup
      ? { externalLookup: options.externalLookup }
      : {}),
    printCallback: streams,
  });

  return {
    result: truncateToolValue(result),
    stdout: truncateToolText(
      streams.output
        .filter((entry) => entry.stream === "stdout")
        .map((entry) => entry.text)
        .join(""),
    ),
    stderr: truncateToolText(
      streams.output
        .filter((entry) => entry.stream === "stderr")
        .map((entry) => entry.text)
        .join(""),
    ),
  };
}
