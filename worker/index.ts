import { handle } from "@astrojs/cloudflare/handler";
import { runSnapshotDiff } from "./scheduled";

export default {
  async fetch(request, env, ctx) {
    return handle(request, env, ctx);
  },
  async scheduled(_event, env, ctx) {
    ctx.waitUntil(
      runSnapshotDiff(env).then((result) => {
        console.log(`brew-watch snapshot: ${JSON.stringify(result)}`);
      })
    );
  },
} satisfies ExportedHandler<Env>;
