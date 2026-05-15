/** Meeting-related types */

export type MeetingStatus = 'scheduled' | 'in_progress' | 'completed';

export interface SpeakerInfo {
  label: string;
  language: 'ja' | 'vi';
}

export interface SpeakerMapping {
  [speakerId: string]: SpeakerInfo;
}

export interface Meeting {
  id: string;
  projectId: string;
  userId: string;
  title: string;
  status: MeetingStatus;
  startedAt?: string;
  endedAt?: string;
  audioPath?: string;
  speakerMapping: SpeakerMapping;
  createdAt: string;
  updatedAt: string;
}

export interface Project {
  id: string;
  userId: string;
  name: string;
  description?: string;
  clientName?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectInput {
  name: string;
  description?: string;
  clientName?: string;
}

export interface CreateMeetingInput {
  title: string;
  projectId: string;
}
