const { slackGIFSelectionFunction } = require('./functions/find_gif.js');
const { savePraiseFunction } = require('./functions/save_praise.js');
const { App, LogLevel } = require('@slack/bolt');
const praiseFormView = require('./praise_form.json');
const { config } = require('dotenv');

config();

/** Initialization */
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

  //Store data attributes into a variable
  var sender = body.user.id;
  var receiver = body.view.state.values.users_menu.select_user.selected_user;
  
  var channel;
  if (body.view.state.values.channels_menu.select_channel.selected_channel === null) {
    channel = receiver;  // Send to receiver instead of sender when no channel selected
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

  //If the backend returns error msg, send the error msg to the sender.
  if (backendRslt.error != null) { 
    message_txt = `*Hey <@${sender}>!* ` + backendRslt.error;
    channel = sender;
  }
  else {
    message_txt = `*Hey <@${receiver}>!*` + 
      `<@${sender}> wanted to share some kind words with you :otter:\n` +
      `> ${message}\n` + `<${gif}>`
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
        // First, close the WebSocket connection
        if (app.client) {
          console.log('Closing WebSocket connection...');
          await app.client.disconnect();
        }
        
        // Then stop the app
        console.log('Stopping the app...');
        await app.stop();
        
        console.log('App stopped successfully');
        process.exit(0);
      } catch (error) {
        console.error('Error during shutdown:', error);
        process.exit(1);
      }
    };

    // Handle termination signals
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (error) {
    console.error('Failed to start the app', error);
    process.exit(1);
  }
})();
