import { generateText, tool } from 'ai';
import { z } from 'zod';
import type { NormalizedMessage, ModelRoute, OrchestratorResult } from '@nexus/shared';
import { createChildLogger } from '@nexus/shared';
import { ProviderRegistry } from '@nexus/providers';
import { ToolRegistry } from '@nexus/tools';
import { ConversationManager } from '@nexus/memory';
import { VoicePipeline } from '@nexus/voice';

const logger = createChildLogger('orchestrator');

export class AgentOrchestrator {
  constructor(
    private providers: ProviderRegistry,
    private tools: ToolRegistry,
    private memory: ConversationManager,
    private voice: VoicePipeline,
  ) {}

  async process(message: NormalizedMessage, route: ModelRoute, persona: string): Promise<OrchestratorResult> {
    // 1. Handle voice: transcribe if voice attachment exists
    let textToProcess = message.text;
    if (message.attachments.some(a => a.type === 'voice') && this.voice.isSTTAvailable()) {
      const voiceAttachment = message.attachments.find(a => a.type === 'voice' && a.buffer);
      if (voiceAttachment?.buffer) {
        textToProcess = await this.voice.speechToText(voiceAttachment.buffer, voiceAttachment.mimeType);
        if (!textToProcess) {
          return { text: 'Sorry, I could not transcribe your voice message. Please try again or type your message.' };
        }
      }
    }

    // 2. Get conversation context
    const context = this.memory.getContext(message.userId, message.channel, persona);

    // 3. Save the user message
    this.memory.addUserMessage(message.userId, message.channel, textToProcess);

    // 4. Build messages array for LLM
    const messages = [
      ...context.turns.map(turn => ({
        role: turn.role as 'user' | 'assistant' | 'system',
        content: turn.content,
      })),
      { role: 'user' as const, content: textToProcess },
    ];

    // 5. Get the model from provider registry
    const model = this.providers.getModelForRoute(route);
    if (!model) {
      return { text: 'No AI model is currently available. Please check your provider configuration.' };
    }

    // 6. Build AI SDK tools map if the route supports tools
    const aiTools: Record<string, any> = {};
    if (route.supportsTools) {
      for (const nexusTool of this.tools.getEnabled()) {
        aiTools[nexusTool.name] = tool({
          description: nexusTool.description,
          parameters: this.buildZodSchema(nexusTool.parameters),
          execute: async (args) => nexusTool.execute(args),
        });
      }
    }

    // 7. Call generateText
    try {
      const result = await generateText({
        model,
        system: persona,
        messages,
        tools: Object.keys(aiTools).length > 0 ? aiTools : undefined,
        maxSteps: route.supportsTools ? (route.intent === 'AGENTIC' ? 10 : 5) : 1,
        maxTokens: route.maxTokens,
        temperature: route.temperature,
        onStepFinish({ toolCalls, toolResults }) {
          if (toolCalls && toolCalls.length > 0) {
            logger.info({ tools: toolCalls.map((tc: { toolName: string }) => tc.toolName) }, 'Tool call executed');
          }
        },
      });

      const responseText = result.text || 'I processed your request but have no text response.';

      // 8. Save assistant response to memory
      this.memory.addAssistantMessage(message.userId, message.channel, responseText);

      // 9. If the inbound message was voice AND TTS is available, synthesize audio
      if (message.attachments.some(a => a.type === 'voice') && this.voice.isTTSAvailable()) {
        try {
          const audioBuffer = await this.voice.textToSpeech(responseText);
          return { text: responseText, audio: audioBuffer, audioMimeType: 'audio/wav' };
        } catch (err) {
          logger.warn({ err }, 'TTS synthesis failed, returning text-only response');
        }
      }

      return { text: responseText };
    } catch (err) {
      logger.error({ err, route, userId: message.userId }, 'LLM generation failed');
      // Never expose internal error details to the user
      return { text: 'I encountered an issue processing your request. Please try again in a moment.' };
    }
  }

  // Convert the JSON Schema-style parameters to a Zod schema for AI SDK
  private buildZodSchema(parameters: Record<string, unknown>): z.ZodType {
    const props = (parameters as any).properties || {};
    const required = new Set((parameters as any).required || []);

    const shape: Record<string, z.ZodType> = {};
    for (const [key, schema] of Object.entries(props)) {
      const s = schema as any;
      let zodType: z.ZodType;

      if (s.enum) {
        zodType = z.enum(s.enum as [string, ...string[]]);
      } else if (s.type === 'number') {
        zodType = z.number();
      } else if (s.type === 'boolean') {
        zodType = z.boolean();
      } else {
        zodType = z.string();
      }

      if (s.description) {
        zodType = zodType.describe(s.description);
      }

      if (!required.has(key)) {
        zodType = zodType.optional();
      }

      shape[key] = zodType;
    }

    return z.object(shape);
  }
}
