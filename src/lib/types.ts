export type WorkType = 'Remote' | 'Hybrid' | 'WFO';
export type JobType = 'Full Time' | 'Part Time' | 'Internship' | 'Contract';

export type Status =
  | 'wishlist'
  | 'applied'
  | 'screening'
  | 'hr_interview'
  | 'user_interview'
  | 'technical_test'
  | 'offer'
  | 'accepted'
  | 'rejected'
  | 'ghosted'
  | 'withdrawn';

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

export type ActivityType =
  | 'created'
  | 'status'
  | 'email'
  | 'interview'
  | 'test'
  | 'followup'
  | 'offer'
  | 'note'
  | 'document';

export interface Activity {
  id: string;
  appId: string | null;
  type: ActivityType;
  title: string;
  description: string;
  date: string;
}

export type ReminderType =
  | 'interview'
  | 'technical_test'
  | 'followup'
  | 'deadline'
  | 'cv_validity';

export interface Reminder {
  id: string;
  appId: string | null;
  type: ReminderType;
  title: string;
  datetime: string;
  notes: string;
  done: boolean;
}

export type DocCategory =
  | 'cv'
  | 'cover_letter'
  | 'portfolio'
  | 'certificate'
  | 'diploma'
  | 'transcript'
  | 'other';

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

export type PrepStatus = 'not_started' | 'research' | 'preparing' | 'ready';

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
