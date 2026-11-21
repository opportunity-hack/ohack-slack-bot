'use strict';

// What the FAQ responder is allowed to say. Edit this file to change answers —
// the LLM is told to use ONLY these facts and links, and any reply containing
// a link to a host outside ALLOWED_LINK_HOSTS is discarded for the fallback.
// Facts are taken from the ohack.dev site copy (frontend-ohack.dev). Things the
// site states inconsistently or that change per event (next hackathon date,
// hosting stipend, prize amounts, EIN) are deliberately left out — the bot
// points to the live page instead.
const KNOWLEDGE = `
ABOUT
- Opportunity Hack (OHack) is a volunteer-run 501(c)(3), founded in 2013, based in Phoenix, AZ. Volunteers build free, open-source software for nonprofits at hackathons and year-round. Everyone who runs it is an unpaid volunteer with a day job.
- Mission: empower students, professionals, and nonprofits to collaboratively create sustainable tech solutions that drive social impact and foster learning.
- Scale: 3,000+ developers and 200+ nonprofits since 2013. About: https://www.ohack.dev/about | Success stories: https://www.ohack.dev/about/success-stories
- Time commitment is flexible: as much or as little as you have. Some people only join events; others give a few hours a week.

GETTING STARTED (anyone new)
1. Introduce yourself in <#C01EY49JV8U> (#introductions).
2. Log in on ohack.dev (most people use Google). It is a separate account from Slack — you want both. Guided tour: https://www.ohack.dev/onboarding
3. Browse projects and pick one tagged "Needs Help": https://www.ohack.dev/projects
4. Find an event and apply as hacker, mentor, judge, or volunteer on its page: https://www.ohack.dev/hack
- Not sure where to post? Ask in <#C1Q6YHXQU> (#general) or come to office hours.

CONTRIBUTING CODE YEAR-ROUND (no event required)
- On a project page: sign in, flip the "Want to help?" toggle, click "Join #channel" to join that project's #npo-... Slack channel, then read its "Code & Tasks" section (GitHub repos, open issues).
- No open issues yet? Write them yourself — closed tickets give you public credit. If a project channel is quiet, ask in <#C1Q6YHXQU> or at office hours.
- All code is public and open source (MIT) in the GitHub org: https://github.com/opportunity-hack
- Project statuses: Concept (needs a team), Hackathon, Post-hackathon, Production (live, used by the nonprofit), Maintenance, Paused.
- New project ideas must come from a real nonprofit — see NONPROFITS below.
- A project is "done" when it is deployed to production, the nonprofit signs off, code + docs live in one GitHub repo, no secrets are committed, and it is MIT licensed: https://www.ohack.dev/about/completion
- Nonprofits looking for projects/teams: https://www.ohack.dev/nonprofits

OFFICE HOURS
- Every Friday, 12–1pm PT, as a Slack huddle in <#C1Q6YHXQU> (#general). Open to anyone writing code for our nonprofits; organizers host. Can't make it? Ask in Slack for another slot. Details + calendar: https://www.ohack.dev/office-hours
- Technical help any time: <#C01E5CGDQ74> (#ask-a-mentor).

HACKATHONS
- Flagship in-person hackathon each fall at Arizona State University (Tempe), plus other events through the year including online-only ones. Dates, locations, and applications are always on https://www.ohack.dev/hack — never state a date yourself; send people there.
- Format: a weekend, Saturday morning to Sunday evening. Free for hackers, mentors, judges, and nonprofits; meals provided by sponsors. Registration opens roughly 8 weeks before.
- Hackers: apply on the event page; no experience screening, everyone can participate. Use team matching to find or form a team (team-size limits are set per event). Bring a laptop and charger. Code starts fresh at kickoff, lives on GitHub, and you submit a demo video. High schoolers are welcome with parent/guardian permission. Guide: https://www.ohack.dev/about/hackers
- Winning teams are invited to continue ~3 months to get the project into production.
- Arizona events: https://www.ohack.dev/hackathons/arizona | Code of conduct: https://www.ohack.dev/hack/code-of-conduct
- Want to host a hackathon at your school, club, or company? https://www.ohack.dev/hack/request

MENTORS
- Apply on the event page (mentor application); applications are reviewed by hand, usually within about a week. No minimum shift — sign up for the blocks you can do. Remote mentoring is welcome; online events are asynchronous over Slack.
- Mentors guide teams rather than writing their code, and check in every 4–6 hours. You cannot mentor and judge at the same event.
- Guide: https://www.ohack.dev/about/mentors

JUDGES
- Apply on the event page or at https://www.ohack.dev/hackathon-judge-opportunities ; reviewed in weekly batches. In-person events need in-person judges on the final afternoon. Expect about 3–4 hours for 8–10 projects.
- Criteria: Scope, Documentation, Polish, and Security, weighted equally, plus a separate Accessibility prize. Rubric: https://www.ohack.dev/hackathon-judging-criteria | Guide: https://www.ohack.dev/about/judges

NON-CODING VOLUNTEERS
- No coding required: registration/check-in, meals, cleanup, photography, social media, pitch and judging support, virtual moderation. Shifts are 2–4 hour blocks; apply on the event page and pick shifts. Guide: https://www.ohack.dev/about/volunteers | All roles: https://www.ohack.dev/volunteer
- Ongoing organizer roles (unpaid, typically 2–6 hours/week): https://www.ohack.dev/jobs

NONPROFITS
- Apply any time, free: https://www.ohack.dev/nonprofits/apply — 501(c)(3) status is optional, no technical expertise needed, and we reply within 7 days from an @ohack.org address. Nonprofits outside Arizona and international organizations are welcome.
- What we need from you: an engaged stakeholder who pitches at kickoff, is reachable during the weekend, and signs off at the end.
- Good fits: volunteer scheduling, donor/grant dashboards, case management, admin tools, impact reporting, community portals. Not a fit: anything needing a full-time team or multi-year maintenance.
- How it works: https://www.ohack.dev/about/process | Overview: https://www.ohack.dev/coding-for-nonprofits
- Free tools: grants directory https://www.ohack.dev/nonprofit-grants and salary benchmarks https://www.ohack.dev/nonprofit-salaries

RECOGNITION, CERTIFICATES, HOURS
- Hearts reward real contributions (shipping to production, docs, code quality, tests, mentoring, judging — e.g. 1 heart per 3-hour block of mentoring or judging). Rewards: 2 hearts certificate, 4 social shoutout, 5 LinkedIn recommendation, 6 interview prep + resume review, 10 job reference, 24 OHack swag, 48 sponsor-provided tech award. Details: https://www.ohack.dev/about/hearts | Leaderboard: https://www.ohack.dev/community-champions
- GitHub certificates are generated from merged commits after each event, with shareable links: https://www.ohack.dev/cert
- Volunteer letters (general volunteer, software engineering, mentor, judge) are requested from the event's letters page and signed by an organizer.
- Log volunteer hours: https://www.ohack.dev/volunteer/track
- Thank someone: type /praise in any Slack channel; praises show on https://www.ohack.dev/praise
- Your profile, hearts, and public portfolio: https://www.ohack.dev/profile | Feedback from mentors, peers, and nonprofits: https://www.ohack.dev/feedback

SPONSORING, DONATING, HIRING
- Sponsor tiers start at $1,000 (Innovator), then $2,500, $5,000, $10,000; volunteer hours count toward a company's tier. Sponsorships are tax-deductible. https://www.ohack.dev/sponsor
- Recruiting from our community: https://www.ohack.dev/recruit-tech-talent
- Donate: https://givebutter.com/a5MSes

CONTACT
- Contact form (reply within about 48 hours): https://www.ohack.dev/contact | Email: help@ohack.org | Blog: https://www.ohack.dev/blog
`.trim();

const ALLOWED_LINK_HOSTS = ['ohack.dev', 'www.ohack.dev', 'github.com', 'givebutter.com'];

// Used when the LLM is disabled, fails, or produces something we won't post.
function fallbackReply(userId) {
  return [
    `Welcome <@${userId}>, glad you're here! 👋 Here's the quickest way to jump in:`,
    '• Pick a project tagged "Needs Help": <https://www.ohack.dev/projects|browse projects>, then hit *Want to help?* and join its Slack channel',
    '• Code lives in our <https://github.com/opportunity-hack|GitHub org> — open issues are a good first contribution',
    '• Stuck or not sure where to start? <https://www.ohack.dev/office-hours|Office hours> are every Friday 12–1pm PT in <#C1Q6YHXQU>',
    '• Hackathons, mentoring, judging, and non-coding roles: <https://www.ohack.dev/hack|events> · <https://www.ohack.dev/volunteer|volunteering>',
  ].join('\n');
}

module.exports = { KNOWLEDGE, ALLOWED_LINK_HOSTS, fallbackReply };
