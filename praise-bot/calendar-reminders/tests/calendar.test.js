'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const ical = require('node-ical');
const { occurrencesBetween } = require('../calendar');
const {
  stripHtml, truncate, reminderKey, buildReminderText,
  buildAddToCalendarUrl, buildSubscribeUrl,
} = require('../render');

const FIXTURE_ICS = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'BEGIN:VEVENT',
  'DTSTART;TZID=America/Phoenix:20260612T130500',
  'DTEND;TZID=America/Phoenix:20260612T133000',
  'RRULE:FREQ=WEEKLY;WKST=SU;UNTIL=20260801T065959Z;BYDAY=FR',
  'UID:weekly-office-hours@test',
  'X-GOOGLE-CONFERENCE:https://meet.google.com/abc-defg-hij',
  'SUMMARY:Office Hours [weekly]',
  'STATUS:CONFIRMED',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART:20260715T170000Z',
  'DTEND:20260715T180000Z',
  'UID:one-off@test',
  'SUMMARY:One-off Kickoff',
  'STATUS:CONFIRMED',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART;VALUE=DATE:20260715',
  'DTEND;VALUE=DATE:20260716',
  'UID:all-day@test',
  'SUMMARY:All Day Thing',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'DTSTART:20260715T190000Z',
  'DTEND:20260715T200000Z',
  'UID:cancelled@test',
  'SUMMARY:Cancelled Meeting',
  'STATUS:CANCELLED',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

function parsed() {
  return ical.sync.parseICS(FIXTURE_ICS);
}

test('occurrencesBetween: expands weekly recurrence to Friday 1:05 PM Phoenix (20:05 UTC)', () => {
  const occs = occurrencesBetween(parsed(), new Date('2026-07-17T20:00:00Z'), new Date('2026-07-17T20:15:00Z'));
  assert.equal(occs.length, 1);
  assert.equal(occs[0].summary, 'Office Hours [weekly]');
  assert.equal(occs[0].start.toISOString(), '2026-07-17T20:05:00.000Z');
  assert.equal(occs[0].end.toISOString(), '2026-07-17T20:30:00.000Z');
  assert.equal(occs[0].conferenceUrl, 'https://meet.google.com/abc-defg-hij');
});

test('occurrencesBetween: no occurrence outside the window', () => {
  const occs = occurrencesBetween(parsed(), new Date('2026-07-17T20:06:00Z'), new Date('2026-07-17T20:21:00Z'));
  assert.equal(occs.length, 0);
});

test('occurrencesBetween: recurrence stops after UNTIL', () => {
  const occs = occurrencesBetween(parsed(), new Date('2026-08-07T00:00:00Z'), new Date('2026-08-08T00:00:00Z'));
  assert.equal(occs.length, 0);
});

test('occurrencesBetween: includes one-off, skips all-day and cancelled', () => {
  const occs = occurrencesBetween(parsed(), new Date('2026-07-15T00:00:00Z'), new Date('2026-07-16T00:00:00Z'));
  assert.deepEqual(occs.map(o => o.summary), ['One-off Kickoff']);
});

test('stripHtml: removes tags and decodes entities', () => {
  assert.equal(
    stripHtml('<p>Agenda: <a href="https://x.dev">doc</a></p><br>Q&amp;A&nbsp;time'),
    'Agenda: doc Q&A time'
  );
});

test('truncate: cuts at word boundary with ellipsis', () => {
  assert.equal(truncate('one two three', 8), 'one two…');
  assert.equal(truncate('short', 8), 'short');
});

test('reminderKey: unique per occurrence of the same UID', () => {
  const a = { uid: 'x', start: new Date('2026-07-17T20:05:00Z') };
  const b = { uid: 'x', start: new Date('2026-07-24T20:05:00Z') };
  assert.notEqual(reminderKey(a), reminderKey(b));
  assert.equal(reminderKey(a), reminderKey({ ...a }));
});

