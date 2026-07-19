import { Button } from '@maka/ui';
import { workspaceInstructionStatusLabel } from './memory-settings-labels';
import type { MemorySettingsCopy } from '../locales/settings-memory-copy';

type WorkspaceInstructionState = Awaited<ReturnType<typeof window.maka.workspaceInstructions.getState>>;

export function WorkspaceInstructionsSection(props: {
  state: WorkspaceInstructionState | null;
  copy: MemorySettingsCopy;
  disabled: boolean;
  isActionPending(key: string): boolean;
  onOpen(file: string): void | Promise<void>;
  onCreate(file: string): void | Promise<void>;
}) {
  if (!props.state) return null;
  return (
    <div className="settingsMemoryPreview">
      <strong>{props.copy.detectedInstructions(props.state.detectedCount)}</strong>
      <small>{props.copy.instructionLimit(props.state.fileCharLimit)}</small>
      <div className="settingsConnectionMeta">
        {props.state.files.map((file) => (
          <span key={file.file} className="settingsInlineFileState">
            <span>{file.file} · {workspaceInstructionStatusLabel(file.status, file.chars, file.truncated, props.copy)}</span>
            {(file.status === 'available' || file.status === 'empty') && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="min-w-[4rem]"
                aria-label={props.copy.openInstructionAria(file.file)}
                disabled={props.disabled || props.isActionPending(`instruction:${file.file}:open`)}
                onClick={() => void props.onOpen(file.file)}
              >
                {props.isActionPending(`instruction:${file.file}:open`) ? props.copy.text.opening : props.copy.text.instructionOpen}
              </Button>
            )}
            {file.status === 'missing' && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="min-w-[4rem]"
                aria-label={props.copy.createInstructionAria(file.file)}
                disabled={props.disabled || props.isActionPending(`instruction:${file.file}:create`)}
                onClick={() => void props.onCreate(file.file)}
              >
                {props.isActionPending(`instruction:${file.file}:create`) ? props.copy.text.creating : props.copy.text.instructionCreate}
              </Button>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

export function MemoryPromptPreviewSection(props: {
  copy: MemorySettingsCopy;
  active: boolean;
  preview: string;
  budgetLabel: string;
  blockedReason: string;
  safeMode: boolean;
  copyPending: boolean;
  onCopy(): void | Promise<void>;
}) {
  return (
    <div className="settingsMemoryPromptPreview" data-active={props.active ? 'true' : 'false'}>
      <div className="settingsMemoryPromptPreviewHeader">
        <strong>{props.copy.text.promptPreview}</strong>
        <div>
          <span>{props.active ? props.copy.text.willInject : props.copy.text.willNotInject}</span>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            className="min-w-[5rem]"
            disabled={!props.preview || props.copyPending}
            onClick={() => void props.onCopy()}
          >
            {props.copyPending ? props.copy.text.copying : props.copy.text.copyContext}
          </Button>
        </div>
      </div>
      <small>{props.copy.text.promptPreviewHelp}</small>
      <small className="settingsMemoryPromptPreviewBudget">{props.budgetLabel}</small>
      {props.preview ? (
        <pre>{props.preview}</pre>
      ) : (
        <p>{props.safeMode ? props.copy.text.safeModePreview : props.copy.text.emptyPromptPreview}</p>
      )}
      {props.blockedReason && props.preview && <small>{props.blockedReason}</small>}
    </div>
  );
}
