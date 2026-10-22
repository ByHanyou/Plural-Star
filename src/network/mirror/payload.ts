import { isRecord } from '../../utils';
import type { HistoryEntry, JournalEntry, WhiteboardStroke } from '../../utils';
import { MIRROR_FEATURES, MirrorFeature, MirrorGroupsPayload, MirrorMember, MirrorPayload, MirrorPlannerPayload, MirrorSystemProfile } from '../types';

const MIRROR_FEATURE_SET: ReadonlySet<string> = new Set(MIRROR_FEATURES);

export const isMirrorFeature = (x: unknown): x is MirrorFeature => typeof x === 'string' && MIRROR_FEATURE_SET.has(x);

const mirrorRecords = <T>(data: MirrorPayload | null | undefined): T[] =>
  Array.isArray(data) ? (data as unknown[]).filter((x): x is T => !!x && typeof x === 'object') : [];

export const mirrorMembersOf = (data: MirrorPayload | null | undefined): MirrorMember[] => mirrorRecords<MirrorMember>(data);

export const mirrorHistoryOf = (data: MirrorPayload | null | undefined): HistoryEntry[] => mirrorRecords<HistoryEntry>(data);

export const mirrorJournalOf = (data: MirrorPayload | null | undefined): JournalEntry[] => mirrorRecords<JournalEntry>(data);

export const mirrorStrokesOf = (data: MirrorPayload | null | undefined): WhiteboardStroke[] =>
  mirrorRecords<WhiteboardStroke>(data).filter(s => Array.isArray(s.pts));

const mirrorObjectOf = <T>(data: MirrorPayload | null | undefined): T | null =>
  isRecord(data) ? (data as T) : null;

export const mirrorGroupsOf = (data: MirrorPayload | null | undefined): MirrorGroupsPayload | null => mirrorObjectOf<MirrorGroupsPayload>(data);

export const mirrorPlannerOf = (data: MirrorPayload | null | undefined): Partial<MirrorPlannerPayload> => mirrorObjectOf<Partial<MirrorPlannerPayload>>(data) || {};

export const mirrorProfileOf = (data: MirrorPayload | null | undefined): MirrorSystemProfile | null => mirrorObjectOf<MirrorSystemProfile>(data);
