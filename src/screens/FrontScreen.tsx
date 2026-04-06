// src/screens/FrontScreen.tsx
import React, {useState, useEffect} from 'react';
import {
  View,
  Text,
  ScrollView,
  TouchableOpacity,
  Image,
  StyleSheet,
} from 'react-native';
import {useTranslation} from 'react-i18next';
import {Fonts} from '../theme';
import {
  FrontState,
  FrontTier,
  FrontTierKey,
  Member,
  fmtTime,
  fmtDur,
  isFrontEmpty,
} from '../utils';

const getInitials = (name: string) =>
  name
    .split(' ')
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

const Avatar = ({
  member,
  size = 40,
  pulse = false,
  T,
}: {
  member?: Member | null;
  size?: number;
  pulse?: boolean;
  T: any;
}) => {
  if (member?.avatar) {
    return (
      <Image
        source={{uri: member.avatar}}
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          shadowColor: pulse ? member.color : 'transparent',
          shadowOpacity: pulse ? 0.5 : 0,
          shadowRadius: pulse ? 8 : 0,
          elevation: pulse ? 4 : 0,
        }}
      />
    );
  }

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: member?.color || T.toggleOff,
        alignItems: 'center',
        justifyContent: 'center',
      }}>
      <Text
        style={{
          fontSize: size * 0.35,
          fontWeight: '700',
          color: 'rgba(0,0,0,0.75)',
        }}>
        {getInitials(member?.name || '?')}
      </Text>
    </View>
  );
};

interface Props {
  theme: any;
  front: FrontState | null;
  getMember: (id: string) => Member | undefined;
  onSetFront: () => void;
  onUpdateNote: (tier: FrontTierKey, note: string) => void;
  onEditDetails: (tier: FrontTierKey) => void;
}

const TIER_I18N_KEY: Record<FrontTierKey, string> = {
  primary: 'tier.primaryFront',
  coFront: 'tier.coFront',
  coConscious: 'tier.coConscious',
};

const TierCard = ({
  tier,
  tierKey,
  T,
  getMember,
  front,
  onEditDetails,
  onUpdateNote,
  showLocation,
}: {
  tier: FrontTier;
  tierKey: FrontTierKey;
  T: any;
  getMember: (id: string) => Member | undefined;
  front: FrontState;
  onEditDetails: (tier: FrontTierKey) => void;
  onUpdateNote: (tier: FrontTierKey, note: string) => void;
  showLocation: boolean;
}) => {
  const {t} = useTranslation();

  const fs = (s: number) => Math.round(s * (T.textScale || 1));

  const [note, setNote] = useState(tier.note || '');

  useEffect(() => {
    setNote(tier.note || '');
  }, [tier.note]);

  const fronters = tier.memberIds
    .map(getMember)
    .filter(Boolean) as Member[];

  const isPrimary = tierKey === 'primary';
  const label = t(TIER_I18N_KEY[tierKey]);
  const accentColor =
    isPrimary ? T.accent : tierKey === 'coFront' ? T.info : T.success;

  return (
    <View style={{marginBottom: 14}}>
      <View style={{flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8}}>
        <View
          style={{
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: accentColor,
          }}
        />
        <Text
          style={{
            fontSize: fs(10),
            letterSpacing: 1,
            textTransform: 'uppercase',
            color: accentColor,
            fontWeight: '700',
          }}>
          {label}
        </Text>
        <View style={{flex: 1, height: 1, backgroundColor: T.border}} />
      </View>

      <View
        style={[
          s.tierCard,
          {backgroundColor: T.card, borderColor: `${accentColor}40`},
        ]}>
        <View style={{gap: 12, marginBottom: 10}}>
          {fronters.length > 0 ? (
            fronters.map(m => (
              <View key={m.id} style={{flexDirection: 'row', alignItems: 'center', gap: 12}}>
                <Avatar member={m} size={isPrimary ? 48 : 40} T={T} />
                <View style={{flex: 1}}>
                  <Text style={{fontSize: isPrimary ? fs(16) : fs(14), fontWeight: '500', color: T.text}}>
                    {m.name}
                  </Text>
                  {m.pronouns ? (
                    <Text style={{fontSize: fs(12), color: T.dim}}>
                      {m.pronouns}
                    </Text>
                  ) : null}
                  {m.role ? (
                    <Text style={{fontSize: fs(10), fontWeight: '600', letterSpacing: 1, marginTop: 1, color: m.color}}>
                      {m.role.toUpperCase()}
                    </Text>
                  ) : null}
                </View>
              </View>
            ))
          ) : (
            <Text style={{fontSize: fs(12), color: T.muted}}>
              {t('front.noOneFronting')}
            </Text>
          )}
        </View>

        {isPrimary && (
          <View style={{borderTopWidth: 1, borderTopColor: T.border, paddingTop: 8, marginBottom: 8}}>
            <Text style={{fontSize: fs(11), color: T.muted}}>
              {t('front.frontingFor')}{' '}
              <Text style={{color: T.accent}}>{fmtDur(front.startTime)}</Text>{' '}
              · {t('front.since')} {fmtTime(front.startTime)}
            </Text>
          </View>
        )}

        <View style={{borderTopWidth: 1, borderTopColor: T.border, paddingTop: 8}}>
          <Text style={{fontSize: fs(9), letterSpacing: 1, color: T.dim}}>
            {t('front.frontNote')}
          </Text>

          <Text style={{fontSize: fs(12), color: note ? T.text : T.muted, marginTop: 4}}>
            {note || t('front.noNote')}
          </Text>
        </View>
      </View>
    </View>
  );
};

