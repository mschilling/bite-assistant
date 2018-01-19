'use strict';

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
Allows the user to switch from a speaker device to a phone at any point in the conversation.
Most data from the conversation will be maintained so the user can continue from where they switched
*/
exports.switchScreen = (assistant) => {
    if (assistant.hasSurfaceCapability(assistant.SurfaceCapabilities.SCREEN_OUTPUT)) {
        if (!assistant.isNewSurface()) {
            assistant.tell("I found no screen.");
        } else {
            assistant.ask("Hey, Bite here. So we switched to a phone, now what do you want to do?");
        }
    } else if (assistant.hasAvailableSurfaceCapabilities(assistant.SurfaceCapabilities.SCREEN_OUTPUT)) {
        try {
            let res = assistant.askForNewSurface("Bite Service on a screen", "Continue talking to Bite service", [assistant.SurfaceCapabilities.SCREEN_OUTPUT]);
            console.log(res);
        } catch (e) {
            console.error("ERROR askForNewSurface()");
            console.log(e);
        }
    } else {
        assistant.tell("Sorry I found no screen");
    }
}

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
                iKnowWhatYourFavouriteSnackIs(assistant);
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
                            //remove this line if you just want to check if the email matches with the one in the database
                            //if (parsedData.domain == "move4mobile.com" || parsedData.emails[0].value == "biteexample@gmail.com") {
                            let emailQuery = FS_Users.where('email', '==', parsedData.emails[0].value).get()
                                .then(snapshot => {
                                    if (snapshot.size > 0) {
                                        snapshot.forEach(doc => {
                                            console.log(doc.id, '=>', doc.data());
                                            assistant.data = { username: doc.data().display_name, userkey: doc.id };
                                            userData = doc;
                                            db.collection('users').doc(doc.id).update({ access_token: accestoken });

                                            //get the users current open orders and finish the welcome intent
                                            iKnowWhatYourFavouriteSnackIs(assistant);
                                            getUserOrder(assistant, userData);
                                        });
                                    } else {
                                        //move4mobile email but without an account, create a new account
                                        //name can be empty
                                        let newPostRef = db.collection('users').add({
                                            access_token: accestoken,
                                            admin: false,
                                            display_name: "NEW USER",
                                            email: parsedData.emails[0].value,
                                            photo_url: parsedData.image.url
                                        }).then(doc => {
                                            console.log(doc.id);
                                            assistant.data = { userkey: doc.id };
                                            let namePermission = assistant.SupportedPermissions.NAME;
                                            // Ask for name permission since the google+ api often doesn't return the name
                                            assistant.askForPermission('Looks like you\'re new to Bite. To sign you up', namePermission);
                                        })
                                    }
                                })
                            // } else {
                            //     speech = `<speak> Sorry, this app has an email domain restriction and does not allow external users. </speak>`;
                            //     assistant.tell(speech);
                            // }
                        } else {
                            speech = `<speak> Something went wrong. If this problem persists, try unlinking the app through the app store. </speak>`;
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
gets the name from permissions and adds it to the database
*/
exports.signup = (assistant) => {
    if (assistant.isPermissionGranted()) {
        let displayName = assistant.getUserName().displayName;
        let key = assistant.data.userkey;
        db.collection('users').doc(key).update({
            display_name: displayName
        });
        assistant.tell(`Hello ${displayName} and welcome to Bite. You can start the Bite app again to start ordering.`);
    } else {
        assistant.tell(`You didn't grant permission, You'll be called NEW USER forever!`);
    }
}

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
                speech = `<speak> there are currently ${storeNames.length} open bites in ${locationContext}` + orderStore + `</speak>`;
                assistant.ask(assistant.buildRichResponse()
                    .addSimpleResponse({ speech })
                    .addSuggestions(['Order from ' + storeNames[0], 'Create a Bite', 'Never mind'])
                );
            } else {
                speech = `<speak> there are currently ${storeNames.length} open bites in ${locationContext} ${orderStore} </speak>`;

                let list = assistant.buildList(`Choose your desired store`);

                //foreach store
                FS_Stores.get()
                    .then(storeSnapshot => {

                        //check if there already is an open bite for that store
                        FS_Orders.where('status', '==', 'open').get()
                            .then(snapshot => {
                                let stores = [];
                                snapshot.forEach(doc => {
                                    stores.push(doc.data().store);
                                })
                                return stores;
                            }).then(storeArray => {
                                let i = 0;
                                let count = 0;
                                storeSnapshot.forEach(store => {
                                    console.log(store.data().name + " :: " + store.id + " :: " + storeArray[i]);
                                    if (storeArray.indexOf(store.data().id) == -1) {
                                        list.addItems(assistant.buildOptionItem(changeContext + store.data().id, [`${store.data().name}`])
                                            .setTitle(`${store.data().name}`)
                                            .setDescription(`${store.data().description}`)
                                        )
                                        count++;
                                    }
                                    i++;
                                })
                                return count;
                            }).then(count => {
                                if (count == 0) {
                                    return assistant.ask("There's an open Bite for every store already, go ahead and place an order.");
                                } else if (count == 1) {
                                    list.addItems(assistant.buildOptionItem("placeholder", [`placeholder`])
                                        .setTitle("placeholder")
                                        .setDescription(`Please don't click me QwQ`)
                                    )
                                    assistant.askWithList(`There are no open Bites in ${locationContext}. Do you want to start a Bite?`, list)
                                } else if (count > 1) {
                                    assistant.askWithList(`There are no open Bites in ${locationContext}. Do you want to start a Bite?`, list)
                                }
                            })
                    })
            }
        })
};

