import { describe, it, expect } from 'vitest'

import { getPricingForModel } from '../src/lib/pricing'

describe('pricing', () => {
  it('maps gpt-5.3-codex to gpt-5.2-codex pricing (including cached token cost)', () => {
    const data = {
      'gpt-5.2-codex': {
        input_cost_per_token: 0.001,
        output_cost_per_token: 0.01,
        cache_read_input_token_cost: 0.0001,
      },
    }

    const pricing = getPricingForModel(data, 'gpt-5.3-codex')
    expect(pricing).toEqual({
      inputCostPerToken: 0.001,
      outputCostPerToken: 0.01,
      cacheReadCostPerToken: 0.0001,
    })
  })

  it('maps provider-prefixed gpt-5.3-codex names to gpt-5.2-codex pricing', () => {
    const data = {
      'openai/gpt-5.2-codex': {
        input_cost_per_token: 0.002,
        output_cost_per_token: 0.02,
        cache_read_input_token_cost: 0.0002,
      },
    }

    const pricing = getPricingForModel(data, 'openai/gpt-5.3-codex')
    expect(pricing).toEqual({
      inputCostPerToken: 0.002,
      outputCostPerToken: 0.02,
      cacheReadCostPerToken: 0.0002,
    })
  })
})
