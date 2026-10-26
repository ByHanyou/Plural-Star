import {useCallback, useEffect, useRef, useState} from 'react';
import {ImportControl, ImportProgress} from '../../import/progress';

const DEFAULT_PHASES = 6;

export const useImportProgress = () => {
  const [restoring, setRestoring] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const controlRef = useRef<ImportControl | null>(null);

  const reset = useCallback(() => {
    controlRef.current = null;
    setProgress(null);
  }, []);

  const setRestoreProgress = useCallback((p: ImportProgress | string) => {
    if (typeof p !== 'string') {
      setProgressText(p.label);
      setProgress(p);
      return;
    }
    setProgressText(p);
    if (!p) {
      controlRef.current = null;
      setProgress(null);
      return;
    }
    if (!controlRef.current) {
      const c = new ImportControl(setRestoreProgress);
      c.plan(DEFAULT_PHASES);
      controlRef.current = c;
    }
    controlRef.current.beginFromLabel(p);
  }, []);

  const arm = useCallback((control: ImportControl, phases: number) => (v: boolean) => {
    if (v) {
      controlRef.current = control;
      setProgress({label: '', phase: 0, phases});
    }
    setRestoring(v);
  }, []);

  useEffect(() => {
    if (!restoring) reset();
  }, [restoring, reset]);

  return {restoring, progress, progressText, controlRef, setRestoreProgress, arm, reset};
};

export type ImportProgressState = ReturnType<typeof useImportProgress>;