/*
Saying: "Edit <STORE>" responds with the user's order in that store, listing all snacks with amount and the total price
Saying: "Add/Remove <SNACK>" after the first response or after quickOrder will update the snack amounts/ remove the snack entirely or add a new snack
*/
exports.getUserOrderItems = (assistant) => {
    //get the arguments from the user, can be empty
    let storeContext = assistant.getArgument("store");
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
    let message = "";
    let amountOfSauces = 0;
    let hasSauce = 0;
    let saveStore;
    //the first response of the edit function, lists the entire order
    if (storeContext && !snackContext) {
        assistant.data = { userStore: storeContext };
        getOrder(userKey, storeContext).then(array => {
            for (let i = 0; i < array.length; i++) {
                if (array[i].data().isSauce) {
                    amountOfSauces += array[i].data().amount;
                }
                if (array[i].data().hasSauce) {
                    hasSauce += array[i].data().amount;
                }
                check = 1;
                amountAndSnacks += array[i].data().amount + " " + array[i].data().name + ", ";
                totalPrice += array[i].data().price;
            }
            let count = amountOfSauces - hasSauce;
            let amountOfDiscounts = 0;
            //more sauces than discounts
            if (count > 0) {
                amountOfDiscounts = amountOfSauces - count;
            } else if (count == 0) {
                amountOfDiscounts = hasSauce;
            } else {
                amountOfDiscounts = hasSauce + count;
            }
            totalPrice = totalPrice - (amountOfDiscounts * 50);

            if (check == 1) {
                message = "You can add and remove items from your order, or lock it when you're done.";

                speech = `<speak> your order contains ${amountAndSnacks}with a total price of` +
                    `<say-as interpret-as="currency">EUR${totalPrice / 100}</say-as>. ` + message +
                    `</speak>`;
                return assistant.ask(assistant.buildRichResponse()
                    .addSimpleResponse({ speech })
                    .addSuggestions(['lock', 'add', 'remove', 'Never mind'])
                );
            } else {
                speech = `<speak> You don't have an order to edit for this store, try again for a different store. </speak>`;
                assistant.ask(speech)
            }
        })
    } else { //the add/remove part
        Store = assistant.data.userStore;
        storeContext = Store;
        //gets all items in the user's order
        getOrder(userKey, Store).then(array => {
            for (let i = 0; i < snackContext.length; i++) {
                //gets the doc id and data for a specific product
                getProduct(Store, snackContext[i]).then(product => {
                    if (product) {
                        getSingleStore(Store).then(id => {
                            saveStore = id;
                            if (changeContext == "add") {
                                checkOrder = 1;
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
                                    price: ((product.data().price * amount)),
                                    isSauce: product.data().isSauce,
                                    hasSauce: product.data().hasSauce
                                }).then(() => {
                                    if (i == snackContext.length - 1) {
                                        reponse();
                                    }
                                });
                            } else if (changeContext == "remove") {
                                //sets amount to 999 if it is 0, remove all
                                if (amountContext[i]) {
                                } else {
                                    amountContext[i] = 999;
                                }
                                let amount = 0;
                                for (let o = 0; o < array.length; o++) {
                                    if (array[o].data().name == product.data().name) {
                                        checkOrder = 1;
                                        change = "removed";
                                        amount = (array[o].data().amount - amountContext[i]);
                                        if (amount <= 0) {
                                            FS_Orders.doc(id).collection('orders').doc(userKey.toString()).collection('snacks').doc(product.id).delete()
                                                .then(() => {
                                                    if (i == snackContext.length - 1) {
                                                        reponse();
                                                    }
                                                });
                                            amountAndSnacks += "all " + " " + product.data().name + ", ";
                                        } else {
                                            amountAndSnacks += amountContext[i] + " " + product.data().name + ", ";

                                            //update the database
                                            FS_Orders.doc(id).collection('orders').doc(userKey.toString()).collection('snacks').doc(product.id).update({
                                                amount: amount,
                                                name: product.data().name,
                                                price: (product.data().price * amount),
                                                isSauce: product.data().isSauce,
                                                hasSauce: product.data().hasSauce
                                            }).then(() => {
                                                if (i == snackContext.length - 1) {
                                                    reponse();
                                                }
                                            });
                                        }
                                    }
                                }
                            }
                        })
                    } else {
                        amountAndSnacksFail += "could not " + changeContext + " " + snackContext[i] + ", ";
                        if (i == snackContext.length - 1) {
                            reponse();
                        }
                    }
                })
            }
        })
    }

    function reponse() {
        let nameArray = [];
        let amountArray = [];
        let orderString = "";
        let orderprice = 0;
        let amountOfSauces = 0;
        let hasSauce = 0;
        getOrder(assistant.data.userkey, storeContext).then(snacks => {
            if (snacks.length > 0) {
                for (let i = 0; i < snacks.length; i++) {
                    if (snacks[i].data().isSauce) {
                        amountOfSauces += snacks[i].data();
                    }
                    if (snacks[i].data().hasSauce) {
                        hasSauce += snacks[i].data();
                    }
                    orderString += snacks[i].data().amount + " " + snacks[i].data().name + ", ";
                    orderprice += snacks[i].data().price;
                }
                let count = amountOfSauces - hasSauce;
                let amountOfDiscounts = 0;
                //more sauces than discounts
                if (count > 0) {
                    amountOfDiscounts = amountOfSauces - count;
                } else if (count == 0) {
                    amountOfDiscounts = hasSauce;
                } else {
                    amountOfDiscounts = hasSauce + count;
                }
                orderprice = orderprice - (amountOfDiscounts * 50);

                if (checkOrder == 1) {
                    speech = `<speak> ${change} ${amountAndSnacks}${amountAndSnacksFail}` +
                        `Your order contains ${orderString} with a total price of <say-as interpret-as="currency">EUR${orderprice / 100}</say-as>. ` +
                        `You can add and remove items from your order, or lock it when you're done.` +
                        `</speak>`;
                    return assistant.ask(assistant.buildRichResponse()
                        .addSimpleResponse({ speech })
                        .addSuggestions(['lock', 'add', 'remove', 'Never mind'])
                    );
                } else {
                    speech = `<speak>${amountAndSnacksFail}the snack was not found in this store, try ordering from a different store.</speak>`;
                    assistant.ask(speech);
                }
            } else {
                FS_Orders.doc(saveStore).collection('orders').doc(userKey.toString()).delete();
                speech = `<speak> ${change} ${amountAndSnacks}${amountAndSnacksFail}Your order for this store has been fully removed!`;
                assistant.tell(speech);
            }
        })
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
    let id;
    let checkOrder = 0;
    let amountAndSnacksFail = "";

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
    getSingleStore(storeContext)
        .then(doc => {
            id = doc;
            return doc;
        }).then(snapshot => {
            if (snapshot) {
                //check if the user already has an order at this bite
                let getUserOrders = FS_Orders.doc(snapshot).collection('orders').doc(userKey).get()
                    .then(doc => {
                        snackContext.forEach(entry => {
                            //if amount is undefined set to 1
                            if (amountContext[snackContext.indexOf(entry)]) {
                            } else {
                                amountContext[snackContext.indexOf(entry)] = 1;
                            }
                            getProduct(storeContext, entry)
                                .then(item => {
                                    if (item) {
                                        //check if the user has already placed an order at this store
                                        if (!doc.exists) {
                                            checkOrder = 1;
                                            //set locked
                                            FS_Orders.doc(id).collection('orders').doc(userKey).set({
                                                locked: false
                                            });
                                            //add snacks
                                            FS_Orders.doc(id).collection('orders').doc(userKey).collection('snacks').doc(item.id).set({
                                                amount: amountContext[snackContext.indexOf(entry)],
                                                name: item.data().name,
                                                price: (item.data().price * amountContext[snackContext.indexOf(entry)]),
                                                isSauce: item.data().isSauce,
                                                hasSauce: item.data().hasSauce
                                            }).then(() => {
                                                snackCount++;
                                                snackString += `<say-as interpret-as="cardinal">${amountContext[snackContext.indexOf(entry)]}</say-as> ${item.data().name}, `;
                                                if (snackCount == snackContext.length) {
                                                    return response();
                                                }
                                            });
                                        } else {
                                            //check if the item is already in the user's order
                                            FS_Orders.doc(id).collection('orders').doc(userKey).collection('snacks').doc(item.id).get()
                                                .then(currentItem => {
                                                    checkOrder = 1;
                                                    if (!currentItem.exists) {
                                                        FS_Orders.doc(id).collection('orders').doc(userKey).collection('snacks').doc(item.id).set({
                                                            amount: amountContext[snackContext.indexOf(entry)],
                                                            name: item.data().name,
                                                            price: (item.data().price * amountContext[snackContext.indexOf(entry)]),
                                                            isSauce: item.data().isSauce,
                                                            hasSauce: item.data().hasSauce
                                                        }).then(() => {
                                                            snackCount++;
                                                            snackString += `<say-as interpret-as="cardinal">${amountContext[snackContext.indexOf(entry)]}</say-as> ${item.data().name}, `;
                                                            if (snackCount == snackContext.length) {
                                                                return response();
                                                            }
                                                        });
                                                    } else {
                                                        //item is already in the order, update the amount
                                                        FS_Orders.doc(id).collection('orders').doc(userKey).collection('snacks').doc(item.id).update({
                                                            amount: (amountContext[snackContext.indexOf(entry)] + currentItem.data().amount),
                                                            name: item.data().name,
                                                            price: (item.data().price * (amountContext[snackContext.indexOf(entry)] + currentItem.data().amount)),
                                                            isSauce: item.data().isSauce,
                                                            hasSauce: item.data().hasSauce
                                                        }).then(() => {
                                                            snackCount++;
                                                            snackString += `<say-as interpret-as="cardinal">${amountContext[snackContext.indexOf(entry)]}</say-as> ${item.data().name}, `;
                                                            if (snackCount == snackContext.length) {
                                                                return response();
                                                            }
                                                        });
                                                    }
                                                })
                                        }
                                    } else {
                                        if (amountAndSnacksFail == "") {
                                            amountAndSnacksFail += " Failed to add "
                                        }
                                        amountAndSnacksFail += entry + ", ";
                                        if (snackCount == snackContext.length - 1) {
                                            return response();
                                        }
                                        snackCount++;
                                    }
                                })
                        })
                        return doc;
                    })
            } else {
                return assistant.ask("There is no open Bite for this store, try ordering from another store.");
            }
        })
    function response() {
        let nameArray = [];
        let amountArray = [];
        let orderString = "";
        let orderprice = 0;
        let speech = "";
        let amountOfSauces = 0;
        let hasSauce = 0;

        getOrder(assistant.data.userkey, storeContext).then(snacks => {
            for (let i = 0; i < snacks.length; i++) {
                if (snacks[i].data().isSauce) {
                    amountOfSauces += snacks[i].data().amount;
                }
                if (snacks[i].data().hasSauce) {
                    hasSauce += snacks[i].data().amount;
                }
                orderString += snacks[i].data().amount + " " + snacks[i].data().name + ", ";
                orderprice += snacks[i].data().price;
            }
            let count = amountOfSauces - hasSauce;
            let amountOfDiscounts = 0;
            //more sauces than discounts
            if (count > 0) {
                amountOfDiscounts = amountOfSauces - count;
            } else if (count == 0) {
                amountOfDiscounts = hasSauce;
            } else {
                amountOfDiscounts = hasSauce + count;
            }
            orderprice = orderprice - (amountOfDiscounts * 50);

            //save the store for easy switching to edit mode
            assistant.data = { userStore: storeContext };
            //allow editing of the order
            assistant.setContext("edit_order", 2);

            if (checkOrder == 1) {
                speech = `<speak> Added ${snackString}${amountAndSnacksFail}` +
                    `Your order contains ${orderString} with a total price of <say-as interpret-as="currency">EUR${orderprice / 100}</say-as>.` +
                    `You can add and remove items, or lock the order when you're done.</speak>`;
                assistant.ask(assistant.buildRichResponse()
                    .addSimpleResponse({ speech })
                    .addSuggestions(['lock', 'add ', 'remove', 'Never mind'])
                );
            } else {
                speech = `<speak>${amountAndSnacksFail}try ordering from a different store.</speak>`;
                assistant.ask(speech);
            }
        })
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
    let changeContext = assistant.getArgument("action");
    let storeContext = assistant.getArgument("store");
    console.log("Change: " + changeContext + ", Store: " + storeContext);

    //get the userID
    let userkey = assistant.data.userkey;

    let speech;
    let ordercheck = 0;

    const param = assistant.getSelectedOption();
    console.log(param);

    if (param) {
        let num = param.match(/\d+/g);
        let letr = param.match(/[a-zA-Z]+/g);
        console.log(num + " " + letr);

        changeContext = letr + "";
        storeContext = num + "";
    }

    if (storeContext || param) {
        FS_Orders.where('status', '==', 'open').where('store', '==', parseInt(storeContext)).get()
            .then(snapshot => {
                if (snapshot.size > 0) {
                    snapshot.forEach(doc => {
                        if (changeContext == "remove" || changeContext == "close") {
                            if (hasScreen) {
                                if (assistant.data.userkey == doc.data().opened_by || assistant.getContext("admin")) {
                                    checkforUsers(storeContext).then(orderAmount => {
                                        if (orderAmount > 0) {
                                            //"archive" the bite(close it)
                                            FS_Orders.doc(doc.id).update({
                                                status: "closed"
                                            });
                                            speech = `<speak> The ${doc.data().storename} Bite has been closed. Anything else? </speak>`;
                                            return assistant.ask(speech);
                                        } else {
                                            //There are no orders in this Bite so lets just delete it
                                            FS_Orders.doc(doc.id).delete();
                                            speech = `<speak> The ${doc.data().storename} Bite has been DELETED since no orders were found in it. Anything else? </speak>`;
                                            return assistant.ask(speech);
                                        }
                                    })
                                } else {
                                    speech = `<speak> You don't have permission to close this Bite. Make sure that you're an admin and that you're using a mobile device. </speak>`
                                    return assistant.ask(speech);
                                }
                            } else {
                                speech = `<speak> You don't have permission to close this Bite. Make sure that you're an admin and that you're using a mobile device. </speak>`
                                return assistant.ask(speech);
                            }
                        } else {
                            speech = `<speak> There is already an open Bite for this store. Try for another store!  </speak>`;
                            return assistant.ask(speech);
                        }
                    });
                } else {
                    if (changeContext == "add") {
                        FS_Stores.doc(storeContext).get()
                            .then(doc => {
                                let now = new Date();
                                let name = doc.data().name.replace(/ /g, "_");
                                FS_Orders.doc((now.setMinutes(now.getMinutes() + 0)).toString() + storeContext + name).set({
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
                }
            })
    } else {
        let list = assistant.buildList(`Choose your desired store`);

        //foreach store
        FS_Stores.get()
            .then(storeSnapshot => {

                //check if there already is an open bite for that store
                FS_Orders.where('status', '==', 'open').get()
                    .then(snapshot => {
                        let stores = [];
                        snapshot.forEach(doc => {
                            stores.push(doc.data().store);
                        })
                        return stores;
                    }).then(storeArray => {
                        let i = 0;
                        let count = 0;
                        storeSnapshot.forEach(store => {
                            console.log(store.data().name + " :: " + store.id + " :: " + storeArray[i]);
                            if (changeContext == "remove" || changeContext == "close") {
                                if (storeArray.indexOf(store.data().id) != -1) {
                                    list.addItems(assistant.buildOptionItem(changeContext + store.data().id, [`${store.data().name}`])
                                        .setTitle(`${store.data().name}`)
                                        .setDescription(`${store.data().description}`)
                                    )
                                    count++;
                                }
                            } else {
                                if (storeArray.indexOf(store.data().id) == -1) {
                                    list.addItems(assistant.buildOptionItem(changeContext + store.data().id, [`${store.data().name}`])
                                        .setTitle(`${store.data().name}`)
                                        .setDescription(`${store.data().description}`)
                                    )
                                    count++;
                                }
                            }

                            i++;
                        })
                        return count;
                    }).then(count => {
                        if (count == 0) {
                            return assistant.ask("There's an open Bite for every store already, go ahead and place an order.");
                        } else if (count == 1) {
                            list.addItems(assistant.buildOptionItem("placeholder", [`placeholder`])
                                .setTitle("placeholder")
                                .setDescription(`Please don't click me QwQ`)
                            )
                            assistant.askWithList(`For which store do you want to ${changeContext} a Bite?`, list)
                        } else if (count > 1) {
                            assistant.askWithList(`For which store do you want to ${changeContext} a Bite?`, list)
                        }
                    })
            })
    }
};

/*
Locks the user's order
*/
exports.lockOrder = (assistant) => {
    //get the arguments from the user query
    let storeContext = assistant.getArgument("store");
    if (!storeContext) {
        if (assistant.data.userStore) {
            storeContext = assistant.data.userStore;
        } else {
            return assistant.ask("For which store do you want to lock your order?")
        }
    }

    //get the userID
    let userkey = assistant.data.userkey;
    let speech;

    FS_Orders.where('status', '==', 'open').where('store', '==', parseInt(storeContext)).get()
        .then(snapshot => {
            snapshot.forEach(doc => {
                FS_Orders.doc(doc.id).collection("orders").doc(userkey).get()
                    .then(user_order => {
                        if (!user_order.exists) {
                            speech = `<speak> Sorry, I couldn't lock your order. You can try for a different store.  </speak>`;
                            assistant.ask(speech);
                        } else {
                            FS_Orders.doc(doc.id).collection("orders").doc(userkey).set({
                                locked: true
                            }).then(() => {
                                speech = `<speak> Your order has been locked! Thanks for ordering with Bite!</speak>`;
                                assistant.tell(speech);
                            })
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
    getSingleStore(storeContext).then(doc => {
        console.log(doc);
        if (doc) {
            FS_Orders.doc(doc.toString()).collection("orders").get()
                .then(userOrders => {
                    userOrders.forEach(userOrder => {
                        saveOrder = doc;
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
                                speech = `<speak> The combined order of all users consists of: ${orderString} with a total cost of <say-as interpret-as="currency">EUR${orderprice / 100}</say-as>. Maybe it's time to place the order! </speak>`;
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

            speech = `<speak> added your pronounciation: ${text} as a synonym for ${snack}. Anything else you want to do? </speak>`;
            assistant.ask(speech);
            assistant.data = { text: null };
        }
    }
};

/*
Learn the most common day, store snack and store for the current user.
Recommendations will be given based on what the user orders most.
*/
function iKnowWhatYourFavouriteSnackIs(assistant) {
    let userKey = assistant.data.userkey;

    let snackArray = [];
    let sauceArray = [];
    let storeArray = [];
    let day = [];

    let snacksInThisStore = [];
    let saucesInThisStore = [];
    let combinedOrders = [];
    //loop through all archived Bites
    FS_Orders.where('status', '==', 'closed').get()
        .then(snapshot => {
            let count = 0;
            snapshot.forEach(doc => {
                getArchivedOrder(userKey, doc.id)
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
                                FS_Stores.doc(mostPopularStore.toString()).get()
                                    .then(store => {
                                        storeName = store.data().name;

                                        if (mostPopularSnack && mostPopularDay && mostPopularStore != null) {
                                            FS_Users.doc(userKey).collection("habits").doc("orders").set({
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
                                    FS_Users.doc(userKey).collection("habits").doc("orders").set({
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
}

//generates a list of all previous orders at the specified store, then tells the order 
exports.getArchivedOrders = (assistant) => {
    let userKey = assistant.data.userkey;

    //get the arguments from the user query
    let storeContext = assistant.getArgument("store");
    console.log("Store: " + storeContext);

    let check = 0;
    let amountAndSnacks = "";
    let totalPrice = 0;
    let speech;

    const param = assistant.getSelectedOption();
    if (param) {
        getItems(param);
    } else {
        let list = assistant.buildList(`Choose your order`);
        let i = 0;
        let count = 0;
        let save;
        getArchivedBites(storeContext, userKey).then(orders => {
            if (orders.length != 0) {
                orders.forEach(order => {
                    FS_Orders.doc(order.id).collection('orders').doc(userKey).get()
                        .then(doc => {
                            if (doc.exists) {
                                let dateString = moment(order.data().open_time).format('dddd, MMMM Do, YYYY');
                                list.addItems(assistant.buildOptionItem(order.id.toString(), [])
                                    .setTitle((i + 1) + ". " + dateString)
                                    .setDescription(order.data().storename + ", " + order.data().location)
                                )
                                save = order.id;
                                count++;
                            }
                            i++;
                            if (i == orders.length) {
                                if (count > 1) {
                                    assistant.askWithList(`These are the Bites you have ordered from before`, list);
                                } else if (count == 1) {
                                    getItems(save);
                                } else {
                                    return assistant.ask("You don't have any previous orders for this store. Try again for another store.");
                                }
                            }
                        })
                })
            } else {
                return assistant.ask("You don't have any previous orders for this store. Try again for another store.");
            }
        })
    }
    function getItems(parameter) {
        getArchivedOrder(userKey, parameter).then(orders => {
            for (let i = 0; i < orders.length; i++) {
                check = 1;
                amountAndSnacks += orders[i].data().amount + " " + orders[i].data().name + ", ";
                totalPrice += orders[i].data().price;
            }
            if (check == 1) {

                speech = `<speak> Your closed order contains: ${amountAndSnacks} with a total price of` +
                    `<say-as interpret-as="currency">EUR${totalPrice / 100}</say-as>. Anything else you want to do? </speak>`;
                assistant.ask(speech);

            } else {
                speech = `<speak> You have not ordered from this store before, try again for a different store. </speak>`;
                assistant.ask(speech)
            }
        })
    }
}

exports.recommendationHandler = (assistant) => {
    let userKey = assistant.data.userkey;
    let reccomendationData = assistant.data.doc;
    console.log(reccomendationData);
    let o = 0;
    let i = 0;
    getOrder(userKey, reccomendationData.store).then(alreadyAnOrder => {
        if (alreadyAnOrder.length < 1) {
            getSingleStore(reccomendationData.store).then(store => {
                if (store) {
                    if (reccomendationData.order && reccomendationData.order != "null") {
                        let items = reccomendationData.order.toString().split(",");
                        items.forEach(item => {
                            if (item != " ") {
                                getProduct(reccomendationData.store.toString(), item).then(snack => {
                                    if (snack) {
                                        FS_Orders.doc(store).collection('orders').doc(userKey).collection('snacks').doc(item.toString()).set({
                                            amount: 1,
                                            name: snack.data().name,
                                            price: snack.data().price,
                                            isSauce: snack.data().isSauce,
                                            hasSauce: snack.data().hasSauce
                                        });
                                        o++;
                                    }
                                    FS_Orders.doc(store).collection('orders').doc(userKey).set({
                                        locked: true
                                    });
                                    i++;
                                    if (i => items.length) {
                                        assistant.ask("Your order consisting of a " + items.toString() + " has been added");
                                    }
                                })
                            }
                        });
                    } else {
                        //partial reccomendation
                    }
                } else {
                    assistant.ask("I can't give you any recommendations at this time. Anything else?")
                }
            })
        } else {
            assistant.ask("You already have an order here so you can't do this. Anything else?")
        }
    })
}

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
    let moreMessage = "do you want to place an order here?";
    let speech;

    let todayHasBite = false;
    let amountOfOrders = 0;
    let stores = [];
    let storeNames = [];
    let openStores = [];
    let storeNameToday = "";

    let storeID = [];
    //Get all open orders, check if the user has an order there.
    let getOpenOrders = FS_Orders.where('status', '==', 'open').get()
        .then(snapshot => {
            snapshot.forEach(doc => {
                if (moment().isSame(moment(doc.data().open_time), 'day')) {
                    todayHasBite = true;
                    message += doc.data().storename + ", ";
                    storeNameToday = 'order from ' + doc.data().storename;
                    storeID.push(doc.data().store);
                }
                openStores.push(doc.data().storename);
                stores.push(doc);
            });
            return stores;
        }).then(stores => {
            FS_Users.doc(userKey.toString()).collection('habits').doc('orders').get()
                .then(doc => {
                    if (doc.exists) {
                        if (doc.data().order && storeID.indexOf(doc.data().store) != -1) {
                            moreMessage = "do you want to order a " + doc.data().order + " from " + doc.data().storeName + " again?";
                            storeNameToday = "I'll have the usual";
                        }
                    }
                    if (stores.length != 0) {
                        let amount = 0;
                        for (let i = 0; i < stores.length; i++) {
                            getOrder(userKey, stores[i].data().store).then(alreadyAnOrder => {
                                if (alreadyAnOrder.length > 0) {
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
                                            speech = `<speak> Welcome ${user.data().display_name}! No Bites have recently been opened, you can use the create command to open a new Bite or order from one of the older ${openStores.toString()} Bites. </speak>`;
                                            assistant.ask(assistant.buildRichResponse()
                                                .addSimpleResponse({ speech })
                                                .addSuggestions(['order', 'Create a Bite', 'start', 'help', 'Never mind'])
                                            );
                                        } else {
                                            assistant.setContext("recommendation", 1);
                                            if (doc.exists) {
                                                assistant.data = { username: user.data().display_name, userkey: userKey, doc: doc.data() };
                                            }
                                            speech = `<speak> Welcome ${user.data().display_name}!` + message + moreMessage + ` </speak>`;
                                            assistant.ask(assistant.buildRichResponse()
                                                .addSimpleResponse({ speech })
                                                .addSuggestions([storeNameToday, 'Create a Bite', 'start', 'help', 'Never mind'])
                                            );
                                        }
                                    } else {
                                        assistant.setContext("user_order", 2);
                                        assistant.setContext("edit_order", 2);
                                        assistant.data = { username: user.data().display_name, userkey: userKey };

                                        const speech = `<speak> Welcome ${user.data().display_name}! You have ${amountOfOrders} open order(s) at ${storeNames.toString()}.<break time="1"/>` +
                                            `Would you like to edit a current order or start another?</speak>`;
                                        assistant.ask(assistant.buildRichResponse()
                                            .addSimpleResponse({ speech })
                                            .addSuggestions(['edit ' + storeNames[0], 'create a bite', 'start', 'Never mind'])
                                        );
                                    }
                                }
                            })
                        }
                    } else {
                        if (user.data().admin == true) {
                            assistant.setContext("admin", 10);
                        }
                        assistant.setContext("user_order", 5);
                        assistant.data = { username: user.data().display_name, userkey: userKey };
                        speech = `<speak> Welcome ${user.data().display_name}! There are no open Bites, you can use the create command to open a new Bite. </speak>`;
                        assistant.ask(assistant.buildRichResponse()
                            .addSimpleResponse({ speech })
                            .addSuggestions(['Create a Bite', 'help', 'Never mind'])
                        );
                    }
                })
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

//returns all items in an user's order
function getArchivedOrder(user, store) {
    let snacks = [];
    return FS_Orders.doc(store.toString()).collection('orders').doc(user.toString()).collection('snacks').get()
        .then(snapshot => {
            snapshot.forEach(doc => {
                snacks.push(doc);
            });
            return snacks;
        })
}

//returns the ids of all closed Bites for a certain store
function getArchivedBites(store, user) {
    let snacks = [];
    let docID = [];
    return FS_Orders.where('status', '==', 'closed').where('store', '==', parseInt(store)).get()
        .then(snapshot => {
            snapshot.forEach(doc => {
                docID.push(doc);
            });
            return docID;
        })
}

//returns a single product key and information
function getProduct(store, productName) {
    let i;
    return FS_Stores.doc(store).collection('products').where('name', '==', productName).get()
        .then(snapshot => {
            if (snapshot.size > 0) {
                snapshot.forEach(doc => {
                    i = doc;
                });
                return i;
            } else {
                return false;
            }
        })
}

//returns the database ID of the open Bite for the given store
function getSingleStore(store) {
    let docID;
    return FS_Orders.where('status', '==', 'open').where('store', '==', parseInt(store)).get()
        .then(snapshot => {
            if (snapshot.size > 0) {
                snapshot.forEach(doc => {
                    docID = doc.id;
                });
            } else {
                docID = false;
            }
            return docID;
        })
}

//returns the locked status of the user order: true/False
function getLocked(user, store) {

    let locked;
    let docID;
    return FS_Orders.where('status', '==', 'open').where('store', '==', parseInt(store)).get()
        .then(snapshot => {
            snapshot.forEach(doc => {
                docID = doc.id;
            });
            return docID;
        }).then(snapshot => {
            if (snapshot) {
                return FS_Orders.doc(snapshot.toString()).collection('orders').doc(user.toString()).get()
                    .then(doc => {
                        if (!doc.exists) {
                            locked = 0;
                        } else {
                            locked = 1;
                        }
                        return locked;
                    })
            } else {
                return -1;
            }
        })
}

//returns the amount of users that placed an order at the specified Bite
function checkforUsers(store) {
    let users = 0;
    return getSingleStore(store).then(doc => {
        if (doc) {
            return FS_Orders.doc(doc.toString()).collection("orders").get()
                .then(userOrders => {
                    userOrders.forEach(userOrder => {
                        users++;
                    })
                    return users;
                })
        } else {
            return users;
        }
    })
}