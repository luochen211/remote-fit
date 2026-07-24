import assert from 'node:assert/strict';
import test from 'node:test';

import { estimateInterviewOutcome } from '../scripts/estimate-interview-outcome.mjs';

const record = `
面试官：你的简历很优秀，经验也很好。
面试官：如果有下一步，我们可能会安排 COO 二面。
面试官：我们会在 2026 年 7 月 28 日之前给你反馈。
招聘方消息：二面已确定为 2026 年 7 月 29 日 15:00，日历邀请已发送。
招聘方消息：很遗憾，我们决定不再继续本次招聘流程。
`;

function observation(overrides = {}) {
  return {
    schemaVersion: 1,
    stage: 'next-round',
    evaluatedAt: '2026-07-24T09:00:00+08:00',
    context: { company: 'Example' },
    actions: [],
    promises: [],
    discardedSignals: [],
    ...overrides
  };
}

test('returns unknown when the record contains praise but no completed action', () => {
  const result = estimateInterviewOutcome(observation({
    discardedSignals: [{
      type: 'verbal-praise',
      quote: '你的简历很优秀，经验也很好',
      reason: '礼貌性评价没有下一步行为'
    }]
  }), record);
  assert.equal(result.verdict, 'unknown-no-action');
  assert.equal(result.outcomeConfidence, 0);
  assert.equal(result.behavioralCommitmentScore, 0);
  assert.equal(result.discardedSignals[0].predictiveWeight, 0);
  assert.equal(result.probability, null);
});

test('conditional next-step language has zero predictive weight', () => {
  const result = estimateInterviewOutcome(observation({
    discardedSignals: [{
      type: 'conditional-next-step',
      quote: '如果有下一步，我们可能会安排 COO 二面',
      reason: '只描述可能流程，没有安排真实下一步'
    }]
  }), record);
  assert.equal(result.verdict, 'unknown-no-action');
  assert.equal(result.outcomeConfidence, 0);
});

test('a confirmed calendar invitation is strong behavioral evidence', () => {
  const result = estimateInterviewOutcome(observation({
    evaluatedAt: '2026-07-28T18:00:00+08:00',
    actions: [{
      id: 'action-1',
      type: 'calendar-invite-received',
      artifact: 'calendar-invite',
      occurredAt: '2026-07-28T17:00:00+08:00',
      quote: '二面已确定为 2026 年 7 月 29 日 15:00，日历邀请已发送'
    }]
  }), record);
  assert.equal(result.verdict, 'advance-confirmed');
  assert.equal(result.behavioralCommitmentScore, 95);
  assert.equal(result.outcomeConfidence, 95);
  assert.equal(result.confidenceLabel, 'high');
});

test('a written rejection confirms termination', () => {
  const result = estimateInterviewOutcome(observation({
    evaluatedAt: '2026-07-30T18:00:00+08:00',
    actions: [{
      id: 'action-1',
      type: 'written-rejection',
      artifact: 'written-message',
      occurredAt: '2026-07-30T17:00:00+08:00',
      quote: '很遗憾，我们决定不再继续本次招聘流程'
    }]
  }), record);
  assert.equal(result.verdict, 'rejection-confirmed');
  assert.equal(result.behavioralCommitmentScore, -100);
  assert.equal(result.outcomeConfidence, 100);
});

test('a final-stage offer confirms a pass without inferring from interview quality', () => {
  const finalRecord = `${record}
招聘方消息：正式录用通知已经发送，请于 2026 年 8 月 1 日前确认。`;
  const result = estimateInterviewOutcome(observation({
    stage: 'final',
    evaluatedAt: '2026-07-31T18:00:00+08:00',
    actions: [{
      id: 'action-1',
      type: 'offer-issued',
      artifact: 'offer-document',
      occurredAt: '2026-07-31T17:00:00+08:00',
      quote: '正式录用通知已经发送，请于 2026 年 8 月 1 日前确认'
    }]
  }), finalRecord);
  assert.equal(result.verdict, 'pass-confirmed');
  assert.equal(result.outcomeConfidence, 100);
});

test('a pending feedback promise does not change outcome confidence', () => {
  const result = estimateInterviewOutcome(observation({
    promises: [{
      quote: '我们会在 2026 年 7 月 28 日之前给你反馈',
      dueAt: '2026-07-28T23:59:59+08:00'
    }]
  }), record);
  assert.equal(result.promises[0].status, 'pending');
  assert.equal(result.verdict, 'unknown-no-action');
  assert.equal(result.outcomeConfidence, 0);
});

test('a missed feedback deadline is weak negative evidence, not rejection', () => {
  const result = estimateInterviewOutcome(observation({
    evaluatedAt: '2026-07-29T09:00:00+08:00',
    promises: [{
      quote: '我们会在 2026 年 7 月 28 日之前给你反馈',
      dueAt: '2026-07-28T23:59:59+08:00'
    }]
  }), record);
  assert.equal(result.promises[0].status, 'missed');
  assert.equal(result.verdict, 'overdue-no-action');
  assert.equal(result.outcomeConfidence, 30);
  assert.equal(result.behavioralCommitmentScore, -30);
});

test('the latest completed action determines the observed outcome', () => {
  const result = estimateInterviewOutcome(observation({
    evaluatedAt: '2026-07-30T18:00:00+08:00',
    actions: [
      {
        id: 'action-1',
        type: 'calendar-invite-received',
        artifact: 'calendar-invite',
        occurredAt: '2026-07-28T17:00:00+08:00',
        quote: '二面已确定为 2026 年 7 月 29 日 15:00，日历邀请已发送'
      },
      {
        id: 'action-2',
        type: 'written-rejection',
        artifact: 'written-message',
        occurredAt: '2026-07-30T17:00:00+08:00',
        quote: '很遗憾，我们决定不再继续本次招聘流程'
      }
    ]
  }), record);
  assert.equal(result.verdict, 'rejection-confirmed');
  assert.equal(result.outcomeConfidence, 100);
});

test('rejects evidence that is not present in the interaction record', () => {
  assert.throws(
    () => estimateInterviewOutcome(observation({
      evaluatedAt: '2026-07-29T18:00:00+08:00',
      actions: [{
        id: 'action-1',
        type: 'written-advance-notice',
        artifact: 'written-message',
        occurredAt: '2026-07-28T17:00:00+08:00',
        quote: '这条消息并不存在于记录中'
      }]
    }), record),
    /was not found in the interaction record/
  );
});

test('rejects verbal claims disguised as completed actions', () => {
  assert.throws(
    () => estimateInterviewOutcome(observation({
      actions: [{
        id: 'action-1',
        type: 'calendar-invite-received',
        artifact: 'meeting-record',
        occurredAt: '2026-07-24T09:00:00+08:00',
        quote: '如果有下一步，我们可能会安排 COO 二面'
      }]
    }), record),
    /artifact must be one of/
  );
});

test('rejects actions dated after the evaluation time', () => {
  assert.throws(
    () => estimateInterviewOutcome(observation({
      actions: [{
        id: 'action-1',
        type: 'calendar-invite-received',
        artifact: 'calendar-invite',
        occurredAt: '2026-07-28T17:00:00+08:00',
        quote: '二面已确定为 2026 年 7 月 29 日 15:00，日历邀请已发送'
      }]
    }), record),
    /cannot be later/
  );
});
