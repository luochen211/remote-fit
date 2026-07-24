#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const DIMENSIONS = Object.freeze([
  { key: 'roleCompetence', label: '岗位核心能力', weight: 30, critical: true },
  { key: 'problemSolving', label: '问题分析与解法', weight: 20, critical: true },
  { key: 'evidenceAndOwnership', label: '经历证据与担当', weight: 20, critical: true },
  { key: 'communication', label: '表达与协作', weight: 15, critical: false },
  { key: 'motivationAndRoleFit', label: '动机与岗位匹配', weight: 10, critical: false },
  { key: 'remoteCollaboration', label: '远程协作准备度', weight: 5, critical: false }
]);

function usage(message) {
  if (message) console.error(message);
  console.error(
    'Usage: node scripts/score-interview.mjs --transcript transcript.txt --assessment assessment.json [--summary]'
  );
  process.exit(2);
}

function normalizeEvidence(value) {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function assertPlainObject(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
}

function validateEvidence(evidence, transcript, field) {
  if (!Array.isArray(evidence) || evidence.length === 0) {
    throw new Error(`${field} must contain at least one transcript quote`);
  }

  const normalizedTranscript = normalizeEvidence(transcript);
  return evidence.map((item, index) => {
    assertPlainObject(item, `${field}[${index}]`);
    const quote = typeof item.quote === 'string' ? item.quote.trim() : '';
    const note = typeof item.note === 'string' ? item.note.trim() : '';
    if (normalizeEvidence(quote).length < 6) {
      throw new Error(`${field}[${index}].quote must contain at least 6 characters`);
    }
    if (!normalizedTranscript.includes(normalizeEvidence(quote))) {
      throw new Error(`${field}[${index}].quote was not found in the transcript`);
    }
    if (!note) {
      throw new Error(`${field}[${index}].note is required`);
    }
    return { quote, note };
  });
}

function validateConcerns(concerns, transcript) {
  if (concerns === undefined) return [];
  if (!Array.isArray(concerns)) throw new Error('concerns must be an array');

  return concerns.map((concern, index) => {
    assertPlainObject(concern, `concerns[${index}]`);
    const severity = concern.severity;
    if (!['low', 'medium', 'high'].includes(severity)) {
      throw new Error(`concerns[${index}].severity must be low, medium, or high`);
    }
    const type = typeof concern.type === 'string' ? concern.type.trim() : '';
    const reason = typeof concern.reason === 'string' ? concern.reason.trim() : '';
    if (!type || !reason) {
      throw new Error(`concerns[${index}] requires type and reason`);
    }
    const [{ quote }] = validateEvidence(
      [{ quote: concern.quote, note: reason }],
      transcript,
      `concerns[${index}].evidence`
    );
    return { type, severity, quote, reason };
  });
}

function round(value, digits = 0) {
  const factor = 10 ** digits;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

export function scoreInterview(assessment, transcript) {
  if (typeof transcript !== 'string' || !transcript.trim()) {
    throw new Error('Interview transcript is empty');
  }
  assertPlainObject(assessment, 'assessment');
  if (assessment.schemaVersion !== 1) {
    throw new Error('assessment.schemaVersion must be 1');
  }

  const stage = assessment.stage;
  if (!['next-round', 'final'].includes(stage)) {
    throw new Error('assessment.stage must be next-round or final');
  }
  assertPlainObject(assessment.dimensions, 'assessment.dimensions');

  const expectedKeys = new Set(DIMENSIONS.map(({ key }) => key));
  const extraKeys = Object.keys(assessment.dimensions).filter((key) => !expectedKeys.has(key));
  if (extraKeys.length) {
    throw new Error(`Unknown assessment dimensions: ${extraKeys.join(', ')}`);
  }

  let ratedWeight = 0;
  let earnedPoints = 0;
  const unratedCriticalDimensions = [];
  const dimensions = DIMENSIONS.map((definition) => {
    const field = `assessment.dimensions.${definition.key}`;
    const value = assessment.dimensions[definition.key];
    assertPlainObject(value, field);

    if (value.rating === null) {
      if (value.evidence !== undefined && (!Array.isArray(value.evidence) || value.evidence.length > 0)) {
        throw new Error(`${field}.evidence must be empty when rating is null`);
      }
      if (definition.critical) unratedCriticalDimensions.push(definition.key);
      return {
        ...definition,
        rating: null,
        score: null,
        weightedPoints: null,
        evidence: [],
        status: 'not-observed'
      };
    }

    if (!Number.isInteger(value.rating) || value.rating < 1 || value.rating > 5) {
      throw new Error(`${field}.rating must be an integer from 1 to 5, or null`);
    }
    const evidence = validateEvidence(value.evidence, transcript, `${field}.evidence`);
    const score = value.rating * 20;
    const weightedPoints = definition.weight * (value.rating / 5);
    ratedWeight += definition.weight;
    earnedPoints += weightedPoints;
    return {
      ...definition,
      rating: value.rating,
      score,
      weightedPoints: round(weightedPoints, 1),
      evidence,
      status: 'rated'
    };
  });

  const concerns = validateConcerns(assessment.concerns, transcript);
  const priorityConcerns = concerns.filter(({ severity }) => severity === 'high');
  const score = ratedWeight ? round((earnedPoints / ratedWeight) * 100) : null;
  const coverage = ratedWeight;
  const evidenceConfidence = coverage >= 85 && !unratedCriticalDimensions.length
    ? 'high'
    : coverage >= 70 && !unratedCriticalDimensions.length
      ? 'medium'
      : 'low';

  return {
    schemaVersion: 1,
    stage,
    context: assessment.context ?? {},
    coachingScore: score,
    evidenceCoverage: coverage,
    evidenceConfidence,
    dimensions,
    concerns,
    priorityConcerns,
    unratedCriticalDimensions,
    predictsEmployerOutcome: false,
    caveat: '该分数只用于候选人复盘和改进，不得用于预测晋级或代表雇主判断。雇主结果只能由可验证的下一步行为确认。'
  };
}

function formatSummary(result) {
  const lines = [
    '用途：候选人表现复盘（不预测晋级）',
    `复盘参考分：${result.coachingScore === null ? '无法计算' : `${result.coachingScore}/100`}`,
    `证据覆盖率：${result.evidenceCoverage}%`,
    `证据置信度：${result.evidenceConfidence}`
  ];
  if (result.priorityConcerns.length) {
    lines.push(`优先改进项：${result.priorityConcerns.map(({ type }) => type).join(', ')}`);
  }
  lines.push(result.caveat);
  return lines.join('\n');
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const args = process.argv.slice(2);
  const transcriptIndex = args.indexOf('--transcript');
  const assessmentIndex = args.indexOf('--assessment');
  const wantsSummary = args.includes('--summary');
  if (transcriptIndex < 0 || !args[transcriptIndex + 1]) {
    usage('--transcript requires a path');
  }
  if (assessmentIndex < 0 || !args[assessmentIndex + 1]) {
    usage('--assessment requires a path');
  }

  try {
    const transcript = fs.readFileSync(args[transcriptIndex + 1], 'utf8');
    const assessment = JSON.parse(fs.readFileSync(args[assessmentIndex + 1], 'utf8'));
    const result = scoreInterview(assessment, transcript);
    console.log(wantsSummary ? formatSummary(result) : JSON.stringify(result, null, 2));
  } catch (error) {
    usage(error instanceof Error ? error.message : String(error));
  }
}
