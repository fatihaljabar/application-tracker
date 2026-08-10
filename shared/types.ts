export const WORK_TYPE_VALUES = ['Remote', 'Hybrid', 'WFO'] as const;
export type WorkType = (typeof WORK_TYPE_VALUES)[number];
export const JOB_TYPE_VALUES = ['Full Time', 'Part Time', 'Internship', 'Contract'] as const;
export type JobType = (typeof JOB_TYPE_VALUES)[number];

export const STATUS_VALUES = [
  'wishlist',
  'applied',
  'screening',
  'hr_interview',
  'user_interview',
  'technical_test',
  'offer',
  'accepted',
  'rejected',
  'ghosted',
  'withdrawn',
] as const;
export type Status = (typeof STATUS_VALUES)[number];

export interface StatusEvent {
  status: Status;
  at: string;
}

export interface Application {
  id: string;
  company: string;
  position: string;
  department: string;
  location: string;
  workType: WorkType;
  jobType: JobType;
  salaryMin: number | null;
  salaryMax: number | null;
  source: string;
  url: string;
  appliedDate: string;
  deadline: string;
  recruiterName: string;
  recruiterEmail: string;
  recruiterPhone: string;
  notes: string;
  status: Status;
  tags: string[];
  documentIds: string[];
  archived: boolean;
  favorite: boolean;
  history: StatusEvent[];
  createdAt: string;
  updatedAt: string;
}

export const ACTIVITY_TYPE_VALUES = [
  'created',
  'status',
  'email',
  'interview',
  'test',
  'followup',
  'offer',
  'note',
  'document',
] as const;
export type ActivityType = (typeof ACTIVITY_TYPE_VALUES)[number];

export interface Activity {
  id: string;
  appId: string | null;
  type: ActivityType;
  title: string;
  description: string;
  date: string;
}

export const REMINDER_TYPE_VALUES = [
  'interview',
  'technical_test',
  'followup',
  'deadline',
  'cv_validity',
] as const;
export type ReminderType = (typeof REMINDER_TYPE_VALUES)[number];

export interface Reminder {
  id: string;
  appId: string | null;
  type: ReminderType;
  title: string;
  datetime: string;
  notes: string;
  done: boolean;
}

export const DOC_CATEGORY_VALUES = [
  'cv',
  'cover_letter',
  'portfolio',
  'certificate',
  'diploma',
  'transcript',
  'other',
] as const;
export type DocCategory = (typeof DOC_CATEGORY_VALUES)[number];

/**
 * Batas dokumen dari PRD § 6.7. Ditaruh di shared karena server MEMAKSAKANNYA
 * dan layar MENAMPILKANNYA — dua salinan angka yang sama suatu hari akan
 * berbeda, dan yang terlihat pengguna jadi berbeda dari yang ditolak server.
 *
 * Yang mengikat tetap pemeriksaan di server; angka di layar cuma kenyamanan.
 */
export const DOC_MAX_FILE_BYTES = 2 * 1024 * 1024;
export const DOC_MAX_TOTAL_BYTES = 20 * 1024 * 1024;
export const DOC_MAX_COUNT = 50;

export interface DocFile {
  id: string;
  name: string;
  label: string;
  group: string;
  category: DocCategory;
  language: 'id' | 'en' | '-';
  version: string;
  size: number;
  mime: string;
  dataUrl: string | null;
  uploadedAt: string;
  note: string;
}

export interface QA {
  /** Identitas stabil supaya React tidak salah memasangkan baris saat satu pasangan dihapus. */
  id: string;
  q: string;
  a: string;
}

export interface InterviewNote {
  id: string;
  appId: string;
  stage: string;
  date: string;
  qa: QA[];
  feedback: string;
  strengths: string;
  weaknesses: string;
  toLearn: string;
}

export interface Bookmark {
  id: string;
  company: string;
  position: string;
  url: string;
  source: string;
  deadline: string;
  note: string;
  favorite: boolean;
  savedAt: string;
}

export const PREP_STATUS_VALUES = ['not_started', 'research', 'preparing', 'ready'] as const;
export type PrepStatus = (typeof PREP_STATUS_VALUES)[number];

export interface CompanyWish {
  id: string;
  company: string;
  role: string;
  prep: PrepStatus;
  skills: string[];
  deadline: string;
  notes: string;
}

export interface Tag {
  name: string;
  color: string;
}

export interface Settings {
  theme: 'light' | 'dark';
  language: 'id' | 'en';
  timezone: string;
  weeklyTarget: number;
  monthlyTarget: number;
  emailNotif: boolean;
  dailyReminder: boolean;
  notifyEmail: string;
  cvValidDays: number;
}

export interface UserProfile {
  name: string;
  email: string;
  provider: 'google' | 'guest';
  avatar: string;
  since: string;
}

export interface DB {
  apps: Application[];
  activities: Activity[];
  reminders: Reminder[];
  docs: DocFile[];
  notes: InterviewNote[];
  bookmarks: Bookmark[];
  wishes: CompanyWish[];
  tags: Tag[];
  settings: Settings;
  user: UserProfile | null;
}
