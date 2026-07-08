import React, {useState} from 'react';
import {View, ScrollView, TouchableOpacity, Alert, KeyboardAvoidingView} from 'react-native';
import {Text, TextInput} from '../components/AppText';
import {useKeyboardBehavior} from '../hooks/useKeyboardBehavior';
import {useTranslation} from 'react-i18next';
import {MedicalData, Medication, MedicalAppointment, MedicalHistoryEntry, uid, fmtTime, fmtDate, time12to24, formatTime12} from '../utils';
import {DateTimeEditor} from '../components/DateTimeEditor';

type MedSection = 'medications' | 'appointments' | 'history' | 'emergency';

interface Props {
  theme: any;
  medical: MedicalData;
  onSave: (m: MedicalData) => void;
}

const REMIND_OPTIONS = [0, 30, 60, 1440];

export const MedicalScreen = ({theme: T, medical, onSave}: Props) => {
  const {t} = useTranslation();
  const fs = (s: number) => Math.round(s * (T.textScale || 1));
  const behavior = useKeyboardBehavior();

  const [section, setSection] = useState<MedSection>('medications');

  const [medFormId, setMedFormId] = useState<string | null>(null);
  const [showMedForm, setShowMedForm] = useState(false);
  const [medName, setMedName] = useState('');
  const [medDosage, setMedDosage] = useState('');
  const [medTimes, setMedTimes] = useState<string[]>([]);
  const [medTimeInput, setMedTimeInput] = useState('');
  const [medAmPm, setMedAmPm] = useState<'AM' | 'PM'>('AM');
  const [medNotes, setMedNotes] = useState('');

  const [apptFormId, setApptFormId] = useState<string | null>(null);
  const [showApptForm, setShowApptForm] = useState(false);
  const [apptTitle, setApptTitle] = useState('');
  const [apptDate, setApptDate] = useState(new Date());
  const [apptLocation, setApptLocation] = useState('');
  const [apptRemind, setApptRemind] = useState(60);
  const [apptNotes, setApptNotes] = useState('');

  const [histFormId, setHistFormId] = useState<string | null>(null);
  const [showHistForm, setShowHistForm] = useState(false);
  const [histTitle, setHistTitle] = useState('');
  const [histDate, setHistDate] = useState(new Date());
  const [histNotes, setHistNotes] = useState('');

  const [emConditions, setEmConditions] = useState(medical.emergency.conditions || '');
  const [emAllergies, setEmAllergies] = useState(medical.emergency.allergies || '');
  const [emBloodType, setEmBloodType] = useState(medical.emergency.bloodType || '');
  const [emNotes, setEmNotes] = useState(medical.emergency.notes || '');
  const [emShow, setEmShow] = useState(medical.emergency.showOnNotification);

  const labelStyle = {fontSize: fs(10), letterSpacing: 1, textTransform: 'uppercase' as const, color: T.dim, marginBottom: 6, fontWeight: '600' as const};
  const inputStyle = {backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: fs(13), marginBottom: 10};

  const resetMedForm = () => {
    setMedFormId(null);
    setMedName('');
    setMedDosage('');
    setMedTimes([]);
    setMedTimeInput('');
    setMedNotes('');
    setShowMedForm(false);
  };

  const openMedForm = (med: Medication | null) => {
    setMedFormId(med?.id || null);
    setMedName(med?.name || '');
    setMedDosage(med?.dosage || '');
    setMedTimes(med?.times || []);
    setMedTimeInput('');
    setMedNotes(med?.notes || '');
    setShowMedForm(true);
  };

  const addMedTime = () => {
    const v = time12to24(medTimeInput, medAmPm);
    if (!v) {
      Alert.alert(t('medical.title'), t('medical.invalidTime'));
      return;
    }
    if (!medTimes.includes(v)) setMedTimes([...medTimes, v].sort());
    setMedTimeInput('');
  };

  const saveMedication = () => {
    const name = medName.trim();
    if (!name) return;
    const entry: Medication = {
      id: medFormId || uid(),
      name,
      dosage: medDosage.trim() || undefined,
      times: medTimes,
      enabled: medFormId ? (medical.medications.find(m => m.id === medFormId)?.enabled ?? true) : true,
      notes: medNotes.trim() || undefined,
      createdAt: medFormId ? (medical.medications.find(m => m.id === medFormId)?.createdAt ?? Date.now()) : Date.now(),
    };
    const next = medFormId
      ? medical.medications.map(m => m.id === medFormId ? entry : m)
      : [...medical.medications, entry];
    onSave({...medical, medications: next});
    resetMedForm();
  };

  const toggleMedication = (id: string) => {
    onSave({...medical, medications: medical.medications.map(m => m.id === id ? {...m, enabled: !m.enabled} : m)});
  };

  const deleteMedication = (id: string) => {
    Alert.alert(t('common.delete'), t('medical.deleteItemMsg'), [
      {text: t('common.cancel'), style: 'cancel'},
      {text: t('common.delete'), style: 'destructive', onPress: () => {
        onSave({...medical, medications: medical.medications.filter(m => m.id !== id)});
        if (medFormId === id) resetMedForm();
      }},
    ]);
  };

  const resetApptForm = () => {
    setApptFormId(null);
    setApptTitle('');
    setApptDate(new Date());
    setApptLocation('');
    setApptRemind(60);
    setApptNotes('');
    setShowApptForm(false);
  };

  const openApptForm = (appt: MedicalAppointment | null) => {
    setApptFormId(appt?.id || null);
    setApptTitle(appt?.title || '');
    setApptDate(appt ? new Date(appt.time) : new Date());
    setApptLocation(appt?.location || '');
    setApptRemind(appt?.reminderMinutesBefore ?? 60);
    setApptNotes(appt?.notes || '');
    setShowApptForm(true);
  };

  const saveAppointment = () => {
    const title = apptTitle.trim();
    if (!title) return;
    const entry: MedicalAppointment = {
      id: apptFormId || uid(),
      title,
      time: apptDate.getTime(),
      location: apptLocation.trim() || undefined,
      notes: apptNotes.trim() || undefined,
      reminderMinutesBefore: apptRemind,
      createdAt: apptFormId ? (medical.appointments.find(a => a.id === apptFormId)?.createdAt ?? Date.now()) : Date.now(),
    };
    const next = apptFormId
      ? medical.appointments.map(a => a.id === apptFormId ? entry : a)
      : [...medical.appointments, entry];
    onSave({...medical, appointments: next.sort((a, b) => a.time - b.time)});
    resetApptForm();
  };

  const deleteAppointment = (id: string) => {
    Alert.alert(t('common.delete'), t('medical.deleteItemMsg'), [
      {text: t('common.cancel'), style: 'cancel'},
      {text: t('common.delete'), style: 'destructive', onPress: () => {
        onSave({...medical, appointments: medical.appointments.filter(a => a.id !== id)});
        if (apptFormId === id) resetApptForm();
      }},
    ]);
  };

  const resetHistForm = () => {
    setHistFormId(null);
    setHistTitle('');
    setHistDate(new Date());
    setHistNotes('');
    setShowHistForm(false);
  };

  const openHistForm = (h: MedicalHistoryEntry | null) => {
    setHistFormId(h?.id || null);
    setHistTitle(h?.title || '');
    setHistDate(h?.date ? new Date(h.date) : new Date());
    setHistNotes(h?.notes || '');
    setShowHistForm(true);
  };

  const saveHistoryEntry = () => {
    const title = histTitle.trim();
    if (!title) return;
    const entry: MedicalHistoryEntry = {
      id: histFormId || uid(),
      title,
      date: histDate.getTime(),
      notes: histNotes.trim() || undefined,
      createdAt: histFormId ? (medical.history.find(h => h.id === histFormId)?.createdAt ?? Date.now()) : Date.now(),
    };
    const next = histFormId
      ? medical.history.map(h => h.id === histFormId ? entry : h)
      : [...medical.history, entry];
    onSave({...medical, history: next.sort((a, b) => (b.date || 0) - (a.date || 0))});
    resetHistForm();
  };

  const deleteHistoryEntry = (id: string) => {
    Alert.alert(t('common.delete'), t('medical.deleteItemMsg'), [
      {text: t('common.cancel'), style: 'cancel'},
      {text: t('common.delete'), style: 'destructive', onPress: () => {
        onSave({...medical, history: medical.history.filter(h => h.id !== id)});
        if (histFormId === id) resetHistForm();
      }},
    ]);
  };

  const saveEmergency = () => {
    onSave({...medical, emergency: {
      conditions: emConditions.trim() || undefined,
      allergies: emAllergies.trim() || undefined,
      bloodType: emBloodType.trim() || undefined,
      notes: emNotes.trim() || undefined,
      showOnNotification: emShow,
    }});
  };

  const SectionBtn = ({id, label}: {id: MedSection; label: string}) => (
    <TouchableOpacity onPress={() => setSection(id)} activeOpacity={0.7}
      accessibilityRole="tab" accessibilityState={{selected: section === id}}
      style={{paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1,
        backgroundColor: section === id ? `${T.accent}20` : T.surface, borderColor: section === id ? `${T.accent}60` : T.border}}>
      <Text style={{fontSize: fs(11), fontWeight: section === id ? '600' : '400', color: section === id ? T.accent : T.dim}}>{label}</Text>
    </TouchableOpacity>
  );

  const AddBtn = ({label, onPress, expanded}: {label: string; onPress: () => void; expanded: boolean}) => (
    <TouchableOpacity onPress={onPress} activeOpacity={0.7} accessibilityRole="button" accessibilityState={{expanded}}
      style={{backgroundColor: T.accentBg, borderWidth: 1, borderColor: `${T.accent}40`, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, alignSelf: 'flex-start', marginBottom: 12}}>
      <Text style={{fontSize: fs(12), fontWeight: '600', color: T.accent}}>{label}</Text>
    </TouchableOpacity>
  );

  const SaveCancelRow = ({onSave: onSavePress, onCancel, canSave}: {onSave: () => void; onCancel: () => void; canSave: boolean}) => (
    <View style={{flexDirection: 'row', gap: 10}}>
      <TouchableOpacity onPress={onCancel} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.cancel')}
        style={{flex: 1, alignItems: 'center', paddingVertical: 11, borderRadius: 8, borderWidth: 1, backgroundColor: 'transparent', borderColor: T.border}}>
        <Text style={{fontSize: fs(13), fontWeight: '500', color: T.dim}}>{t('common.cancel')}</Text>
      </TouchableOpacity>
      <TouchableOpacity onPress={onSavePress} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.save')} disabled={!canSave}
        style={{flex: 2, alignItems: 'center', paddingVertical: 11, borderRadius: 8, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`, opacity: canSave ? 1 : 0.45}}>
        <Text style={{fontSize: fs(13), fontWeight: '500', color: T.accent}}>{t('common.save')}</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <KeyboardAvoidingView style={{flex: 1}} behavior={behavior}>
      <ScrollView style={{flex: 1, backgroundColor: T.bg}} contentContainerStyle={{padding: 16, paddingBottom: 120}} keyboardShouldPersistTaps="handled">
        <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 16}}>
          <SectionBtn id="medications" label={t('medical.medications')} />
          <SectionBtn id="appointments" label={t('medical.appointments')} />
          <SectionBtn id="history" label={t('medical.history')} />
          <SectionBtn id="emergency" label={t('medical.emergency')} />
        </View>

        {section === 'medications' && (
          <View>
            <AddBtn label={t('medical.addMedication')} expanded={showMedForm} onPress={() => (showMedForm ? resetMedForm() : openMedForm(null))} />
            {showMedForm && (
              <View style={{backgroundColor: T.card, borderRadius: 12, borderWidth: 1, borderColor: T.border, padding: 14, marginBottom: 14}}>
                <Text style={labelStyle}>{t('modal.name')}</Text>
                <TextInput value={medName} onChangeText={setMedName} placeholder={t('medical.namePlaceholder')} placeholderTextColor={T.muted} style={inputStyle} />
                <Text style={labelStyle}>{t('medical.dosage')}</Text>
                <TextInput value={medDosage} onChangeText={setMedDosage} placeholder={t('medical.dosagePlaceholder')} placeholderTextColor={T.muted} style={inputStyle} />
                <Text style={labelStyle}>{t('medical.reminderTimes')}</Text>
                {medTimes.length > 0 && (
                  <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8}}>
                    {medTimes.map(tm => (
                      <TouchableOpacity key={tm} onPress={() => setMedTimes(medTimes.filter(x => x !== tm))} activeOpacity={0.7}
                        accessibilityRole="button" accessibilityLabel={`${t('common.remove')} ${formatTime12(tm)}`}
                        style={{flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, borderWidth: 1, backgroundColor: `${T.accent}15`, borderColor: `${T.accent}40`}}>
                        <Text style={{fontSize: fs(12), color: T.accent, fontFamily: 'monospace'}}>{formatTime12(tm)}</Text>
                        <Text style={{fontSize: fs(10), color: T.danger}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">✕</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
                <View style={{flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 10}}>
                  <TextInput value={medTimeInput} onChangeText={setMedTimeInput} placeholder="9:00" placeholderTextColor={T.muted} keyboardType="numbers-and-punctuation" maxLength={5}
                    style={{flex: 1, backgroundColor: T.surface, color: T.text, borderWidth: 1, borderColor: T.border, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 9, fontSize: fs(13), fontFamily: 'monospace'}}
                    onSubmitEditing={addMedTime} returnKeyType="done" />
                  <View style={{flexDirection: 'row', borderWidth: 1, borderColor: T.border, borderRadius: 8, overflow: 'hidden'}}>
                    {(['AM', 'PM'] as const).map(ap => (
                      <TouchableOpacity key={ap} onPress={() => setMedAmPm(ap)} activeOpacity={0.7}
                        accessibilityRole="button" accessibilityLabel={ap} accessibilityState={{selected: medAmPm === ap}}
                        style={{paddingHorizontal: 12, paddingVertical: 9, backgroundColor: medAmPm === ap ? T.accent : T.surface}}>
                        <Text style={{fontSize: fs(12), fontWeight: '700', color: medAmPm === ap ? '#0a0508' : T.dim}}>{ap}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TouchableOpacity onPress={addMedTime} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('medical.addTime')}
                    style={{paddingHorizontal: 14, paddingVertical: 9, borderRadius: 8, borderWidth: 1, backgroundColor: T.surface, borderColor: T.border}}>
                    <Text style={{fontSize: fs(12), color: T.accent, fontWeight: '600'}}>{t('medical.addTime')}</Text>
                  </TouchableOpacity>
                </View>
                <Text style={labelStyle}>{t('modal.note')}</Text>
                <TextInput value={medNotes} onChangeText={setMedNotes} placeholder={t('modal.noteOptional')} placeholderTextColor={T.muted} multiline style={[inputStyle, {minHeight: 56, textAlignVertical: 'top', marginBottom: 14}]} />
                <SaveCancelRow onSave={saveMedication} onCancel={resetMedForm} canSave={!!medName.trim()} />
              </View>
            )}
            {medical.medications.length === 0 && !showMedForm ? (
              <Text style={{fontSize: fs(12), color: T.muted, fontStyle: 'italic'}}>{t('medical.noMedications')}</Text>
            ) : medical.medications.map(med => (
              <TouchableOpacity key={med.id} onPress={() => openMedForm(med)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={med.name}
                style={{backgroundColor: T.card, borderRadius: 12, borderWidth: 1, borderColor: T.border, padding: 12, marginBottom: 8, opacity: med.enabled ? 1 : 0.55}}>
                <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
                  <Text style={{fontSize: fs(16)}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">💊</Text>
                  <View style={{flex: 1}}>
                    <Text style={{fontSize: fs(14), fontWeight: '600', color: T.text}} numberOfLines={1}>{med.name}{med.dosage ? `  ·  ${med.dosage}` : ''}</Text>
                    {med.times.length > 0 && <Text style={{fontSize: fs(11), color: T.dim, fontFamily: 'monospace'}}>{med.times.map(formatTime12).join('  ')}</Text>}
                    {med.notes ? <Text style={{fontSize: fs(11), color: T.muted}} numberOfLines={1}>{med.notes}</Text> : null}
                  </View>
                  <TouchableOpacity onPress={() => toggleMedication(med.id)} activeOpacity={0.8}
                    accessibilityRole="switch" accessibilityState={{checked: med.enabled}} accessibilityLabel={med.name}
                    style={{width: 40, height: 22, borderRadius: 11, backgroundColor: med.enabled ? T.accent : T.toggleOff, justifyContent: 'center'}}>
                    <View style={{width: 16, height: 16, borderRadius: 8, backgroundColor: '#fff', position: 'absolute', left: med.enabled ? 20 : 3}} />
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => deleteMedication(med.id)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={`${t('common.delete')} ${med.name}`} style={{padding: 4}}>
                    <Text style={{fontSize: fs(12), color: T.danger}}>✕</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {section === 'appointments' && (
          <View>
            <AddBtn label={t('medical.addAppointment')} expanded={showApptForm} onPress={() => (showApptForm ? resetApptForm() : openApptForm(null))} />
            {showApptForm && (
              <View style={{backgroundColor: T.card, borderRadius: 12, borderWidth: 1, borderColor: T.border, padding: 14, marginBottom: 14}}>
                <Text style={labelStyle}>{t('modal.entryTitle')}</Text>
                <TextInput value={apptTitle} onChangeText={setApptTitle} placeholder={t('medical.apptPlaceholder')} placeholderTextColor={T.muted} style={inputStyle} />
                <DateTimeEditor date={apptDate} onChange={setApptDate} label={t('medical.when')} T={T} />
                <Text style={labelStyle}>{t('modal.location')}</Text>
                <TextInput value={apptLocation} onChangeText={setApptLocation} placeholder={t('modal.typeLocation')} placeholderTextColor={T.muted} style={inputStyle} />
                <Text style={labelStyle}>{t('medical.remindBefore')}</Text>
                <View style={{flexDirection: 'row', gap: 6, marginBottom: 10}}>
                  {REMIND_OPTIONS.map(mins => (
                    <TouchableOpacity key={mins} onPress={() => setApptRemind(mins)} activeOpacity={0.7}
                      accessibilityRole="button" accessibilityState={{selected: apptRemind === mins}}
                      style={{flex: 1, alignItems: 'center', paddingVertical: 7, borderRadius: 8, borderWidth: 1,
                        backgroundColor: apptRemind === mins ? `${T.accent}20` : T.surface, borderColor: apptRemind === mins ? `${T.accent}60` : T.border}}>
                      <Text style={{fontSize: fs(11), color: apptRemind === mins ? T.accent : T.dim, fontWeight: apptRemind === mins ? '600' : '400'}}>
                        {mins === 0 ? t('medical.atTime') : mins === 30 ? t('medical.remind30m') : mins === 60 ? t('medical.remind1h') : t('medical.remind1d')}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
                <Text style={labelStyle}>{t('modal.note')}</Text>
                <TextInput value={apptNotes} onChangeText={setApptNotes} placeholder={t('modal.noteOptional')} placeholderTextColor={T.muted} multiline style={[inputStyle, {minHeight: 56, textAlignVertical: 'top', marginBottom: 14}]} />
                <SaveCancelRow onSave={saveAppointment} onCancel={resetApptForm} canSave={!!apptTitle.trim()} />
              </View>
            )}
            {medical.appointments.length === 0 && !showApptForm ? (
              <Text style={{fontSize: fs(12), color: T.muted, fontStyle: 'italic'}}>{t('medical.noAppointments')}</Text>
            ) : medical.appointments.map(appt => {
              const past = appt.time < Date.now();
              return (
                <TouchableOpacity key={appt.id} onPress={() => openApptForm(appt)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={appt.title}
                  style={{backgroundColor: T.card, borderRadius: 12, borderWidth: 1, borderColor: T.border, padding: 12, marginBottom: 8, opacity: past ? 0.55 : 1}}>
                  <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
                    <Text style={{fontSize: fs(16)}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">📅</Text>
                    <View style={{flex: 1}}>
                      <Text style={{fontSize: fs(14), fontWeight: '600', color: T.text}} numberOfLines={1}>{appt.title}</Text>
                      <Text style={{fontSize: fs(11), color: past ? T.muted : T.accent}}>{fmtTime(appt.time)}{appt.location ? `  ·  ${appt.location}` : ''}</Text>
                      {appt.notes ? <Text style={{fontSize: fs(11), color: T.muted}} numberOfLines={1}>{appt.notes}</Text> : null}
                    </View>
                    <TouchableOpacity onPress={() => deleteAppointment(appt.id)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={`${t('common.delete')} ${appt.title}`} style={{padding: 4}}>
                      <Text style={{fontSize: fs(12), color: T.danger}}>✕</Text>
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {section === 'history' && (
          <View>
            <AddBtn label={t('medical.addHistory')} expanded={showHistForm} onPress={() => (showHistForm ? resetHistForm() : openHistForm(null))} />
            {showHistForm && (
              <View style={{backgroundColor: T.card, borderRadius: 12, borderWidth: 1, borderColor: T.border, padding: 14, marginBottom: 14}}>
                <Text style={labelStyle}>{t('modal.entryTitle')}</Text>
                <TextInput value={histTitle} onChangeText={setHistTitle} placeholder={t('medical.historyPlaceholder')} placeholderTextColor={T.muted} style={inputStyle} />
                <DateTimeEditor date={histDate} onChange={setHistDate} label={t('customFields.typeDate')} T={T} />
                <Text style={labelStyle}>{t('modal.note')}</Text>
                <TextInput value={histNotes} onChangeText={setHistNotes} placeholder={t('modal.noteOptional')} placeholderTextColor={T.muted} multiline style={[inputStyle, {minHeight: 72, textAlignVertical: 'top', marginBottom: 14}]} />
                <SaveCancelRow onSave={saveHistoryEntry} onCancel={resetHistForm} canSave={!!histTitle.trim()} />
              </View>
            )}
            {medical.history.length === 0 && !showHistForm ? (
              <Text style={{fontSize: fs(12), color: T.muted, fontStyle: 'italic'}}>{t('medical.noHistory')}</Text>
            ) : medical.history.map(h => (
              <TouchableOpacity key={h.id} onPress={() => openHistForm(h)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={h.title}
                style={{backgroundColor: T.card, borderRadius: 12, borderWidth: 1, borderColor: T.border, padding: 12, marginBottom: 8}}>
                <View style={{flexDirection: 'row', alignItems: 'center', gap: 10}}>
                  <Text style={{fontSize: fs(16)}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">⚕</Text>
                  <View style={{flex: 1}}>
                    <Text style={{fontSize: fs(14), fontWeight: '600', color: T.text}} numberOfLines={1}>{h.title}</Text>
                    {h.date ? <Text style={{fontSize: fs(11), color: T.dim}}>{fmtDate(h.date)}</Text> : null}
                    {h.notes ? <Text style={{fontSize: fs(11), color: T.muted}} numberOfLines={2}>{h.notes}</Text> : null}
                  </View>
                  <TouchableOpacity onPress={() => deleteHistoryEntry(h.id)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={`${t('common.delete')} ${h.title}`} style={{padding: 4}}>
                    <Text style={{fontSize: fs(12), color: T.danger}}>✕</Text>
                  </TouchableOpacity>
                </View>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {section === 'emergency' && (
          <View>
            <Text style={{fontSize: fs(11), color: T.muted, lineHeight: 16, marginBottom: 14}}>{t('medical.emergencyDesc')}</Text>
            <Text style={labelStyle}>{t('medical.conditions')}</Text>
            <TextInput value={emConditions} onChangeText={setEmConditions} placeholder={t('medical.conditionsPlaceholder')} placeholderTextColor={T.muted} style={inputStyle} />
            <Text style={labelStyle}>{t('medical.allergies')}</Text>
            <TextInput value={emAllergies} onChangeText={setEmAllergies} placeholder={t('medical.allergiesPlaceholder')} placeholderTextColor={T.muted} style={inputStyle} />
            <Text style={labelStyle}>{t('medical.bloodType')}</Text>
            <TextInput value={emBloodType} onChangeText={setEmBloodType} placeholder="O+" placeholderTextColor={T.muted} maxLength={3} autoCapitalize="characters" style={inputStyle} />
            <Text style={labelStyle}>{t('modal.note')}</Text>
            <TextInput value={emNotes} onChangeText={setEmNotes} placeholder={t('modal.noteOptional')} placeholderTextColor={T.muted} multiline style={[inputStyle, {minHeight: 72, textAlignVertical: 'top'}]} />
            <TouchableOpacity onPress={() => setEmShow(!emShow)} activeOpacity={0.7}
              accessibilityRole="switch" accessibilityState={{checked: emShow}} accessibilityLabel={t('medical.showOnNotification')}
              style={{flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6, marginBottom: 16}}>
              <View style={{width: 40, height: 22, borderRadius: 11, backgroundColor: emShow ? T.accent : T.toggleOff, justifyContent: 'center'}}>
                <View style={{width: 16, height: 16, borderRadius: 8, backgroundColor: '#fff', position: 'absolute', left: emShow ? 20 : 3}} />
              </View>
              <Text style={{flex: 1, fontSize: fs(12), color: T.dim}}>{t('medical.showOnNotification')}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={saveEmergency} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('common.save')}
              style={{alignItems: 'center', paddingVertical: 11, borderRadius: 8, borderWidth: 1, backgroundColor: T.accentBg, borderColor: `${T.accent}40`}}>
              <Text style={{fontSize: fs(13), fontWeight: '500', color: T.accent}}>{t('common.save')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
};
