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

export const STAGES = Object.freeze({
  'next-round': {
    positiveDecision: 'advance',
    negativeDecision: 'do-not-advance',
    positiveThreshold: 70,
    holdThreshold: 60
  },
  final: {
    positiveDecision: 'pass',
    negativeDecision: 'no-pass',
    positiveThreshold: 75,
    holdThreshold: 65
  }
});

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
  const stageConfig = STAGES[stage];
  if (!stageConfig) {
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
  const blockingConcerns = concerns.filter(({ severity }) => severity === 'high');
  const score = ratedWeight ? round((earnedPoints / ratedWeight) * 100) : null;
  const coverage = ratedWeight;
  const confidence = coverage >= 85 && !unratedCriticalDimensions.length
    ? 'high'
    : coverage >= 70 && !unratedCriticalDimensions.length
      ? 'medium'
      : 'low';

  let decision;
  let decisionReason;
  if (blockingConcerns.length) {
    decision = stageConfig.negativeDecision;
    decisionReason = '存在有原文证据的高严重度阻断项';
  } else if (confidence === 'low') {
    decision = 'insufficient-evidence';
    decisionReason = '关键维度或证据覆盖率不足，不能可靠做出晋级判断';
  } else if (score >= stageConfig.positiveThreshold) {
    decision = stageConfig.positiveDecision;
    decisionReason = `参考分达到 ${stageConfig.positiveThreshold} 分门槛`;
  } else if (score >= stageConfig.holdThreshold) {
    decision = 'hold';
    decisionReason = `参考分处于 ${stageConfig.holdThreshold}–${stageConfig.positiveThreshold - 1} 分复核区间`;
  } else {
    decision = stageConfig.negativeDecision;
    decisionReason = `参考分低于 ${stageConfig.holdThreshold} 分`;
  }

  return {
    schemaVersion: 1,
    stage,
    context: assessment.context ?? {},
    score,
    coverage,
    confidence,
    decision,
    decisionReason,
    thresholds: {
      positive: stageConfig.positiveThreshold,
      hold: stageConfig.holdThreshold
    },
    dimensions,
    concerns,
    blockingConcerns,
    unratedCriticalDimensions,
    caveat: '该结果是基于所提供面试稿的辅助判断，不代表雇主实际决定；未在原稿出现的信息不会被推断。'
  };
}

function formatSummary(result) {
  const decisionLabels = {
    advance: '建议进入下一轮',
    pass: '建议通过',
    hold: '待复核',
    'do-not-advance': '不建议进入下一轮',
    'no-pass': '不建议通过',
    'insufficient-evidence': '证据不足，暂不判断'
  };
  const lines = [
    `判断：${decisionLabels[result.decision]}`,
    `参考分：${result.score === null ? '无法计算' : `${result.score}/100`}`,
    `证据覆盖率：${result.coverage}%`,
    `置信度：${result.confidence}`,
    `原因：${result.decisionReason}`
  ];
  if (result.blockingConcerns.length) {
    lines.push(`阻断项：${result.blockingConcerns.map(({ type }) => type).join(', ')}`);
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
