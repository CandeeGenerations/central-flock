// Repeat Rules for Calendar Print Events. The engine lives in server/lib/repeat-rules.ts — the
// Year Copy and the boot-time backfill need it and the server can't import from src/ — and is
// re-exported here so the Event form's Repeats field and the server describe and evaluate a rule
// with the same function. See CONTEXT.md → Repeat Rule and docs/adr/0040.
export {
  describeRule,
  evaluateRule,
  guessRule,
  parseRule,
  ruleAlternatives,
  sameRule,
} from '../../server/lib/repeat-rules'
export type {RepeatRule, RuleOption} from '../../server/lib/repeat-rules'
