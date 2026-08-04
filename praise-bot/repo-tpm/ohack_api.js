'use strict';
const config = require('./config');

async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
  return res.json();
}

async function getHackathon(eventId = config.eventId) {
  const data = await fetchJson(`${config.ohackApiBase}/api/messages/hackathons`);
  const hackathons = Array.isArray(data) ? data : data.hackathons || [];
  const h = hackathons.find(h => h.event_id === eventId);
  if (!h) throw new Error(`Hackathon ${eventId} not found`);
  return h;
}

async function getTeam(teamId) {
  const data = await fetchJson(`${config.ohackApiBase}/api/messages/team/${teamId}`);
  return data.team || data;
}

async function getActiveTeams(eventId = config.eventId) {
  const hackathon = await getHackathon(eventId);
  const teamIds = hackathon.teams || [];
  const teams = await Promise.all(teamIds.map(id => getTeam(id).catch(() => null)));
  return teams.filter(t =>
    t &&
    String(t.active) === 'True' &&
    Array.isArray(t.github_links) &&
    t.github_links.length > 0
  ).map(t => ({ ...t, hackathon }));
}

module.exports = { getHackathon, getTeam, getActiveTeams };
