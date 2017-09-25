'use strict';

process.env.DEBUG = 'actions-on-google:*';

const Assistant = require('actions-on-google').ApiAiAssistant;
const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp(functions.config().firebase);
const orderRef = admin.database().ref('orders');
const storeRef = admin.database().ref('stores');
const userRef = admin.database().ref('users');

// API.AI Intent Action names
const LOCATION_INTENT = 'input.start';
const ORDER_INTENT = 'input.welcome';

// Contexts
const LOCATION_CONTEXT = 'order-location';
const LOCATION_ARGUMENT = 'Location';

//start of the firebase function
exports.Bite = functions.https.onRequest((request, response) => {
  console.log('headers: ' + JSON.stringify(request.headers));
  console.log('body: ' + JSON.stringify(request.body));

  //create an assistant object
  const assistant = new Assistant({ request: request, response: response });

  let actionMap = new Map();
  actionMap.set('input.start', getLocation);
  actionMap.set('input.welcome', getUser);
  actionMap.set('input.welcome.followup', userSignUp);
  assistant.handleRequest(actionMap);

  //select the location to order from.
  function getLocation(assistant) {
    let storeNumber = 0;
    let store = "McDonalds";//fallback
    let location = "Amsterdam";//fallback

    //get the location context, this can be used during later steps.
    let context = assistant.getContext(LOCATION_CONTEXT);
    const locationContext = assistant.getArgument(LOCATION_ARGUMENT);

    let i = 0;

    orderRef.once('value', ((data) => {
      storeRef.once('value', ((userData) => {
        data.forEach((childData) => {
          if (locationContext == childData.val().location) {
            storeNumber = childData.val().store;
            location = childData.val().location;
            i++;
          }
        });
        userData.forEach((childData) => {
          if (storeNumber == childData.val().id) {
            store = childData.val().name;
          }
        });
        let orderStore = "";
        if (store != "McDonalds") {
          orderStore = `<break time="1"/>, do you want to order from ${store}?`;
          assistant.data = { storeNumber: storeNumber }
        }
        const speech = `<speak> there are currently ${i} open bites in ${locationContext}` + orderStore + `</speak>`;
        assistant.ask(speech);
      }));
    }));
    //TO DO
    //add card with link to the orderpage of the snackbar(for view on phone)
    //requires new field with url in the database of stores
  }

  //triggered on welcome intent
  //see if uid is in the database, if not start sign-up process
  function getUser(assistant) {

    let check = 0; // 0 is negative match, 1 is positive.
    let userData; // stores the user data when the uid matches in the db

    // get the uid from your assistant, this uid is bound to email and should be the same across all your devices.
    //the uid is not permanent and can be reset by the user, but usually doesn't change.
    const userId = assistant.getUser().userId; 

    //loop through all users
    userRef.once('value', ((data) => {
      data.forEach((childData) => {

        if (userId == childData.val().uid) {
          userData = childData.val();
          check = 1;
        }
      })

      if (check == 0) {
        const speech = `<speak> Welcome, it looks like your Bite Assistant is not yet linked to an account, <break time="1"/>`,
        `please enter the email adress of your existing Bite account to start <break time="1"/>`,
        `it is reccomended to do this on a phone and not on the Google Home. </speak>`;
        assistant.ask(speech);
      } else {
        const speech = `<speak> Welcome back ${userData.display_name}!  </speak>`;
        assistant.ask(speech);
      }
    }))

    //for first log in ask the user to type his email addres
    //Users UID will be bound to the user entry in the database with the same email.
    //for security: use a special code at sign up so only people who know it can get authenticated.
    //ask user what to do on startup: view my orders? place a new order? view open bites?
    //learn where the user wants to order, if the user has an open order in zwolle: continue there.
    //check if the user has open orders
  }

  function userSignUp(assistant) {
    let email = request.body.result.parameters['email'];
    const userId = assistant.getUser().userId; 
    
    console.log(email);
    userRef.once('value', ((data) => {
        data.forEach((childData) => {
            if (childData.val().email == email){
                
            }
        })
      }))

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