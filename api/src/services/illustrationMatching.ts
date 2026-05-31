import type { PublishedIllustrationProfileVersion } from './illustrations';
import { listPublishedIllustrationProfileVersionDetails } from './illustrations';
import type {
  IllustrationEvidenceSnippet,
  IllustrationFingerprintMatchStrategy,
  IllustrationProfileFingerprint,
  IllustrationProfileMatchCandidate,
  IllustrationProfileMatchResult,
  IllustrationProductType,
  PdfExtractionResult,
} from '../types/illustration';

type FingerprintEvaluation = {
  fingerprint: IllustrationProfileFingerprint;
  matched: boolean;
  evidence?: IllustrationEvidenceSnippet;
};

export type MatchPublishedIllustrationProfileOptions = {
  productType?: IllustrationProductType | null;
};

function normalizeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, ' ').trim();
}

function normalizeCompact(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function textContainsFingerprintValue(text: string, value: string) {
  const needle = normalizeText(value);
  if (!needle) return false;
  return normalizeText(text).includes(needle);
}

export function textNormalizedContainsFingerprintValue(text: string, value: string) {
  const needle = normalizeCompact(value);
  if (!needle) return false;
  return normalizeCompact(text).includes(needle);
}

function pageText(pdf: PdfExtractionResult, pageHint?: number | null) {
  if (!pageHint) return pdf.text;
  return pdf.pages.find(page => page.page === pageHint)?.text || '';
}

function snippet(text: string, index: number, length: number) {
  const start = Math.max(0, index - 80);
  const end = Math.min(text.length, index + Math.max(length, 1) + 80);
  return text.slice(start, end).replace(/\s+/g, ' ').trim();
}

function evidenceForMatch(
  fingerprint: IllustrationProfileFingerprint,
  pdf: PdfExtractionResult,
  text: string,
  index: number,
  length: number,
): IllustrationEvidenceSnippet {
  return {
    page: fingerprint.pageHint || pageForOffset(pdf, text, index) || 1,
    text: snippet(text, index, length) || fingerprint.value,
    confidence: fingerprint.confidence,
    source: 'pdf_text',
  };
}

function pageForOffset(pdf: PdfExtractionResult, targetText: string, index: number) {
  if (targetText !== pdf.text) return null;
  let offset = 0;
  for (const page of pdf.pages) {
    const nextOffset = offset + page.text.length + 1;
    if (index >= offset && index < nextOffset) return page.page;
    offset = nextOffset;
  }
  return null;
}

function evidenceIndexForContains(text: string, value: string) {
  const haystack = text.toLowerCase();
  const rawIndex = haystack.indexOf(value.toLowerCase());
  if (rawIndex >= 0) return rawIndex;

  const firstToken = normalizeText(value)
    .split(' ')
    .find(token => token.length >= 3);
  if (!firstToken) return 0;

  const tokenIndex = haystack.indexOf(firstToken);
  return tokenIndex >= 0 ? tokenIndex : 0;
}

function evaluateContains(
  fingerprint: IllustrationProfileFingerprint,
  pdf: PdfExtractionResult,
  text: string,
): FingerprintEvaluation {
  if (!textContainsFingerprintValue(text, fingerprint.value)) return { fingerprint, matched: false };
  const index = evidenceIndexForContains(text, fingerprint.value);
  return {
    fingerprint,
    matched: true,
    evidence: evidenceForMatch(fingerprint, pdf, text, index, fingerprint.value.length),
  };
}

function evaluateEquals(
  fingerprint: IllustrationProfileFingerprint,
  pdf: PdfExtractionResult,
  text: string,
): FingerprintEvaluation {
  const needle = normalizeText(fingerprint.value);
  for (const page of pdf.pages) {
    for (const line of page.lines) {
      if (normalizeText(line.text) === needle) {
        return {
          fingerprint,
          matched: true,
          evidence: {
            page: line.page,
            text: line.text,
            confidence: fingerprint.confidence,
            source: 'pdf_text',
          },
        };
      }
    }
  }
  if (normalizeText(text) === needle) {
    return {
      fingerprint,
      matched: true,
      evidence: evidenceForMatch(fingerprint, pdf, text, 0, text.length),
    };
  }
  return { fingerprint, matched: false };
}

function evaluateRegex(
  fingerprint: IllustrationProfileFingerprint,
  pdf: PdfExtractionResult,
  text: string,
): FingerprintEvaluation {
  let pattern: RegExp;
  try {
    pattern = new RegExp(fingerprint.value, 'i');
  } catch {
    return { fingerprint, matched: false };
  }
  const match = pattern.exec(text);
  if (!match) return { fingerprint, matched: false };
  return {
    fingerprint,
    matched: true,
    evidence: evidenceForMatch(fingerprint, pdf, text, match.index, match[0]?.length || fingerprint.value.length),
  };
}

function evaluateNormalizedContains(
  fingerprint: IllustrationProfileFingerprint,
  pdf: PdfExtractionResult,
): FingerprintEvaluation {
  const needle = normalizeCompact(fingerprint.value);
  if (!needle) return { fingerprint, matched: false };

  const pages = fingerprint.pageHint
    ? pdf.pages.filter(page => page.page === fingerprint.pageHint)
    : pdf.pages;
  for (const page of pages) {
    if (textNormalizedContainsFingerprintValue(page.text, fingerprint.value)) {
      return {
        fingerprint,
        matched: true,
        evidence: {
          page: page.page,
          text: snippet(page.text, evidenceIndexForContains(page.text, fingerprint.value), fingerprint.value.length) || fingerprint.value,
          confidence: fingerprint.confidence,
          source: 'pdf_text',
        },
      };
    }
    for (const line of page.lines) {
      if (normalizeCompact(line.text).includes(needle)) {
        return {
          fingerprint,
          matched: true,
          evidence: {
            page: line.page,
            text: line.text,
            confidence: fingerprint.confidence,
            source: 'pdf_text',
          },
        };
      }
    }
  }
  return { fingerprint, matched: false };
}

function evaluateFingerprintWithHint(fingerprint: IllustrationProfileFingerprint, pdf: PdfExtractionResult): FingerprintEvaluation {
  const text = pageText(pdf, fingerprint.pageHint);
  if (!text) return { fingerprint, matched: false };

  const strategy: IllustrationFingerprintMatchStrategy = fingerprint.matchStrategy;
  if (strategy === 'equals') return evaluateEquals(fingerprint, pdf, text);
  if (strategy === 'regex') return evaluateRegex(fingerprint, pdf, text);
  if (strategy === 'normalized_contains') return evaluateNormalizedContains(fingerprint, pdf);
  return evaluateContains(fingerprint, pdf, text);
}

export function evaluateFingerprint(fingerprint: IllustrationProfileFingerprint, pdf: PdfExtractionResult): FingerprintEvaluation {
  const hinted = evaluateFingerprintWithHint(fingerprint, pdf);
  if (hinted.matched || !fingerprint.pageHint) return hinted;
  return evaluateFingerprintWithHint({ ...fingerprint, pageHint: null }, pdf);
}

export function candidateForProfile(
  publishedProfile: PublishedIllustrationProfileVersion,
  pdf: PdfExtractionResult,
): IllustrationProfileMatchCandidate | null {
  const fingerprints = publishedProfile.fingerprints;
  if (!fingerprints.length) return null;

  const evaluations = fingerprints.map(fingerprint => evaluateFingerprint(fingerprint, pdf));
  const matched = evaluations.filter(evaluation => evaluation.matched);
  const requiredFingerprints = fingerprints.filter(fingerprint => fingerprint.required);
  const scoringFingerprints = requiredFingerprints.length ? requiredFingerprints : fingerprints;
  const scoringFingerprintSet = new Set(scoringFingerprints);
  const totalWeight = scoringFingerprints.reduce((sum, fingerprint) => sum + Math.max(0, fingerprint.weight || 0), 0);
  const matchedWeight = matched
    .filter(evaluation => scoringFingerprintSet.has(evaluation.fingerprint))
    .reduce((sum, evaluation) => {
      const weight = Math.max(0, evaluation.fingerprint.weight || 0);
      return sum + weight * evaluation.fingerprint.confidence;
    }, 0);
  const matchedRequiredFingerprints = requiredFingerprints.filter(fingerprint =>
    matched.some(evaluation => evaluation.fingerprint.id === fingerprint.id),
  );
  const matchedNonCarrierFingerprint = matched.some(evaluation => evaluation.fingerprint.fingerprintType !== 'carrier');
  const evidence: Record<string, IllustrationEvidenceSnippet> = {};

  matched.forEach((evaluation, index) => {
    if (!evaluation.evidence) return;
    evidence[evaluation.fingerprint.id || `fingerprint:${index}`] = evaluation.evidence;
  });

  return {
    profileId: publishedProfile.profile.id,
    profileVersionId: publishedProfile.version.id,
    carrier: publishedProfile.profile.carrier,
    productName: publishedProfile.profile.productName,
    productType: publishedProfile.profile.productType,
    score: totalWeight > 0 ? Math.min(1, matchedWeight / totalWeight) : 0,
    minMatchScore: publishedProfile.version.minMatchScore,
    requiredMatched: requiredFingerprints.length > 0 && matchedRequiredFingerprints.length === requiredFingerprints.length,
    requiredFingerprintCount: requiredFingerprints.length,
    matchedRequiredFingerprintCount: matchedRequiredFingerprints.length,
    totalFingerprintCount: fingerprints.length,
    matchedFingerprintCount: matched.length,
    matchedNonCarrierFingerprint,
    evidence,
  };
}

function bestCandidate(candidates: IllustrationProfileMatchCandidate[]) {
  return [...candidates].sort((a, b) => b.score - a.score)[0];
}

function isAcceptedCandidate(candidate: IllustrationProfileMatchCandidate) {
  return candidate.requiredMatched
    && candidate.matchedNonCarrierFingerprint
    && candidate.score >= candidate.minMatchScore;
}

export async function matchPublishedIllustrationProfile(
  pdf: PdfExtractionResult,
  options: MatchPublishedIllustrationProfileOptions = {},
): Promise<IllustrationProfileMatchResult> {
  const publishedProfiles = await listPublishedIllustrationProfileVersionDetails(options.productType || null);
  if (!publishedProfiles.length) {
    return {
      status: 'no_published_profile',
      code: 'no_published_profile',
      message: 'No published illustration profiles are available for this upload.',
      candidates: [],
    };
  }

  const candidates = publishedProfiles
    .map(profile => candidateForProfile(profile, pdf))
    .filter((candidate): candidate is IllustrationProfileMatchCandidate => Boolean(candidate))
    .sort((a, b) => b.score - a.score);

  if (!candidates.length) {
    return {
      status: 'unsupported_profile',
      code: 'unsupported_profile',
      message: 'No published illustration profile has fingerprints that can match this upload.',
      candidates: [],
    };
  }

  const accepted = candidates.find(isAcceptedCandidate);
  if (accepted) {
    return {
      status: 'matched',
      match: accepted,
    };
  }

  const best = bestCandidate(candidates);
  return {
    status: best?.score ? 'low_match_confidence' : 'unsupported_profile',
    code: best?.score ? 'low_match_confidence' : 'unsupported_profile',
    message: best?.matchedNonCarrierFingerprint
      ? 'The best profile match did not meet the published confidence threshold.'
      : 'Profile matching requires at least one approved non-carrier fingerprint.',
    bestCandidate: best,
    candidates,
  };
}
