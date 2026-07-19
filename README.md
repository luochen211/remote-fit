# Remote Career Ops

面向中文用户、由 Codex 驱动的本地远程求职工作流。

它不只是搜索包含 `remote` 的职位，而是回答更重要的问题：

> 这个岗位是否真的允许一名居住在中国的候选人远程完成？

## 当前能力

- 识别全球远程、地域限制、时区要求和用工形式
- 发现 `US only`、必须搬迁、必须持有当地工卡等排除条件
- 标记押金、培训费、免费试工和异常沟通方式等风险
- 输出结构化 JSON，供 Codex 继续完成语义判断
- 通过 Agent Skill 约束岗位评估和申请流程
- 严格区分用户数据与可升级的系统文件

## 快速开始

```bash
cp config/profile.example.yml config/profile.yml
cp cv.template.md cv.md
npm test
node scripts/evaluate-remote.mjs --file path/to/job-description.txt --summary
```

然后在仓库根目录启动 Codex，并输入：

```text
使用 remote-job-search 评估这个岗位是否适合居住在中国的候选人：<岗位链接或 JD>
```

## 评估结果

每个岗位都会得到以下字段：

- `remoteType`：全球远程、地域受限、混合办公或未知
- `chinaEligibility`：可申请、需确认或不可申请
- `timezone`：明确时区及重合要求
- `engagement`：雇员、EOR、合同工、自由职业或未知
- `riskSignals`：费用、免费劳动、异常沟通等风险
- `confidence`：当前判断的证据充分程度

缺失信息会保持 `unknown`，不会被自动解释成“可以申请”。

## 项目原则

- 真实岗位优先于岗位数量
- 原始招聘页优先于聚合站
- 事实重写，绝不虚构
- 低匹配岗位明确劝退
- 可以起草和填写，永不自动提交
- CV、联系方式、投递记录默认只保存在本地

## 路线图

- 国内外远程岗位源与去重
- 原始招聘页存活验证
- 中英文 CV 与申请材料
- 申请追踪、回复分类与面试准备
- 基于真实结果校准远程资格模型

## License

MIT

