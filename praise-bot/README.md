# Opportunity Hack Problem Statement
All Slack apps that do this are $3 to $4 per user, per month.  If we have 800 active users, that could be $3200 a month for us.  We need to create a free version of what these other apps do.

## Paid App Examples
### 1. I'm Frank https://imfrank.app
1. I'm Frank helps teams develop with timely, continuous feedback and recognition within Slack.
2. Users can share, request, and receive feedback from colleagues and managers using various formats, settings, and templates.
3. Users can also praise co-workers for their achievements and values, and display the recognition on a public wall of praise.
4. Users can customize the feedback and praise messages and emojis to fit their company's values and culture.
5. Managers can access the feedback and praise history of their reports, and prepare performance reviews based on continuous 360° feedback.
6. Users can view and manage their feedback and praise data, as well as their reporting lines and org chart, on a web dashboard.
7. The app has a simple and user-friendly interface that works seamlessly with Slack's native features and commands.
8. The app costs $4 per user per month, and offers a free trial for 30 days with no credit card required.
9. The app complies with Slack's security and compliance standards, and respects the user's privacy and data protection.
10. The app improves the team's engagement, development, and performance by making feedback and recognition part of their workflow and culture.

### 2. Dankon https://dankon.io
1. Dankon is a Slack app that promotes gratitude and encourages teammates to praise each other.
2. Users can send and receive praise messages within Slack, using commands, buttons, or reactions.
3. Users can customize the praise messages and emojis to match their team's culture and values.
4. Users can view the praise history and stats of themselves and their teammates on a web dashboard.
5. Users can also see the praise messages displayed on a public wall of praise on the app's website¹.
6. The app integrates with the company's performance management system and helps managers track and reward their team's achievements.
7. The app has a simple and intuitive interface that requires no training or installation to use.
8. The app costs $2.99 per user per month, and offers a free trial for 14 days with no credit card required.
9. The app complies with Slack's security and compliance standards, and respects the user's privacy and data protection.
10. The app improves the team's engagement, morale, and productivity by making praise and recognition an integral part of their workflow and culture.



### 3. karmabot https://karmabot.chat
1. Karma bot is a Slack app that tracks and rewards team performance and culture.
2. Users can send and receive karma points within Slack, using commands, buttons, or reactions, to appreciate their colleagues' work and achievements.
3. Users can customize the karma messages and emojis to match their team's values and goals.
4. Users can view the karma history and stats of themselves and their teammates on a web dashboard or in Slack.
5. Users can also see the karma messages displayed on a public wall of praise on the app's website¹.
6. The app integrates with the company's performance management system and helps managers track and reward their team's achievements.
7. The app has a simple and intuitive interface that works seamlessly with Slack's native features and commands.
8. The app costs $2.99 per user per month, and offers a free trial for 30 days with no credit card required.
9. The app complies with Slack's security and compliance standards, and respects the user's privacy and data protection.
10. The app improves the team's engagement, morale, and productivity by making karma and recognition an integral part of their workflow and culture.



# Deno Starter Template

This is a scaffolded Deno template used to build out Slack apps using the Slack
CLI.

**Guide Outline**:

