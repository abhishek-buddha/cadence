export const SPECIALIZATION_OPTIONS = [
  { value: 'claim_status', label: 'Claim Status' },
  { value: 'denial_claim', label: 'Denial Claim' },
  { value: 'claim_eligibility_check', label: 'Claim Eligibility Check' },
];

export const SPECIALIZATION_LABELS = Object.fromEntries(
  SPECIALIZATION_OPTIONS.map((o) => [o.value, o.label])
);
