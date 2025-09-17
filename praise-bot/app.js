const { slackGIFSelectionFunction } = require('./functions/find_gif.js');
const { savePraiseFunction } = require('./functions/save_praise.js');
const { App, LogLevel } = require('@slack/bolt');
const praiseFormView = require('./praise_form.json');
const { config } = require('dotenv');

config();

/*
 * Validates the setting of the required environment variables:
 *  SLACK_BOT_TOKEN - the OAuth token env variable for the Slack bot
 *  SLACK_APP_TOKEN - the App-level token allowing tasks requiring app access
 *  SLASH_CMD - the slash command used to activate Slack bot in dev or prod mode
 */
function validateConfig() {
  const requiredEnvVars = {
    SLACK_BOT_TOKEN: process.env.SLACK_BOT_TOKEN,
    SLACK_APP_TOKEN: process.env.SLACK_APP_TOKEN,
    SLASH_CMD: process.env.SLASH_CMD
  };

  const missingVars = Object.entries(requiredEnvVars)
    .filter(([_, value]) => value === undefined || value === null || value === '')
    .map(([key]) => key);

  if (missingVars.length > 0) {
    throw new Error(`Missing required environment variables: ${missingVars.join(', ')}`);
  }

  /* 
   * Validate SLASH_CMD format or spelling in development mode 
   * If the app is in Development Mode AND SLASH_CMD not spelled correctly, 
   * stop the app when running 'node app.js' command by throwing an error. 
   */
  if (process.env.DEBUG_MODE === 'true' && process.env.SLASH_CMD !== '/praise-dev') {
    throw new Error('SLASH_CMD is not set to /praise-dev in debug/dev mode');
  }
}

try {
  validateConfig();
} catch (error) {
  console.error('Configuration Error:', error.message);
  process.exit(1);
}

/** App Initialization */
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  socketMode: true,
  appToken: process.env.SLACK_APP_TOKEN,
  logLevel: LogLevel.DEBUG,
  port: process.env.PORT || 3000
});

// Update status on connection
app.client.on('connected', () => {
  console.log('Successfully connected to Slack');
});

// Update status on disconnection
app.client.on('disconnected', () => {
  console.log('Disconnected from Slack');
});

// Update status on reconnection attempts
app.client.on('reconnect', (attempt) => {
  console.log(`Reconnecting...`);
});

// Update status on errors
app.error(async (error) => {
  console.error('An error occurred:', error);
});

app.command(process.env.SLASH_CMD, async ({ ack, body, client, logger}) => {
  // Acknowledge command request
  await ack();

  //Open the slack praise form for the user. 
  try {
    const result = await client.views.open({
      // Pass a valid trigger_id within 3 seconds of receiving it
      trigger_id: body.trigger_id,
      // View payload for praise form (stored in praise_form.json)
      view: praiseFormView
    });
    logger.info("result object:", result);
  } catch (error) {
    console.log("error with opening form: ", error);
  }
});

app.action('select_user', async ({ ack, body, client, logger}) => {
  await ack();
  logger.info("body: ", body);
  logger.info("selected user: ", body.actions[0].selected_user);
});

app.action('select_channel', async ({ ack, body, client, logger}) => {
  await ack();
  logger.info("body: ", body.actions[0].selected_channel);
  logger.info("selected channel: ", body.actions[0].selected_user);
});

app.view('praise_form', async ({ ack, body, view, client, logger}) => {
  await ack();

  //Get the url of the Gif chosen by the slack app
  var vibe_selection;
  if (body.view.state.values.vibe_dropdown.select_vibe.selected_option === null) {
    vibe_selection = "";
  } else {
    vibe_selection = body.view.state.values.vibe_dropdown.select_vibe.selected_option.text.text;
  }
  const gif_selection = slackGIFSelectionFunction(vibe_selection);

  /*
   * Store data attributes into a variable
   */
  var sender = body.user.id;
  var receiver = body.view.state.values.users_menu.select_user.selected_user;
  
  /*
   * Decides which channel to send the praise message to 
   */
  var channel;
  if (body.view.state.values.channels_menu.select_channel.selected_channel === null) {
    channel = receiver;  // Send to receiver if a channel not selected
  } else {
    channel = body.view.state.values.channels_menu.select_channel.selected_channel;
  }

  var message = body.view.state.values.message_input.plain_text_input.value;
  var gif = gif_selection.URL;
  var message_txt =``;

  //Praise JSON data object to send to the backend
  const jsonPraiseData = {
    "praise_sender": sender,      //userID of person sending praise
    "praise_channel": channel,    //channelID of the channel receiving praise  
    "praise_message": message,    //string content of the message text box
    "praise_receiver": receiver,  //userID of person receiving praise
    "praise_gif": gif             //url of the gif
  }
  console.log("preparing to call the savePraiseFunction using json object ", 
    jsonPraiseData);
  var backendRslt = await savePraiseFunction(jsonPraiseData, process.env);

  //Sets the message format depending on success in backend.
  if (backendRslt.error != null) { 
    //Prepares for direct message to 'praise sender' about an issue with backend.
    message_txt = `*Hey <@${sender}>!* ` + backendRslt.error;
    channel = sender;
  }
  else {
    message_txt = `*Hey <@${receiver}>!*` + 
      `<@${sender}> wanted to share some kind words with you :otter:\n` +
      `> ${message}\n` + `<${gif}>` +
      `\n\nYou can check out this praise at <https://ohack.dev/praise|ohack.dev/praise>. If you don't see it, `
      + `please report the issue in #slack-bot-dev.` +
      `\n\nWant to send a praise too? Type \`/praise\` to open and submit a form.`
  }

  // Post message in the channel or to the user
  try {
    await client.chat.postMessage({
      channel: channel,
      text: message_txt
    });
  } catch (error) {
    console.log("error with posting message: ", error);
  }
});

/** Start the Bolt App */
(async () => {
  try {
    // Start the app
    await app.start();
    console.log('⚡️ Bolt app is running!');

    // Handle graceful shutdown
    const shutdown = async () => {
      console.log('Shutting down gracefully...');
      try {
        // Stop the app to handle WebSocket closure
        console.log('Stopping the app...');
        await app.stop();
        
        console.log('App stopped successfully');
        process.exit(0);
      } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    // Handle termination 
    process.on('SIGTERM', shutdown);  //Shutdown when redeploying on fly.io 
    process.on('SIGINT', shutdown);   //Shutdown when clicking CTRL+C
  } catch (error) {
    console.error('Failed to start the app', error);
    process.exit(1);
  }
})();
