'use strict';
process.env.DEBUG = 'actions-on-google:*';

const functions = require('firebase-functions');

//firebase database ref
const admin = require('firebase-admin');
admin.initializeApp(functions.config().firebase);

//FIRESTORE
var db = admin.firestore();

//cloud firestore refs
const FS_Orders = db.collection('orders');
const FS_Stores = db.collection('restaurants');
const FS_Users = db.collection('users');

//Moment.js
var moment = require('moment');
moment().format();


/*
Checks the database to see if the user already has an account, this is done by comparing the access tokens
Performs a https request to get the current user's information if the access token did not match any in the database.
Updates the access token in the database
Calls the getUserOrder function on succesfull authentication
*/
exports.biteUser = (assistant) => {
    //OAUTH SIGNIN 
    let parsedData; //stores the parsed json 
    let userData; // stores the user data when the email matches in the db
    let speech = "";
    let i = 0;

    let accestoken = assistant.getUser().accessToken;
    console.log("Access token: " + accestoken);

    let query = FS_Users.where('access_token', '==', accestoken).get()
        .then(snapshot => {
            snapshot.forEach(doc => {
                console.log(doc.id, '=>', doc.data());
                assistant.data = { username: doc.data().display_name, userkey: doc.id };
                userData = doc;
                i = 1;
            });
            if (i == 1) {
                //get the users current open orders and finish the welcome intent
                getUserOrder(assistant, userData);
            } else if (accestoken) {
                const https = require('https');
                https.get('https://www.googleapis.com/plus/v1/people/me?access_token=' + accestoken, (resp) => {
                    let jsondata = '';

                    // A chunk of data has been recieved.
                    resp.on('data', (chunk) => {
                        jsondata += chunk;
                    });

                    // The whole response has been received. Print out the result.
                    resp.on('end', () => {
                        parsedData = JSON.parse(jsondata);
                        console.log(parsedData);
                        if (parsedData.emails) {
                            //check if the user is using a move4mobile google account
                            if (parsedData.domain == "move4mobile.com" || parsedData.emails[0].value == "biteexample@gmail.com") {
                                let emailQuery = FS_Users.where('email', '==', parsedData.emails[0].value).get()
                                    .then(snapshot => {
                                        snapshot.forEach(doc => {
                                            console.log(doc.id, '=>', doc.data());
                                            assistant.data = { username: doc.data().display_name, userkey: doc.id };
                                            userData = doc;
                                            db.collection('users').doc(doc.id).update({ access_token: accestoken });
                                            i = 1;
                                        });
                                        if (i == 1) {
                                            //get the users current open orders and finish the welcome intent
                                            getUserOrder(assistant, userData);
                                        } else {
                                            speech = `<speak> I couldn't find an account for this email.</speak>`;
                                            assistant.tell(speech);
                                            //TODO: Create the user account
                                        }
                                    })
                            } else {
                                speech = `<speak> Sorry, this app has an email domain restriction and does not allow external users. </speak>`;
                                assistant.tell(speech);
                            }
                        } else {
                            speech = `<speak> Something went wrong. If this problem persists, visit https://myaccount.google.com/permissions to revoke access to this app. It may take up to a few hours for the changes to take effect. </speak>`;
                            assistant.tell(speech);
                        }
                    });
                }).on("error", (err) => {
                    console.log("Error: " + err.message);
                });
            }
        }).catch(err => {
            console.log('Error getting documents', err);
        });
};

/*
Checks if there are any open Bites in the specified location
*/
exports.biteLocation = (assistant) => {
    const locationContext = assistant.getArgument("Location");
    console.log(locationContext);
    let storeNames = [];
    let speech = "";
    let orderStore;
    let getOpenOrders = FS_Orders.where('status', '==', 'open').where('location', '==', locationContext.toString())
        .get()
        .then(snapshot => {
            snapshot.forEach(doc => {
                console.log(doc.id, '=>', doc.data());
                storeNames.push(doc.data().storename);
            })
        }).then(stores => {
            if (storeNames.length != 0) {
                orderStore = `<break time="1"/>, you can order from ${storeNames.toString()} or open a Bite yourself`;
                assistant.setContext("user_order", 2);
                assistant.setContext("edit_order", 2);
            } else {
                orderStore = `<break time="1"/>. You can try ordering from another location, or start a Bite here yourself! `;
            }
            speech = `<speak> there are currently ${storeNames.length} open bites in ${locationContext}` + orderStore + `</speak>`;
            assistant.ask(speech);
        })
};

