// In-app screen recorder (native ReplayKit plugin, ios/App/App/ScreenRecorderPlugin.swift).
// Shown only to owner accounts (same list as recording mode), iPhone app only.
import { Capacitor, registerPlugin } from '@capacitor/core'

interface ScreenRecorderPlugin {
  start(options: { microphone: boolean }): Promise<{ recording: boolean }>
  stop(): Promise<{ recording: boolean }>
  isRecording(): Promise<{ recording: boolean }>
}

export const ScreenRecorder = registerPlugin<ScreenRecorderPlugin>('ScreenRecorder')

export function canRecordInApp(): boolean {
  return Capacitor.getPlatform() === 'ios'
}
