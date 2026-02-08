/**
 * Model pricing from LiteLLM's model_prices_and_context_window.json.
 * Fetches and caches pricing data; computes estimated cost per model call.
 * Cached input uses cache_read_input_token_cost from LiteLLM when present.
 */

import fs from 'fs'
import os from 'os'
import path from 'path'

const PRICING_URL =
  'https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json'
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24 hours

function getCachePath(): string {
  const dir = path.join(os.homedir(), '.codex-observ')
  return path.join(dir, 'pricing-cache.json')
}

type PricingEntry = {
  input_cost_per_token?: number
  output_cost_per_token?: number
  cache_read_input_token_cost?: number
  cache_creation_input_token_cost?: number
  mode?: string
}

type PricingCache = {
  fetchedAt: number
  data: Record<string, PricingEntry>
}

let memoryCache: PricingCache | null = null

function loadCache(): PricingCache | null {
  if (memoryCache) return memoryCache
  try {
    const cachePath = getCachePath()
    const raw = fs.readFileSync(cachePath, 'utf-8')
    const parsed = JSON.parse(raw) as PricingCache
    if (parsed.fetchedAt && parsed.data) {
      memoryCache = parsed
      return parsed
    }
  } catch {
    // ignore
  }
  return null
}

function saveCache(data: Record<string, PricingEntry>): void {
  const cachePath = getCachePath()
  fs.mkdirSync(path.dirname(cachePath), { recursive: true })
  const entry: PricingCache = { fetchedAt: Date.now(), data }
  fs.writeFileSync(cachePath, JSON.stringify(entry, null, 0), 'utf-8')
  memoryCache = entry
}

export async function fetchPricing(): Promise<Record<string, PricingEntry>> {
  const cached = loadCache()
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return cached.data
  }
  try {
    const res = await fetch(PRICING_URL)
    if (!res.ok) throw new Error(`fetch ${res.status}`)
    const data = (await res.json()) as Record<string, PricingEntry>
    saveCache(data)
    return data
  } catch (err) {
    if (cached) return cached.data
    return {}
  }
}

export function getPricingSync(): Record<string, PricingEntry> | null {
  const cached = loadCache()
  return cached?.data ?? null
}

/** Try model name variations to find pricing (exact, provider/model, etc.) */
function findPricing(
  data: Record<string, PricingEntry>,
  model: string | null
): PricingEntry | null {
  if (!model || model === 'unknown') return null
  const m = model.trim()
  if (!m) return null

  const aliases: string[] = []
  // Temporary pricing alias: LiteLLM doesn't publish `gpt-5.3-codex` yet, but our logs already
  // contain it. Treat it as `gpt-5.2-codex` (including cached-token pricing) until upstream
  // adds real pricing for 5.3. Remove this once `gpt-5.3-codex` exists in the source.
  if (m === 'gpt-5.3-codex') {
    aliases.push('gpt-5.2-codex')
  }
  if (m.endsWith('/gpt-5.3-codex')) {
    aliases.push(m.replace('/gpt-5.3-codex', '/gpt-5.2-codex'))
    aliases.push('gpt-5.2-codex')
  }

  const baseCandidates = Array.from(new Set([m, ...aliases]))

  for (const candidate of baseCandidates) {
    if (data[candidate]) return data[candidate]
  }

  for (const candidate of baseCandidates) {
    const variants = [
      `openai/${candidate}`,
      `azure/${candidate}`,
      `anthropic/${candidate}`,
      `openai/${candidate}`.replace(/\./g, '-'),
    ]
    for (const v of variants) {
      if (data[v]) return data[v]
    }
  }
  return null
}

export type ModelPricing = {
  inputCostPerToken: number
  outputCostPerToken: number
  cacheReadCostPerToken: number
}

export function getPricingForModel(
  data: Record<string, PricingEntry> | null,
  model: string | null
): ModelPricing | null {
  if (!data) return null
  const entry = findPricing(data, model)
  if (!entry) return null
  const inputCost = Number(entry.input_cost_per_token)
  const outputCost = Number(entry.output_cost_per_token)
  if (!Number.isFinite(inputCost) || !Number.isFinite(outputCost)) return null

  const cacheRead =
    Number(entry.cache_read_input_token_cost) ??
    Number(entry.cache_creation_input_token_cost) ??
    inputCost

  return {
    inputCostPerToken: inputCost,
    outputCostPerToken: outputCost,
    cacheReadCostPerToken: Number.isFinite(cacheRead) ? cacheRead : inputCost,
  }
}

export function computeCost(
  pricing: ModelPricing | null,
  inputTokens: number,
  cachedInputTokens: number,
  outputTokens: number,
  reasoningTokens: number
): number | null {
  if (!pricing) return null
  const nonCachedInput = Math.max(0, inputTokens - cachedInputTokens)
  const inputCost = nonCachedInput * pricing.inputCostPerToken
  const cachedCost = cachedInputTokens * pricing.cacheReadCostPerToken
  const outputCost = (outputTokens + reasoningTokens) * pricing.outputCostPerToken
  return inputCost + cachedCost + outputCost
}
