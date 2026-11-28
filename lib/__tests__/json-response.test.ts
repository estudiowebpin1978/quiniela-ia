import { describe, expect, it } from "vitest"
import { readJsonArray, readJsonObject } from "@/lib/json-response"

describe("JSON response readers", () => {
  it("accepts object and array response payloads", async () => {
    const object = await readJsonObject<{ ok: boolean }>(
      new Response(JSON.stringify({ ok: true })),
    )
    const array = await readJsonArray<string>(
      new Response(JSON.stringify(["ready"])),
    )

    expect(object.ok).toBe(true)
    expect(array).toEqual(["ready"])
  })

  it("rejects unexpected top-level JSON shapes", async () => {
    await expect(readJsonObject(new Response("null"))).rejects.toThrow("Expected a JSON object")
    await expect(readJsonArray(new Response("{}"))).rejects.toThrow("Expected a JSON array")
  })
})
