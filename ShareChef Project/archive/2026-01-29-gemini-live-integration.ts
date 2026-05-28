/**
 * Gemini Live Integration
 * Real-time bidirectional voice conversation with Gemini AI
 * 
 * Features:
 * - WebSocket-based streaming audio
 * - Natural interruptions and turn-taking
 * - High-quality voice synthesis
 * - Continuous conversation mode
 */

export type GeminiLiveConfig = {
    apiKey: string;
    systemInstruction?: string;
    voiceConfig?: {
        voiceName?: string; // e.g., "Puck", "Charon", "Kore", "Fenrir", "Aoede"
    };
    onConnected?: () => void;
    onDisconnected?: () => void;
    onError?: (error: string) => void;
    onUserSpeaking?: (isListening: boolean) => void;
    onAssistantSpeaking?: (isResponding: boolean) => void;
    onTranscript?: (text: string, isFinal: boolean, isUser: boolean) => void;
};

export class GeminiLiveSession {
    private ws: WebSocket | null = null;
    private audioContext: AudioContext | null = null;
    private mediaStream: MediaStream | null = null;
    private audioWorkletNode: AudioWorkletNode | null = null;
    private config: GeminiLiveConfig;
    private isConnected = false;
    private reconnectAttempts = 0;
    private maxReconnectAttempts = 3;

    constructor(config: GeminiLiveConfig) {
        this.config = config;
    }

