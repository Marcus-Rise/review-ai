import { createHmac, timingSafeEqual } from 'node:crypto';

const TIMESTAMP_MAX_AGE_SECONDS = 300; // 5 minutes

export function verifyHmacSignature(
  body: string,
  timestamp: string,
  signature: string,
  clientSecret: string,
): { valid: boolean; reason?: string } {
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts)) {
    return { valid: false, reason: 'Invalid timestamp format' };
  }

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > TIMESTAMP_MAX_AGE_SECONDS) {
    return { valid: false, reason: 'Timestamp expired' };
  }

  const expected = createHmac('sha256', clientSecret).update(`${body}${timestamp}`).digest('hex');

  try {
    const sigBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expected, 'hex');

    if (sigBuffer.length !== expectedBuffer.length) {
      return { valid: false, reason: 'Signature mismatch' };
    }

    if (!timingSafeEqual(sigBuffer, expectedBuffer)) {
      return { valid: false, reason: 'Signature mismatch' };
    }

    return { valid: true };
  } catch {
    return { valid: false, reason: 'Signature verification failed' };
  }
}
