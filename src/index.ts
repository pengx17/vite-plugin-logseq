import { ConfigEnv, Plugin, ResolvedConfig, ViteDevServer } from "vite";
import { writeFile, mkdir } from "fs/promises";
import path from "path";
import fs from "fs";
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

  const delay = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));

  // eagerly load the HTML file to let it write to the dist
  const tapHtml = async (config: ResolvedConfig) => {
    await delay(1000);

    const res = await request(
      `http://${config.server.host}:${config.server.port}`,
      {
        method: "GET",
        headers: {
          accept: "text/html",
        },
      }
    );
    return res;
  };

  return {
    name: pluginName,
    enforce: "post",
    config: async (config, resolvedEnv) => {
      if (
        resolvedEnv.command === "serve" &&
        (!config.server?.host ||
          !config.server?.port ||
          !config.server?.strictPort)
      ) {
        throw new Error(
          `${pluginName} requires server.host, server.port, and server.strictPort to be set for dev mode`
        );
      }
      configEnv = resolvedEnv;
      // make sure base is empty, otherwise when running in build mode
      // the asset will be served from the root "/"
      config.base = "";
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

        // amend entries
        return (
          `
        import.meta.hot.accept(() => {});
        import.meta.hot.dispose(() => {
          top?.LSPluginCore.reload("${pluginId}");
          console.log("✨Plugin ${pluginId} reloaded ✨");
        });\n\n` + code
        );
      }
    },

    // Overwrite dev HTML
    async buildStart(opt) {
      if (configEnv.command === "serve") {
        tapHtml(config).then(async (html) => {
          // Rewrite the base, otherwise assets like `/@vite/client` will
          // subject to default `file://` path
          const baseHref = `http://${config.server.host}:${config.server.port}`;
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
      }
    },
  };
};

export default logseqDevPlugin;
