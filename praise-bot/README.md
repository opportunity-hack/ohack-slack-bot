# Praise Bot App (powered by the JavaScript Bolt Framework)

## General Information and Overview
This repository stores all code for the development of the Praise Bot App activated by the **/praise** slash command on the Opportunity Hack Slack workspace.

To learn the more about the Bolt Framework for the development of Slack apps, read or learn more at the following: 
- [GitHub for Bolt-JS Development](https://github.com/slackapi/bolt-js)
- [Guides or Walkthrough on Bolt for JavaScript](https://tools.slack.dev/bolt-js/).

---

## Local Development Setup Steps:

1. Choose a folder and clone the ohack-slack-bot repository into the directory 
of your local machine
2. cd into the **praise-bot** folder
3. Install node into your machine using the command 'nvm install node'
4. Run the command **npm install @slack/bolt** to install the bolt framework locally
6. Contact *Andrew Nguyen* or an OHack Staff member for the environment variables
5. Type **node app.js** in your terminal to run the Slack Praise Bot App locally. 
6. To ensure that the app successfully starts, look for the message "⚡️ Bolt app is running!" at the end of your console terminal output
7. On Slack, type **/praise-dev** to trigger the development version of the Slack Praise Bot. DO NOT use **/praise**, as this will run the production version of the Slack Praise Bot. 


**NOTE:** To make sure that your local slack bot executes any local code changes, press `<CTRL> + C` to end the process, save your changes, and then repeat Step 6 above to run the app with any updated code changes.

---

## Questions and concerns

If any issues arise when setting up the development version of the Praise Bot, join the Opportunity Hack Slack workspace to post a message in the #slack-bot-dev channel or send a direct message to *Andrew Nguyen* for assistance.

If you see any functional defects while sending praises to OHack Slack workspace members, message in the #slack-bot-dev channel of the OHack Slack workspace or log an issue at [GitHub Issues](https://github.com/opportunity-hack/ohack-slack-bot/issues)