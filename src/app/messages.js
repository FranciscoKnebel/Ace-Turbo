import { t } from '../i18n.js';
export function presentMessage(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  const params = { ...value.params };
  if (params.team) params.team = t('team.' + params.team);
  if (params.reason) params.reason = t('reason.' + params.reason);
  return t(value.key, params);
}
