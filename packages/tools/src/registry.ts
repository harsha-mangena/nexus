import type { NexusTool } from '@nexus/shared';
import webSearch from './web-search.js';
import httpFetch from './http-fetch.js';
import { createFsTools } from './fs-tools.js';
import runCode from './run-code.js';
import datetime from './datetime.js';
import calculator from './calculator.js';
import slack from './slack.js';
import github from './github.js';

export class ToolRegistry {
  private readonly tools = new Map<string, NexusTool>();
  private readonly enabledNames: Set<string>;

  constructor(enabledNames: string[], private readonly allowedPaths: string[] = []) {
    this.enabledNames = new Set(enabledNames);
  }

  register(tool: NexusTool): void {
    this.tools.set(tool.name, tool);
  }

  get(name: string): NexusTool | undefined {
    return this.tools.get(name);
  }

  getAll(): NexusTool[] {
    return Array.from(this.tools.values());
  }

  getEnabled(): NexusTool[] {
    return Array.from(this.tools.values()).filter((tool) => this.enabledNames.has(tool.name));
  }

  static createDefaultTools(enabledNames: string[], allowedPaths: string[] = []): ToolRegistry {
    const registry = new ToolRegistry(enabledNames, allowedPaths);

    // Register all built-in tools
    registry.register(webSearch);
    registry.register(httpFetch);
    registry.register(runCode);
    registry.register(datetime);
    registry.register(calculator);
    registry.register(slack);
    registry.register(github);

    // Register filesystem tools (require allowedPaths)
    if (allowedPaths.length > 0) {
      for (const fsTool of createFsTools(allowedPaths)) {
        registry.register(fsTool);
      }
    }

    return registry;
  }
}
