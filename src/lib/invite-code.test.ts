import { APIError } from 'better-auth/api'
import { describe, expect, it } from 'vitest'
import { assertValidInviteCode } from './invite-code'

function rejection(provided: unknown, expected: string | undefined) {
  try {
    assertValidInviteCode(provided, expected)
  } catch (error) {
    return error
  }
}

describe('assertValidInviteCode', () => {
  it('accepts the configured code', () => {
    expect(() => assertValidInviteCode('open-sesame', 'open-sesame')).not.toThrow()
  })

  it('rejects a different code', () => {
    expect(rejection('wrong', 'open-sesame')).toBeInstanceOf(APIError)
  })

  it('rejects with a 403 status', () => {
    expect(rejection('wrong', 'open-sesame')).toMatchObject({ statusCode: 403 })
  })

  it('rejects a missing code', () => {
    expect(rejection(undefined, 'open-sesame')).toBeInstanceOf(APIError)
  })

  it('rejects a non-string code', () => {
    expect(rejection(1234, '1234')).toBeInstanceOf(APIError)
  })

  it('compares codes case-sensitively', () => {
    expect(rejection('OPEN-SESAME', 'open-sesame')).toBeInstanceOf(APIError)
  })

  it('rejects every sign-up when no code is configured', () => {
    expect(rejection(undefined, undefined)).toBeInstanceOf(APIError)
  })

  it('rejects an empty code even when the configured code is empty', () => {
    expect(rejection('', '')).toBeInstanceOf(APIError)
  })
})