/*
Saying: "Edit <STORE>" responds with the user's order in that store, listing all snacks with amount and the total price
Saying: "Add/Remove <SNACK>" after the first response or after quickOrder will update the snack amounts/ remove the snack entirely or add a new snack
*/
exports.getUserOrderItems = (assistant) => {
    //get the arguments from the user, can be empty
    const storeContext = assistant.getArgument("store");
    const changeContext = assistant.getArgument("action");
    const snackContext = assistant.getArgument("snack");
    let amountContext = assistant.getArgument("number");
    console.log("Change: " + changeContext + ", Snack: " + snackContext + ", Amount: " + amountContext + ", Store: " + storeContext);

    let userKey = assistant.data.userkey;
    let speech;
    let Store;

    let amountAndSnacks = "";
    let amountAndSnacksFail = "";
    let totalPrice = 0;
    let check = 0;
    let checkOrder = 0;
    let change;

    //the first response of the edit function, lists the entire order
    if (storeContext && !snackContext) {
        assistant.data = { userStore: storeContext };
        getOrder(userKey, storeContext).then(array => {
            for (let i = 0; i < array.length; i++) {
                check = 1;
                amountAndSnacks += array[i].data().amount + " " + array[i].data().name + ", ";
                totalPrice += array[i].data().price;
            }
            if (check == 1) {
                speech = `<speak> your order contains: ${amountAndSnacks} with a total price of` +
                    `<say-as interpret-as="currency">EUR${totalPrice / 100}</say-as>. You can add and remove items from your order, or lock it when you're done.` +
                    `</speak>`
            } else {
                speech = `<speak> You don't have an order to edit for this store, try again for a different store. </speak>`
            }

            assistant.ask(speech)
        })
    } else { //the add/remove part
        Store = assistant.data.userStore;

        //gets all items in the user's order
        getOrder(userKey, Store).then(array => {
            for (let i = 0; i < snackContext.length; i++) {
                //gets the doc id and data for a specific product
                getProduct(Store, snackContext[i]).then(product => {
                    if (product) {
                        getSingleStore(Store).then(id => {
                            if (changeContext == "add") {
                                //sets amount to 1 if it is 0
                                if (amountContext[i]) {
                                } else {
                                    amountContext[i] = 1;
                                }
                                let amount = amountContext[i];
                                for (let o = 0; o < array.length; o++) {
                                    if (array[o].data().name == product.data().name) {
                                        amount = (array[o].data().amount + amountContext[i]);
                                    }
                                }
                                //build the response
                                change = "added";
                                amountAndSnacks += amountContext[i] + " " + snackContext[i] + ", ";

                                //update the database
                                FS_Orders.doc(id).collection('orders').doc(userKey.toString()).collection('snacks').doc(product.id).set({
                                    amount: amount,
                                    name: product.data().name,
                                    price: ((product.data().price * amount))
                                });

                                checkOrder = 1;

                            } else if (changeContext == "remove") {
                                //sets amount to 999 if it is 0
                                if (amountContext[i]) {
                                } else {
                                    amountContext[i] = 999;
                                }
                                let amount = 0;
                                for (let o = 0; o < array.length; o++) {
                                    if (array[o].data().name == product.data().name) {
                                        amount = (array[o].data().amount - amountContext[i]);
                                        if (amount < 0) {
                                            amount = 0;
                                            FS_Orders.doc(id).collection('orders').doc(userKey.toString()).collection('snacks').doc(product.id).delete();

                                            //build the responses
                                            change = "removed";
                                            amountAndSnacks += "all " + " " + product.data().name + ", ";
                                        } else {
                                            //build the response
                                            change = "removed";
                                            amountAndSnacks += amountContext[i] + " " + product.data().name + ", ";

                                            //update the database
                                            FS_Orders.doc(id).collection('orders').doc(userKey.toString()).collection('snacks').doc(product.id).update({
                                                amount: amount,
                                                name: product.data().name,
                                                price: (product.data().price * amount)
                                            });
                                        }
                                        checkOrder = 1;
                                    }
                                }
                            }
                            if (i == snackContext.length - 1) {
                                reponse();
                            }
                        })
                    } else {
                        amountAndSnacksFail += " could not add or remove " + snackContext[i] + ", ";
                        if (i == snackContext.length - 1) {
                            reponse();
                        }
                    }
                })
            }
        })
    }

    function reponse() {
        if (checkOrder == 1) {
            speech = `<speak> ${change} ${amountAndSnacks} ${amountAndSnacksFail}` +
                `You can add and remove items from your order, or lock it when you're done.` +
                `</speak>`
        } else {
            speech = `<speak>${amountAndSnacksFail} was not found in this store, try ordering from a different store.</speak>`
        }
        assistant.ask(speech);
    }
};

