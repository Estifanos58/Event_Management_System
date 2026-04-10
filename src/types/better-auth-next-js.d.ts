declare module "better-auth/next-js" {
  import type { betterAuth } from "better-auth";

  type BetterAuthInstance = ReturnType<typeof betterAuth>;
  type BetterAuthOptions = Parameters<typeof betterAuth>[0];
  type BetterAuthPlugin = NonNullable<BetterAuthOptions["plugins"]>[number];

  export function nextCookies(): BetterAuthPlugin;

  export function toNextJsHandler(auth: BetterAuthInstance): {
    GET: (request: Request) => Response | Promise<Response>;
    POST: (request: Request) => Response | Promise<Response>;
    PUT: (request: Request) => Response | Promise<Response>;
    PATCH: (request: Request) => Response | Promise<Response>;
    DELETE: (request: Request) => Response | Promise<Response>;
  };
}
