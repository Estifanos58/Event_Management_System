declare module "better-auth/next-js" {
  export function nextCookies(): any;

  export function toNextJsHandler(auth: any): {
    GET: (request: Request) => Response | Promise<Response>;
    POST: (request: Request) => Response | Promise<Response>;
    PUT: (request: Request) => Response | Promise<Response>;
    PATCH: (request: Request) => Response | Promise<Response>;
    DELETE: (request: Request) => Response | Promise<Response>;
  };
}