/*
The easiest way to place an order
Can be performed at any point in the conversation
Adds the snacks to the order at the specified shop
Also works if the user already has an order at that store, in that case it simply updates the amount
*/
exports.quickOrder = (assistant) => {

    let snackCount = 0;
    let snackString = "";
    let userKey = assistant.data.userkey;
    let storename;
    let id;

    //get the arguments from the user query
    const changeContext = assistant.getArgument("action");
    const snackContext = assistant.getArgument("snack");
    let amountContext = assistant.getArgument("number");
    let storeContext = assistant.getArgument("store");
    console.log("Change: " + changeContext + ", Snack: " + snackContext + ", Amount: " + amountContext + ", Store: " + storeContext);
    if (changeContext == "remove") {
        return assistant.ask(`<speak> You need to be in edit mode to remove an item, try saying edit, followed by your store of choice. </speak>`)
    }

    //get the right open bite
    let getOpenOrders = FS_Orders.where('status', '==', 'open').where('store', '==', parseInt(storeContext)).get()
        .then(snapshot => {
            //should only ever return 1 store
            snapshot.forEach(doc => {
                storename = doc.data().storename;
                id = doc.id;
            })
            return id;
        }).then(snapshot => {
            if (snapshot) {
                //check if the user already has an order at this bite
                let getUserOrders = FS_Orders.doc(snapshot).collection('orders').doc(userKey).get()
                    .then(doc => {
                        snackContext.forEach(entry => {
                            //if amount is undefined set to 1
                            if (amountContext[snackCount]) {
                            } else {
                                amountContext[snackCount] = 1;
                            }
                            let getProducts = FS_Stores.doc(storeContext.toString()).collection('products').where('name', '==', entry).limit(1).get()
                                .then(object => {
                                    object.forEach(item => {
                                        if (item) {
                                            if (!doc.exists) {
                                                FS_Orders.doc(id).collection('orders').doc(userKey).set({
                                                    locked: false
                                                });
                                                FS_Orders.doc(id).collection('orders').doc(userKey).collection('snacks').doc(item.id).set({
                                                    amount: amountContext[snackContext.indexOf(entry)],
                                                    name: item.data().name,
                                                    price: (item.data().price * amountContext[snackContext.indexOf(entry)])
                                                });
                                                snackString += `<say-as interpret-as="cardinal">${amountContext[snackContext.indexOf(entry)]}</say-as> ${item.data().name}, `;
                                                snackCount++;
                                                if (snackCount == snackContext.length) {
                                                    return response();
                                                }
                                            } else {
                                                //check if the item is already in the user's order
                                                FS_Orders.doc(id).collection('orders').doc(userKey).collection('snacks').doc(item.id)
                                                    .get()
                                                    .then(currentItem => {
                                                        if (!currentItem.exists) {
                                                            FS_Orders.doc(id).collection('orders').doc(userKey).collection('snacks').doc(item.id).set({
                                                                amount: amountContext[snackContext.indexOf(entry)],
                                                                name: item.data().name,
                                                                price: (item.data().price * amountContext[snackContext.indexOf(entry)])
                                                            });
                                                            snackString += `<say-as interpret-as="cardinal">${amountContext[snackContext.indexOf(entry)]}</say-as> ${item.data().name}, `;
                                                        } else {
                                                            FS_Orders.doc(id).collection('orders').doc(userKey).collection('snacks').doc(item.id).update({
                                                                amount: (amountContext[snackContext.indexOf(entry)] + currentItem.data().amount),
                                                                name: item.data().name,
                                                                price: (item.data().price * (amountContext[snackContext.indexOf(entry)] + currentItem.data().amount))
                                                            });
                                                            snackString += `<say-as interpret-as="cardinal">${amountContext[snackContext.indexOf(entry)]}</say-as> ${item.data().name}, `;
                                                        }
                                                        snackCount++;
                                                        if (snackCount == snackContext.length) {
                                                            return response();
                                                        }
                                                    })
                                            }
                                        }
                                    })
                                })
                        })
                        return doc;
                    })
            } else {
                return assistant.ask("There is no open Bite for this store, try ordering from another store.");
            }
        })
    function response() {
        //save the store for easy switching to edit mode
        assistant.data = { userStore: storeContext };
        //allow editing of the order
        assistant.setContext("edit_order", 2);
        let speech = `<speak> Added ${snackString} you can add and remove items, or lock the order when you're done.</speak>`;
        assistant.ask(speech);
    }
};

