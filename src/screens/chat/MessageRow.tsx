import React from 'react';
import {View, TouchableOpacity, Image} from 'react-native';
import Share from 'react-native-share';
import {useTranslation} from 'react-i18next';
import {Text} from '../../components/AppText';
import {Avatar} from '../../components/Avatar';
import {RichText} from '../../components/MarkdownRenderer';
import {fontScale} from '../../theme';
import {useTheme} from '../../themeContext';
import {ChatMessage, Member, fmtTime, truncateRunes} from '../../utils';
import {getChatMediaFileName} from '../../utils/mediaUtils';
import {logError} from '../../utils/log';
import {CLOUD_MEDIA_MARK} from '../../cloud/cloudKeys';
import {Pill} from './ChatParts';

const EMOJI_QUICK = ['👍', '❤️', '😂', '😢', '😮', '🎉', '✨', '🔥'];
const ICON_HIT = {top: 12, bottom: 12, left: 4, right: 6};
const PILL_HIT = {top: 6, bottom: 11};

export const isEditableMessage = (m: ChatMessage): boolean => m.type === 'text' || m.type === 'reply';

export const MessageRow = ({msg, author, replyMsg, replyAuthor, members, activeMemberId, emojiOpen, actionsOpen, onMentionPress, onReply, onToggleEmoji, onToggleActions, onReact, onEdit, onPing, onDelete}: {
  msg: ChatMessage; author?: Member; replyMsg?: ChatMessage; replyAuthor?: Member; members: Member[]; activeMemberId: string | null;
  emojiOpen: boolean; actionsOpen: boolean; onMentionPress?: (memberId: string) => void;
  onReply: (msg: ChatMessage) => void; onToggleEmoji: (id: string) => void; onToggleActions: (id: string) => void; onReact: (id: string, emoji: string) => void;
  onEdit: (msg: ChatMessage) => void; onPing: (msg: ChatMessage) => void; onDelete: (msg: ChatMessage) => void;
}) => {
  const T = useTheme();
  const {t} = useTranslation();
  const fs = fontScale(T);
  const reactionEntries = Object.entries(msg.reactions || {});
  const mediaGone = msg.content === CLOUD_MEDIA_MARK;
  const imageReady = typeof msg.content === 'string' && msg.content.trim().length > 0 && !mediaGone;
  const fileLabel = mediaGone ? t('chat.imageUnavailable') : getChatMediaFileName(msg.content);
  const panel = {flexDirection: 'row' as const, gap: 6, marginLeft: 38, marginTop: 4, padding: 6, backgroundColor: T.card, borderRadius: 8, borderWidth: 1, borderColor: T.border};

  return (
    <View style={{paddingHorizontal: 16, paddingVertical: 6}}>
      {replyMsg && (
        <View style={{flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 38, marginBottom: 4, opacity: 0.7}}>
          <Text style={{fontSize: fs(10), color: T.dim}} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">↳</Text>
          <Text style={{fontSize: fs(11), color: replyAuthor?.color || T.dim, fontWeight: '500'}}>{replyAuthor?.name || '?'}</Text>
          <Text style={{fontSize: fs(11), color: T.muted}} numberOfLines={1}>{truncateRunes(replyMsg.content, 50, '…')}</Text>
        </View>
      )}
      <View style={{flexDirection: 'row', gap: 10}}>
        <Avatar member={author} size={28} />
        <View style={{flex: 1}}>
          <View style={{flexDirection: 'row', alignItems: 'baseline', gap: 8, marginBottom: 2}}>
            <Text style={{fontSize: fs(13), fontWeight: '600', color: author?.color || T.text}}>{author?.name || '?'}</Text>
            <Text style={{fontSize: fs(10), color: T.muted}}>{fmtTime(msg.timestamp)}</Text>
          </View>
          {msg.type === 'image' ? (
            imageReady ? (
              <Image source={{uri: msg.content.trim()}} accessibilityRole="image" accessibilityLabel={t('a11y.image')} style={{width: 200, height: 200, borderRadius: 8, marginTop: 4}} resizeMode="cover" />
            ) : (
              <Text style={{fontSize: fs(11), color: T.muted, fontStyle: 'italic', marginTop: 4}}>{t('chat.imageUnavailable')}</Text>
            )
          ) : msg.type === 'file' ? (
            <TouchableOpacity activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={fileLabel}
              onPress={() => { if (msg.content && !mediaGone) Share.open({url: msg.content, failOnCancel: false}).catch(e => logError('chat', e)); }}
              hitSlop={{top: 6, bottom: 6}} style={{flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, borderRadius: 8, backgroundColor: T.surface, borderWidth: 1, borderColor: T.border, marginTop: 4}}>
              <Text style={{fontSize: fs(18)}} accessibilityElementsHidden importantForAccessibility="no">📄</Text>
              <Text style={{fontSize: fs(13), color: T.info, flex: 1}} numberOfLines={1}>{fileLabel}</Text>
            </TouchableOpacity>
          ) : (
            <RichText text={msg.content} members={members} onMentionPress={onMentionPress} />
          )}
          {reactionEntries.length > 0 && (
            <View style={{flexDirection: 'row', flexWrap: 'wrap', gap: 4, marginTop: 4}}>
              {reactionEntries.map(([emoji, users]) => {
                const mine = users.includes(activeMemberId || '');
                return (
                  <TouchableOpacity key={emoji} onPress={() => onReact(msg.id, emoji)} activeOpacity={0.7}
                    accessibilityRole="button" accessibilityState={{selected: mine}} accessibilityLabel={t('chat.reactionA11y', {emoji, count: users.length})}
                    hitSlop={{top: 4, bottom: 13}} style={{flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 999,
                      backgroundColor: mine ? `${T.accent}20` : T.surface, borderWidth: 1, borderColor: T.border}}>
                    <Text style={{fontSize: fs(12)}}>{emoji}</Text>
                    <Text style={{fontSize: fs(10), color: T.dim}}>{users.length}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>
        <View style={{flexDirection: 'row', gap: 4, paddingTop: 2}}>
          <TouchableOpacity hitSlop={{...ICON_HIT, left: 6}} onPress={() => onReply(msg)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('chat.replyTo', {name: author?.name || '?'})}><Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{fontSize: fs(12), color: T.dim}}>↩</Text></TouchableOpacity>
          <TouchableOpacity hitSlop={ICON_HIT} onPress={() => onToggleEmoji(msg.id)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('chat.addReaction')}><Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{fontSize: fs(12), color: T.dim}}>☺</Text></TouchableOpacity>
          <TouchableOpacity hitSlop={ICON_HIT} onPress={() => onToggleActions(msg.id)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={t('chat.messageActions')}><Text accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={{fontSize: fs(14), color: actionsOpen ? T.accent : T.dim, fontWeight: '700'}}>⋯</Text></TouchableOpacity>
        </View>
      </View>
      {emojiOpen && (
        <View style={panel}>
          {EMOJI_QUICK.map(e => (
            <TouchableOpacity hitSlop={{top: 10, bottom: 11}} key={e} onPress={() => onReact(msg.id, e)} activeOpacity={0.7} accessibilityRole="button" accessibilityLabel={e}>
              <Text style={{fontSize: fs(18)}}>{e}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      {actionsOpen && (
        <View style={[panel, {flexWrap: 'wrap'}]}>
          {isEditableMessage(msg) && <Pill onPress={() => onEdit(msg)} label={t('common.edit')} color={T.accent} bg={T.accentBg} hitSlop={PILL_HIT} />}
          <Pill onPress={() => onPing(msg)} label={t('chat.ping')} color={T.info} bg={T.infoBg} hitSlop={PILL_HIT} />
          <Pill onPress={() => onDelete(msg)} label={t('common.delete')} color={T.danger} bg={T.dangerBg} hitSlop={PILL_HIT} />
        </View>
      )}
    </View>
  );
};
