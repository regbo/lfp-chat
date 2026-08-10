import { readFileSync } from "node:fs";

const keyFile = process.env.OPENAI_API_KEY_FILE;

if (!process.env.OPENAI_API_KEY && keyFile) {
  const key = readFileSync(keyFile, "utf8").trim();
  if (!key) {
    throw new Error(`OPENAI_API_KEY_FILE is empty: ${keyFile}`);
  }
  process.env.OPENAI_API_KEY = key;
}
