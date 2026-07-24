# RemoteFit

**Verify whether a remote job is truly workable from China.**

RemoteFit 是面向中文用户的远程岗位资格验证工具，由 Codex 在本地驱动。

产品网站：[luochen211.github.io/remote-fit](https://luochen211.github.io/remote-fit/) · 作者项目：[luo-chen.com](https://luo-chen.com)

它不只是搜索包含 `remote` 的职位，而是回答更重要的问题：

> 这个岗位是否真的允许一名居住在中国的候选人远程完成？

## 当前能力

- 识别全球远程、地域限制、时区要求和用工形式
- 发现 `US only`、必须搬迁、必须持有当地工卡等排除条件
- 提前筛查成人、赌博、灰产、传销、Web3/Crypto 和军工等行业雷区
- 标记押金、培训费、免费试工和异常沟通方式等风险
- 输出结构化 JSON，供 Codex 继续完成语义判断
- 通过 Agent Skill 约束岗位评估和申请流程
- 基于真实 JD、公司研究与候选人证据生成个性化面试准备手册
- 分离面试表现复盘与结果追踪，只用真实下一步行为确认晋级或拒绝
- 通过 SMTP 发送申请邮件，并强制执行两次人工确认
- 严格区分用户数据与可升级的系统文件

## 快速开始

```bash
cp config/profile.example.yml config/profile.yml
cp cv.template.md cv.md
npx playwright install chromium
npm test
node scripts/evaluate-remote.mjs --file path/to/job-description.txt --summary
node scripts/evaluate-url.mjs https://company.com/jobs/123 --summary
```

然后在仓库根目录启动 Codex，并输入：

```text
使用 remote-fit 评估这个岗位是否真的允许候选人在中国远程工作：<岗位链接或 JD>
```

## 岗位链接分析

`evaluate-url.mjs` 会：

1. 拦截 localhost、私网 IP、带凭据 URL 和不安全重定向。
2. 对 Greenhouse、Lever、Ashby、Workday 优先读取官方公开 ATS 接口。
3. 普通页面优先读取 Schema.org `JobPosting` JSON-LD，再提取正文。
4. 遇到 JavaScript 页面、403、429、503 或正文不足时，使用只读 Chromium 兜底。
5. 记录最终 URL、提取方式和字符数。
6. 检查过期文案、`validThrough` 和重定向后职位 ID 是否仍存在；过期信号优先于通用 Apply 文字。
7. 将提取的 JD 交给同一套行业策略和远程资格引擎。

```bash
node scripts/evaluate-url.mjs \
  https://company.com/jobs/123 \
  --policy config/content-policy.json \
  --save output/company-role.txt
```

如果浏览器仍被验证码或反爬页面拦截，命令会返回“无法确认”并要求粘贴 JD。403、503、Cloudflare 页面和提取失败都不会被解释为岗位过期。

## 评估结果

每个岗位都会得到以下字段：

- `remoteType`：全球远程、地域受限、混合办公或未知
- `chinaEligibility`：可申请、需确认或不可申请
- `timezone`：明确时区及重合要求
- `engagement`：雇员、EOR、合同工、自由职业或未知
- `riskSignals`：费用、免费劳动、异常沟通等风险
- `confidence`：当前判断的证据充分程度

缺失信息会保持 `unknown`，不会被自动解释成“可以申请”。

## 行业雷区筛查

RemoteFit 会先执行内容策略，再判断远程资格和个人匹配。默认策略：

- 成人、赌博、灰产、传销：`block`
- Web3/Crypto、武器/军工：`review`

命中会返回类别、动作和原文证据。Web3 不会被自动解释成诈骗，而是按用户策略处理。

```bash
cp config/content-policy.example.json config/content-policy.json
node scripts/evaluate-remote.mjs \
  --file path/to/job-description.txt \
  --policy config/content-policy.json
```

每一类支持 `allow`、`review` 或 `block`。本地策略不会被提交。

## 双确认邮件发送

复制 `.env.example` 为 `.env`，填写自己的 SMTP 地址和应用专用密码。凭据与待发送邮件都在 `.gitignore` 中，不会进入 Git。

邮件发送被拆成两个不可跳过的确认阶段：

1. Codex 展示完整的收件人、标题、正文和附件，用户第一次明确确认。
2. 系统冻结邮件内容并生成一个 30 分钟有效的一次性发送码。Codex 再次展示摘要，用户必须原样回复发送码。
3. 只有发送码、邮件摘要和附件哈希全部匹配，SMTP 才会发送邮件。

第一次确认之后运行：

```bash
node scripts/send-application-email.mjs prepare \
  --to jobs@example.com \
  --subject "Application — Software Engineer" \
  --body-file output/email.txt \
  --attachment output/cv.pdf \
  --confirm-draft YES-I-REVIEWED-THE-DRAFT
```

用户第二次确认并提供一次性发送码后运行：

```bash
node scripts/send-application-email.mjs send \
  --approval <approval-id> \
  --confirm SEND-XXXXXXXX
```

正文、收件人或附件发生任何改变都需要重新完成两次确认。Codex 不得代替用户输入确认内容。

## 面试准备手册

当候选人获得面试时，RemoteFit 可以结合原始 JD、可核验的公司信息和候选人证据，生成岗位定制的准备手册。手册优先覆盖 JD 匹配、真实经历证据、技术与产品问题、角色相关案例、反问清单和面试当天速查页。

个人经历、薪资期望和联系方式等私密内容默认保存到 `output/interviews/`，不会被 Git 提交。

## 面试复盘与结果追踪

RemoteFit 把两个任务彻底分开：

1. **表现复盘**：分析候选人回答中展示的能力、证据和改进点；
2. **结果追踪**：只根据雇主已经完成的下一步行为确认晋级、通过或拒绝。

表现复盘可以按岗位核心能力、问题分析、经历证据与担当、表达协作、动机匹配和远程协作六个维度生成 `coachingScore`。这个分数只用于自我改进，明确设置 `predictsEmployerOutcome: false`，不会再输出晋级建议。

```bash
node scripts/score-interview.mjs \
  --transcript output/interviews/example-role/transcript.txt \
  --assessment output/interviews/example-role/assessment.json \
  --summary
```

结果追踪采用“真实行为或未知”原则。以下信息的预测权重一律为零：

- “简历很优秀”“经验很好”等口头表扬；
- 点头、语气、长时间追问或面试时长；
- 薪资、时间、地点和到岗问题；
- “如果有下一步”“可能会安排二面”等条件式表述；
- 对标准招聘流程的介绍。

只有已经发生、且能在记录中找到凭证的动作可以改变结果状态，例如：

- 收到书面晋级通知；
- 收到具体二面时间或日历邀请；
- 收到真实任务或与决策人的已确认会议；
- 收到 Offer、书面拒绝或流程终止通知。

```bash
node scripts/estimate-interview-outcome.mjs \
  --record output/interviews/example-role/interaction-record.md \
  --observation output/interviews/example-role/outcome-observation.json \
  --summary
```

没有真实下一步行为时，结果固定为 `unknown-no-action`，结果置信度为 `0`。承诺的反馈期限尚未到达时保持未知；期限过去仍无行动，只记为弱负向 `overdue-no-action`，不冒充正式拒绝。

`behavioralCommitmentScore` 是行为证据强度，不是通过概率。没有经过历史“信号—实际结果”数据校准前，`probability` 始终为 `null`。

模板见 `config/interview-scorecard.example.json` 和 `config/interview-outcome.example.json`。面试稿、后续消息、评估输入和报告默认保存在 `output/interviews/`，不会提交到 Git。

## 项目原则

- 真实岗位优先于岗位数量
- 原始招聘页优先于聚合站
- 事实重写，绝不虚构
- 低匹配岗位明确劝退
- 可以起草和填写，永不自动提交
- 邮件可以自动发送，但必须经过两次独立人工确认
- CV、联系方式、投递记录默认只保存在本地

## 路线图

- 国内外远程岗位源与去重
- 原始招聘页存活验证
- 中英文 CV 与申请材料
- 申请追踪与回复分类
- 基于真实结果校准远程资格模型

## License

MIT
