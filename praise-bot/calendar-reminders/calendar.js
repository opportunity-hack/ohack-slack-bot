'use strict';
const ical = require('node-ical');

/*
 * Accept any of the ways people copy a Google Calendar reference and reduce
 * it to the bare calendar ID (e.g. c_…@group.calendar.google.com):
 *   - the ID itself (possibly URL-encoded, %40 for @)
 *   - a share link: https://calendar.google.com/calendar/u/0?cid=<base64url of ID>
 *   - an embed link: …/embed?src=<ID>
 *   - an ICS link: …/calendar/ical/<ID>/public/basic.ics
 */
function normalizeCalendarId(input) {
  if (!input) return input;
  let value = String(input).trim();

  if (/^https?:\/\//i.test(value)) {
    try {
      const url = new URL(value);
      const cid = url.searchParams.get('cid');
      const src = url.searchParams.get('src');
      const icalMatch = url.pathname.match(/\/calendar\/ical\/([^/]+)\//);
      if (cid) {
        // cid is base64url-encoded (unpadded) — decode to the real ID
        const b64 = cid.replace(/-/g, '+').replace(/_/g, '/');
        const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
        const decoded = Buffer.from(padded, 'base64').toString('utf8');
        if (decoded.includes('@')) value = decoded;
      } else if (src) {
        value = src;
      } else if (icalMatch) {
        value = decodeURIComponent(icalMatch[1]);
      }
    } catch (_) { /* fall through with the raw value */ }
  }

  try { value = decodeURIComponent(value); } catch (_) {}
  return value;
}

function icsUrl(calendarId) {
  return `https://calendar.google.com/calendar/ical/${encodeURIComponent(normalizeCalendarId(calendarId))}/public/basic.ics`;
}

// node-ical keys recurrence overrides/exclusions by YYYY-MM-DD (UTC)
function dateKey(date) {
  return date.toISOString().substring(0, 10);
}

function toOccurrence(ev, start, durationMs) {
  return {
    uid: ev.uid,
    summary: (ev.summary || 'Untitled event').trim(),
    start,
    end: new Date(start.getTime() + durationMs),
    description: ev.description || '',
    location: ev.location || '',
    conferenceUrl: ev['GOOGLE-CONFERENCE'] || '',
  };
}

/*
 * Expand parsed VEVENTs (including recurring ones) into concrete occurrences
 * whose start time falls within [windowStart, windowEnd]. Skips all-day
 * events and cancelled events. Honors EXDATE exclusions and per-occurrence
 * RECURRENCE-ID overrides.
 */
function occurrencesBetween(events, windowStart, windowEnd) {
  const out = [];
  for (const ev of Object.values(events)) {
    if (ev.type !== 'VEVENT') continue;
    if (ev.datetype === 'date') continue; // all-day events aren't reminder-worthy
    if (String(ev.status || '').toUpperCase() === 'CANCELLED') continue;

    const durationMs = Math.max(0, (ev.end?.getTime() || 0) - (ev.start?.getTime() || 0));

    if (ev.rrule) {
      // Expand a day wide on each side, then filter — overrides can shift times
      const dates = ev.rrule.between(
        new Date(windowStart.getTime() - 86400000),
        new Date(windowEnd.getTime() + 86400000),
        true
      );
      for (const date of dates) {
        const key = dateKey(date);
        let occ = ev;
        let start = date;
        if (ev.recurrences && ev.recurrences[key]) {
          occ = ev.recurrences[key];
          start = occ.start;
          if (String(occ.status || '').toUpperCase() === 'CANCELLED') continue;
        } else if (ev.exdate && ev.exdate[key]) {
          continue;
        }
        if (start >= windowStart && start <= windowEnd) {
          out.push(toOccurrence(occ, start, durationMs));
        }
      }
    } else if (ev.start && ev.start >= windowStart && ev.start <= windowEnd) {
      out.push(toOccurrence(ev, ev.start, durationMs));
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

async function getUpcomingEvents(calendarId, windowStart, windowEnd) {
  const events = await ical.async.fromURL(icsUrl(calendarId));
  return occurrencesBetween(events, windowStart, windowEnd);
}

module.exports = { getUpcomingEvents, occurrencesBetween, icsUrl, normalizeCalendarId };
