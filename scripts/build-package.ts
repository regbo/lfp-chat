import { mkdir, rm } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { $ } from "bun";

const projectRoot = resolve(import.meta.dir, "..");
const distRoot = resolve(projectRoot, "dist");
const packageRoot = resolve(distRoot, "package");
const temporaryTypesRoot = resolve(distRoot, ".package-types");

if (dirname(packageRoot) !== distRoot || dirname(temporaryTypesRoot) !== distRoot) {
  throw new Error("Refusing to clean package paths outside the project dist directory.");
}

await rm(packageRoot, { force: true, recursive: true });
await rm(temporaryTypesRoot, { force: true, recursive: true });

const manifest = await Bun.file(resolve(projectRoot, "package.json")).json();
const externalDependencies = Object.keys(manifest.dependencies ?? {}).flatMap(
  (dependency) => [dependency, `${dependency}/*`],
);

const bundle = await Bun.build({
  banner: '"use client";',
  entrypoints: [resolve(projectRoot, "src/index.ts")],
  external: externalDependencies,
  format: "esm",
  minify: true,
  outdir: packageRoot,
  sourcemap: "none",
  target: "browser",
});

if (!bundle.success) {
  for (const log of bundle.logs) {
    console.error(log);
  }
  throw new Error("The package JavaScript bundle failed.");
}

await $`${process.execPath} x tsc -p ${resolve(projectRoot, "tsconfig.publish.json")}`.cwd(
  projectRoot,
);

const publicTypesRoot = resolve(packageRoot, "types");
await mkdir(resolve(publicTypesRoot, "components"), { recursive: true });
for (const relativePath of [
  "index.d.ts",
  "components/chat-app.d.ts",
]) {
  await Bun.write(
    resolve(publicTypesRoot, relativePath),
    Bun.file(resolve(temporaryTypesRoot, relativePath)),
  );
}
await rm(temporaryTypesRoot, { force: true, recursive: true });

await $`${process.execPath} x tailwindcss -i ${resolve(projectRoot, "src/app/globals.css")} -o ${resolve(packageRoot, "styles.css")} --minify`.cwd(
  projectRoot,
);

const bundledSource = await Bun.file(resolve(packageRoot, "index.js")).text();
const imports = new Bun.Transpiler({ loader: "js" }).scan(bundledSource).imports;
const dependencyNames = Object.keys(manifest.dependencies ?? {});
const usedDependencies = new Set<string>();
for (const item of imports) {
  const dependency = dependencyNames.find(
    (name) => item.path === name || item.path.startsWith(`${name}/`),
  );
  if (dependency) usedDependencies.add(dependency);
}

const peerDependencyNames = new Set(["next", "react", "react-dom"]);
if (usedDependencies.has("react")) usedDependencies.add("react-dom");
const packageDependencies = Object.fromEntries(
  [...usedDependencies]
    .filter((name) => !peerDependencyNames.has(name))
    .sort()
    .map((name) => [name, manifest.dependencies[name]]),
);
const peerDependencies = Object.fromEntries(
  [...peerDependencyNames]
    .filter((name) => usedDependencies.has(name))
    .sort()
    .map((name) => [name, manifest.dependencies[name]]),
);

const packageManifest = {
  name: "@lfp/chat",
  version: manifest.version,
  description: manifest.description,
  license: manifest.license,
  type: "module",
  sideEffects: ["./styles.css"],
  exports: {
    ".": {
      types: "./types/index.d.ts",
      import: "./index.js",
    },
    "./styles.css": "./styles.css",
  },
  dependencies: packageDependencies,
  peerDependencies,
  engines: manifest.engines,
  publishConfig: {
    access: "public",
    registry: "https://registry.npmjs.org/",
  },
  repository: {
    type: "git",
    url: "git+https://github.com/regbo/lfp-chat.git",
  },
  bugs: {
    url: "https://github.com/regbo/lfp-chat/issues",
  },
  homepage: "https://github.com/regbo/lfp-chat#readme",
};

await Bun.write(
  resolve(packageRoot, "package.json"),
  `${JSON.stringify(packageManifest, null, 2)}\n`,
);
await Bun.write(resolve(packageRoot, "README.md"), Bun.file(resolve(projectRoot, "README.md")));
