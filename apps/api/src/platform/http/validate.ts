import type { Request } from 'express';
import type { z } from 'zod';
import { AppError } from './errors';

/**
 * Parses the request body with a zod schema. Failures become a 400
 * VALIDATION_FAILED with `details.fields` = { fieldName: message }.
 * Use z.strictObject so unknown fields are rejected.
 */
export function parseBody<T extends z.ZodType>(schema: T, req: Request): z.infer<T> {
  return parse(schema, req.body);
}

/** Same as parseBody, for the query string (e.g. ?q=&page=). */
export function parseQuery<T extends z.ZodType>(schema: T, req: Request): z.infer<T> {
  return parse(schema, req.query);
}

function parse<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (result.success) return result.data;
  const fields: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || '_';
    fields[key] ??= issue.message;
  }
  throw new AppError(400, 'VALIDATION_FAILED', 'Some fields are invalid', { fields });
}
