import { build } from "esbuild";
import path from "node:path";
import { pathToFileURL } from "node:url";
export async function loadDomain(env) {
  // This process is separate from Next and can never be deployed with the app.
  Object.assign(process.env, env, {
    NODE_ENV: "development",
    LANCERS_TEST_BOX: "1",
    LANCERS_TEST_PANEL: "1",
  });
  const outfile = path.resolve(".lancers-runtime/domain-bridge.mjs");
  await build({
    entryPoints: ["scripts/test-box/domain-bridge.ts"],
    outfile,
    bundle: true,
    platform: "node",
    format: "esm",
    packages: "external",
    logLevel: "silent",
    plugins: [
      {
        name: "local-test-boundary",
        setup(b) {
          b.onResolve({ filter: /^next\/(headers|cache|navigation|server)$/ }, (args) => ({
            path: args.path + ".js",
            external: true,
          }));
          b.onResolve({ filter: /^server-only$/ }, () => ({
            path: "empty",
            namespace: "local-server",
          }));
          b.onLoad({ filter: /.*/, namespace: "local-server" }, () => ({
            contents: "export {};",
            loader: "js",
          }));
          b.onResolve({ filter: /test-runtime$/ }, () => ({
            path: path.resolve("scripts/test-box/app-hooks.mjs"),
          }));
        },
      },
    ],
  });
  return import(pathToFileURL(outfile).href + "?t=" + Date.now());
}
