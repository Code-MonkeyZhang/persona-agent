import type { I18nKey } from '../../i18n';

/**
 * Option data of the editor demo pickers. Model groups mirror the app model
 * selector structure and voice names follow the app preset voice registry.
 */

/** One provider group of the default model picker, model ids are plain strings. */
export type ModelGroup = { providerKey: I18nKey; models: string[] };

/** Flat model options derived from the groups, each keeps its provider label. */
export const MODEL_GROUPS: ModelGroup[] = [
  { providerKey: 'ed.pZhi', models: ['GLM-4.7', 'GLM-4.7-Air'] },
  { providerKey: 'ed.pOai', models: ['GPT-5.2'] },
  { providerKey: 'ed.pAnt', models: ['Claude Opus 4.6'] },
  { providerKey: 'ed.pDsk', models: ['DeepSeek-V4'] },
];

/** One voice option, tagKey renders the gender or clone suffix. */
export type VoiceOption = { id: string; nameKey: I18nKey; tagKey?: I18nKey };

export const CLONED_VOICES: VoiceOption[] = [{ id: 'arona', nameKey: 'ed.vArona', tagKey: 'ed.tClone' }];

export const PRESET_VOICES: VoiceOption[] = [
  { id: 'shaonv', nameKey: 'ed.vpShaonv', tagKey: 'ed.vFemale' },
  { id: 'yujie', nameKey: 'ed.vpYujie', tagKey: 'ed.vFemale' },
  { id: 'tianmei', nameKey: 'ed.vpTianmei', tagKey: 'ed.vFemale' },
  { id: 'qingse', nameKey: 'ed.vpQingse', tagKey: 'ed.vMale' },
];
