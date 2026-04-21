import Decimal from "decimal.js"

export function decimalFrom(value: Decimal.Value | null | undefined) {
  return new Decimal(value ?? 0)
}

export function toMoneyString(value: Decimal.Value | null | undefined) {
  return decimalFrom(value).toFixed(8)
}
