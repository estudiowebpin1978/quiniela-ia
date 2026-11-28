async function readJson(response: Response): Promise<unknown> {
  return response.json()
}

export function isJsonRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export async function readJsonObject<T extends object>(response: Response): Promise<T> {
  const value = await readJson(response)
  if (!isJsonRecord(value)) {
    throw new Error("Expected a JSON object in the response")
  }
  return value as T
}

export async function readJsonArray<T>(response: Response): Promise<T[]> {
  const value = await readJson(response)
  if (!Array.isArray(value)) {
    throw new Error("Expected a JSON array in the response")
  }
  return value as T[]
}
