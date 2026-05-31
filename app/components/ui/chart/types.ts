import type { Component } from "vue"

export interface ChartConfigEntry {
  label?: string
  color?: string
  theme?: {
    light?: string
    dark?: string
  }
  icon?: Component
}

export type ChartConfig = Record<string, ChartConfigEntry>
