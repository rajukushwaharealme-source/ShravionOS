export type ReminderSettings = {
  enabled: boolean;
  soundEnabled: boolean;
  vibrationEnabled: boolean;
  preDeadlineMinutes: number | null;
  dailyReminderHour: number | null;
};

export type ReminderPayload = {
  id?: string;
  title: string;
  body: string;
  tag?: string;
};

export const DEFAULT_REMINDER_SETTINGS: ReminderSettings = {
  enabled: true,
  soundEnabled: true,
  vibrationEnabled: false,
  preDeadlineMinutes: 15,
  dailyReminderHour: 9
};

export const REMINDER_SETTINGS_EVENT = 'shravion:reminder-settings-updated';
export const REMINDER_NOTIFY_EVENT = 'shravion:reminder-notify';
export const ACTIVE_FOCUS_TIMER_STORAGE_KEY = 'focusApp.activeTimer.v1';
const REMINDER_SOUND_PATH = '/sounds/reminder.mp3';

let reminderAudio: HTMLAudioElement | null = null;
let reminderAudioUnlocked = false;

const getReminderAudio = () => {
  if (typeof window === 'undefined') return null;
  if (!reminderAudio) {
    reminderAudio = new Audio(REMINDER_SOUND_PATH);
    reminderAudio.preload = 'auto';
    reminderAudio.volume = 0.45;
    reminderAudio.loop = false;
  }

  return reminderAudio;
};

const unlockReminderAudio = () => {
  if (reminderAudioUnlocked) return;

  const audio = getReminderAudio();
  if (!audio) return;

  const previousVolume = audio.volume;
  audio.volume = 0;
  audio.currentTime = 0;
  audio.play()
    .then(() => {
      audio.pause();
      audio.currentTime = 0;
      audio.volume = previousVolume;
      reminderAudioUnlocked = true;
    })
    .catch(() => {
      audio.volume = previousVolume;
    });
};

if (typeof window !== 'undefined') {
  const setupAudioUnlock = () => {
    unlockReminderAudio();
    window.removeEventListener('pointerdown', setupAudioUnlock);
    window.removeEventListener('keydown', setupAudioUnlock);
    window.removeEventListener('touchstart', setupAudioUnlock);
  };

  window.addEventListener('pointerdown', setupAudioUnlock, { once: true });
  window.addEventListener('keydown', setupAudioUnlock, { once: true });
  window.addEventListener('touchstart', setupAudioUnlock, { once: true });
}

const getSettingsKey = (uid: string) => `shravion.reminderSettings.${uid}.v1`;

export const normalizeReminderSettings = (value: any): ReminderSettings => ({
  enabled: typeof value?.enabled === 'boolean' ? value.enabled : DEFAULT_REMINDER_SETTINGS.enabled,
  soundEnabled: typeof value?.soundEnabled === 'boolean' ? value.soundEnabled : DEFAULT_REMINDER_SETTINGS.soundEnabled,
  vibrationEnabled: typeof value?.vibrationEnabled === 'boolean' ? value.vibrationEnabled : DEFAULT_REMINDER_SETTINGS.vibrationEnabled,
  preDeadlineMinutes: value?.preDeadlineMinutes === null
    ? null
    : Number.isFinite(Number(value?.preDeadlineMinutes))
    ? Math.min(60, Math.max(5, Math.floor(Number(value.preDeadlineMinutes))))
    : DEFAULT_REMINDER_SETTINGS.preDeadlineMinutes,
  dailyReminderHour: value?.dailyReminderHour === null
    ? null
    : Number.isFinite(Number(value?.dailyReminderHour))
    ? Math.min(20, Math.max(6, Math.floor(Number(value.dailyReminderHour))))
    : DEFAULT_REMINDER_SETTINGS.dailyReminderHour
});

export const readReminderSettings = (uid: string): ReminderSettings => {
  if (typeof window === 'undefined') return DEFAULT_REMINDER_SETTINGS;

  try {
    const raw = window.localStorage.getItem(getSettingsKey(uid));
    return normalizeReminderSettings(raw ? JSON.parse(raw) : null);
  } catch {
    return DEFAULT_REMINDER_SETTINGS;
  }
};

export const saveReminderSettings = (uid: string, settings: ReminderSettings) => {
  if (typeof window === 'undefined') return;

  window.localStorage.setItem(getSettingsKey(uid), JSON.stringify(normalizeReminderSettings(settings)));
  window.dispatchEvent(new CustomEvent(REMINDER_SETTINGS_EVENT, { detail: { uid, settings } }));
};

export const requestReminderNotification = (payload: ReminderPayload) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(REMINDER_NOTIFY_EVENT, { detail: payload }));
};

export const playReminderSound = async () => {
  const audio = getReminderAudio();
  if (!audio) return;

  try {
    audio.pause();
    audio.currentTime = 0;
    audio.loop = false;
    audio.volume = 0.45;
    await audio.play();
  } catch (error) {
    console.debug('Reminder sound could not play', error);
  }
};
