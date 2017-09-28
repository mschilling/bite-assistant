'use strict';

process.env.DEBUG = 'actions-on-google:*';

const Assistant = require('actions-on-google').ApiAiAssistant;
const functions = require('firebase-functions');

//database stuff
const admin = require('firebase-admin');
admin.initializeApp(functions.config().firebase);
const orderRef = admin.database().ref('orders');
const storeRef = admin.database().ref('stores');
const userRef = admin.database().ref('users');
const userOrderRef = admin.database().ref('user_order');

/*
1. Login
*/
exports.biteUser = (assistant) => {
    let check = 0; // 0 is negative match, 1 is positive.
    let userData; // stores the user data when the uid matches in the db

    //get the uid from your assistant, this uid is bound to the session on your google account and is the same across all your devices..
    //the uid is not permanent and can be reset by the user, but usually doesn't change.
    const userId = assistant.getUser().userId;

    //loop through all users and match if the UserID is the same as the one in the database.
    userRef.once('value', ((data) => {
        data.forEach((childData) => {
            if (userId == childData.val().uid) {
                userData = childData;//save user data
                check = 1;
            }
        })

        //not logged in
        if (check == 0) {
            const speech = `<speak> Welcome, it looks like your Bite Assistant is not yet linked to an account, <break time="1"/>` +
                `please enter the email adress of your existing Bite account to start the sign-up process. <break time="1"/>` +
                `It is reccomended to do this by screen input. </speak>`;
            assistant.ask(speech);
        } else {
            //get the users current open orders
            getUserOrders(assistant, userData);
        }
    }))
};

/*
2. SignUp
*/
exports.biteSignUp = (request, assistant) => {
    //get email from the user input
    let email = request.body.result.parameters['email'];
    const userId = assistant.getUser().userId;

    let speech = `<speak> I was unable to find an account with this email, did you enter the correct email? </speak>`;//for when no match is found

    userRef.once('value', ((data) => {
        data.forEach((childData) => {
            if (childData.val().email == email) {
                //add the new uid to the user in the database.
                admin.database().ref('users/' + childData.key).update({ uid: userId });
                speech = `<speak> Thanks for registering ${childData.val().display_name}. You can now place an order. </speak>`;
                assistant.data = { username: childData.val().display_name };
            }
        })
        assistant.ask(speech);
    }))
};

/*
3. getOrderLocation
*/
exports.biteLocation = (assistant) => {
    let storeNumber = 0;
    let store = "McDonalds";//fallback
    let location = "Amsterdam";//fallback
    console.log(assistant.data.userOrders);
    //get the location context, this data remains in the assistant for a certain amount of actions and can be called again in later functions.
    let context = assistant.getContext("orderlocation");
    const locationContext = assistant.getArgument("Location");
    let i = 0;

    orderRef.once('value', ((data) => {
        storeRef.once('value', ((userData) => {
            //get all bites for the user specified location
            data.forEach((childData) => {
                if (locationContext == childData.val().location) {
                    storeNumber = childData.val().store;
                    location = childData.val().location;
                    i++;
                }
            });
            //get the name of the store for the last order of the location...
            userData.forEach((childData) => {
                if (storeNumber == childData.val().id) {
                    store = childData.val().name;
                }
            });
            //is null if there are no open orders for that location
            let orderStore = "";
            if (store != "McDonalds") {
                orderStore = `<break time="1"/>, do you want to order from ${store}?`;
                assistant.data = { storeNumber: storeNumber }
            } else {
                orderStore = `<break time="1"/>. You can try ordering from another location, or start a Bite here yourself! `;
            }
            const speech = `<speak> there are currently ${i} open bites in ${locationContext}` + orderStore + `</speak>`;
            assistant.ask(speech);
        }));
    }));
};

//check if user is logged in
exports.biteLoginCheck = (assistant) => {
    const userName = assistant.data.username;
    if (userName != null) {
        return true;
    } else {
        return false;
    }
};

/*
private function getUserOrders
get open orders for the user, handles part of the welcome intent and- 
saves the array with database references of the users Bite order in assistant.data.userOrders
example: [ 'user_order/-KorC-i_WY5CsFct9ncd/2zjwkTWsWAd2ZyU2EoBnQrvU2fz2' ] supports multiple user orders
              TABLE  /     (OPEN)BITE     /            USER               / ORDERS
calling assistant.data.userOrders returns a string so you probably need to string split the individual orders if there are more than one
*/
function getUserOrders(assistant, user) {
    const userId = assistant.getUser().userId;
    let check = 0;
    let itemArray = [];

    orderRef.once('value', ((orderData) => {
        userOrderRef.once('value', ((userOrderData) => {

            //foreach open Bite
            orderData.forEach((orderChild) => {

                //check if the Bite in the user_order table is open
                userOrderData.forEach((childData) => {
                    if (orderChild.key == childData.key) {
                        userOrderData.child(childData.key).forEach(function (userOrderData) {
                            if (user.key == userOrderData.key) {
                                check++; //+1 order
                                itemArray.push('user_order/' + childData.key + "/" + userOrderData.key);
                            }
                        })
                    }
                })
            })
            if (check == 0) {
                assistant.data = { username: user.val().display_name };
                const speech = `<speak> Welcome ${user.val().display_name}! You can order by saying "start" or the name of the city you would like to order at. </speak>`;
                assistant.ask(speech);
            } else {
                assistant.data = { username: user.val().display_name, userOrders: itemArray };
                const speech = `<speak> Welcome ${user.val().display_name}! You currently have ${check} open order(s).<break time="1"/>` +
                    `Would you like to edit a current order or start another?</speak>`;
                assistant.ask(speech);
            }
        }))
    }))
};