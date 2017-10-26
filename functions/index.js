/*
Function List:
1. Login
2. SignUp
3. getOrderLocation
*/

'use strict';

process.env.DEBUG = 'actions-on-google:*';

const biteFunctions = require('./functions.js');
const Assistant = require('actions-on-google').ApiAiAssistant;
const functions = require('firebase-functions');

//start of the firebase function
exports.Bite = functions.https.onRequest((request, response) => {
  console.log('headers: ' + JSON.stringify(request.headers));
  console.log('body: ' + JSON.stringify(request.body));

  //create an assistant object
  const assistant = new Assistant({ request: request, response: response });

  //actionmap to handle the incoming requests. The name inbetween the quotes matches the action name in api.ai
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
  assistant.handleRequest(actionMap);

  /*
  1. login
  triggered on welcome intent or when the user is not logged in.
  */
  function login(assistant) {
    biteFunctions.biteUser(assistant);
    //biteFunctions.getUserOrders(assistant);
  }

  function signup(assistant) {
    biteFunctions.userSignUp(request, assistant);
    //biteFunctions.getUserOrders(assistant);
  }

  /*
  3. getOrderLocation
  select the location & store to order from.
  */
  function getOrderLocation(assistant) {
    //check if user is logged in
    if (biteFunctions.biteLoginCheck(assistant)) {
      biteFunctions.biteLocation(assistant);
    } else {
      //redirect back to the login process.
      assistant.setContext("DefaultWelcomeIntent-followup", 2);
      login(assistant);
    }
  }

  function getUserOrder(assistant) {
    if (biteFunctions.biteLoginCheck(assistant)) {
      biteFunctions.getUserOrderItems(assistant);
    } else {
      //redirect back to the login process.
      assistant.setContext("DefaultWelcomeIntent-followup", 2);
      login(assistant);
    }
  }

  function placeOrder(assistant) {
    if (biteFunctions.biteLoginCheck(assistant)) {
      biteFunctions.quickOrder(assistant);
    } else {
      //redirect back to the login process.
      assistant.setContext("DefaultWelcomeIntent-followup", 2);
      login(assistant);
    }
  }

  function createBite(assistant) {
    biteFunctions.AdminFunctions(assistant);
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

});