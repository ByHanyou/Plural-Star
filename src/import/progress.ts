import type {TFunction} from 'i18next';

/**
 * Import progress + safe-stop control.
 *
 * Every import path already announced its phase with `setRestoreProgress('some
 * label')`. That still works — the setter accepts a plain string — but a phase
 * can now also carry a position, which is what lets the wait screen show a bar
 * that means something instead of an animation that doesn't.
 *
 * Honest progress only: the bar advances one step per COMPLETED phase, and
 * within the few genuinely slow phases (avatar/banner downloads, chat channels)
 * it fills by their real done/total. Phases that are a single store.set finish
 * instantly and simply tick over.
 */
export interface ImportProgress {
  label: string;
  /** Phases finished so far. */
  phase: number;
  /** Total phases this run intends to do. 0 = unknown, bar renders indeterminate. */
  phases: number;
  /** Position inside the current phase, when it is countable. */
  done?: number;
  total?: number;
  /** True once the user has asked to stop; the run finishes the current phase first. */
  stopping?: boolean;
}

export type ProgressSetter = (p: ImportProgress | string) => void;

/** Thrown at a phase boundary when the user asked to stop. Not an error state. */
export class ImportStopped extends Error {
  /** Phases that finished and were kept, so the catch can say so without the control. */
  readonly completedCount: number;
  constructor(completedCount = 0) {
    super('import stopped by user');
    this.name = 'ImportStopped';
    this.completedCount = completedCount;
  }
}

export const isImportStopped = (e: any): boolean => e?.name === 'ImportStopped';

/**
 * Cancel here means "stop at the next phase boundary", never "abort mid-write".
 * Imports write as they go, so tearing out of the middle of a phase would leave
 * a member list half-saved. The run checks `shouldStop()` between phases and
 * reports what it managed to finish.
 */
export class ImportControl {
  private cancelled = false;
  private phaseIndex = 0;
  private phaseCount = 0;
  private currentLabel = '';
  /** Phase labels that completed before a stop, for the summary. */
  readonly completed: string[] = [];

  constructor(private setProgress: ProgressSetter) {}

  /** Declare how many phases this run will attempt, so the bar can be honest. */
  plan(phaseCount: number): void {
    this.phaseCount = Math.max(0, phaseCount);
    this.phaseIndex = 0;
  }

  /** Start a phase. Returns false if the user asked to stop — caller should return. */
  begin(label: string): boolean {
    if (this.cancelled) return false;
    this.currentLabel = label;
    this.emit();
    return true;
  }

  /** Position inside the phase in flight (used by the media loops). */
  step(done: number, total: number, label?: string): void {
    if (label) this.currentLabel = label;
    this.emit(done, total);
  }

  /** Phase finished cleanly. */
  end(): void {
    if (this.currentLabel) this.completed.push(this.currentLabel);
    this.phaseIndex = Math.min(this.phaseIndex + 1, this.phaseCount || this.phaseIndex + 1);
    this.emit();
  }

  /**
   * Every importer already announces its phases by calling
   * setRestoreProgress('some label'). Route those through here and each new
   * label becomes a counted phase — so paths that were never edited still get a
   * moving bar, and a stop request lands on the ONLY safe boundary they expose:
   * the moment they announce the next phase.
   *
   * Throws ImportStopped, which the importer's own top-level catch turns into a
   * clean exit. Nothing is interrupted mid-write, because a label is only
   * announced between units of work.
   */
  beginFromLabel(label: string): void {
    if (label && label !== this.currentLabel) {
      if (this.currentLabel) this.end();
      this.currentLabel = label;
      this.emit();
    }
    if (this.cancelled) throw new ImportStopped(this.completed.length);
  }

  /** Checked at phase boundaries. */
  shouldStop(): boolean {
    return this.cancelled;
  }

  /** From the Cancel button. Does not interrupt the phase in flight. */
  requestStop(): void {
    this.cancelled = true;
    this.emit();
  }

  get stopped(): boolean {
    return this.cancelled;
  }

  private emit(done?: number, total?: number): void {
    this.setProgress({
      label: this.currentLabel,
      phase: this.phaseIndex,
      phases: this.phaseCount,
      done,
      total,
      stopping: this.cancelled,
    });
  }
}

/**
 * 0..1 for the bar. Returns null when there is nothing honest to show.
 * Clamped to 0.95 while phases remain, and again if a run announces more phases
 * than it planned — a bar that sits at 100% while work continues is a lie.
 */
export const progressFraction = (p: ImportProgress | null): number | null => {
  if (!p || p.phases <= 0) return null;
  const inner = p.total && p.total > 0 ? Math.min(1, Math.max(0, (p.done || 0) / p.total)) : 0;
  const value = (p.phase + inner) / p.phases;
  return Math.min(0.95, Math.max(0, value));
};

/** Message shown after a safe stop, naming what did and did not land. */
export const stoppedSummary = (control: ImportControl, t: TFunction): string =>
  t('share.importStopped', {
    defaultValue:
      'Import stopped. {{count}} step(s) finished and were saved; the remaining steps were not run.',
    count: control.completed.length,
  });