/*
Lets an user open or close a Bite
Anyone can open a Bite
A Bite cannot be closed from a Google Home device, to prevent unauthorized people from closing it.
*/
exports.AdminFunctions = (assistant) => {

    //check if the device is a phone
    let hasScreen = assistant.hasSurfaceCapability(assistant.SurfaceCapabilities.SCREEN_OUTPUT)

    //get the arguments from the user query
    const changeContext = assistant.getArgument("action");
    const storeContext = assistant.getArgument("store");
    console.log("Change: " + changeContext + ", Store: " + storeContext);

    //get the userID
    let userkey = assistant.data.userkey;

    let speech = `<speak> You don't have permission to close this Bite. Make sure that you're an admin and that you're using a mobile device. </speak>`;
    let ordercheck = 0;

    FS_Orders.where('status', '==', 'open').where('store', '==', parseInt(storeContext)).get()
        .then(snapshot => {
            snapshot.forEach(doc => {
                if (changeContext == "remove" || changeContext == "close") {
                    if (hasScreen) {
                        if (assistant.data.userkey == doc.data().opened_by || assistant.getContext("admin")) {
                            FS_Orders.doc(doc.id).update({
                                status: "closed"
                            });
                            speech = `<speak> The ${doc.data().storename} Bite has been closed. Anything else? </speak>`;
                        }
                    }
                } else {
                    speech = `<speak> There is already an open Bite for this store, please choose another store. </speak>`;
                }
                ordercheck = 1;
                assistant.ask(speech);
            });
            return ordercheck;
        }).then(ordercheck => {
            if (ordercheck == 0 && changeContext == "add") {
                FS_Stores.doc(storeContext).get()
                    .then(doc => {
                        let now = new Date();
                        FS_Orders.doc((storeContext + now.setMinutes(now.getMinutes() + 0)).toString()).set({
                            open_time: now.setMinutes(now.getMinutes() + 0),
                            close_time: now.setMinutes(now.getMinutes() + 30),
                            duration: 30,
                            location: doc.data().location,
                            opened_by: userkey,
                            status: "open",
                            store: parseInt(storeContext),
                            storename: doc.data().name
                        }).then(() => {
                            speech = `<speak> I’ve opened a Bite for ${doc.data().name} in ${doc.data().location}. The Bite will be open for 30 minutes so hurry up and place your orders!  </speak>`;
                            return assistant.tell(speech);
                        })
                    })
            } else {
                speech = `<speak> There is no open Bite for this store, try for another store! </speak>`;
                return assistant.ask(speech);
            }
        })
};

