import type { ReactNode } from 'react';

export type AgentChatInputStatus = 'ready' | 'submitted' | 'streaming' | 'error';

export type AgentChatInputOption = {
  id: string;
  label: string;
  description?: string;
};

export type AgentChatSkill = AgentChatInputOption & {
  icon?: ReactNode;
};

export type AgentChatAgent = AgentChatInputOption & {
  icon?: ReactNode;
};

/** One way the composer creates, such as Agent mode or plain image generation. */
export type AgentChatMode = {
  id: string;
  label: string;
  icon?: ReactNode;
  /** A short tag after the label, such as "即将上线" on a mode that is not open yet. */
  badge?: string;
};

/** A skill listed in the composer's skill library. */
export type AgentChatLibrarySkill = {
  id: string;
  label: string;
  description: string;
  icon?: ReactNode;
  /** A small example of what the skill makes. */
  image?: string;
};

export type AgentChatAttachment = {
  id: string;
  name: string;
  type?: string;
  size?: number;
  file?: File;
  url?: string;
};

export type AgentChatQueuedMessage = {
  id: string;
  text: string;
  actionLabel?: string;
  disabled?: boolean;
};

export type AgentChatSubmitPayload = {
  text: string;
  model: string;
  reasoning: string;
  speed: string;
  agent: string;
  skillIds: string[];
  attachments: AgentChatAttachment[];
};

export type AgentChatInputClassNames = {
  root?: string;
  textarea?: string;
  toolbar?: string;
  menu?: string;
};

export interface AgentChatInputProps {
  value?: string;
  defaultValue?: string;
  onValueChange?: (value: string) => void;
  onSubmit?: (payload: AgentChatSubmitPayload) => void;
  onStop?: () => void;
  status?: AgentChatInputStatus;
  placeholder?: string;
  streamingPlaceholders?: readonly string[];
  ariaLabel?: string;
  submitLabel?: string;
  submitContent?: ReactNode;
  disabled?: boolean;
  autoFocus?: boolean;
  minRows?: number;
  maxRows?: number;
  submitOnEnter?: boolean;
  clearOnSubmit?: boolean;
  models?: readonly AgentChatInputOption[];
  model?: string;
  defaultModel?: string;
  onModelChange?: (model: string) => void;
  reasoningLevels?: readonly AgentChatInputOption[];
  reasoning?: string;
  defaultReasoning?: string;
  onReasoningChange?: (reasoning: string) => void;
  speedModes?: readonly AgentChatInputOption[];
  speed?: string;
  defaultSpeed?: string;
  onSpeedChange?: (speed: string) => void;
  agents?: readonly AgentChatAgent[];
  agent?: string;
  defaultAgent?: string;
  onAgentChange?: (agent: string) => void;
  skills?: readonly AgentChatSkill[];
  /** Rendered at the top of the input's surface, above the text. */
  header?: ReactNode;
  skillIds?: readonly string[];
  defaultSkillIds?: readonly string[];
  onSkillIdsChange?: (skillIds: string[]) => void;
  attachments?: readonly AgentChatAttachment[];
  defaultAttachments?: readonly AgentChatAttachment[];
  onAttachmentsChange?: (attachments: AgentChatAttachment[]) => void;
  queuedMessages?: readonly AgentChatQueuedMessage[];
  defaultQueuedMessages?: readonly AgentChatQueuedMessage[];
  onQueuedMessagesChange?: (messages: AgentChatQueuedMessage[]) => void;
  onQueuedMessageSteer?: (message: AgentChatQueuedMessage) => void;
  onQueuedMessageRemove?: (message: AgentChatQueuedMessage) => void;
  onQueuedMessageEdit?: (message: AgentChatQueuedMessage) => void;
  onVoiceClick?: () => void;
  allowFileUpload?: boolean;
  acceptedFileTypes?: string;
  /** Most reference images, shown under the add tile as "n/limit". */
  attachmentLimit?: number;
  /** Modes at the start of the toolbar; the page decides what each one does. */
  modes?: readonly AgentChatMode[];
  mode?: string;
  onModeChange?: (mode: string) => void;
  /** Skills in the toolbar's skill library; picking one hands its id to the page. */
  librarySkills?: readonly AgentChatLibrarySkill[];
  onLibrarySkillSelect?: (skillId: string) => void;
  /** Where the composer's panels open: below it on the homepage, above it at the foot of a page. */
  menuSide?: 'top' | 'bottom';
  /** A short note beside the send button, such as how a run is billed. */
  submitNote?: ReactNode;
  toolbarContent?: ReactNode;
  className?: string;
  classNames?: AgentChatInputClassNames;
}
