// Recording mode: a hidden, per-device switch for capturing screen recordings
// of a cook. iOS leaves app audio out of screen recordings while the mic runs
// in its voice-processing ("call") mode, which is what echoCancellation turns
// on. Recording mode asks for a plain microphone instead. The mic is already
// muted while Micheli speaks (see queueAudio), so she still cannot hear herself.
// Off by default. Toggle: tap the Preferences page title five times.
const KEY = 'sc_recording_mode'

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
