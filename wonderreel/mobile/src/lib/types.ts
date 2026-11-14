export type Style = 'Cinematic' | 'Animated' | 'Fantasy' | '3D' | 'Comic';
export const STYLES: Style[] = ['Cinematic', 'Animated', 'Fantasy', '3D', 'Comic'];

export type AspectRatio = '9:16' | '1:1' | '16:9';
export const ASPECTS: AspectRatio[] = ['9:16', '1:1', '16:9'];

export type Category =
  | 'Superhero' | 'Holiday' | 'Fantasy' | 'Space' | 'Action' | 'Adventure' | 'Comedy' | 'Travel';
export const CATEGORIES: Category[] = [
  'Superhero', 'Holiday', 'Fantasy', 'Space', 'Action', 'Adventure', 'Comedy', 'Travel',
];

export type Scene = {
  number: number;
  title: string;
  description: string;
  camera?: string;
  durationSec?: number;
};

/** Reusable, rights-safe story structure. It never contains anyone's face, voice or media. */
export type RemixTemplate = {
  templateId: string;
  title: string;
  category: Category;
  style: Style;
  prompt: string;
  scenes: Scene[];
  origin?: { postId: string; creatorHandle: string };
};

export type Storyboard = {
  title: string;
  theme: string;
  style: Style;
  prompt: string;
  scenes: Scene[];
  /** Where the plan came from. "local" = on-device planner, "ai" = server AI Director. */
  source: 'local' | 'ai';
};

export type MediaKind = 'image' | 'video';
export type LocalMedia = {
  uri: string;
  kind: MediaKind;
  mimeType: string;
  sizeBytes?: number;
  durationMs?: number;
  width?: number;
  height?: number;
  fileName?: string;
};

export type JobStatus =
  | 'queued' | 'processing' | 'output_review' | 'completed' | 'failed' | 'cancelled' | 'rejected';

export type GenerationKind = 'text_to_image' | 'image_edit' | 'image_to_video' | 'video_to_video';

export type GenerationJob = {
  id: string;
  kind: GenerationKind;
  status: JobStatus;
  createdAt: string;
  updatedAt: string;
  error?: string;
  outputUrl?: string;
  outputKind?: MediaKind;
  creditsReserved?: number;
};

export type ProjectStatus = 'draft' | 'generating' | 'ready' | 'pending_review' | 'published' | 'rejected';

export type Project = {
  id: string;
  title: string;
  prompt: string;
  style: Style;
  aspect: AspectRatio;
  storyboard: Storyboard | null;
  media: LocalMedia | null;
  jobs: GenerationJob[];
  status: ProjectStatus;
  family: boolean;
  remixOf?: RemixTemplate['origin'] & { templateId: string; title: string };
  allowRemix: boolean;
  createdAt: string;
  updatedAt: string;
  /** Set when synced to the cloud. */
  remoteId?: string;
};

export type FeedPost = {
  id: string;
  creatorId?: string;
  handle: string;
  avatarLetter: string;
  title: string;
  caption: string;
  tags: string[];
  likeCount: number;
  commentCount: number;
  posterKey?: string;
  posterUrl?: string;
  videoUrl?: string;
  aiGenerated: true;
  allowRemix: boolean;
  template?: RemixTemplate;
  remixedFrom?: { postId: string; handle: string };
  /** True for built-in illustrations that are not real user posts. */
  sample: boolean;
};

export type ChatMessage = { id: string; role: 'user' | 'director'; text: string };
