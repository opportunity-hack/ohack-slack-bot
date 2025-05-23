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
6. To set the required .env variables, follow the steps provided in [How to set environment variables](#How-to-set-environment-variables)
5. Type **node app.js** in your terminal to run the Slack Praise Bot App locally. 
6. To ensure that the app successfully starts, look for the message "⚡️ Bolt app is running!" at the end of your console terminal output
7. On Slack, type **/praise-dev** to trigger the development version of the Slack Praise Bot. DO NOT use **/praise**, as this will run the production version of the Slack Praise Bot. 


**NOTE:** To make sure that your local slack bot executes any local code changes, press `<CTRL> + C` to end the process, save your changes, and then repeat Step 6 above to run the app with any updated code changes.

---

## How to set environment variables

Set the following environment variables for local development
- SLASH_CMD='/praise-dev'
- DEBUG_MODE=true
- To set the SLACK_APP_TOKEN and SLACK_BOT_TOKEN, message Greg for access to the **Praise Bot Dev** on api.slack.com/apps and follow these steps to access the values when you click on **Praise Bot Dev**:
    - SLACK_APP_TOKEN: Click on 'Basic Information' > Scroll Down to App-Level Token > Click 'Generate Token and Scopes' > Click 'app dev token' > Copy the token value
    - SLACK_BOT_TOKEN: Click on 'OAuth & Permissions' > Scroll to OAuth Tokens > Click 'Copy' button in text box for Bot User OAuth Token
    - BACKEND_PRAISE_URL and BACKEND_PRAISE_TOKEN: Contact **Greg Vannoni** on the Opportunity Hack slack workspace for the values

---

## Questions and Concerns

If any issues arise when setting up the development version of the Praise Bot, join the Opportunity Hack Slack workspace to post a message in the #slack-bot-dev channel or send a direct message to *Andrew Nguyen* or *Greg Vannoni* for assistance.

If you see any functional defects while sending praises to OHack Slack workspace members, message in the #slack-bot-dev channel of the OHack Slack workspace or log an issue at [GitHub Issues](https://github.com/opportunity-hack/ohack-slack-bot/issues)