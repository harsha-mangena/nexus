import { request } from 'undici';
import { createChildLogger } from '@nexus/shared';

const logger = createChildLogger('whisper');

export class WhisperClient {
  private readonly whisperUrl: string;

  constructor(whisperUrl: string) {
    this.whisperUrl = whisperUrl.replace(/\/$/, '');
  }

  async transcribe(audioBuffer: Buffer, mimeType: string): Promise<string> {
    try {
      const boundary = `----NexusBoundary${Date.now()}`;

      const ext = mimeType.split('/')[1] ?? 'wav';
      const filename = `audio.${ext}`;

      const preamble = Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="audio_file"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`,
        'utf8',
      );
      const epilogue = Buffer.from(`\r\n--${boundary}--\r\n`, 'utf8');
      const body = Buffer.concat([preamble, audioBuffer, epilogue]);

      logger.debug({ url: `${this.whisperUrl}/inference`, mimeType }, 'Transcribing audio');

      const response = await request(`${this.whisperUrl}/inference`, {
        method: 'POST',
        headers: {
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
          'Content-Length': String(body.length),
        },
        body,
      });

      if (response.statusCode < 200 || response.statusCode >= 300) {
        const text = await response.body.text();
        logger.error({ statusCode: response.statusCode, body: text }, 'Whisper inference failed');
        return '';
      }

      const data = (await response.body.json()) as { text?: string };
      const transcription = (data.text ?? '').trim();
      logger.debug({ transcription }, 'Transcription complete');
      return transcription;
    } catch (err) {
      logger.error({ err }, 'Error transcribing audio');
      return '';
    }
  }
}
