import assert from 'node:assert/strict';
import test from 'node:test';

import { scoreInterview } from '../scripts/score-interview.mjs';

const transcript = `
面试官：请介绍一次你负责的完整交付。
候选人：我负责用户系统和后台，从需求拆解到上线都由我推进，最终按期交付。
面试官：接口出现延迟时你怎么处理？
候选人：我先看监控拆分数据库和外部接口耗时，再用压测验证，最后给慢查询加了索引。
面试官：你如何与产品协作？
候选人：我会先复述目标和约束，写成决策记录，有分歧时用小实验验证。
面试官：为什么想加入我们？
候选人：这个岗位需要产品型全栈能力，与我做完整业务闭环的经验一致。
面试官：远程工作怎么同步？
候选人：我每天异步更新进度，阻塞超过半小时就主动升级，并保留书面上下文。
`;

function rated(rating, quote, note = '与该维度直接相关') {
  return { rating, evidence: [{ quote, note }] };
}

function assessment(overrides = {}) {
  return {
    schemaVersion: 1,
    stage: 'next-round',
    context: { company: 'Example', role: 'Full-stack Engineer' },
    dimensions: {
      roleCompetence: rated(4, '我负责用户系统和后台，从需求拆解到上线都由我推进'),
      problemSolving: rated(4, '我先看监控拆分数据库和外部接口耗时，再用压测验证'),
      evidenceAndOwnership: rated(4, '最终按期交付'),
      communication: rated(4, '我会先复述目标和约束，写成决策记录'),
      motivationAndRoleFit: rated(3, '与我做完整业务闭环的经验一致'),
      remoteCollaboration: rated(4, '我每天异步更新进度，阻塞超过半小时就主动升级'),
      ...overrides.dimensions
    },
    concerns: overrides.concerns ?? []
  };
}

test('scores a fully evidenced interview for coaching only', () => {
  const result = scoreInterview(assessment(), transcript);
  assert.equal(result.coachingScore, 78);
  assert.equal(result.evidenceCoverage, 100);
  assert.equal(result.evidenceConfidence, 'high');
  assert.equal(result.predictsEmployerOutcome, false);
  assert.equal('decision' in result, false);
});

test('does not turn a final interview coaching score into a pass decision', () => {
  const input = assessment();
  input.stage = 'final';
  input.dimensions.roleCompetence.rating = 3;
  const result = scoreInterview(input, transcript);
  assert.equal(result.coachingScore, 72);
  assert.equal(result.predictsEmployerOutcome, false);
  assert.equal('thresholds' in result, false);
});

test('lowers evidence confidence instead of treating unasked dimensions as failures', () => {
  const result = scoreInterview(assessment({
    dimensions: {
      evidenceAndOwnership: { rating: null, evidence: [] },
      communication: { rating: null, evidence: [] },
      motivationAndRoleFit: { rating: null, evidence: [] },
      remoteCollaboration: { rating: null, evidence: [] }
    }
  }), transcript);
  assert.equal(result.coachingScore, 80);
  assert.equal(result.evidenceCoverage, 50);
  assert.equal(result.evidenceConfidence, 'low');
  assert.deepEqual(result.unratedCriticalDimensions, ['evidenceAndOwnership']);
});

test('high severity evidence-backed concern remains a coaching priority only', () => {
  const result = scoreInterview(assessment({
    concerns: [{
      type: 'availability-mismatch',
      severity: 'high',
      quote: '阻塞超过半小时就主动升级',
      reason: '示例阻断项，用于验证决策覆盖规则'
    }]
  }), transcript);
  assert.equal(result.coachingScore, 78);
  assert.equal(result.priorityConcerns.length, 1);
  assert.equal(result.predictsEmployerOutcome, false);
});

test('rejects evidence that does not occur in the transcript', () => {
  const input = assessment();
  input.dimensions.roleCompetence.evidence[0].quote = '原稿里不存在的自述证据';
  assert.throws(
    () => scoreInterview(input, transcript),
    /was not found in the transcript/
  );
});

test('rejects out-of-range ratings', () => {
  const input = assessment();
  input.dimensions.problemSolving.rating = 6;
  assert.throws(
    () => scoreInterview(input, transcript),
    /integer from 1 to 5/
  );
});
