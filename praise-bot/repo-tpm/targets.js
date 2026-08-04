'use strict';
const { getActiveTeams } = require('./ohack_api');
const { parseRepoUrl } = require('./github');

const REPO_SHORTHAND = /^[\w.-]+\/[\w.-]+$/;

// Accept "owner/repo" shorthand or a full GitHub URL.
function parseRepoRef(ref) {
  if (typeof ref !== 'string') return null;
  const trimmed = ref.trim();
  if (REPO_SHORTHAND.test(trimmed)) {
    const [owner, repo] = trimmed.split('/');
    return { owner, repo: repo.replace(/\.git$/, '') };
  }
  return parseRepoUrl(trimmed);
}

/*
 * Expand a github_watcher config into concrete digest targets.
 * - hackathon mode: one target per active team (existing behavior)
 * - repos mode: a single target posting to the watcher's channels
 */
async function getTargets(watcher) {
  const source = watcher.source || {};

  if (source.mode === 'repos') {
    return [{
      name: watcher.name || 'repos',
      channels: source.channels || [],
      repos: (source.repos || []).map(parseRepoRef).filter(Boolean),
      hackathonEndDate: null,
    }];
  }

  // Default: hackathon mode (team-driven, resolved live from the OHack API)
  const teams = await getActiveTeams(source.event_id);
  return teams.map(t => ({
    name: t.name,
    channels: t.slack_channel ? [t.slack_channel] : [],
    repos: (t.github_links || [])
      .map(l => parseRepoUrl(typeof l === 'string' ? l : l.link))
      .filter(Boolean),
    hackathonEndDate: t.hackathon?.end_date || null,
  }));
}

module.exports = { getTargets, parseRepoRef };
