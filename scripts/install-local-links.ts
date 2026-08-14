import { cp, readFile, rm } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";

interface LocalLink {
  package: string;
  path: string;
}

const projectRoot = resolve(import.meta.dir, "..");

function parseLink(value: string): LocalLink {
  const separator = value.indexOf("=");
  if (separator <= 0 || separator === value.length - 1) {
    throw new Error(`Invalid local link ${JSON.stringify(value)}; expected package=directory`);
  }
  return { package: value.slice(0, separator), path: value.slice(separator + 1) };
}

async function requestedLinks(): Promise<LocalLink[]> {
  const links: LocalLink[] = [];
  for (let index = 2; index < process.argv.length; index += 1) {
    const argument = process.argv[index] ?? "";
    if (argument === "--link") {
      const value = process.argv[index + 1];
      if (!value) throw new Error("--link requires package=directory");
      links.push(parseLink(value));
      index += 1;
    } else if (argument.startsWith("--link=")) {
      links.push(parseLink(argument.slice("--link=".length)));
    } else if (argument === "--manifest") {
      const value = process.argv[index + 1];
      if (!value) throw new Error("--manifest requires a JSON file");
      const manifestPath = isAbsolute(value) ? value : resolve(projectRoot, value);
      const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as unknown;
      if (!Array.isArray(manifest)) throw new Error("Local-link manifest must be an array");
      links.push(...(manifest as LocalLink[]));
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${argument}`);
    }
  }
  if (links.length === 0) throw new Error("Provide at least one --link or --manifest");
  return links;
}

const seen = new Set<string>();
for (const link of await requestedLinks()) {
  if (!/^(?:@[a-z0-9_.-]+\/)?[a-z0-9_.-]+$/i.test(link.package)) {
    throw new Error(`Invalid package name: ${link.package}`);
  }
  if (seen.has(link.package)) throw new Error(`Duplicate local link: ${link.package}`);
  seen.add(link.package);

  const source = isAbsolute(link.path) ? link.path : resolve(projectRoot, link.path);
  const manifest = JSON.parse(await readFile(resolve(source, "package.json"), "utf8")) as {
    dependencies?: Record<string, string>;
    name?: string;
  };
  if (manifest.name !== link.package) {
    throw new Error(
      `${link.package} points to a package named ${manifest.name ?? "missing"}: ${source}`,
    );
  }

  const dependencies = Object.entries(manifest.dependencies ?? {}).map(
    ([name, version]) => `${name}@${version}`,
  );
  if (dependencies.length > 0) {
    const install = Bun.spawn([process.execPath, "add", "--no-save", ...dependencies], {
      cwd: projectRoot,
      stderr: "inherit",
      stdout: "inherit",
    });
    if ((await install.exited) !== 0) {
      throw new Error(`Failed to install dependencies for local link: ${link.package}`);
    }
  }

  const target = resolve(projectRoot, "node_modules", ...link.package.split("/"));
  const targetRelative = relative(resolve(projectRoot, "node_modules"), target);
  if (targetRelative.startsWith("..") || isAbsolute(targetRelative)) {
    throw new Error(`Refusing to replace a package outside node_modules: ${link.package}`);
  }
  await rm(target, { force: true, recursive: true });
  await cp(source, target, { recursive: true });
  console.log(`Linked ${link.package} from ${source}`);
}
