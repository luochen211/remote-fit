#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ACTION_TYPES = Object.freeze({
  'written-advance-notice': {
    direction: 'positive',
    confidence: 100,
    artifacts: ['written-message']
  },
  'next-round-time-confirmed': {
    direction: 'positive',
    confidence: 95,
    artifacts: ['calendar-invite', 'written-message', 'meeting-record']
  },
  'calendar-invite-received': {
    direction: 'positive',
    confidence: 95,
    artifacts: ['calendar-invite']
  },
  'next-step-assignment-received': {
    direction: 'positive',
    confidence: 80,
    artifacts: ['assignment', 'written-message']
  },
  'decision-maker-meeting-confirmed': {
    direction: 'positive',
    confidence: 90,
    artifacts: ['calendar-invite', 'written-message']
  },
  'offer-issued': {
    direction: 'positive',
    confidence: 100,
    artifacts: ['offer-document', 'written-message']
  },
  'written-rejection': {
    direction: 'negative',
    confidence: 100,
    artifacts: ['written-message']
  },
  'role-closed-notice': {
    direction: 'negative',
    confidence: 100,
    artifacts: ['written-message']
  },
  'process-terminated': {
    direction: 'negative',
    confidence: 95,
    artifacts: ['written-message']
  }
});

export const DISCARDED_SIGNAL_TYPES = Object.freeze([
  'verbal-praise',
  'generic-acknowledgement',
  'interviewer-follow-up',
  'compensation-discussion',
  'availability-question',
  'process-description',
  'conditional-next-step',
  'sentiment-or-tone'
]);

function usage(message) {
  if (message) console.error(message);
  console.error(
    'Usage: node scripts/estimate-interview-outcome.mjs --record interaction-record.txt --observation observation.json [--summary]'
  );
  process.exit(2);
}

function assertPlainObject(value, field) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
}

function normalizeEvidence(value) {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function validateQuote(quoteValue, record, field) {
  const quote = typeof quoteValue === 'string' ? quoteValue.trim() : '';
  if (normalizeEvidence(quote).length < 6) {
    throw new Error(`${field} must contain at least 6 characters`);
  }
  if (!normalizeEvidence(record).includes(normalizeEvidence(quote))) {
    throw new Error(`${field} was not found in the interaction record`);
  }
  return quote;
}

function parseTimestamp(value, field) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error(`${field} must be a valid timestamp`);
  return timestamp;
}

function validateActions(actions, record, evaluatedAtMs) {
  if (actions === undefined) return [];
  if (!Array.isArray(actions)) throw new Error('actions must be an array');
  const ids = new Set();

  return actions.map((action, index) => {
    const field = `actions[${index}]`;
    assertPlainObject(action, field);
    const definition = ACTION_TYPES[action.type];
    if (!definition) throw new Error(`${field}.type is not a recognized completed action`);
    if (typeof action.id !== 'string' || !action.id.trim()) {
      throw new Error(`${field}.id is required`);
    }
    if (ids.has(action.id)) throw new Error(`${field}.id must be unique`);
    ids.add(action.id);
    if (!definition.artifacts.includes(action.artifact)) {
      throw new Error(
        `${field}.artifact must be one of: ${definition.artifacts.join(', ')}`
      );
    }
    const occurredAtMs = parseTimestamp(action.occurredAt, `${field}.occurredAt`);
    if (occurredAtMs > evaluatedAtMs) {
      throw new Error(`${field}.occurredAt cannot be later than observation.evaluatedAt`);
    }
    const quote = validateQuote(action.quote, record, `${field}.quote`);
    return {
      id: action.id,
      type: action.type,
      artifact: action.artifact,
      occurredAt: new Date(occurredAtMs).toISOString(),
      occurredAtMs,
      quote,
      note: typeof action.note === 'string' ? action.note.trim() : '',
      ...definition
    };
  });
}

function validatePromises(promises, actions, record, evaluatedAtMs) {
  if (promises === undefined) return [];
  if (!Array.isArray(promises)) throw new Error('promises must be an array');
  const actionIds = new Set(actions.map(({ id }) => id));

  return promises.map((promise, index) => {
    const field = `promises[${index}]`;
    assertPlainObject(promise, field);
    const quote = validateQuote(promise.quote, record, `${field}.quote`);
    const dueAtMs = parseTimestamp(promise.dueAt, `${field}.dueAt`);
    const fulfilledByActionId = promise.fulfilledByActionId ?? null;
    if (fulfilledByActionId !== null && !actionIds.has(fulfilledByActionId)) {
      throw new Error(`${field}.fulfilledByActionId does not match an action`);
    }
    const status = fulfilledByActionId
      ? 'fulfilled'
      : evaluatedAtMs > dueAtMs
        ? 'missed'
        : 'pending';
    return {
      quote,
      dueAt: new Date(dueAtMs).toISOString(),
      fulfilledByActionId,
      status
    };
  });
}

