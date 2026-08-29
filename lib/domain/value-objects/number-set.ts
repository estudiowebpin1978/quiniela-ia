/**
 * Value Object: NumberSet (collection of lottery numbers with validation)
 */
export class NumberSet {
  private constructor(private readonly numbers: readonly number[]) {}

  static create2c(nums: number[]): NumberSet {
    const valid = nums.filter(n => n >= 0 && n <= 99 && Number.isInteger(n))
    return new NumberSet(Object.freeze([...new Set(valid)]))
  }

  static create3c(nums: number[]): NumberSet {
    const valid = nums.filter(n => n >= 0 && n <= 999 && Number.isInteger(n))
    return new NumberSet(Object.freeze([...new Set(valid)]))
  }

  static create4c(nums: number[]): NumberSet {
    const valid = nums.filter(n => n >= 0 && n <= 9999 && Number.isInteger(n))
    return new NumberSet(Object.freeze([...new Set(valid)]))
  }

  get items(): readonly number[] { return this.numbers }
  get length(): number { return this.numbers.length }
  get isEmpty(): boolean { return this.numbers.length === 0 }

  contains(n: number): boolean { return this.numbers.includes(n) }

  toArray(): number[] { return [...this.numbers] }

  padAll(width: number): string[] {
    return this.numbers.map(n => String(n).padStart(width, "0"))
  }
}
