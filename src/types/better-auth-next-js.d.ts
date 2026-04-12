declare module "better-auth/next-js" {
  type BetterAuthPlugin = import("better-auth").BetterAuthPlugin;
  type NextRouteHandler = (request: Request) => Response | Promise<Response>;
  type NextAuthHandlerInput =
    | {
        handler: NextRouteHandler;
      }
    | NextRouteHandler;

  export function nextCookies(): BetterAuthPlugin;

  export function toNextJsHandler(auth: NextAuthHandlerInput): {
    GET: NextRouteHandler;
    POST: NextRouteHandler;
    PUT: NextRouteHandler;
    PATCH: NextRouteHandler;
    DELETE: NextRouteHandler;
  };
}
