const path = require("node:path");
const { pathToFileURL } = require("node:url");

const entryUrl = pathToFileURL(path.join(__dirname, "server.mjs")).href;

import(entryUrl).catch((err) => {
  try {
    process.stderr.write(`${err?.stack || String(err)}\n`);
  } catch {}
  process.exit(1);
});
