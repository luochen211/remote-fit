# Interview preparation pack

Use this workflow after a role has passed the content-policy and eligibility gates, or when the user already has an interview scheduled and asks to prepare regardless of the earlier recommendation.

## Evidence order

1. Exact job description or saved posting
2. Employer's official site, product, careers page, and original public statements
3. Candidate `cv.md`, `config/profile.yml`, and `evidence/`
4. Existing application records in `data/` or private artifacts in `output/`
5. User statements from the current conversation
6. Clearly labeled inference

Record source URLs and access dates for changing facts. Do not turn search snippets, reposted summaries, or community speculation into company facts. When a product team and its legal employer differ, describe both and state which relationship is verified, user-provided, or inferred.

## Required preparation content

Group the pack into four or five top-level modules, such as quick orientation, candidate narrative, core questions, and interview closeout. Treat the items below as content requirements and usually render them as second- or third-level sections, not as nine separate top-level headings.

1. **One-page quick reference**
   - interview positioning in one sentence;
   - three strongest proof points;
   - two honest gaps and how to handle them;
   - the five facts that must be remembered;
   - the three reverse questions that matter most.
2. **Company, team, and product**
   - product origin, users, business stage, and current priorities;
   - distinction between public facts, user context, and inference;
   - current metrics only when a dated source supports them.
3. **JD decomposition**
   - responsibility or requirement;
   - evidence-backed candidate match;
   - confidence level;
   - gap or risk;
   - interview response strategy.
4. **Personal narrative**
   - 60-second introduction;
   - why this product, role, and team;
   - why now;
   - availability, remote-work habits, and compensation expectations.
5. **Likely interview questions**
   - technical and system-design questions;
   - product and user-safety questions;
   - behavioral questions grounded in real stories;
   - concise answer outline for each, not a fabricated script.
6. **Role-specific exercise**
   - one realistic system, product, growth, operations, or case problem;
   - assumptions, tradeoffs, failure modes, rollout, and success metrics.
7. **Reverse questions**
   - product goals and constraints;
   - ownership and collaboration;
   - technical quality and decision making;
   - employment model, payment, data, IP, and working hours when unresolved.
8. **Preparation schedule**
   - tasks for the evening before;
   - final review on interview day;
   - a last 15-minute checklist.
9. **Sources and uncertainty notes**
   - direct links;
   - dates;
   - claims that still need recruiter confirmation.

## Quality bar

- Use the exact role title and compensation range from the current JD.
- Use no more than five first-level headings. Preserve a visible reading path instead of promoting every topic to the top level.
- Explain why each candidate example matters to this role instead of listing projects.
- Never imply production experience in a domain the candidate has only studied or designed hypothetically.
- For algorithms, AI, safety, payments, or privacy, discuss boundaries and failure handling as well as the happy path.
- Put the most useful material first. A reader should be able to prepare from the first page alone if time is short.
- For Word output, use headings, compact tables, page breaks, and callouts intentionally. Check for clipped tables, stranded headings, placeholder text, and unreadable source URLs.

## Private output convention

Use a directory such as:

```text
output/interviews/<company>-<role>/
├── <company>-<role>-interview-prep.docx
├── sources.md                  # optional research log
└── jd.txt                      # optional saved posting
```

These files can contain personal history, compensation expectations, contact details, and private application context. Keep them under the ignored `output/` directory unless the user explicitly requests publication after reviewing a redacted version.
