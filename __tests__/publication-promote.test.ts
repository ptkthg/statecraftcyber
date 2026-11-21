import { expect, it, vi } from 'vitest';
import { promoteWithRecovery } from '../scripts/lib/publication-promote.mjs';

function fixture() {
  return {
    candidate: 'https://candidate.vercel.app',
    previous: 'dpl_previous',
    promote: vi.fn<(deployment: string) => Promise<void>>().mockResolvedValue(undefined),
    verifyCandidate: vi.fn<(deployment: string) => Promise<string>>().mockResolvedValue('candidate report'),
    verifyLive: vi.fn<(deployment: string) => Promise<string>>().mockResolvedValue('live report'),
    verifyPrevious: vi.fn<(deployment: string) => Promise<void>>().mockResolvedValue(undefined),
    delay: vi.fn<(milliseconds: number) => Promise<void>>().mockResolvedValue(undefined),
  };
}

it('does not promote a candidate whose isolated verification fails', async () => {
  const options = fixture();
  options.verifyCandidate.mockRejectedValue(new Error('provider diagnostic'));

  await expect(promoteWithRecovery(options)).rejects.toThrow(/^candidate_publication_verification_failed$/);
  expect(options.verifyCandidate).toHaveBeenCalledWith(options.candidate);
  expect(options.promote).not.toHaveBeenCalled();
  expect(options.verifyLive).not.toHaveBeenCalled();
});

it('requires the previous immutable deployment before promoting', async () => {
  const options = fixture();

  await expect(promoteWithRecovery({ ...options, previous: '' })).rejects.toThrow(/^previous_publication_required$/);
  expect(options.promote).not.toHaveBeenCalled();
});

it('waits for canonical domain propagation and returns both verification reports', async () => {
  const options = fixture();
  options.verifyLive.mockRejectedValueOnce(new Error('still propagating')).mockRejectedValueOnce(new Error('still propagating'));

  await expect(promoteWithRecovery(options)).resolves.toEqual({ verified: 'candidate report', live: 'live report' });
  expect(options.promote.mock.calls).toEqual([[options.candidate]]);
  expect(options.verifyLive.mock.calls).toEqual([[options.candidate], [options.candidate], [options.candidate]]);
  expect(options.delay.mock.calls).toEqual([[2_000], [5_000]]);
  expect(options.verifyPrevious).not.toHaveBeenCalled();
});

it('re-promotes and verifies the immutable previous deployment after persistent failure', async () => {
  const options = fixture();
  options.verifyLive.mockRejectedValue(new Error('canonical identity mismatch'));
  options.verifyPrevious.mockRejectedValueOnce(new Error('rollback still propagating'));

  await expect(promoteWithRecovery(options)).rejects.toThrow(/^recovered_previous_publication$/);
  expect(options.verifyLive).toHaveBeenCalledTimes(3);
  expect(options.promote.mock.calls).toEqual([[options.candidate], [options.previous]]);
  expect(options.verifyPrevious.mock.calls).toEqual([[options.previous], [options.previous]]);
  expect(options.delay.mock.calls).toEqual([[2_000], [5_000], [2_000]]);
});

it('reports an unverified recovery distinctly when the previous deployment cannot be confirmed', async () => {
  const options = fixture();
  options.verifyLive.mockRejectedValue(new Error('canonical identity mismatch'));
  options.verifyPrevious.mockRejectedValue(new Error('rollback identity mismatch'));

  await expect(promoteWithRecovery(options)).rejects.toThrow(/^publication_rollback_failed$/);
  expect(options.promote.mock.calls).toEqual([[options.candidate], [options.previous]]);
  expect(options.verifyPrevious).toHaveBeenCalledTimes(3);
});

it('recovers the previous deployment when the promotion command fails after a possible domain change', async () => {
  const options = fixture();
  options.promote.mockRejectedValueOnce(new Error('promotion command lost its connection'));

  await expect(promoteWithRecovery(options)).rejects.toThrow(/^recovered_previous_publication$/);
  expect(options.promote.mock.calls).toEqual([[options.candidate], [options.previous]]);
  expect(options.verifyLive).not.toHaveBeenCalled();
  expect(options.verifyPrevious).toHaveBeenCalledWith(options.previous);
});