/*
Locks the user's order
*/
exports.lockOrder = (assistant) => {
    //get the arguments from the user query
    const storeContext = assistant.getArgument("store");

    //get the userID
    let userkey = assistant.data.userkey;

    let speech;

    FS_Orders.where('status', '==', 'open').where('store', '==', parseInt(storeContext)).get()
        .then(snapshot => {
            snapshot.forEach(doc => {
                FS_Orders.doc(doc.id).collection("orders").doc(userkey).get()
                    .then(doc => {
                        if (!doc.exists) {
                            speech = `<speak> Sorry, I couldn't lock your order. You can try for a different store.  </speak>`;
                            assistant.ask(speech);
                        } else {
                            FS_Orders.doc(doc.id).collection("orders").doc(userkey).update({
                                locked: true
                            })
                            speech = `<speak> Your order has been locked! Thanks for ordering with Bite!</speak>`;
                            assistant.tell(speech);
                        }
                    })
            })
        })
};

/*
Responds with the amount of users in an order and shows how many of them have their order locked in
*/
exports.finishOrder = (assistant) => {
    //get the arguments from the user query
    const storeContext = assistant.getArgument("store");
    //get the userID
    let userkey = assistant.data.userkey;
    //users in order
    let users = 0;
    //users that have their order locked
    let lockedUsers = 0;
    //save the database key for the next intent
    let saveOrder;
    //the response
    let speech;

    //get the open Bite for the selected store
    //get all user orders and check if they are locked
    FS_Orders.where('status', '==', 'open').where('store', '==', parseInt(storeContext)).get()
        .then(snapshot => {
            if (snapshot.size > 0) {
                snapshot.forEach(doc => {
                    FS_Orders.doc(doc.id).collection("orders").get()
                        .then(userOrders => {
                            userOrders.forEach(userOrder => {
                                saveOrder = doc.id;
                                users++;
                                if (userOrder.data().locked == true) {
                                    lockedUsers++;
                                }
                            })
                        }).then(() => {
                            assistant.data = { userStore: storeContext, saveOrder: saveOrder, userkey: userkey };
                            if (users == lockedUsers && users != 0) {
                                speech = `<speak> All ${users} user(s) have locked their order. Do you want me to tell you the total list of orders?</speak>`;
                            } else if (users != 0) {
                                speech = `<speak> ${lockedUsers} out of ${users} user(s) have locked their order. Want to hear all orders? </speak>`;
                            } else {
                                speech = `<speak> This Bite doesn't have any orders yet, maybe you should place the first one! </speak>`;
                            }
                            assistant.ask(speech);
                        })
                })
            } else {
                speech = `<speak> There is no open Bite for this store, try starting one! </speak>`;
                assistant.ask(speech);
            }
        })
};

/*
responds with the total combined order for a single store
*/
exports.listTotalOrder = (assistant) => {

    const storeContext = assistant.data.userStore; //get the store that was saved during finishOrder();
    let userkey = assistant.data.userkey; //get the userID
    let savedOrder = assistant.data.saveOrder; //get the orders key

    let nameArray = [];
    let amountArray = [];
    let count = 0;
    let orderString = "";
    let orderprice = 0;
    let speech;

    //for each user that has an order in this store
    FS_Orders.doc(savedOrder).collection('orders').get()
        .then(snapshot => {
            if (snapshot.size > 0) {
                snapshot.forEach(doc => {
                    //get all snacks of the user and save them
                    getOrder(doc.id, storeContext).then(snacks => {
                        snacks.forEach(doc => {
                            let index = nameArray.indexOf(doc.data().name);
                            if (index === 0) {
                                amountArray[index] = (amountArray[index] + doc.data().amount);
                            } else {
                                nameArray.push(doc.data().name);
                                amountArray.push(doc.data().amount);
                            }
                            orderprice += doc.data().price;
                        })
                        count++;
                        if (count == snapshot.size) {
                            for (let i = 0; i < amountArray.length; i++) {
                                orderString += `<say-as interpret-as="cardinal">` + amountArray[i] + "</say-as> " + nameArray[i] + ", ";
                            }
                            if (count != 0) {
                                speech = `<speak> The combined order of all users consists of: ${orderString} with a total cost of <say-as interpret-as="currency">EUR${orderprice / 100}</say-as>. Maybe you should place the order! </speak>`;
                                assistant.tell(speech);
                            } else {
                                speech = `<speak> Oops, something went wrong, try again for a different store.  </speak>`;
                                assistant.ask(speech);
                            }
                        }
                    })
                })
            } else {
                speech = `<speak> Oops, something went wrong, try again for a different store.  </speak>`;
                assistant.ask(speech);
            }
        })
}

