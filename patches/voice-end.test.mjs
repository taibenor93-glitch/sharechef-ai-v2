import ts from 'typescript'
import vm from 'node:vm'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'
let source = readFileSync('src/voice/realtimeVoice.ts', 'utf8').replace(/^import .*$/gm, '').replace("import.meta.env.VITE_EVENTS_ENABLED === 'true'", 'false').replace('export class RealtimeVoice', 'class RealtimeVoice')
source += '\nglobalThis.Voice = RealtimeVoice'
const sockets = []
class Socket {
  static OPEN = 1
  readyState = 1
  sent = []
  constructor() { sockets.push(this) }
  send(x) { this.sent.push(JSON.parse(x)) }
  close() { this.readyState = 3 }
}
const context = vm.createContext({
  exports: {}, WebSocket: Socket, WS_BASE: '', voiceActivity() {},
  window: { sessionStorage: { getItem: () => 'guest-test' }, localStorage: { getItem: () => null }, setTimeout },
  navigator: {}, document: { visibilityState: 'hidden' }, console, clearTimeout,
})
vm.runInContext(ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText, context)
const statuses = []
const voice = new context.Voice({ onStatus: s => statuses.push(s), onError: () => {}, onTranscript: () => {} })
let resolveToken
voice.connect(() => new Promise(resolve => { resolveToken = resolve }))
const opening = sockets[0].onopen()
voice.disconnect()
resolveToken('token')
await opening
assert.equal(statuses.at(-1), 'idle')
assert.equal(sockets[0].sent.some(x => x.type === 'auth'), false)
console.log('PASS end during authentication cannot reactivate voice')
voice.connect()
let resolveMic
let stopped = false
context.navigator.mediaDevices = { getUserMedia: () => new Promise(resolve => { resolveMic = resolve }) }
const listening = voice.startListening()
voice.disconnect()
resolveMic({ getTracks: () => [{ stop() { stopped = true } }] })
await listening
assert.equal(stopped, true)
assert.equal(statuses.at(-1), 'idle')
console.log('PASS end during microphone permission stops late microphone stream')
assert.equal(sockets[1].onmessage, null)
console.log('PASS ended socket cannot deliver queued speech')