export const FrontScreen = ({
  theme: T,
  front,
  getMember,
  onSetFront,
  onUpdateNote,
  onEditDetails,
}: Props) => {
  const {t} = useTranslation();
  
  const empty = isFrontEmpty(front);

  return (
    <View style={{flex: 1}}>
      <ScrollView
        style={{flex: 1, backgroundColor: T.bg}}
        contentContainerStyle={{
          padding: 16,
          paddingBottom: 140,
          flexGrow: 1,
        }}>

        <View style={s.headerRow}>
          <Text style={[s.heading, {color: T.text}]}>
            {t('front.currentlyFronting')}
          </Text>

          <TouchableOpacity
            onPress={onSetFront}
            style={[
              s.btn,
              {backgroundColor: T.accentBg, borderColor: `${T.accent}40`},
            ]}>
            <Text style={[s.btnText, {color: T.accent}]}>
              {t('front.update')}
            </Text>
          </TouchableOpacity>
        </View>

        {empty ? (
          <View style={[s.emptyCard, {backgroundColor: T.card, borderColor: T.border}]}>
            <Text style={{color: T.muted, fontSize: fs(13)}}>
              {t('front.noOneFronting')}
            </Text>
          </View>
        ) : (
          <>
            <TierCard
              tier={front!.primary}
              tierKey="primary"
              T={T}
              getMember={getMember}
              front={front!}
              onEditDetails={onEditDetails}
              onUpdateNote={onUpdateNote}
              showLocation={true}
            />

            <TierCard
              tier={front!.coFront}
              tierKey="coFront"
              T={T}
              getMember={getMember}
              front={front!}
              onEditDetails={onEditDetails}
              onUpdateNote={onUpdateNote}
              showLocation={false}
            />

            <TierCard
              tier={front!.coConscious}
              tierKey="coConscious"
              T={T}
              getMember={getMember}
              front={front!}
              onEditDetails={onEditDetails}
              onUpdateNote={onUpdateNote}
              showLocation={false}
            />
          </>
        )}

        <View style={{height: 300}} />
      </ScrollView>
    </View>
  );
};

const s = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  heading: {
    fontFamily: Fonts.display,
    fontSize: 26,
    fontWeight: '600',
    fontStyle: 'italic',
  },
  btn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  btnText: {
    fontSize: 13,
    fontWeight: '500',
  },
  tierCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
  },
  emptyCard: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 18,
    minHeight: 100,
    alignItems: 'center',
    justifyContent: 'center',
  },
});