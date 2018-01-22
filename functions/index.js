'use strict';

//process.env.DEBUG = 'actions-on-google:*';

const functions = require('firebase-functions');
const admin = require('firebase-admin');
admin.initializeApp(functions.config().firebase);
const biteFunctions = require('./functions.js');
const Assistant = require('actions-on-google').DialogflowApp;
const db = admin.firestore();

//Moment.js
var moment = require('moment');
moment().format();

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
  actionMap.set('archive', getArchivedOrders);
  actionMap.set('returning', recommendationHandler);
  actionMap.set('copyright', createBite);
  assistant.handleRequest(actionMap);

  function createBite(assistant) {
    const param = assistant.getSelectedOption();
    if (assistant.getContext("help")) {
      let speech = `Try saying: ${param} to perform this action`;
      assistant.ask(assistant.buildRichResponse()
        .addSimpleResponse({ speech })
        .addSuggestions([param, 'Never mind'])
      );
    } else if (assistant.getContext("archive")) {
      biteFunctions.getArchivedOrders(assistant);
    } else if (assistant.getContext("copyright")) {
      if (param) {
        biteFunctions.recommendationHandler(assistant);
      } else {
        biteFunctions.listTotalOrder(assistant);
      }

    } else {
      biteFunctions.AdminFunctions(assistant);
    }
  }

  function login(assistant) {
    biteFunctions.biteUser(assistant);
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

  function getArchivedOrders(assistant) {
    biteFunctions.getArchivedOrders(assistant);
  }

  function recommendationHandler(assistant) {
    biteFunctions.recommendationHandler(assistant);
  }
});

exports.biteClosed = functions.firestore
  .document('orders/{biteId}')
  .onUpdate((event) => {
    const bite = event.data.id;
    let users = {};
    if (!event.data.data().users && event.data.data().status == 'closed') {
      return db.collection('orders').doc(bite).collection('orders').get().then((userQuery) => {
        if (userQuery.size == 0) {
          db.collection('orders').doc(bite).delete();
          return 'done';
        } else {
          userQuery.forEach((user) => {
            let total = 0;
            users[user.id] = true;
            db.collection('users').doc(user.id).get().then((userDoc) => {
              db.collection('orders').doc(bite).collection('orders').doc(user.id).collection('snacks').get().then((productQuery) => {
                productQuery.forEach((product) => {
                  total += product.data().price;
                });
                db.collection('users').doc(user.id).update({
                  spend: (userDoc.data().spend || 0) + total,
                  orders: (userDoc.data().orders || 0) + 1,
                });

                /*
                  Learn the most common day, store snack and store for the current user.
                  Recommendations will be given based on what the user orders most.
                */
                let snackArray = [];
                let sauceArray = [];
                let storeArray = [];
                let day = [];

                let snacksInThisStore = [];
                let saucesInThisStore = [];
                let combinedOrders = [];
                //loop through all archived Bites
                db.collection('orders').where('status', '==', 'closed').get()
                  .then(snapshot => {
                    let count = 0;
                    snapshot.forEach(doc => {
                      biteFunctions.getArchivedOrder(user.id, doc.id)
                        .then(snackSnapshot => {
                          let i = 0;
                          if (snapshot.size > 0) {
                            let dayoftheweek = moment(doc.data().open_time).isoWeekday(); // returns 1-7 where 1 is Monday and 7 is Sunday
                            day.push(dayoftheweek.toString());
                            storeArray.push(doc.data().store);

                            //loop through all the snacks
                            snackSnapshot.forEach(snack => {
                              if (snack.data().isSauce) {
                                sauceArray.push(snack.data().name);
                                saucesInThisStore.push(snack.data().name);
                              } else {
                                snackArray.push(snack.data().name);
                                snacksInThisStore.push(snack.data().name);
                              }
                              i++;

                              if (i == snackSnapshot.length) {
                                let orderSauceString = "";
                                if (saucesInThisStore.length > 0) {
                                  saucesInThisStore.sort();
                                  saucesInThisStore.forEach(sauceString => {
                                    orderSauceString += sauceString + ",";
                                  })
                                  saucesInThisStore.length = 0;
                                }
                                let orderSnackString = "";
                                snacksInThisStore.sort();
                                snacksInThisStore.forEach(snackString => {
                                  orderSnackString += snackString + ",";
                                })
                                let orderString = orderSnackString + orderSauceString;
                                //console.log(orderString);
                                combinedOrders.push(orderString);
                                snacksInThisStore.length = 0;
                              }
                            })
                          } else {
                            console.log("nope");
                            //do nothing
                          }
                        }).then(() => {
                          count++;
                          if (count == snapshot.size) {
                            let now = new Date();
                            let mostPopularSnack = popular(snackArray);
                            let mostPopularDay = popular(day);
                            let mostPopularStore = popular(storeArray);
                            let mostPopularSauce = popular(sauceArray);
                            let mostPopularOrder = popular(combinedOrders);
                            if (!mostPopularSauce) {
                              mostPopularSauce = "null";
                            }
                            if (!mostPopularOrder) {
                              mostPopularOrder = "null";
                            }
                            let storeName = mostPopularStore;
                            if (mostPopularStore) {
                              db.collection('restaurants').doc(mostPopularStore.toString()).get()
                                .then(store => {
                                  storeName = store.data().name;

                                  if (mostPopularSnack && mostPopularDay && mostPopularStore != null) {
                                    db.collection('users').doc(user.id).collection("habits").doc("orders").set({
                                      snack: mostPopularSnack,
                                      day: mostPopularDay,
                                      store: mostPopularStore,
                                      sauce: mostPopularSauce,
                                      order: mostPopularOrder,
                                      storeName: storeName
                                    }).then(() => {
                                      console.log("updated");
                                    })
                                  }
                                })
                            } else {
                              if (mostPopularSnack && mostPopularDay && mostPopularStore != null) {
                                db.collection('users').doc(user.id).collection("habits").doc("orders").set({
                                  snack: mostPopularSnack,
                                  day: mostPopularDay,
                                  store: mostPopularStore,
                                  sauce: mostPopularSauce,
                                  order: mostPopularOrder
                                }).then(() => {
                                  console.log("updated");
                                })
                              }
                            }
                          }
                        })
                    })
                  })

                //returns null if there was no most popular item
                function popular(arr) {
                  arr.sort();
                  var max = 0, result, freq = 0;
                  for (var i = 0; i < arr.length; i++) {
                    //console.log(arr[i]);
                    if (arr[i] === arr[i + 1]) {
                      freq++;
                    }
                    else {
                      freq = 0;
                    }
                    if (freq > max) {
                      result = arr[i];
                      max = freq;
                    }
                  }
                  console.log(result);
                  return result;
                }
              });
            });
          });
          console.log(users);
          return db.collection('orders').doc(bite).update({ users: users }).then(() => { return 'done' });
        }
      });
    } else {
      console.log('Already Has Users');
      return 'done';
    }
  });