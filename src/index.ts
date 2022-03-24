import { ConfigEnv, Plugin, ResolvedConfig, ViteDevServer } from "vite";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import fs from "fs";
import MagicString from "magic-string";
import { RequestOptions, get as httpGet } from "http";

const pluginName = "vite:logseq-dev-plugin";

function getLogseqPluginId() {
  try {
    const packageJson = fs.readFileSync(
      path.join(process.cwd(), "package.json"),
      "utf-8"
    );

    return JSON.parse(packageJson).logseq.id;
  } catch (err) {
    console.error(`${pluginName}: failed to get valid plugin id`);
  }
}

// TODO: support https?
const request = async (url: string, options: RequestOptions) => {
  let resolve: (body: any) => void;
  let data: any[] = [];
  let promise = new Promise<string>((res) => {
    resolve = res;
  });

  httpGet(url, options, (res) => {
    res.on("data", (chunk) => {
      data.push(chunk);
    });
    res.on("end", () => {
      resolve(Buffer.concat(data).toString());
    });
  });
  return promise;
};

const logseqDevPlugin: () => Plugin = () => {
  let config: ResolvedConfig;
  let configEnv: ConfigEnv;
  let server: ViteDevServer;
  const pluginId = getLogseqPluginId();

  // eagerly load the HTML file to let it write to the dist
  const tapHtml = async (address: string) => {
    const res = await request(address, {
      method: "GET",
      headers: {
        accept: "text/html",
      },
    });
    return res;
  };

  return {
    name: pluginName,
    enforce: "post",
    config: async (config, resolvedEnv) => {
      configEnv = resolvedEnv;

      // make sure base is empty, otherwise when running in build mode
      // the asset will be served from the root "/"
      config.base = "";

      // Plugin works in file://, but it fetches vite resources from localhost
      // thus we must turn on cors
      if (resolvedEnv.command === "serve") {
        config.server = Object.assign({}, config.server, {
          cors: true,
          hmr: {
            host: config.server?.host ?? "localhost",
          },
        });
      }

      return config;
    },

    configureServer(_server) {
      server = _server;
    },

    configResolved(resolvedConfig) {
      // store the resolved config
      config = resolvedConfig;
    },

    transform(code, id) {
      if (
        server!.moduleGraph.getModuleById(id)?.importers.size === 0 &&
        !/node_modules/.test(id) &&
        id.startsWith(process.cwd())
      ) {
        const s = new MagicString(code);
        s.prepend(
          `
if (import.meta.hot) {
  import.meta.hot.accept(() => {});
  import.meta.hot.dispose(() => {
    top?.LSPluginCore.reload("${pluginId}");
    console.log("✨Plugin ${pluginId} reloaded ✨");
    // TODO: trigger re-render globally
  });
}\n\n`
        );
        // amend entries
        return {
          code: s.toString(),
          map: s.generateMap({ hires: true }),
        };
      }
    },

    // Overwrite dev HTML
    async buildStart() {
      if (configEnv.command === "serve") {
        if (!server.httpServer) {
          throw new Error(
            `${pluginName} Only works for non-middleware mode for now`
          );
        }

        server.httpServer.once("listening", () => {
          let address = server.httpServer!.address()!;
          if (typeof address === "object" && address) {
            address = "http://" + address.address + ":" + address.port;
          }
          tapHtml(address).then(async (html) => {
            // Rewrite the base, otherwise assets like `/@vite/client` will
            // subject to default `file://` path
            const baseHref = address;
            const baseString = `<base href="${baseHref}">`;
            const htmlWithBase = html.replace(`<head>`, `<head>${baseString}`);

            await mkdir(config.build.outDir, { recursive: true });
            await writeFile(
              path.resolve(config.build.outDir, "index.html"),
              htmlWithBase,
              {
                encoding: "utf-8",
              }
            );
            console.info(`${pluginName}: Wrote development index.html`);
          });
        });
      }
    },
  };
};

export default logseqDevPlugin;
