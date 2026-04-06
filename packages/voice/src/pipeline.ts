import { createChildLogger } from '@nexus/shared';
import { WhisperClient } from './whisper.js';
import { PiperClient } from './piper.js';

const logger = createChildLogger('voice-pipeline');

export class VoicePipeline {
  private readonly whisper?: WhisperClient;
  private readonly piper?: PiperClient;

  constructor(whisper?: WhisperClient, piper?: PiperClient) {
    this.whisper = whisper;
    this.piper = piper;
  }

  async speechToText(audioBuffer: Buffer, mimeType: string): Promise<string> {
    if (!this.whisper) {
      logger.warn('STT requested but WhisperClient is not configured');
      return '';
    }
    logger.debug({ mimeType, bytes: audioBuffer.length }, 'Running speech-to-text');
    const text = await this.whisper.transcribe(audioBuffer, mimeType);
    logger.debug({ text }, 'Speech-to-text complete');
    return text;
  }

  async textToSpeech(text: string, voice?: string): Promise<Buffer> {
    if (!this.piper) {
      logger.warn('TTS requested but PiperClient is not configured');
      throw new Error('PiperClient is not configured');
    }
    logger.debug({ voice, textLength: text.length }, 'Running text-to-speech');
    const audio = await this.piper.synthesize(text, voice);
    logger.debug({ bytes: audio.length }, 'Text-to-speech complete');
    return audio;
  }

  isSTTAvailable(): boolean {
    return this.whisper !== undefined;
  }

  isTTSAvailable(): boolean {
    return this.piper !== undefined;
  }
}
