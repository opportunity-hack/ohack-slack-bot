'use strict';
const config = {
  // Public Google Calendar ID — read via its public ICS feed, no API key needed.
  // Default is the Opportunity Hack public calendar (ohack.dev/office-hours).
  calendarId: process.env.CALENDAR_ID
    || 'c_15c6f25ddc611081a1c59ef917c647fb48a58ae716916c5792eede6a2236ed10@group.calendar.google.com',
  // Comma-separated Slack channel names or IDs to notify (e.g. "general,volunteers")
  channels: (process.env.CALENDAR_CHANNELS || 'general')
    .split(',').map(s => s.trim().replace(/^#/, '')).filter(Boolean),
  // How many minutes before an event starts to post the reminder
  leadMinutes: parseInt(process.env.CALENDAR_LEAD_MINUTES || '15', 10),
  // How often to poll the calendar for upcoming events
  pollCron: process.env.CALENDAR_POLL_CRON || '*/5 * * * *',
  // Where people can see the full schedule
  eventsPageUrl: process.env.CALENDAR_EVENTS_URL || 'https://www.ohack.dev/office-hours',
  dryRun: process.env.CALENDAR_DRY_RUN === '1',
};
module.exports = config;
