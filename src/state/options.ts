// Option lists shared by several screens.
import type { PayFreq } from '../types';

export const PAY_FREQ_OPTIONS: readonly (readonly [PayFreq, string])[] = [
  ['weekly', 'Weekly'], ['biweekly', 'Every 2 weeks'], ['semimonthly', 'Twice a month'], ['monthly', 'Monthly']
];
export const PAY_FREQ_LABEL: Record<PayFreq, string> = { weekly: 'Every week', biweekly: 'Every 2 weeks', semimonthly: 'Twice a month', monthly: 'Once a month' };
