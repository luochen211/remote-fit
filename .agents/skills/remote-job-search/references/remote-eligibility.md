# Remote eligibility model

## Decision order

Evaluate in this order because later positive language must not erase earlier exclusions:

1. Scam and exploitation risks
2. On-site, hybrid, travel, or relocation requirements
3. Country, residency, work-authorization, and clearance restrictions
4. Whether the employer can engage a person residing in China
5. Timezone and schedule feasibility
6. Engagement model and payment mechanics
7. Candidate-role fit

## Eligibility values

### `likely-eligible`

Use only when the posting explicitly supports one of these conditions:

- worldwide or work-from-anywhere;
- China is named as an allowed location;
- APAC is allowed and no narrower entity or residency restriction excludes China;
- the employer confirms a China entity, EOR, or cross-border contractor path.

Global language does not override export-control, sanctions, clearance, work-authorization, or residency requirements.

### `needs-confirmation`

Use when the role is remote but omits any material fact, including:

- allowed hiring countries;
- entity, EOR, or contractor availability in China;
- timezone overlap;
- payment method or currency for contractors;
- employment classification.

Recommend contacting the recruiter before investing in tailored materials.

### `not-eligible`

Use when any hard exclusion applies:

- a country or region list excludes China;
- local work authorization is required outside China;
- relocation or recurring office attendance is mandatory;
- required hours conflict with the candidate's stated limits;
- a security clearance or controlled-work condition cannot be met;
- the company explicitly says it cannot hire or contract in China.

## Remote type

- `global-remote`: explicitly worldwide or work from anywhere.
- `region-restricted-remote`: remote only inside named countries or regions.
- `remote-unspecified`: remote is stated but geographic scope is missing.
- `hybrid-or-onsite`: recurring physical attendance or relocation is required.
- `unknown`: remote arrangement is not established.

## Engagement model

- `employee`: direct employment through a China entity.
- `eor`: employment through an Employer of Record.
- `contractor`: independent cross-border service agreement.
- `freelance`: project-based or hourly work without ongoing employment.
- `unknown`: do not guess from compensation language.

Do not present contractor work as employment. Flag benefits, tax, currency conversion, invoice, IP assignment, termination, and payment-timing questions for later confirmation.

## Risk signals

Recommend `skip` or enhanced verification for:

- application, equipment, onboarding, deposit, or training fees;
- unpaid production work disguised as an assessment;
- guaranteed income or implausible pay for trivial tasks;
- pressure to move immediately to Telegram, WhatsApp, or private chat;
- requests for banking credentials, identity documents, or remote computer access before a verified offer process;
- mismatched company domains or recruiters who cannot be verified;
- crypto transfer, money forwarding, purchasing, or reshipping duties.

Do not label a company fraudulent without sufficient evidence. State the observed signal and the verification needed.

## Timezone evaluation

Use the candidate timezone from `config/profile.yml`. Distinguish:

- flexible asynchronous work;
- a stated overlap window;
- fixed local working hours;
- rotating or permanent night shifts;
- occasional meetings versus daily coverage.

Convert the employer's schedule to the candidate's local time and compare it with their declared limits. Account for daylight-saving changes when relevant.

## Evidence standard

For every conclusion, retain the shortest posting excerpt that supports it. If the conclusion depends on recruiter confirmation or outside research, label it as such and link the source. Do not use search snippets as final evidence when the original page is available.