function validateDiscardedSignals(signals, record) {
  if (signals === undefined) return [];
  if (!Array.isArray(signals)) throw new Error('discardedSignals must be an array');

  return signals.map((signal, index) => {
    const field = `discardedSignals[${index}]`;
    assertPlainObject(signal, field);
    if (!DISCARDED_SIGNAL_TYPES.includes(signal.type)) {
      throw new Error(`${field}.type is not a recognized non-behavioral signal`);
    }
    const quote = validateQuote(signal.quote, record, `${field}.quote`);
    const reason = typeof signal.reason === 'string' ? signal.reason.trim() : '';
    if (!reason) throw new Error(`${field}.reason is required`);
    return { type: signal.type, quote, reason, predictiveWeight: 0 };
  });
}

function confidenceLabel(value) {
  if (value >= 85) return 'high';
  if (value >= 50) return 'medium';
  if (value > 0) return 'low';
  return 'none';
}

export function estimateInterviewOutcome(observation, record) {
  if (typeof record !== 'string' || !record.trim()) {
    throw new Error('Interaction record is empty');
  }
  assertPlainObject(observation, 'observation');
  if (observation.schemaVersion !== 1) {
    throw new Error('observation.schemaVersion must be 1');
  }
  if (!['next-round', 'final'].includes(observation.stage)) {
    throw new Error('observation.stage must be next-round or final');
  }
  const evaluatedAtMs = parseTimestamp(observation.evaluatedAt, 'observation.evaluatedAt');
  const actions = validateActions(observation.actions, record, evaluatedAtMs);
  const promises = validatePromises(observation.promises, actions, record, evaluatedAtMs);
  const discardedSignals = validateDiscardedSignals(observation.discardedSignals, record);

  const orderedActions = [...actions].sort((a, b) => a.occurredAtMs - b.occurredAtMs);
  const latestAction = orderedActions.at(-1) ?? null;
  const missedPromises = promises.filter(({ status }) => status === 'missed');

  let verdict = 'unknown-no-action';
  let direction = 'unknown';
  let outcomeConfidence = 0;
  let behavioralCommitmentScore = 0;
  let basis = '没有观察到可验证的下一步行为；语言反馈、情绪和流程介绍不参与结果判断';

  if (latestAction) {
    direction = latestAction.direction;
    outcomeConfidence = latestAction.confidence;
    behavioralCommitmentScore = latestAction.direction === 'positive'
      ? latestAction.confidence
      : -latestAction.confidence;
    verdict = latestAction.direction === 'positive'
      ? observation.stage === 'final' ? 'pass-confirmed' : 'advance-confirmed'
      : 'rejection-confirmed';
    basis = `以最近的已完成行为 ${latestAction.type} 为准`;
  } else if (missedPromises.length) {
    verdict = 'overdue-no-action';
    direction = 'negative';
    outcomeConfidence = 30;
    behavioralCommitmentScore = -30;
    basis = '承诺的反馈期限已经过去，但没有观察到后续行为；这是弱负向证据，不等于正式拒绝';
  }

  return {
    schemaVersion: 1,
    stage: observation.stage,
    evaluatedAt: new Date(evaluatedAtMs).toISOString(),
    context: observation.context ?? {},
    verdict,
    direction,
    behavioralCommitmentScore,
    outcomeConfidence,
    confidenceLabel: confidenceLabel(outcomeConfidence),
    probability: null,
    calibrationStatus: 'uncalibrated-no-historical-outcomes',
    basis,
    actions: actions.map(({ occurredAtMs, direction: actionDirection, confidence, ...action }) => ({
      ...action,
      direction: actionDirection,
      confidence
    })),
    promises,
    discardedSignals,
    caveat: '该模型只确认可验证的下一步行为，不根据赞美、语气、追问或候选人表现预测结果。没有历史结果校准时不输出通过概率。'
  };
}

function formatSummary(result) {
  const labels = {
    'advance-confirmed': '已观察到真实推进',
    'pass-confirmed': '已观察到真实通过',
    'rejection-confirmed': '已观察到真实终止',
    'overdue-no-action': '承诺期限已过但无行动',
    'unknown-no-action': '未知：没有真实下一步行为'
  };
  return [
    `结果：${labels[result.verdict]}`,
    `行为承诺分：${result.behavioralCommitmentScore}`,
    `结果置信度：${result.outcomeConfidence}/100 (${result.confidenceLabel})`,
    `通过概率：不输出（${result.calibrationStatus}）`,
    `依据：${result.basis}`,
    `已丢弃的非行为信号：${result.discardedSignals.length}`,
    result.caveat
  ].join('\n');
}

const isMain = process.argv[1]
  && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) {
  const args = process.argv.slice(2);
  const recordIndex = args.indexOf('--record');
  const observationIndex = args.indexOf('--observation');
  const wantsSummary = args.includes('--summary');
  if (recordIndex < 0 || !args[recordIndex + 1]) usage('--record requires a path');
  if (observationIndex < 0 || !args[observationIndex + 1]) {
    usage('--observation requires a path');
  }

  try {
    const record = fs.readFileSync(args[recordIndex + 1], 'utf8');
    const observation = JSON.parse(fs.readFileSync(args[observationIndex + 1], 'utf8'));
    const result = estimateInterviewOutcome(observation, record);
    console.log(wantsSummary ? formatSummary(result) : JSON.stringify(result, null, 2));
  } catch (error) {
    usage(error instanceof Error ? error.message : String(error));
  }
}
