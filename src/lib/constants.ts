import type { DocCategory, PrepStatus, ReminderType, Status } from '@shared/types';

export const STATUSES: { key: Status; color: string; dot: string }[] = [
  { key: 'wishlist', color: '#9a958b', dot: '#b4afa4' },
  { key: 'applied', color: '#5b7fa6', dot: '#7d9dbd' },
  { key: 'screening', color: '#6f7fb5', dot: '#8e9cc9' },
  { key: 'hr_interview', color: '#8a72b0', dot: '#a692c5' },
  { key: 'user_interview', color: '#a6708f', dot: '#c08ea9' },
  { key: 'technical_test', color: '#b58a52', dot: '#cba473' },
  { key: 'offer', color: '#3f8f74', dot: '#63ab92' },
  { key: 'accepted', color: '#2f7d55', dot: '#4f9d75' },
  { key: 'rejected', color: '#b06565', dot: '#c68484' },
  { key: 'ghosted', color: '#8b8b8b', dot: '#a5a5a5' },
  { key: 'withdrawn', color: '#7a7a86', dot: '#9a9aa5' },
];

export const STATUS_KEYS = STATUSES.map((s) => s.key);

/** Progression order used for funnel statistics. */
export const FUNNEL_ORDER: Status[] = [
  'wishlist',
  'applied',
  'screening',
  'hr_interview',
  'user_interview',
  'technical_test',
  'offer',
  'accepted',
];

export const TERMINAL: Status[] = ['rejected', 'ghosted', 'withdrawn'];

export const statusMeta = (s: Status) =>
  STATUSES.find((x) => x.key === s) ?? STATUSES[0];

export const WORK_TYPES = ['Remote', 'Hybrid', 'WFO'] as const;
export const JOB_TYPES = ['Full Time', 'Part Time', 'Internship', 'Contract'] as const;

export const SOURCES = [
  'LinkedIn',
  'Jobstreet',
  'Glints',
  'Kalibrr',
  'Website Perusahaan',
  'Referral',
  'Instagram',
  'Telegram',
  'Job Fair',
  'Lainnya',
];

export const DOC_CATEGORIES: DocCategory[] = [
  'cv',
  'cover_letter',
  'portfolio',
  'certificate',
  'diploma',
  'transcript',
  'other',
];

export const REMINDER_TYPES: ReminderType[] = [
  'interview',
  'technical_test',
  'followup',
  'deadline',
  'cv_validity',
];

export const REMINDER_ICON: Record<ReminderType, string> = {
  interview: 'fi-rr-comment-alt',
  technical_test: 'fi-rr-file-invoice',
  followup: 'fi-rr-paper-plane',
  deadline: 'fi-rr-clock',
  cv_validity: 'fi-rr-document',
};

export const PREP_STATUSES: PrepStatus[] = ['not_started', 'research', 'preparing', 'ready'];

export const TIMEZONES = [
  'Asia/Jakarta',
  'Asia/Makassar',
  'Asia/Jayapura',
  'Asia/Singapore',
  'Asia/Kuala_Lumpur',
  'Asia/Tokyo',
  'Europe/London',
  'America/New_York',
  'UTC',
];

export const DEFAULT_TAGS = [
  { name: 'Dream Company', color: '#3f8f74' },
  { name: 'Remote', color: '#5b7fa6' },
  { name: 'Startup', color: '#b58a52' },
  { name: 'BUMN', color: '#a6708f' },
  { name: 'Fresh Graduate', color: '#6f7fb5' },
  { name: 'Referral', color: '#8a72b0' },
  { name: 'High Priority', color: '#b06565' },
];

export const ACTIVITY_ICON: Record<string, string> = {
  created: 'fi-rr-square-plus',
  status: 'fi-rr-refresh',
  email: 'fi-rr-envelope',
  interview: 'fi-rr-comment-alt',
  test: 'fi-rr-file-invoice',
  followup: 'fi-rr-paper-plane',
  offer: 'fi-rr-badge-check',
  note: 'fi-rr-notebook',
  document: 'fi-rr-document',
};
