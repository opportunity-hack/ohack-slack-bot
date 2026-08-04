'use strict';

// Google Calendar descriptions arrive as HTML; reduce to compact plain text.
function stripHtml(html) {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<\/(p|li|ul|ol|div)>/gi, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;?/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
}

function truncate(text, max) {
  if (text.length <= max) return text;
  return `${text.slice(0, max).replace(/\s+\S*$/, '')}…`;
}

// Unique key for one occurrence of an event (recurring events share a UID)
function reminderKey(occ) {
  return `${occ.uid}:${occ.start.toISOString()}`;
}

// 20260717T200500Z — the compact UTC format Google Calendar URLs expect
function gcalDate(date) {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
}

// Pre-filled "create event" dialog in the viewer's own Google Calendar
function buildAddToCalendarUrl(occ, eventsPageUrl) {
  const details = [
    truncate(stripHtml(occ.description), 400),
    occ.conferenceUrl ? `Join: ${occ.conferenceUrl}` : '',
    eventsPageUrl ? `Full schedule: ${eventsPageUrl}` : '',
  ].filter(Boolean).join('\n\n');
  const params = new URLSearchParams({
    action: 'TEMPLATE',
    text: occ.summary,
    dates: `${gcalDate(occ.start)}/${gcalDate(occ.end)}`,
    details,
    location: occ.conferenceUrl || occ.location || '',
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

// Prompt to subscribe to the whole public calendar (all future events)
function buildSubscribeUrl(calendarId) {
  return `https://calendar.google.com/calendar/render?cid=${encodeURIComponent(calendarId)}`;
}

/*
 * Build the Slack reminder message. Uses Slack's <!date> token so each
 * reader sees the start time in their own timezone.
 */
function buildReminderText(occ, now, eventsPageUrl, calendarId) {
  const unix = Math.floor(occ.start.getTime() / 1000);
  const minutes = Math.max(1, Math.round((occ.start.getTime() - now.getTime()) / 60000));
  const fallback = occ.start.toISOString().replace('T', ' ').substring(0, 16) + ' UTC';

  const lines = [
    `:calendar: *${occ.summary}* starts in ~${minutes} minute${minutes === 1 ? '' : 's'} ` +
      `(<!date^${unix}^{time}|${fallback}>).`,
  ];

  const snippet = truncate(stripHtml(occ.description), 200);
  if (snippet) lines.push(`> ${snippet}`);

  if (occ.conferenceUrl) {
    lines.push(`:movie_camera: Join: ${occ.conferenceUrl}`);
  } else if (occ.location) {
    lines.push(`:round_pushpin: ${occ.location}`);
  }

  const links = [`<${buildAddToCalendarUrl(occ, eventsPageUrl)}|Add to your calendar>`];
  if (calendarId) links.push(`<${buildSubscribeUrl(calendarId)}|Subscribe to all events>`);
  if (eventsPageUrl) links.push(`<${eventsPageUrl}|Full schedule>`);
  lines.push(`:link: ${links.join(' · ')}`);

  return lines.join('\n');
}

module.exports = {
  stripHtml, truncate, reminderKey, buildReminderText,
  buildAddToCalendarUrl, buildSubscribeUrl,
};
