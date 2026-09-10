import {
  FileArchiveIcon,
  FileAudioIcon,
  FileIcon,
  FileTextIcon,
  FileVideoIcon,
  ImageIcon,
  type LucideIcon,
} from "lucide-react";

import type { FileKind } from "@/services/attachments/fileMeta";

// Own module so AttachmentsSection and AttachmentPreview can both import it without a cycle.
export const KIND_ICONS: Record<FileKind, LucideIcon> = {
  image: ImageIcon,
  video: FileVideoIcon,
  audio: FileAudioIcon,
  pdf: FileTextIcon,
  archive: FileArchiveIcon,
  text: FileTextIcon,
  file: FileIcon,
};
