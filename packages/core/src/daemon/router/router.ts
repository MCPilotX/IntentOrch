import http from "http";
import { logger } from "../../core/logger.js";
import { sendJson, type RouteContext } from "../routes/index.js";

export type RouteHandler = (ctx: RouteContext) => Promise<boolean>;

export class Router {
  private routes: Array<{
    method: string;
    path: string | RegExp;
    handler: RouteHandler;
  }> = [];

  use(method: string, path: string | RegExp, handler: RouteHandler) {
    this.routes.push({ method, path, handler });
  }

  async dispatch(ctx: RouteContext): Promise<boolean> {
    for (const route of this.routes) {
      if (ctx.method === route.method || route.method === "ALL") {
        let matched = false;
        if (typeof route.path === "string") {
          matched = ctx.path === route.path;
        } else {
          matched = route.path.test(ctx.path);
        }

        if (matched) {
          try {
            const handled = await route.handler(ctx);
            if (handled) return true;
          } catch (error: unknown) {
            logger.error(`[Router] Error handling ${ctx.method} ${ctx.path}:`, error);
            sendJson(ctx.res, 500, {
              error: "Internal Server Error",
              message: (error instanceof Error ? error.message : String(error)),
            });
            return true;
          }
        }
      }
    }
    return false;
  }
}
