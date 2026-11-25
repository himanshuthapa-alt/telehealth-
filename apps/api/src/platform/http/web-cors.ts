import type { RequestHandler } from 'express';

/**
 * Allows browser clients to call the API. Development accepts browser origins
 * so changing localhost/LAN addresses work; deployments must list exact origins.
 * The API uses bearer tokens rather than cookies, so credentials are disabled.
 */
export function webCors({
  allowAnyOrigin = false,
  allowedOrigins = [],
}: {
  allowAnyOrigin?: boolean;
  allowedOrigins?: readonly string[];
} = {}): RequestHandler {
  const originSet = new Set(allowedOrigins);

  return (req, res, next) => {
    const origin = req.get('origin');
    if (!origin) return next();

    const allowed = allowAnyOrigin || originSet.has(origin);
    if (!allowed) {
      if (req.method === 'OPTIONS') return res.sendStatus(403);
      return next();
    }

    res.setHeader('Access-Control-Allow-Origin', allowAnyOrigin ? '*' : origin);
    if (!allowAnyOrigin) res.vary('Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type, X-Request-Id');
    res.setHeader('Access-Control-Max-Age', '600');

    if (req.method === 'OPTIONS') return res.sendStatus(204);
    next();
  };
}
