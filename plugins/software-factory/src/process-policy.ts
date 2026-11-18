/** Shared profile semantics with AIRD contract v2; legacy packages are not reclassified. */
export const PROFILE_DESCRIPTIONS: Record<string, string> = {
  lite: 'Локальная обратимая задача: один исполнитель, нужные проверки, без отдельных исследовательских ролей при известных требованиях.',
  standard: 'Фича с известными границами: роли только для нерешённых вопросов и независимых проверок.',
  deep: 'Существенный риск: контракты, безопасность, миграции или внешняя неопределённость; обязательные проверки риска сохраняются.',
};
export function profileProblem(state: Record<string, unknown>): string | null {
  if (state.efficiency_policy === undefined) return null;
  if (Number(state.efficiency_policy) !== 2) return 'Неизвестная efficiency_policy';
  if (!Array.isArray(state.risk_flags) || typeof state.profile_reason !== 'string' || !state.profile_reason.trim()) return 'Policy 2 требует risk_flags и profile_reason';
  const levels: Record<string, number> = { lite: 0, standard: 1, deep: 2 };
  const risks: Record<string, number> = { security: 2, migration: 2, schema: 2, multi_service: 2, external_unknown: 2, public_contract: 1, cross_layer: 1 };
  const level = levels[String(state.discovery_profile)];
  if (!Object.hasOwn(levels, String(state.discovery_profile))) return 'Профиль должен быть lite, standard или deep';
  for (const flag of state.risk_flags) {
    if (typeof flag !== 'string' || !Object.hasOwn(risks, flag)) return `Неизвестный risk_flag: ${String(flag)}`;
    if (level < risks[flag]!) return `Профиль ${state.discovery_profile} недостаточен для ${flag}`;
  }
  return null;
}
