const tag = process.argv[2];
const version = tag?.startsWith("v") ? tag.slice(1) : tag;

if (!version || !/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/.test(version)) {
  throw new Error(`Expected a semantic version tag such as v1.2.3; received ${tag ?? "nothing"}.`);
}

const manifestPath = new URL("../package.json", import.meta.url);
const manifest = await Bun.file(manifestPath).json();
manifest.version = version;
await Bun.write(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log(`Publishing ${manifest.config.npmPackageName}@${version}`);