/*
Gets all synonyms for a certain snack
Adds the user's spoken synonym to the list
Updates Dialogflow with the new synonyms
*/
exports.learnMode = (assistant) => {

    let snack = assistant.getArgument("snack");
    let text = assistant.getArgument("any");
    console.log("snack: " + snack);
    console.log("text: " + text);

    let currentSynonyms = [];
    let speech = "hiiii";

    //PUT entities
    if (snack) {
        text = assistant.data.text;
        assistant.data = { snack: snack };
    } else if (text) {
        snack = assistant.data.snack;
        assistant.data = { text: text };
    }

    if (snack && !text) {
        speech = `<speak> Your pronunciation of ${snack} was correct. No need to add any synonyms for it.</speak>`;
        assistant.ask(speech);
    } else if (text && !snack) {
        assistant.data = { text: text };
        speech = `<speak> Unrecognized snack. Type the name of the snack if you want to add ${text} as a synonym for it.</speak>`;
        assistant.ask(speech);
    } else if (text && snack) {
        //GET the entity and store the current synonyms. we need to add this again later so they don't get overwritten.
        var https = require('https');
        var options = {
            hostname: 'api.api.ai',
            path: '/v1/entities/5c3243d4-a29f-4779-a13e-ac91c2a9e728?v=20150910',
            method: 'GET',
            headers: { "Authorization": "Bearer d517f269ee6f4d01b6becd58bc070d85" }
        };
        var callback = function (data) {
            console.log(data);
            for (let i = 0, l = data.entries.length; i < l; i++) {
                if (data.entries[i].value == snack) {
                    console.log("snack: " + snack);
                    for (let o = 0, l = data.entries[o].synonyms.length; o <= l; o++) {
                        if (data.entries[i].synonyms[o] != null) {
                            currentSynonyms.push(data.entries[i].synonyms[o]);
                            console.log("synonyms: " + data.entries[i].synonyms[o]);
                            console.log("current: " + currentSynonyms);
                        }
                    }
                }
            }
            setSynonyms();
        }
        https.get(options, function (res) {
            console.log("Got response: " + res.statusCode);
            var body = '';
            res.on('data', function (data) {
                body += data;
            });
            res.on('end', function () {
                var result = JSON.parse(body);
                callback(result);
            });
        }).on('error', function (e) {
            console.log("Got error: " + e.message);
        });

        function setSynonyms() {
            //assistant.ask(speech);
            var https = require('https');
            var options = {
                hostname: 'api.api.ai',
                path: '/v1/entities/5c3243d4-a29f-4779-a13e-ac91c2a9e728/entries?v=20150910',
                method: 'PUT',
                headers: {
                    "Authorization": "Bearer d517f269ee6f4d01b6becd58bc070d85",
                    "Content-Type": "application/json; charset=utf-8"
                }
            };

            var req = https.request(options, function (res) {
                console.log('STATUS: ' + res.statusCode);
                console.log('HEADERS: ' + JSON.stringify(res.headers));
                res.setEncoding('utf8');
                res.on('data', function (chunk) {
                    console.log('BODY: ' + chunk);
                });
            });

            req.on('error', function (e) {
                console.log('problem with request: ' + e.message);
            });

            currentSynonyms.push(text);
            let body = JSON.stringify(
                [
                    {
                        "synonyms":
                            currentSynonyms
                        ,
                        "value": snack,
                    }
                ]
            )

            // write data to request body
            req.write(body);
            req.end();

            speech = `<speak> added your pronounciation: ${text} as a synonym for ${snack} </speak>`;
            assistant.ask(speech);
            assistant.data = { text: null };
        }
    }
};

