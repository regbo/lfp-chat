import { cp, mkdir, rm } from "node:fs/promises";
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

const clientBundle = await Bun.build({
  banner: '"use client";',
  // Bun otherwise selects the development JSX runtime for this standalone
  // library bundle, which is not available while Next.js prerenders consumers.
  define: { "process.env.NODE_ENV": '"production"' },
  entrypoints: [resolve(projectRoot, "src/index.ts")],
  external: externalDependencies,
  format: "esm",
  minify: true,
  outdir: packageRoot,
  sourcemap: "none",
  target: "browser",
});

if (!clientBundle.success) {
  for (const log of clientBundle.logs) {
    console.error(log);
  }
  throw new Error("The package JavaScript bundle failed.");
}

const serverBundle = await Bun.build({
  define: { "process.env.NODE_ENV": '"production"' },
  entrypoints: [resolve(projectRoot, "src/server-package.ts")],
  external: externalDependencies,
  format: "esm",
  minify: true,
  naming: "mastra.js",
  outdir: packageRoot,
  sourcemap: "none",
  target: "bun",
});

if (!serverBundle.success) {
  for (const log of serverBundle.logs) {
    console.error(log);
  }
  throw new Error("The Mastra package JavaScript bundle failed.");
}

await $`${process.execPath} x tsc -p ${resolve(projectRoot, "tsconfig.publish.json")}`.cwd(
  projectRoot,
);

const publicTypesRoot = resolve(packageRoot, "types");
await mkdir(publicTypesRoot, { recursive: true });
await cp(temporaryTypesRoot, publicTypesRoot, { recursive: true });
await rm(temporaryTypesRoot, { force: true, recursive: true });

await $`${process.execPath} x tailwindcss -i ${resolve(projectRoot, "src/app/globals.css")} -o ${resolve(packageRoot, "styles.css")} --minify`.cwd(
  projectRoot,
);

const clientSource = await Bun.file(resolve(packageRoot, "index.js")).text();
if (/react\/jsx-dev-runtime|\bjsxDEV\b/.test(clientSource)) {
  throw new Error("The package bundle contains React's development-only JSX runtime.");
}
const serverSource = await Bun.file(resolve(packageRoot, "mastra.js")).text();
const transpiler = new Bun.Transpiler({ loader: "js" });
const imports = [
  ...transpiler.scan(clientSource).imports,
  ...transpiler.scan(serverSource).imports,
];
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
  name: manifest.config.npmPackageName,
  version: manifest.version,
  description: manifest.description,
  license: manifest.license,
  type: "module",
  sideEffects: ["./styles.css"],
  exports: {
    ".": {
      types: "./types/index.d.ts",
      import: "./index.js",
      default: "./index.js",
    },
    "./mastra": {
      types: "./types/server-package.d.ts",
      import: "./mastra.js",
      default: "./mastra.js",
    },
    "./styles.css": "./styles.css",
    "./package.json": "./package.json",
  },
  dependencies: packageDependencies,
  peerDependencies,
  engines: manifest.engines,
  publishConfig: {
    access: "public",
    registry: "https://registry.npmjs.org/",
  },
  repository: manifest.repository,
  bugs: manifest.bugs,
  homepage: manifest.homepage,
};

await Bun.write(
  resolve(packageRoot, "package.json"),
  `${JSON.stringify(packageManifest, null, 2)}\n`,
);
await Bun.write(resolve(packageRoot, "README.md"), Bun.file(resolve(projectRoot, "README.md")));
