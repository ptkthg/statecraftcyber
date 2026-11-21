import { setTimeout as wait } from 'node:timers/promises';

const propagationDelays = [0, 2_000, 5_000];

async function verifyCanonical(verify, deployment, delay) {
  for (const milliseconds of propagationDelays) {
    if (milliseconds > 0) await delay(milliseconds);
    try {
      return await verify(deployment);
    } catch {
      // The canonical domain may still be propagating.
    }
  }
  throw new Error('canonical_publication_verification_failed');
}

/**
 * @template CandidateReport, LiveReport
 * @param {object} options
 * @param {string} options.candidate Immutable candidate deployment identifier or URL.
 * @param {string} options.previous Immutable previous deployment identifier or URL.
 * @param {(deployment: string) => Promise<unknown>} options.promote
 * @param {(deployment: string) => Promise<CandidateReport>} options.verifyCandidate
 * @param {(deployment: string) => Promise<LiveReport>} options.verifyLive
 * @param {(deployment: string) => Promise<unknown>} options.verifyPrevious
 * @param {(milliseconds: number) => Promise<unknown>} [options.delay]
 */
export async function promoteWithRecovery({
  candidate,
  previous,
  promote,
  verifyCandidate,
  verifyLive,
  verifyPrevious,
  delay = wait,
}) {
  if (typeof previous !== 'string' || !previous.trim()) {
    throw new Error('previous_publication_required');
  }

  let verified;
  try {
    verified = await verifyCandidate(candidate);
  } catch {
    throw new Error('candidate_publication_verification_failed');
  }

  try {
    await promote(candidate);
    const live = await verifyCanonical(verifyLive, candidate, delay);
    return { verified, live };
  } catch {
    // A failed promotion command may already have changed the canonical domain.
  }

  try {
    await promote(previous);
  } catch {
    // Confirm the canonical deployment even if the rollback command loses its connection.
  }
  try {
    await verifyCanonical(verifyPrevious, previous, delay);
  } catch {
    throw new Error('publication_rollback_failed');
  }
  throw new Error('recovered_previous_publication');
}
