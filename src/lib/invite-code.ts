import { APIError } from 'better-auth/api'

export function assertValidInviteCode(provided: unknown, expected: string | undefined) {
  if (!expected || provided !== expected) {
    throw new APIError('FORBIDDEN', { message: 'Invalid invite code' })
  }
}
