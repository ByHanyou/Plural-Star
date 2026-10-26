import React, {useState} from 'react';
import {GroupBrowsePane} from './systemManager/GroupBrowsePane';
import {GroupTreeEditor} from './systemManager/GroupTreeEditor';

interface Props {
  onViewMember?: (id: string) => void;
  startBrowsing?: boolean;
  header?: React.ReactNode;
  hideRootTitle?: boolean;
}

export const SystemManagerScreen = ({onViewMember, startBrowsing, header, hideRootTitle}: Props) => {
  const [browse, setBrowse] = useState(!!startBrowsing);
  if (browse) {
    return <GroupBrowsePane header={header} hideRootTitle={hideRootTitle} onViewMember={onViewMember} onEdit={() => setBrowse(false)} />;
  }
  return <GroupTreeEditor header={header} onBrowse={() => setBrowse(true)} />;
};
