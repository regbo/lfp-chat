import { isIP } from "node:net";
import { networkInterfaces } from "node:os";
import { mkdir, writeFile } from "node:fs/promises";
import { spawn, spawnSync } from "node:child_process";
import path from "node:path";

const DEFAULT_PORT = 8080;
const DEFAULT_UPSTREAM = "127.0.0.1:3000";
const LOOPBACK_ADDRESS = "127.0.0.1";

function readPort(value: string | undefined): number {
  const port = value ? Number.parseInt(value, 10) : DEFAULT_PORT;

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error(`CADDY_PORT must be an integer from 1 to 65535; received ${value}.`);
  }

  return port;
}

function readExtraAddresses(value: string | undefined): string[] {
  if (!value?.trim()) return [];

  return value.split(",").map((address) => {
    const trimmed = address.trim();
    if (isIP(trimmed) !== 4) {
      throw new Error(`CADDY_EXTRA_BIND_ADDRESSES contains a non-IPv4 address: ${trimmed}`);
    }
    return trimmed;
  });
}

function detectZeroTierAddresses(): string[] {
  return Object.entries(networkInterfaces()).flatMap(([name, addresses]) => {
    if (!/zerotier/i.test(name)) return [];

    return (addresses ?? [])
      .filter((address) => address.family === "IPv4" && !address.internal)
      .map((address) => address.address);
  });
}

function createCaddyfile(port: number, upstream: string, bindAddresses: string[]) {
  return `{
  admin ${LOOPBACK_ADDRESS}:2019
  auto_https off
}

http://:${port} {
  bind ${bindAddresses.join(" ")}
  encode zstd gzip
  reverse_proxy ${upstream}

  header {
    -Server
  }
}
`;
}

async function main() {
  const port = readPort(process.env.CADDY_PORT);
  const upstream = process.env.CADDY_UPSTREAM?.trim() || DEFAULT_UPSTREAM;
  const bindAddresses = [
    ...new Set([
      LOOPBACK_ADDRESS,
      ...detectZeroTierAddresses(),
      ...readExtraAddresses(process.env.CADDY_EXTRA_BIND_ADDRESSES),
    ]),
  ];
  const runtimeDirectory = path.join(process.cwd(), ".caddy");
  const configPath = path.join(runtimeDirectory, "Caddyfile.dev");

  await mkdir(runtimeDirectory, { recursive: true });
  await writeFile(configPath, createCaddyfile(port, upstream, bindAddresses));

  const formatting = spawnSync("caddy", ["fmt", "--overwrite", configPath], {
    encoding: "utf8",
  });
  if (formatting.status !== 0) {
    const message = formatting.stderr.trim();
    throw new Error(`Caddy configuration could not be formatted: ${message}`);
  }

  const validation = spawnSync(
    "caddy",
    ["validate", "--config", configPath, "--adapter", "caddyfile"],
    { encoding: "utf8" },
  );

  if (validation.status !== 0) {
    const message = validation.stderr.trim();
    throw new Error(`Caddy configuration is invalid: ${message}`);
  }

  console.log(`Caddy proxy: ${bindAddresses.map((address) => `http://${address}:${port}`).join(", ")}`);
  console.log(`Caddy upstream: http://${upstream}`);

  if (process.argv.includes("--check")) return;

  const caddy = spawn(
    "caddy",
    ["run", "--config", configPath, "--adapter", "caddyfile"],
    { stdio: "inherit" },
  );

  const stop = () => caddy.kill();
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);
  process.exitCode = await new Promise<number>((resolve, reject) => {
    caddy.once("error", reject);
    caddy.once("close", (code) => resolve(code ?? 1));
  });
}

await main();
