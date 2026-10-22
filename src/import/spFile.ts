import {Alert} from 'react-native';
import {importErrorText} from './importError';
import type {TFunction} from 'i18next';
import {safePick, isPickerCancel, getPickedFilePath} from '../utils/safePicker';
import {readFileText} from '../utils/fileBytes';
import {asArray, cleanImportedName} from './formats';
import type {SpUserDoc, SpMemberDoc, SpSwitchDoc, SpGroupDoc, SpFieldDoc} from './formats';
import type {ExtPreview, ImportSource} from './preview';
import {isSpExportFile} from './detect';

export type SPFileCtx = {
  t: TFunction;
  setExtPreview: (p: ExtPreview | null) => void;
  setImportSource: (s: ImportSource) => void;
};

export const handleSPFileImport = async (ctx: SPFileCtx) => {
  const {t, setExtPreview, setImportSource} = ctx;
  try {
    const [res] = await safePick({type: ['application/json', 'text/plain']});
    if (!res) return;
    const content = await readFileText(getPickedFilePath(res), res.uri);
    const data: unknown = JSON.parse(content);
    if (!isSpExportFile(data)) {
      Alert.alert(t('share.importFailed'), t('share.notValidSPExport'));
      return;
    }
    const spMembers = asArray<SpMemberDoc>(data.members);
    const spHistory = asArray<SpSwitchDoc>(data.frontHistory);
    const spUsers = asArray<SpUserDoc>(data.users);
    const spGroups = asArray<SpGroupDoc>(data.groups);
    const spCustomFields = asArray<SpFieldDoc>(data.customFields);
    const systemInfo: SpUserDoc = spUsers[0] || {};
    const sanitized = spMembers.map(m => {
      if (m?.name) m.name = cleanImportedName(m.name);
      return m;
    });
    setExtPreview({source: 'spfile', system: {content: systemInfo}, members: sanitized, switches: spHistory, groups: spGroups, customFields: spCustomFields});
    setImportSource('spfile');
  } catch (e) {
    if (!isPickerCancel(e)) Alert.alert(t('share.importFailed'), importErrorText(e, t));
  }
};
