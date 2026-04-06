import * as fs from 'node:fs';
import * as path from 'node:path';
import type { NexusTool } from '@nexus/shared';

function isPathAllowed(filePath: string, allowedPaths: string[]): boolean {
  const resolved = path.resolve(filePath);
  return allowedPaths.some((allowed) => {
    const resolvedAllowed = path.resolve(allowed);
    return resolved === resolvedAllowed || resolved.startsWith(resolvedAllowed + path.sep);
  });
}

export function createFsTools(allowedPaths: string[]): NexusTool[] {
  const fsRead: NexusTool = {
    name: 'fs_read',
    description: 'Read the contents of a file at the given path. Only files within the allowed paths can be read.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The absolute or relative path to the file to read',
        },
      },
      required: ['path'],
    },
    async execute(args: Record<string, unknown>): Promise<unknown> {
      const filePath = args['path'] as string;

      if (!filePath || typeof filePath !== 'string') {
        return 'Error: path parameter is required and must be a string';
      }

      if (!isPathAllowed(filePath, allowedPaths)) {
        return `Error: Access denied. Path '${filePath}' is not within the allowed paths: ${allowedPaths.join(', ')}`;
      }

      try {
        const content = fs.readFileSync(path.resolve(filePath), 'utf-8');
        return content;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return `Error reading file: ${message}`;
      }
    },
  };

  const fsWrite: NexusTool = {
    name: 'fs_write',
    description: 'Write content to a file at the given path. Creates the file and any missing parent directories. Only files within the allowed paths can be written.',
    parameters: {
      type: 'object',
      properties: {
        path: {
          type: 'string',
          description: 'The absolute or relative path to the file to write',
        },
        content: {
          type: 'string',
          description: 'The content to write to the file',
        },
      },
      required: ['path', 'content'],
    },
    async execute(args: Record<string, unknown>): Promise<unknown> {
      const filePath = args['path'] as string;
      const content = args['content'] as string;

      if (!filePath || typeof filePath !== 'string') {
        return 'Error: path parameter is required and must be a string';
      }

      if (content === undefined || content === null) {
        return 'Error: content parameter is required';
      }

      if (!isPathAllowed(filePath, allowedPaths)) {
        return `Error: Access denied. Path '${filePath}' is not within the allowed paths: ${allowedPaths.join(', ')}`;
      }

      try {
        const resolvedPath = path.resolve(filePath);
        const dir = path.dirname(resolvedPath);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(resolvedPath, String(content), 'utf-8');
        return `Successfully wrote ${String(content).length} characters to ${resolvedPath}`;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return `Error writing file: ${message}`;
      }
    },
  };

  return [fsRead, fsWrite];
}
