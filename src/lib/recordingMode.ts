// Owner allowlist for the in-app Record button (Supabase user ids, not secret).
// The button itself lives on Home and captures sound through the app's own
// sound tape (lib/soundTape) joined onto the ReplayKit video, so there is no
// per-device switch to set: recording sound always works. The old
// "Keep sound in screen recordings" switch was removed — it released and
// re-grabbed the microphone on every turn, which churned the iOS audio session
// and corrupted the audio, and it also disabled autoGainControl, iOS's
// automatic volume boost, which left the voice faint.
const ALLOWED_USER_IDS = new Set<string>(['5e4d1bc0-f20e-47ed-a225-a5c8aa29fd05'])

export function canUseRecordingMode(userId: string | null): boolean {
  return !!userId && ALLOWED_USER_IDS.has(userId)
}
