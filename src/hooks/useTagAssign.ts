import {useMemo, useState} from 'react';
import {hasTag, tagFromInput, tagKey, uniqueTags, withTag} from '../utils';

export const useTagAssign = (known: string[]) => {
  const [sel, setSel] = useState<string[]>([]);
  const [added, setAdded] = useState<string[]>([]);
  const [input, setInput] = useState('');
  const choices = useMemo(() => uniqueTags([...known, ...added]), [known, added]);
  const resolve = (raw: string): string | null => {
    const next = tagFromInput(raw);
    return next ? choices.find(x => tagKey(x) === tagKey(next)) || next : null;
  };
  const isOn = (tag: string) => hasTag(sel, tag);
  const toggle = (tag: string) => setSel(prev => (hasTag(prev, tag) ? prev.filter(x => tagKey(x) !== tagKey(tag)) : [...prev, tag]));
  const addTyped = (): string | null => {
    const tag = resolve(input);
    setInput('');
    if (!tag) return null;
    if (!hasTag(choices, tag)) setAdded(prev => [...prev, tag]);
    setSel(prev => withTag(prev, tag));
    return tag;
  };
  const pending = resolve(input);
  const final = pending && !isOn(pending) ? [...sel, pending] : sel;
  return {input, setInput, choices, isOn, toggle, addTyped, final};
};
