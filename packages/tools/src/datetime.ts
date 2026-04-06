import type { NexusTool } from '@nexus/shared';

const datetime: NexusTool = {
  name: 'datetime',
  description: 'Get the current date and time, optionally formatted for a specific timezone. Useful for answering questions about the current time, date, day of the week, etc.',
  parameters: {
    type: 'object',
    properties: {
      timezone: {
        type: 'string',
        description: 'IANA timezone identifier (e.g. "America/New_York", "Europe/London", "Asia/Tokyo"). Defaults to UTC.',
      },
      format: {
        type: 'string',
        enum: ['full', 'date', 'time', 'iso'],
        description: 'Output format: "full" (date + time), "date" (date only), "time" (time only), "iso" (ISO 8601). Defaults to "full".',
      },
    },
    required: [],
  },
  async execute(args: Record<string, unknown>): Promise<unknown> {
    const timezone = (args['timezone'] as string | undefined) ?? 'UTC';
    const format = (args['format'] as string | undefined) ?? 'full';

    const now = new Date();

    // Validate timezone
    try {
      Intl.DateTimeFormat(undefined, { timeZone: timezone });
    } catch {
      return `Error: Invalid timezone '${timezone}'. Use an IANA timezone identifier like 'America/New_York' or 'Europe/London'.`;
    }

    if (format === 'iso') {
      // Return ISO string adjusted to the requested timezone offset
      const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone: timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false,
      });

      const parts = formatter.formatToParts(now);
      const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';

      const year = get('year');
      const month = get('month');
      const day = get('day');
      const hour = get('hour');
      const minute = get('minute');
      const second = get('second');

      return `${year}-${month}-${day}T${hour}:${minute}:${second} (${timezone})`;
    }

    const dateOptions: Intl.DateTimeFormatOptions = {
      timeZone: timezone,
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    };

    const timeOptions: Intl.DateTimeFormatOptions = {
      timeZone: timezone,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: true,
      timeZoneName: 'short',
    };

    if (format === 'date') {
      return new Intl.DateTimeFormat('en-US', dateOptions).format(now);
    }

    if (format === 'time') {
      return new Intl.DateTimeFormat('en-US', timeOptions).format(now);
    }

    // 'full' — combine date and time
    const datePart = new Intl.DateTimeFormat('en-US', dateOptions).format(now);
    const timePart = new Intl.DateTimeFormat('en-US', timeOptions).format(now);
    return `${datePart} at ${timePart}`;
  },
};

export default datetime;