test('buildReminderText: includes summary, minutes, meet link, and schedule link', () => {
  const occ = {
    uid: 'x',
    summary: 'Office Hours',
    start: new Date('2026-07-17T20:05:00Z'),
    end: new Date('2026-07-17T20:30:00Z'),
    description: '<p>Bring questions!</p>',
    conferenceUrl: 'https://meet.google.com/abc-defg-hij',
    location: '',
  };
  const text = buildReminderText(occ, new Date('2026-07-17T19:53:00Z'), 'https://www.ohack.dev/office-hours', 'cal-id@group.calendar.google.com');
  assert.match(text, /\*Office Hours\* starts in ~12 minutes/);
  assert.match(text, /<!date\^1784318700\^\{time\}\|2026-07-17 20:05 UTC>/);
  assert.match(text, /> Bring questions!/);
  assert.match(text, /https:\/\/meet\.google\.com\/abc-defg-hij/);
  assert.match(text, /\|Add to your calendar>/);
  assert.match(text, /\|Subscribe to all events>/);
  assert.match(text, /<https:\/\/www\.ohack\.dev\/office-hours\|Full schedule>/);
});

test('buildAddToCalendarUrl: pre-fills title, UTC times, and meet link', () => {
  const occ = {
    summary: 'Office Hours',
    start: new Date('2026-07-17T20:05:00Z'),
    end: new Date('2026-07-17T20:30:00Z'),
    description: '<p>Bring questions!</p>',
    conferenceUrl: 'https://meet.google.com/abc-defg-hij',
    location: '',
  };
  const url = new URL(buildAddToCalendarUrl(occ, 'https://www.ohack.dev/office-hours'));
  assert.equal(url.searchParams.get('action'), 'TEMPLATE');
  assert.equal(url.searchParams.get('text'), 'Office Hours');
  assert.equal(url.searchParams.get('dates'), '20260717T200500Z/20260717T203000Z');
  assert.equal(url.searchParams.get('location'), 'https://meet.google.com/abc-defg-hij');
  assert.match(url.searchParams.get('details'), /Bring questions!/);
});

test('buildSubscribeUrl: encodes calendar ID', () => {
  assert.equal(
    buildSubscribeUrl('c_abc@group.calendar.google.com'),
    'https://calendar.google.com/calendar/render?cid=c_abc%40group.calendar.google.com'
  );
});

test('buildReminderText: falls back to location when no conference URL', () => {
  const occ = {
    uid: 'x',
    summary: 'In-person Meetup',
    start: new Date('2026-07-17T20:05:00Z'),
    end: new Date('2026-07-17T21:05:00Z'),
    description: '',
    conferenceUrl: '',
    location: 'ASU Tempe Campus',
  };
  const text = buildReminderText(occ, new Date('2026-07-17T20:04:30Z'), '');
  assert.match(text, /starts in ~1 minute /);
  assert.match(text, /ASU Tempe Campus/);
  assert.doesNotMatch(text, /Full schedule/);
});

// --- normalizeCalendarId: accept IDs, share links, embed links, ICS links ---
const { normalizeCalendarId, icsUrl } = require('../calendar');

test('normalizeCalendarId reduces every pasted form to the bare ID', () => {
  const realId = 'c_15c6f25ddc611081a1c59ef917c647fb48a58ae716916c5792eede6a2236ed10@group.calendar.google.com';
  const cid = Buffer.from(realId, 'utf8').toString('base64').replace(/=+$/, '');

  assert.equal(normalizeCalendarId(realId), realId);
  assert.equal(normalizeCalendarId(realId.replace('@', '%40')), realId);
  assert.equal(normalizeCalendarId(`https://calendar.google.com/calendar/u/0?cid=${cid}`), realId);
  assert.equal(normalizeCalendarId(`https://calendar.google.com/calendar/embed?src=${realId}`), realId);
  assert.equal(
    normalizeCalendarId(`https://calendar.google.com/calendar/ical/${realId.replace('@', '%40')}/public/basic.ics`),
    realId);
  // icsUrl uses the normalized value
  assert.ok(icsUrl(`https://calendar.google.com/calendar/u/0?cid=${cid}`)
    .includes(encodeURIComponent(realId)));
});