/* 
                                                    PRIVATE FUNCTIONS
    these functions are only used by the export functions in this file and are not directly connected to a Dialogflow Action
*/

/*
Handles the welcome intent after the user is authenticated
Checks the database to see if the user already has an order or if a Bite opened today.
Builds a response and sets the right contexts
*/
function getUserOrder(assistant, user) {

    let userKey = assistant.data.userkey;

    let message = " A Bite just Opened at ";
    let speech;

    let todayHasBite = false;
    let amountOfOrders = 0;
    let stores = [];
    let storeNames = [];

    //Get all open orders, check if the user has an order there.
    let getOpenOrders = FS_Orders.where('status', '==', 'open').get()
        .then(snapshot => {
            snapshot.forEach(doc => {
                if (moment().isSame(moment(doc.data().open_time), 'day')) {
                    todayHasBite = true
                    message += doc.data().storename + ", ";
                }
                stores.push(doc);
            });
            return stores;
        }).then(stores => {
            if (stores.length != 0) {
                let amount = 0;
                for (let i = 0; i < stores.length; i++) {
                    FS_Orders.doc(stores[i].id.toString()).collection('orders').doc(userKey).get()
                        .then(doc => {
                            if (doc.exists) {
                                amountOfOrders++; //+1 order
                                storeNames.push(stores[i].data().storename);
                            }
                            amount++;
                            if (amount === stores.length) {
                                if (user.data().admin) {
                                    assistant.setContext("admin", 10);
                                }
                                if (amountOfOrders == 0) {
                                    assistant.setContext("user_order", 5);
                                    assistant.data = { username: user.data().display_name, userkey: userKey };
                                    if (!todayHasBite) {
                                        speech = `<speak> Welcome ${user.data().display_name}! No Bites have recently been opened, you can use the create command to start a new Bite or say start to order from older Bites. </speak>`;
                                    } else {
                                        speech = `<speak> Welcome ${user.data().display_name}!` + message + ` do you want to place an order here?.</speak>`;
                                    }
                                    assistant.ask(speech);
                                } else {
                                    assistant.setContext("user_order", 2);
                                    assistant.setContext("edit_order", 2);
                                    assistant.data = { username: user.data().display_name, userkey: userKey };

                                    const speech = `<speak> Welcome ${user.data().display_name}! You have ${amountOfOrders} open order(s) at ${storeNames.toString()}.<break time="1"/>` +
                                        `Would you like to edit a current order or start another?</speak>`;
                                    assistant.ask(speech);
                                }
                            }
                        })
                }
            } else {
                assistant.setContext("user_order", 5);
                assistant.data = { username: user.data().display_name, userkey: userKey };
                speech = `<speak> Welcome ${user.data().display_name}! No Bites have recently been opened, you can use the create command to start a new Bite. </speak>`;
                assistant.ask(speech);
            }
        })
};

//returns all items in an user's order
function getOrder(user, store) {

    let snacks = [];
    let docID;
    return FS_Orders.where('status', '==', 'open').where('store', '==', parseInt(store)).get()
        .then(snapshot => {
            snapshot.forEach(doc => {
                docID = doc.id;
            });
            return docID;
        }).then(snapshot => {
            return FS_Orders.doc(snapshot.toString()).collection('orders').doc(user.toString()).collection('snacks').get()
                .then(snapshot => {
                    snapshot.forEach(doc => {
                        snacks.push(doc);
                    });
                    return snacks;
                })
        })
}

//returns a single product key and information
function getProduct(store, productName) {
    let i;
    return FS_Stores.doc(store).collection('products').where('name', '==', productName).get()
        .then(snapshot => {
            snapshot.forEach(doc => {
                i = doc;
            });
            return i;
        })
}

//returns the database ID of the open Bite for the given store
function getSingleStore(store) {
    let docID
    return FS_Orders.where('status', '==', 'open').where('store', '==', parseInt(store)).get()
        .then(snapshot => {
            snapshot.forEach(doc => {
                docID = doc.id;
            });
            return docID;
        })
}