    /**
     * Start the Gemini Live session
     */
    async start(): Promise<void> {
        try {
            // Initialize audio context
            this.audioContext = new AudioContext({ sampleRate: 16000 });
            
            // Request microphone access
            this.mediaStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                    sampleRate: 16000,
                    channelCount: 1,
                }
            });

            // Connect to Gemini Live WebSocket
            await this.connectWebSocket();

            // Set up audio processing
            await this.setupAudioProcessing();

            this.isConnected = true;
            this.config.onConnected?.();
            
        } catch (error) {
            const message = error instanceof Error ? error.message : 'Failed to start session';
            this.config.onError?.(message);
            throw error;
        }
    }

    /**
     * Stop the session and clean up resources
     */
    async stop(): Promise<void> {
        this.isConnected = false;

        // Close WebSocket
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }

        // Stop audio processing
        if (this.audioWorkletNode) {
            this.audioWorkletNode.disconnect();
            this.audioWorkletNode = null;
        }

        // Stop media stream
        if (this.mediaStream) {
            this.mediaStream.getTracks().forEach(track => track.stop());
            this.mediaStream = null;
        }

        // Close audio context
        if (this.audioContext) {
            await this.audioContext.close();
            this.audioContext = null;
        }

        this.config.onDisconnected?.();
    }

    /**
     * Send a text message (for hybrid text/voice mode)
     */
    sendText(text: string): void {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            this.config.onError?.('Not connected');
            return;
        }

        this.ws.send(JSON.stringify({
            client_content: {
                turns: [{
                    role: 'user',
                    parts: [{ text }]
                }],
                turn_complete: true
            }
        }));
    }

    /**
     * Interrupt the assistant (stop current response)
     */
    interrupt(): void {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        this.ws.send(JSON.stringify({
            client_content: {
                turn_complete: true
            }
        }));
    }

    private async connectWebSocket(): Promise<void> {
        return new Promise((resolve, reject) => {
            const wsUrl = `wss://generativelanguage.googleapis.com/ws/google.ai.generativelanguage.v1alpha.GenerativeService.BidiGenerateContent?key=${this.config.apiKey}`;
            
            this.ws = new WebSocket(wsUrl);
            this.ws.binaryType = 'arraybuffer';

            this.ws.onopen = () => {
                console.log('[Gemini Live] WebSocket connected');
                
                // Send setup message
                const setupMessage = {
                    setup: {
                        model: 'models/gemini-2.0-flash-exp',
                        generation_config: {
                            response_modalities: ['AUDIO'],
                            speech_config: {
                                voice_config: {
                                    prebuilt_voice_config: {
                                        voice_name: this.config.voiceConfig?.voiceName || 'Puck'
                                    }
                                }
                            }
                        },
                        ...(this.config.systemInstruction && {
                            system_instruction: {
                                parts: [{ text: this.config.systemInstruction }]
                            }
                        })
                    }
                };

                this.ws!.send(JSON.stringify(setupMessage));
                this.reconnectAttempts = 0;
                resolve();
            };

            this.ws.onerror = (error) => {
                console.error('[Gemini Live] WebSocket error:', error);
                reject(new Error('WebSocket connection failed'));
            };

            this.ws.onclose = () => {
                console.log('[Gemini Live] WebSocket closed');
                this.handleDisconnect();
            };

            this.ws.onmessage = (event) => {
                this.handleServerMessage(event.data);
            };

            // Timeout after 10 seconds
            setTimeout(() => {
                if (this.ws?.readyState !== WebSocket.OPEN) {
                    reject(new Error('WebSocket connection timeout'));
                }
            }, 10000);
        });
    }

    private async setupAudioProcessing(): Promise<void> {
        if (!this.audioContext || !this.mediaStream) {
            throw new Error('Audio context or media stream not initialized');
        }

        // Create audio worklet for processing
        const source = this.audioContext.createMediaStreamSource(this.mediaStream);
        
        // Create script processor for now (worklet would be better but more complex)
        const processor = this.audioContext.createScriptProcessor(4096, 1, 1);
        
        processor.onaudioprocess = (event) => {
            if (!this.isConnected || !this.ws || this.ws.readyState !== WebSocket.OPEN) {
                return;
            }

            const inputData = event.inputBuffer.getChannelData(0);
            
            // Convert Float32Array to Int16Array (PCM16)
            const pcm16 = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) {
                const s = Math.max(-1, Math.min(1, inputData[i]));
                pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
            }

            // Send audio to Gemini
            this.sendAudioChunk(pcm16.buffer);
        };

        source.connect(processor);
        processor.connect(this.audioContext.destination);
    }

    private sendAudioChunk(audioData: ArrayBuffer): void {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;

        // Convert to base64
        const base64Audio = this.arrayBufferToBase64(audioData);

        this.ws.send(JSON.stringify({
            realtime_input: {
                media_chunks: [{
                    mime_type: 'audio/pcm',
                    data: base64Audio
                }]
            }
        }));
    }

    private handleServerMessage(data: string | ArrayBuffer): void {
        try {
            let message: any;
            
            if (typeof data === 'string') {
                message = JSON.parse(data);
            } else {
                // Handle binary data (audio response)
                this.playAudioResponse(data);
                return;
            }

            // Handle setup complete
            if (message.setupComplete) {
                console.log('[Gemini Live] Setup complete');
                return;
            }

            // Handle server content (text transcripts, audio, etc.)
            if (message.serverContent) {
                const content = message.serverContent;

                // Handle model turn (assistant speaking)
                if (content.modelTurn) {
                    const parts = content.modelTurn.parts || [];
                    
                    parts.forEach((part: any) => {
                        // Text transcript from assistant
                        if (part.text) {
                            this.config.onTranscript?.(part.text, true, false);
                        }

                        // Audio from assistant
                        if (part.inlineData) {
                            this.playInlineAudio(part.inlineData.data);
                        }
                    });

                    this.config.onAssistantSpeaking?.(true);
                }

                // Handle turn complete
                if (content.turnComplete) {
                    this.config.onAssistantSpeaking?.(false);
                }

                // Handle grounding metadata, interrupted flag, etc.
                if (content.interrupted) {
                    console.log('[Gemini Live] Turn interrupted');
                    this.config.onAssistantSpeaking?.(false);
                }
            }

            // Handle tool calls (if using function calling)
            if (message.toolCall) {
                console.log('[Gemini Live] Tool call:', message.toolCall);
            }

        } catch (error) {
            console.error('[Gemini Live] Error handling message:', error);
        }
    }

    private playInlineAudio(base64Audio: string): void {
        try {
            // Decode base64 to ArrayBuffer
            const binaryString = atob(base64Audio);
            const bytes = new Uint8Array(binaryString.length);
            for (let i = 0; i < binaryString.length; i++) {
                bytes[i] = binaryString.charCodeAt(i);
            }

            // Play the audio
            this.playAudioResponse(bytes.buffer);
        } catch (error) {
            console.error('[Gemini Live] Error playing audio:', error);
        }
    }

    private async playAudioResponse(audioData: ArrayBuffer): Promise<void> {
        if (!this.audioContext) return;

        try {
            const audioBuffer = await this.audioContext.decodeAudioData(audioData);
            const source = this.audioContext.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(this.audioContext.destination);
            source.start();

            this.config.onAssistantSpeaking?.(true);
            
            source.onended = () => {
                this.config.onAssistantSpeaking?.(false);
            };
        } catch (error) {
            console.error('[Gemini Live] Error playing audio:', error);
        }
    }

    private handleDisconnect(): void {
        if (!this.isConnected) return;

        this.isConnected = false;
        this.config.onDisconnected?.();

        // Attempt reconnection
        if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`[Gemini Live] Reconnecting... (${this.reconnectAttempts}/${this.maxReconnectAttempts})`);
            
            setTimeout(() => {
                this.start().catch(err => {
                    console.error('[Gemini Live] Reconnection failed:', err);
                });
            }, 2000 * this.reconnectAttempts);
        } else {
            this.config.onError?.('Connection lost. Please try again.');
        }
    }

    private arrayBufferToBase64(buffer: ArrayBuffer): string {
        const bytes = new Uint8Array(buffer);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return btoa(binary);
    }

    isActive(): boolean {
        return this.isConnected && this.ws?.readyState === WebSocket.OPEN;
    }
}
