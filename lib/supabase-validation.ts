/**
 * Supabase Response Validation Helpers
 * Provides consistent error handling and validation for all Supabase operations.
 */

import { PostgrestError, PostgrestResponse } from "@supabase/supabase-js"
import logger from "@/lib/logger"

export interface ValidatedResponse<T> {
  data: T | null
  error: PostgrestError | null
  success: boolean
}

/**
 * Validates a Supabase response and returns a standardized result.
 * Handles all common error cases and provides consistent error messages.
 */
export function validateResponse<T>(
  response: PostgrestResponse<T> | { data: T | null; error: PostgrestError | null }
): ValidatedResponse<T> {
  if (response.error) {
    return {
      data: null,
      error: response.error,
      success: false
    }
  }

  if (response.data === null || response.data === undefined) {
    return {
      data: null,
      error: { message: "No data returned", code: "PGRST116", details: "", hint: "" } as PostgrestError,
      success: false
    }
  }

  return {
    data: response.data,
    error: null,
    success: true
  }
}

/**
 * Validates that response contains an array with at least one element.
 */
export function validateArrayResponse<T>(
  response: PostgrestResponse<T[]> | { data: T[] | null; error: PostgrestError | null }
): ValidatedResponse<T[]> {
  const validated = validateResponse(response)
  if (!validated.success) return validated

  if (!Array.isArray(validated.data) || validated.data.length === 0) {
    return {
      data: null,
      error: { message: "Expected non-empty array", code: "EMPTY_ARRAY", details: "", hint: "" } as PostgrestError,
      success: false
    }
  }

  return validated
}

/**
 * Validates that response contains a single object (not array).
 */
export function validateSingleResponse<T>(
  response: PostgrestResponse<T> | { data: T | null; error: PostgrestError | null }
): ValidatedResponse<T> {
  const validated = validateResponse(response)
  if (!validated.success) return validated

  if (Array.isArray(validated.data)) {
    return {
      data: null,
      error: { message: "Expected single object, got array", code: "UNEXPECTED_ARRAY", details: "", hint: "" } as PostgrestError,
      success: false
    }
  }

  return validated
}

/**
 * Wraps a Supabase query with automatic validation and error logging.
 */
export async function validatedQuery<T>(
  queryFn: () => Promise<PostgrestResponse<T> | { data: T | null; error: PostgrestError | null }>,
  context: string
): Promise<ValidatedResponse<T>> {
  try {
    const response = await queryFn()
    const validated = validateResponse(response)

    if (!validated.success) {
      logger.error(`[Supabase] ${context}:`, { error: validated.error?.message })
    }

    return validated
  } catch (err) {
    const error = err as Error
    logger.error(`[Supabase] ${context} exception:`, { error: error.message })
    return {
      data: null,
      error: { message: error.message, code: "EXCEPTION", details: "", hint: "" } as PostgrestError,
      success: false
    }
  }
}

/**
 * Wraps a Supabase array query with automatic validation and error logging.
 */
export async function validatedArrayQuery<T>(
  queryFn: () => Promise<PostgrestResponse<T[]> | { data: T[] | null; error: PostgrestError | null }>,
  context: string
): Promise<ValidatedResponse<T[]>> {
  try {
    const response = await queryFn()
    const validated = validateArrayResponse(response)

    if (!validated.success) {
      logger.error(`[Supabase] ${context}:`, { error: validated.error?.message })
    }

    return validated
  } catch (err) {
    const error = err as Error
    logger.error(`[Supabase] ${context} exception:`, { error: error.message })
    return {
      data: null,
      error: { message: error.message, code: "EXCEPTION", details: "", hint: "" } as PostgrestError,
      success: false
    }
  }
}

/**
 * Wraps a Supabase single-object query with automatic validation and error logging.
 */
export async function validatedSingleQuery<T>(
  queryFn: () => Promise<PostgrestResponse<T> | { data: T | null; error: PostgrestError | null }>,
  context: string
): Promise<ValidatedResponse<T>> {
  try {
    const response = await queryFn()
    const validated = validateSingleResponse(response)

    if (!validated.success) {
      logger.error(`[Supabase] ${context}:`, { error: validated.error?.message })
    }

    return validated
  } catch (err) {
    const error = err as Error
    logger.error(`[Supabase] ${context} exception:`, { error: error.message })
    return {
      data: null,
      error: { message: error.message, code: "EXCEPTION", details: "", hint: "" } as PostgrestError,
      success: false
    }
  }
}

/**
 * Validates Supabase RPC response
 */
export function validateRpcResponse<T>(
  response: { data: T | null; error: PostgrestError | null }
): ValidatedResponse<T> {
  return validateResponse(response)
}

/**
 * Safe array access - returns empty array instead of throwing
 */
export function safeArray<T>(data: T[] | null | undefined): T[] {
  return Array.isArray(data) ? data : []
}

/**
 * Safe object access - returns null instead of throwing
 */
export function safeObject<T extends object>(data: T | null | undefined): T | null {
  return data && typeof data === "object" && !Array.isArray(data) ? data : null
}