- [Setup](#setup)
  - [Install the Slack CLI](#install-the-slack-cli)
  - [Clone the Template](#clone-the-template)
- [Running Your Project Locally](#running-your-project-locally)
- [Creating Triggers](#creating-triggers)
- [Datastores](#datastores)
- [Testing](#testing)
- [Deploying Your App](#deploying-your-app)
- [Viewing Activity Logs](#viewing-activity-logs)
- [Project Structure](#project-structure)
- [Resources](#resources)

---

## Setup

Before getting started, first make sure you have a development workspace where
you have permission to install apps. **Please note that the features in this
project require that the workspace be part of
[a Slack paid plan](https://slack.com/pricing).**

### Install the Slack CLI

To use this template, you need to install and configure the Slack CLI.
Step-by-step instructions can be found in our
[Quickstart Guide](https://api.slack.com/automation/quickstart).

### Clone the Template

Start by cloning this repository:

```zsh
# Clone this project onto your machine
$ slack create my-app -t slack-samples/deno-starter-template

# Change into the project directory
$ cd my-app
```

## Running Your Project Locally

While building your app, you can see your changes appear in your workspace in
real-time with `slack run`. You'll know an app is the development version if the
name has the string `(local)` appended.

```zsh
# Run app locally
$ slack run

Connected, awaiting events
```

To stop running locally, press `<CTRL> + C` to end the process.

## Creating Triggers

[Triggers](https://api.slack.com/automation/triggers) are what cause workflows
to run. These triggers can be invoked by a user, or automatically as a response
to an event within Slack.

When you `run` or `deploy` your project for the first time, the CLI will prompt
you to create a trigger if one is found in the `triggers/` directory. For any
subsequent triggers added to the application, each must be
[manually added using the `trigger create` command](#manual-trigger-creation).

When creating triggers, you must select the workspace and environment that you'd
like to create the trigger in. Each workspace can have a local development
version (denoted by `(local)`), as well as a deployed version. _Triggers created
in a local environment will only be available to use when running the
application locally._

### Link Triggers

A [link trigger](https://api.slack.com/automation/triggers/link) is a type of
trigger that generates a **Shortcut URL** which, when posted in a channel or
added as a bookmark, becomes a link. When clicked, the link trigger will run the
associated workflow.

Link triggers are _unique to each installed version of your app_. This means
that Shortcut URLs will be different across each workspace, as well as between
[locally run](#running-your-project-locally) and
[deployed apps](#deploying-your-app).

With link triggers, after selecting a workspace and environment, the output
provided will include a Shortcut URL. Copy and paste this URL into a channel as
a message, or add it as a bookmark in a channel of the workspace you selected.
Interacting with this link will run the associated workflow.

**Note: triggers won't run the workflow unless the app is either running locally
or deployed!**

### Manual Trigger Creation

To manually create a trigger, use the following command:

```zsh
$ slack trigger create --trigger-def triggers/sample_trigger.ts
```

## Datastores

For storing data related to your app, datastores offer secure storage on Slack
infrastructure. For an example of a datastore, see
`datastores/sample_datastore.ts`. The use of a datastore requires the
`datastore:write`/`datastore:read` scopes to be present in your manifest.

## Testing

For an example of how to test a function, see
`functions/sample_function_test.ts`. Test filenames should be suffixed with
`_test`.

Run all tests with `deno test`:

```zsh
$ deno test
```

## Deploying Your App

Once development is complete, deploy the app to Slack infrastructure using
`slack deploy`:

```zsh
$ slack deploy
```

When deploying for the first time, you'll be prompted to
[create a new link trigger](#creating-triggers) for the deployed version of your
app. When that trigger is invoked, the workflow should run just as it did when
developing locally (but without requiring your server to be running).

## Viewing Activity Logs

Activity logs of your application can be viewed live and as they occur with the
following command:

```zsh
$ slack activity --tail
```

## Project Structure

### `.slack/`

Contains `apps.dev.json` and `apps.json`, which include installation details for
development and deployed apps.

### `datastores/`

[Datastores](https://api.slack.com/automation/datastores) securely store data
for your application on Slack infrastructure. Required scopes to use datastores
include `datastore:write` and `datastore:read`.

### `functions/`

[Functions](https://api.slack.com/automation/functions) are reusable building
blocks of automation that accept inputs, perform calculations, and provide
outputs. Functions can be used independently or as steps in workflows.

### `triggers/`

[Triggers](https://api.slack.com/automation/triggers) determine when workflows
are run. A trigger file describes the scenario in which a workflow should be
run, such as a user pressing a button or when a specific event occurs.

### `workflows/`

A [workflow](https://api.slack.com/automation/workflows) is a set of steps
(functions) that are executed in order.

Workflows can be configured to run without user input or they can collect input
by beginning with a [form](https://api.slack.com/automation/forms) before
continuing to the next step.

### `manifest.ts`

The [app manifest](https://api.slack.com/automation/manifest) contains the app's
configuration. This file defines attributes like app name and description.

### `slack.json`

Used by the CLI to interact with the project's SDK dependencies. It contains
script hooks that are executed by the CLI and implemented by the SDK.

## Resources

To learn more about developing automations on Slack, visit the following:

- [Automation Overview](https://api.slack.com/automation)
- [CLI Quick Reference](https://api.slack.com/automation/cli/quick-reference)
- [Samples and Templates](https://api.slack.com/automation/samples)
