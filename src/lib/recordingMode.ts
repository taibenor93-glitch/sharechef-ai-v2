// Recording mode: a hidden, per-device switch for capturing screen recordings
// of a cook. iOS leaves app audio out of screen recordings while the mic runs
// in its voice-processing ("call") mode, which is what echoCancellation turns
// on. Recording mode asks for a plain microphone instead. The mic is already
// muted while Micheli speaks (see queueAudio), so she still cannot hear herself.
// Off by default. A visible switch on the Preferences page, shown only to the
// accounts listed below (Supabase user ids, not secret).
const KEY = 'sc_recording_mode'
const ALLOWED_USER_IDS = new Set<string>(['5e4d1bc0-f20e-47ed-a225-a5c8aa29fd05'])

export function canUseRecordingMode(userId: string | null): boolean {
  return !!userId && ALLOWED_USER_IDS.has(userId)
}

export function isRecordingMode(): boolean {
  try {
    return localStorage.getItem(KEY) === '1'
  } catch {
    return false
  }
}

export function setRecordingMode(on: boolean): void {
  try {
    if (on) localStorage.setItem(KEY, '1')
    else localStorage.removeItem(KEY)
  } catch {
    /* ignore storage errors */
  }
}
