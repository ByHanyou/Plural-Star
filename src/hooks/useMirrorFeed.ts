import {useCallback, useEffect, useRef, useState} from 'react';
import {NetworkManager} from '../network/NetworkManager';
import {MirrorCacheEntry, MirrorFeature, MirrorGroupsPayload, MirrorMember} from '../network/types';
import {mirrorMembersOf} from '../network/mirror/payload';
import {groupsDataOf} from '../network/mirror/view';
import {log, logError} from '../utils/log';

const MIRROR_WAIT_MS = 12000;

export type MirrorRequestState = 'idle' | 'sent' | 'failed';

export const useMirrorFeed = (visible: boolean, peerId: string, feature: MirrorFeature) => {
  const [entry, setEntry] = useState<MirrorCacheEntry | null>(null);
  const [memberCache, setMemberCache] = useState<MirrorMember[]>([]);
  const [memberMedia, setMemberMedia] = useState<Record<string, string>>({});
  const [groupCache, setGroupCache] = useState<MirrorGroupsPayload | null>(null);
  const [requesting, setRequesting] = useState<MirrorRequestState>('idle');
  const waitRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onlineRef = useRef(false);

  const reload = useCallback(async () => {
    const cache = await NetworkManager.loadMirror(peerId, feature);
    setEntry(cache);
    if (feature === 'journal' || feature === 'groups' || feature === 'history') {
      const mc = await NetworkManager.loadMirror(peerId, 'members');
      setMemberCache(mirrorMembersOf(mc?.data));
      setMemberMedia(mc?.media || {});
    }
    if (feature === 'members') {
      const gc = await NetworkManager.loadMirror(peerId, 'groups');
      setGroupCache(gc && !gc.none ? groupsDataOf(gc.data) : null);
    }
  }, [peerId, feature]);

  const request = useCallback(() => {
    setRequesting('sent');
    if (waitRef.current) clearTimeout(waitRef.current);
    waitRef.current = setTimeout(() => {
      waitRef.current = null;
      setRequesting(r => (r === 'sent' ? 'failed' : r));
    }, MIRROR_WAIT_MS);
    NetworkManager.requestMirror(peerId, feature).catch(e => {
      log.debug('mirror', e);
      setRequesting('failed');
    });
    if (feature === 'groups' || feature === 'history' || feature === 'journal') {
      NetworkManager.requestMirror(peerId, 'members').catch(e => log.debug('mirror', e));
    }
    if (feature === 'members') {
      NetworkManager.requestMirror(peerId, 'groups').catch(e => log.debug('mirror', e));
    }
  }, [peerId, feature]);

  useEffect(() => {
    if (!visible) return;
    const reloadLogged = () => { reload().catch(e => logError('mirror', e)); };
    setEntry(null);
    setGroupCache(null);
    reloadLogged();
    request();
    const unsub = NetworkManager.onMirrorUpdated((pid, feat) => {
      if (pid !== peerId) return;
      if (feat === feature) {
        if (waitRef.current) {
          clearTimeout(waitRef.current);
          waitRef.current = null;
        }
        setRequesting('idle');
        reloadLogged();
      } else if (feat === 'members' || (feature === 'members' && feat === 'groups')) {
        reloadLogged();
      }
    });
    const unsubNet = NetworkManager.subscribe(s => {
      const online = s.onlinePeers.includes(peerId);
      const was = onlineRef.current;
      onlineRef.current = online;
      if (online && !was) request();
    });
    return () => {
      unsub();
      unsubNet();
      if (waitRef.current) {
        clearTimeout(waitRef.current);
        waitRef.current = null;
      }
    };
  }, [visible, peerId, feature, reload, request]);

  return {entry, memberCache, memberMedia, groupCache, requesting, request};
};
