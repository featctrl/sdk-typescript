/**
 * Feature flag model as returned by the FeatCtrl backend.
 */
export interface FeatCtrlFlag {
  key: string;
  name: string;
  flag_type: 'boolean';
  enabled: boolean;
  config: Record<string, unknown> | null;
}
