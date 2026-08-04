'use strict';
const config = {
  eventId: process.env.EVENT_ID || 'summer-2026',
  githubToken: process.env.GITHUB_TOKEN || '',
  digestCron: process.env.DIGEST_CRON || '0 16 * * *',
  mentorCron: process.env.MENTOR_CRON || '30 17 * * *', // Daily 17:30 UTC (10:30 AM Arizona)
  mentorChannel: process.env.MENTOR_CHANNEL || '',
  dryRun: process.env.DIGEST_DRY_RUN === '1',
  ohackApiBase: 'https://api.ohack.dev',
  identityApiBase: process.env.OHACK_API_BASE || 'https://api.ohack.dev',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  maxApiCallsPerRun: 20,
};
module.exports = config;
