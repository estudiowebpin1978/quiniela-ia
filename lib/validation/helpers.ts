/**
 * Validation helpers
 */
import { z } from "zod"
import type { ZodSchema } from "zod"

export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; errors: string[] }

/**
 * Validate data against a Zod schema, returning typed result
 */
export function validate<T>(schema: ZodSchema<T>, data: unknown): ValidationResult<T> {
  const result = schema.safeParse(data)
  if (result.success) {
    return { success: true, data: result.data }
  }
  return {
    success: false,
    errors: result.error.issues.map(i => `${i.path.join(".")}: ${i.message}`),
  }
}

/**
 * Validate and throw on failure
 */
export function validateOrThrow<T>(schema: ZodSchema<T>, data: unknown): T {
  return schema.parse(data)
}

/**
 * Parse JSON body from Request
 */
export async function parseJsonBody<T>(
  request: Request,
  schema: ZodSchema<T>,
): Promise<ValidationResult<T>> {
  try {
    const body = await request.json()
    return validate(schema, body)
  } catch {
    return { success: false, errors: ["Invalid JSON body"] }
  }
}

/**
 * Extract and validate query params
 */
export function validateQueryParams<T>(
  url: string,
  schema: ZodSchema<T>,
): ValidationResult<T> {
  try {
    const parsedUrl = new URL(url)
    const params: Record<string, string> = {}
    parsedUrl.searchParams.forEach((value, key) => {
      params[key] = value
    })
    return validate(schema, params)
  } catch {
    return { success: false, errors: ["Invalid URL"] }
  }
}
