import React from 'react';
import {View, Animated} from 'react-native';
import {Text} from '../../components/AppText';
import {Avatar} from '../../components/Avatar';
import {useTheme} from '../../themeContext';
import {Member, Relationship, RelationshipTypeDef} from '../../utils';
import {HALF, MapNode, WORLD} from './layout';
import {relColorOf} from './MapParts';

const AVATAR_NODE_CAP = 250;
const LABEL_NODE_CAP = 600;

export const MapCanvas = ({nodes, nodesById, rels, memberById, typeById, selectedId, isLit, isDimmed, colorAll, tx, ty, scale}: {
  nodes: MapNode[]; nodesById: Map<string, MapNode>; rels: Relationship[]; memberById: Map<string, Member>; typeById: Map<string, RelationshipTypeDef>;
  selectedId: string | null; isLit: (a: string, b: string) => boolean; isDimmed: (id: string) => boolean; colorAll: boolean;
  tx: Animated.Value; ty: Animated.Value; scale: Animated.Value;
}) => {
  const T = useTheme();
  const showAvatar = nodes.length <= AVATAR_NODE_CAP;
  const showLabel = nodes.length <= LABEL_NODE_CAP;
  return (
    <View pointerEvents="none" style={{position: 'absolute', left: '50%', top: '50%', width: 0, height: 0}}>
      <Animated.View style={{position: 'absolute', left: -HALF, top: -HALF, width: WORLD, height: WORLD, transform: [{translateX: tx}, {translateY: ty}, {scale}]}}>
        {rels.map(r => {
          const a = nodesById.get(r.fromId);
          const b = nodesById.get(r.toId);
          if (!a || !b) return null;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const len = Math.hypot(dx, dy) || 1;
          const lit = isLit(r.fromId, r.toId);
          return (
            <View key={r.id} style={{
              position: 'absolute',
              left: HALF + (a.x + b.x) / 2 - len / 2,
              top: HALF + (a.y + b.y) / 2 - (lit ? 1.5 : 1),
              width: len,
              height: lit ? 3 : 2,
              borderRadius: 1.5,
              backgroundColor: lit || colorAll ? relColorOf(typeById.get(r.typeId)) : T.dim,
              opacity: selectedId ? (lit ? 0.95 : 0.06) : 0.3,
              transform: [{rotateZ: `${Math.atan2(dy, dx)}rad`}],
            }} />
          );
        })}
        {nodes.map(node => {
          const m = memberById.get(node.id);
          if (!m) return null;
          const isSel = node.id === selectedId;
          const size = node.r * 2;
          return (
            <View key={node.id} style={{position: 'absolute', left: HALF + node.x - node.r, top: HALF + node.y - node.r, opacity: isDimmed(node.id) ? 0.25 : m.archived ? 0.55 : 1}}>
              {showAvatar ? (
                <View style={{width: size, height: size, borderRadius: node.r, borderWidth: isSel ? 3 : 2, borderColor: isSel ? T.accent : m.color, backgroundColor: T.card, alignItems: 'center', justifyContent: 'center', overflow: 'hidden'}}>
                  <Avatar member={m} size={size - 4} />
                </View>
              ) : (
                <View style={{width: size, height: size, borderRadius: node.r, borderWidth: isSel ? 3 : 0, borderColor: T.accent, backgroundColor: m.color}} />
              )}
              {showLabel && (
                <Text numberOfLines={1} style={{position: 'absolute', width: 90, left: node.r - 45, top: size + 2, textAlign: 'center', fontSize: 9, color: isSel ? T.accent : T.dim}}>{m.name}</Text>
              )}
            </View>
          );
        })}
      </Animated.View>
    </View>
  );
};
