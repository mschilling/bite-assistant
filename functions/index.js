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
  actionMap.set('input.welcome.followup', signUp);
  assistant.handleRequest(actionMap);

  /*
  1. login
  triggered on welcome intent or when the user is not logged in.
  */
  function login(assistant) {
    biteFunctions.biteUser(assistant);
  }

  /*
  2. signUp
  checks the email and adds the user to the database.
  */
  function signUp(assistant) {
    if (biteFunctions.biteLoginCheck(assistant)) {
      const speech = `<speak> You are already logged in, go ahead an place an order. </speak>`;
      assistant.ask(speech);
    } else {
      biteFunctions.biteSignUp(request, assistant);
    }
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
    //get users latest order... and change it?
  }

  function validateOrder(assistant) {
    let value = assistant.data.storeNumber;
    //check user order against the database.
    //order must be in the same shop
    //get prices
    //confirm order
    assistant.ask("Your order: ... with a total price of: ... do you want to confirm this order?");
    //placeOrder();
  }

  function placeOrder(assistant) {
    //push order to database.
  }

  function createBite(assistant) {
    //create a bite.
  }

});