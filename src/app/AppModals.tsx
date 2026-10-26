import React, {useMemo} from 'react';
import {SystemInfo, Member, FrontTier, JournalEntry, allFrontMemberIds, singletStatuses} from '../utils';
import {SetFrontModal, SetStatusModal, EditFrontDetailModal, MemberModal, JournalModal, SystemModal, SystemProfileModal, CustomFrontModal} from '../modals';
import {ImageCropHost} from '../components/ImageCropModal';
import {useAppStore} from '../store/appStore';
import {useUiStore} from '../store/uiStore';
import {saveSystem, savePalettes, selectPalette, updateFront, updateFrontDetails, saveMember, deleteMember, saveEntry, saveSettingsWithSelf} from '../store/actions';
import {reportSaveError} from '../utils/saveError';

export function AppModals({isSinglet, selfMember}: {isSinglet: boolean; selfMember: Member | undefined}) {
  const ui = useUiStore();
  const system = useAppStore(s => s.system);
  const members = useAppStore(s => s.members);
  const front = useAppStore(s => s.front);
  const appSettings = useAppStore(s => s.appSettings);
  const groups = useAppStore(s => s.groups);
  const palettes = useAppStore(s => s.palettes);
  const activePaletteId = useAppStore(s => s.activePaletteId);
  const journalTemplates = useAppStore(s => s.journalTemplates);
  const lastKnownLocation = useAppStore(s => s.lastKnownLocation);
  const activeMembers = useMemo(() => members.filter(m => !m.archived), [members]);
  const selfMemberId = selfMember?.id;

  const saveFront = async (primary: FrontTier, coFront: FrontTier, coConscious: FrontTier) => {
    try { await updateFront(primary, coFront, coConscious); } catch (e) { reportSaveError(e); return; }
    ui.closeSetFront();
  };

  const memberModal = ui.memberModal;
  return (
    <>
      {isSinglet ? (
        <SetStatusModal visible={ui.setFrontVisible} statuses={singletStatuses(members)} selfId={selfMemberId} current={front} settings={appSettings}
          lastKnownLocation={lastKnownLocation}
          onSave={saveFront}
          onClose={ui.closeSetFront} />
      ) : (
        <SetFrontModal visible={ui.setFrontVisible} members={activeMembers} current={front} settings={appSettings}
          lastKnownLocation={lastKnownLocation}
          onSave={saveFront}
          onClose={ui.closeSetFront} />
      )}
      {front && (
        <EditFrontDetailModal visible={ui.editFrontDetail.visible} front={front} tier={ui.editFrontDetail.tier} settings={appSettings} statusMode={isSinglet}
          lastKnownLocation={lastKnownLocation}
          onSave={async (mood: string | undefined, location: string | undefined, note: string, energyLevel?: number) => {
            try { await updateFrontDetails(ui.editFrontDetail.tier, mood, location, note, energyLevel); } catch (e) { reportSaveError(e); return; }
            ui.closeEditFrontDetail();
          }}
          onClose={ui.closeEditFrontDetail} />
      )}
      <MemberModal key={memberModal.session} visible={memberModal.visible} member={memberModal.member} members={members} groups={groups} settings={appSettings}
        readOnly={memberModal.readOnly}
        facetMode={memberModal.addFacet || !!memberModal.member?.isFacet}
        profileMode={isSinglet && memberModal.member?.id === selfMember?.id && !memberModal.member?.isCustomFront}
        isFronting={!!memberModal.member && allFrontMemberIds(front).includes(memberModal.member.id)}
        onMentionPress={ui.openMemberById}
        onShowOnMap={ui.showMemberOnMap}
        onSave={async (m: Member) => {await saveMember(memberModal.addCustomFront && !memberModal.member ? {...m, isCustomFront: true} : memberModal.addFacet && !memberModal.member ? {...m, isFacet: true} : m); ui.closeMember();}}
        onDelete={async (id: string) => {await deleteMember(id); ui.closeMember();}}
        onClose={ui.closeMember} />
      <CustomFrontModal visible={ui.customFrontModal.visible} customFront={ui.customFrontModal.customFront} statusMode={isSinglet} groups={groups}
        isFronting={!!ui.customFrontModal.customFront && allFrontMemberIds(front).includes(ui.customFrontModal.customFront.id)}
        onSave={async (m: Member) => {await saveMember({...m, isCustomFront: true}); ui.closeCustomFront();}}
        onDelete={async (id: string) => {await deleteMember(id); ui.closeCustomFront();}}
        onClose={ui.closeCustomFront} />
      <JournalModal visible={ui.journalModal.visible} entry={ui.journalModal.entry} members={members} templates={journalTemplates}
        onMentionPress={ui.openMemberById}
        onSave={async (e: JournalEntry) => {await saveEntry(e); ui.closeJournal();}}
        onClose={ui.closeJournal} />
      <SystemModal visible={ui.systemVisible} system={system} settings={appSettings}
        palettes={palettes} activePaletteId={activePaletteId}
        onSave={async (s: SystemInfo) => {await saveSystem(s); ui.closeSystem();}}
        onSaveSettings={async s => {await saveSettingsWithSelf(s); ui.closeSystem();}}
        onSavePalettes={savePalettes}
        onSelectPalette={selectPalette}
        onOpenProfile={() => { ui.closeSystem(); ui.openSystemProfile(); }}
        onClose={ui.closeSystem} />
      <SystemProfileModal visible={ui.systemProfileVisible && !isSinglet} system={system}
        onSave={saveSystem}
        onClose={ui.closeSystemProfile} />
      <ImageCropHost />
    </>
  );
}
