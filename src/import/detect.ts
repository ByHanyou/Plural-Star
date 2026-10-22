import type {ExportPayload} from '../utils';
import {asRecord} from '../utils';
import type {SpExportFile, OuExport, MxExport, OcExport, PxExport, TbExport, AmExportJson} from './formats';

export const isSpExportFile = (o: unknown): o is SpExportFile => {
  const r = asRecord(o);
  return !!r && !!(r.members || r.frontHistory || r.users);
};

export const looksLikeSP = (o: unknown): o is SpExportFile => {
  const r = asRecord(o);
  if (!r) return false;
  return !r._meta && Array.isArray(r.members) && r.members.length > 0
    && asRecord(r.members[0])?._id !== undefined && Array.isArray(r.customFields);
};

export const looksLikeOurcana = (o: unknown): o is OuExport => {
  const r = asRecord(o);
  if (!r) return false;
  const graph = asRecord(r.graph);
  return r.format === 'ourcana'
    || (!!graph && Array.isArray(graph.nodes))
    || (!r._meta && Array.isArray(r.members) && Array.isArray(r.frontHistory) && asRecord(r.members[0])?.id !== undefined);
};

export const looksLikeMultiplicity = (o: unknown): o is MxExport => {
  const r = asRecord(o);
  if (!r) return false;
  return r.app === 'multiplicity'
    || (Array.isArray(r.alters) && Array.isArray(r.front_entries) && asRecord(r.alters[0])?.alter_id !== undefined);
};

export const looksLikeOctocon = (o: unknown): o is OcExport => {
  const r = asRecord(o);
  return !!r && !r._meta && !!r.user && typeof r.user === 'object' && Array.isArray(r.alters);
};

export const isParallaxDb = (o: unknown): o is PxExport => {
  const r = asRecord(o);
  return !!r && !r._meta && typeof r.user_id === 'string' && Array.isArray(r.members) && Array.isArray(r.fronting_log);
};

export const isTupperboxExport = (o: unknown): o is TbExport => {
  const r = asRecord(o);
  return !!r && Array.isArray(r.tuppers);
};

export const isAmpersandJson = (o: unknown): o is AmExportJson => {
  const db = asRecord(asRecord(o)?.database);
  return !!db && Array.isArray(db.members) && Array.isArray(db.frontingEntries);
};

export const isNativeBackup = (o: unknown): o is ExportPayload => {
  const app = asRecord(asRecord(o)?._meta)?.app;
  return typeof app === 'string'
    && (app.includes('PluralSpace') || app.includes('Plural Space') || app.includes('PluralStar') || app.includes('Plural Star'));
};

export const findOurcanaJsonEntry = (files: Record<string, Uint8Array>): string | undefined => {
  const names = Object.keys(files);
  return names.find(n => /(^|\/)ourcana[^/]*\.json$/i.test(n))
    || names.find(n => !n.includes('/') && n.toLowerCase().endsWith('.json'))
    || names.find(n => n.toLowerCase().endsWith('.json') && !n.toLowerCase().endsWith('index.json'));
};
