'use strict';

process.env.DEBUG = 'actions-on-google:*';

const biteFunctions = require('./functions.js');
const Assistant = require('actions-on-google').DialogflowApp;
const functions = require('firebase-functions');

//start of the firebase function
exports.Bite = functions.https.onRequest((request, response) => {
  //logs the entire received JSON response
  console.log("/////////////////////////////////////////////////////////////////////////////////////////////////////////////////////");
  console.log('headers: ' + JSON.stringify(request.headers));
  console.log('body: ' + JSON.stringify(request.body));

  //create an assistant object
  const assistant = new Assistant({ request: request, response: response });

  //actionmap to handle the incoming requests. The name inbetween the quotes matches the action name in Dialogflow
  let actionMap = new Map();
  actionMap.set('input.start', getOrderLocation);
  actionMap.set('input.welcome', login);
  actionMap.set('input.welcome.followup', signup);
  actionMap.set('input.order', placeOrder);
  actionMap.set('input.admin', createBite);
  actionMap.set('input.lock', lockOrder);
  actionMap.set('learnmode.learnmode-custom', learnMode);
  actionMap.set('input.listorder', listTotalOrder);
  actionMap.set('input.finish', finishOrder);
  actionMap.set('input.user.order', getUserOrder);
  actionMap.set('input.user.orderedit', getUserOrder);
  actionMap.set('new_surface_intent', switchScreen);
  actionMap.set('actions_intent_OPTION', createBite);
  assistant.handleRequest(actionMap);

  function createBite(assistant) {
    const param = assistant.getSelectedOption();
    if (assistant.getContext("help")) {
      let speech = `Try saying: ${param} to perform this action`;
      assistant.ask(assistant.buildRichResponse()
        .addSimpleResponse({ speech })
        .addSuggestions([param, 'Never mind'])
      );
    } else {
      biteFunctions.AdminFunctions(assistant);
    }
  }

  function login(assistant) {
    biteFunctions.biteUser(assistant);
    biteFunctions.iKnowWhatYourFavouriteSnackIs(assistant);
  }

  function signup(assistant) {
    biteFunctions.signup(assistant);
  }

  function getOrderLocation(assistant) {
    biteFunctions.biteLocation(assistant);
  }

  function getUserOrder(assistant) {
    biteFunctions.getUserOrderItems(assistant);
  }

  function placeOrder(assistant) {
    biteFunctions.quickOrder(assistant);
  }

  function lockOrder(assistant) {
    biteFunctions.lockOrder(assistant);
  }

  function finishOrder(assistant) {
    biteFunctions.finishOrder(assistant);
  }

  function listTotalOrder(assistant) {
    biteFunctions.listTotalOrder(assistant);
  }

  function learnMode(assistant) {
    biteFunctions.learnMode(assistant);
  }

  function switchScreen(assistant) {
    biteFunctions.switchScreen(assistant);
  }

  function option(assistant) {
    biteFunctions.optionHandler(assistant);
  }
});