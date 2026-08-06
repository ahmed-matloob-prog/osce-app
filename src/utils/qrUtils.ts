// QR badge encoding, decoding and validation.
//
// Badges printed before this existed carried the bare candidate number, which
// meant a badge from any exam scanned cleanly into any other. The current
// format namespaces the payload with the exam it was printed for:
//
//   OSCE:<examId>:<candidateNumber>
//
// Legacy bare-number badges still decode, but are flagged so the UI can warn.

export const QR_PREFIX = 'OSCE';

export interface QRCodeData {
  examId: string | null; // null for legacy badges that carry no exam
  candidateNumber: string;
  isLegacy: boolean;
}

export type QRValidation =
  | { status: 'ok'; data: QRCodeData }
  | { status: 'legacy'; data: QRCodeData }
  | { status: 'wrong-exam'; data: QRCodeData }
  | { status: 'unreadable'; raw: string };

/**
 * Build the payload for a candidate's badge in a given exam.
 */
export function encodeQR(examId: string, candidateNumber: string): string {
  return `${QR_PREFIX}:${examId}:${candidateNumber}`;
}

/**
 * Parse a scanned string. Returns null if it is not something we recognise.
 *
 * Splits on the first two colons only, so a candidate number containing a
 * colon survives the round trip.
 */
export function decodeQR(qrText: string): QRCodeData | null {
  const text = qrText.trim();
  if (!text) return null;

  if (text.startsWith(`${QR_PREFIX}:`)) {
    const rest = text.slice(QR_PREFIX.length + 1);
    const split = rest.indexOf(':');
    if (split <= 0) return null;

    const examId = rest.slice(0, split);
    const candidateNumber = rest.slice(split + 1).trim();
    if (!examId || !candidateNumber) return null;

    return { examId, candidateNumber, isLegacy: false };
  }

  // Legacy badge: the bare candidate number.
  return { examId: null, candidateNumber: text, isLegacy: true };
}

/**
 * Check a scanned badge against the exam currently being run.
 */
export function validateQR(qrText: string, currentExamId: string): QRValidation {
  const data = decodeQR(qrText);
  if (!data) return { status: 'unreadable', raw: qrText };

  if (data.isLegacy) return { status: 'legacy', data };
  if (data.examId !== currentExamId) return { status: 'wrong-exam', data };

  return { status: 'ok', data };
}

/**
 * Canonical form of a college ID for storage and comparison.
 *
 * Trimmed and upper-cased. Leading zeros are preserved, because collapsing
 * them would merge two students if an institution ever issued both `0024001`
 * and `24001`. The spreadsheet-ate-my-zeros case is handled as an explicit
 * fallback in `findCandidateByNumber` instead.
 */
export function normalizeCandidateNumber(value: string | undefined | null): string {
  return (value ?? '').trim().toUpperCase();
}

/**
 * Resolve a scanned or typed college ID against a candidate list.
 *
 * Exact match first. The previous implementation compared with `includes()` in
 * both directions, so scanning "20240012" would resolve to candidate "2024001"
 * and file the score against the wrong person.
 *
 * If there is no exact match, fall back to comparing with leading zeros
 * stripped — Excel drops them on export, so a roster imported from a
 * re-saved spreadsheet can hold "24001" for a student whose badge reads
 * "0024001". The fallback is only accepted when exactly one candidate
 * matches; two or more is ambiguous and must be resolved by a human.
 */
export function findCandidateByNumber<T extends { candidateNumber: string }>(
  candidates: T[],
  candidateNumber: string
): T | undefined {
  const target = normalizeCandidateNumber(candidateNumber);
  if (!target) return undefined;

  const exact = candidates.find((c) => normalizeCandidateNumber(c.candidateNumber) === target);
  if (exact) return exact;

  const stripZeros = (v: string) => v.replace(/^0+/, '');
  const loose = stripZeros(target);
  if (!loose) return undefined;

  const matches = candidates.filter(
    (c) => stripZeros(normalizeCandidateNumber(c.candidateNumber)) === loose
  );
  return matches.length === 1 ? matches[0] : undefined;
}
