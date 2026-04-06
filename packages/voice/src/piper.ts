import { request } from 'undici';
import { createChildLogger } from '@nexus/shared';

const logger = createChildLogger('piper');

export class PiperClient {
  private readonly piperUrl: string;

  constructor(piperUrl: string) {
    this.piperUrl = piperUrl.replace(/\/$/, '');
  }

  async synthesize(text: string, voice?: string): Promise<Buffer> {
    const url = new URL(this.piperUrl);
    if (voice) {
      url.searchParams.set('voice', voice);
    }

    logger.debug({ url: url.toString(), voice }, 'Synthesizing text to speech');

    const response = await request(url.toString(), {
      method: 'POST',
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
      },
      body: text,
    });

    if (response.statusCode < 200 || response.statusCode >= 300) {
      const errorBody = await response.body.text();
      logger.error(
        { statusCode: response.statusCode, body: errorBody },
        'Piper TTS synthesis failed',
      );
      throw new Error(
        `Piper TTS synthesis failed with status ${response.statusCode}: ${errorBody}`,
      );
    }

    const arrayBuffer = await response.body.arrayBuffer();
    const audioBuffer = Buffer.from(arrayBuffer);
    logger.debug({ bytes: audioBuffer.length }, 'TTS synthesis complete');
    return audioBuffer;
  }
}
