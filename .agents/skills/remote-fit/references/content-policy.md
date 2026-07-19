# Content policy

Run this screen before remote eligibility or candidate fit.

## Actions

- `allow`: continue without an industry warning.
- `review`: pause the recommendation, show evidence, and let the user decide.
- `block`: recommend skipping the role before spending time on application materials.

Read `config/content-policy.json` when present. Otherwise use the script defaults.

## Categories

- `adult`: pornography, explicit adult entertainment, camming, erotic services, or sex-work platforms.
- `gambling`: casinos, betting, sportsbooks, real-money poker, or gambling platforms.
- `gray-market`: account farming, fake engagement, reshipping, money-mule work, payment forwarding, or similar evasive activity.
- `multi-level-marketing`: downline recruitment, pyramid structures, or compensation driven by recruiting distributors.
- `web3-crypto`: cryptocurrency, blockchain protocols, DeFi, NFTs, tokenomics, or smart-contract businesses.
- `weapons-defense`: weapons systems, firearms manufacturing, military targeting, autonomous weapons, or defense contractors.

## Evidence and ambiguity

Retain the shortest matching excerpt. Do not block on a broad word when a more specific meaning is plausible:

- `design token` is not cryptocurrency.
- a normal digital `wallet` is not necessarily a crypto wallet.
- `gaming` is not gambling without betting or real-money context.
- military veterans, defense against attacks, or defensive programming are not weapons/defense industry signals.

Industry category and scam risk are independent. A legitimate Web3 employer can still be excluded by user preference; a non-Web3 role can still be fraudulent. State both judgments separately.
