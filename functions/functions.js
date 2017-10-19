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
Login
*/
exports.biteUser = (assistant) => {

    let parsedData; //stores the parsed json 
    let userData; // stores the user data when the email matches in the db
    let speech = "";
    let i = 0;

    let accestoken = assistant.getUser().accessToken;
    console.log("Access token: " + accestoken);

    if (accestoken) {
        const https = require('https');
        https.get('https://www.googleapis.com/plus/v1/people/me?access_token=' + assistant.getUser().accessToken, (resp) => {
            let data = '';

            // A chunk of data has been recieved.
            resp.on('data', (chunk) => {
                data += chunk;
            });

            // The whole response has been received. Print out the result.
            resp.on('end', () => {
                parsedData = JSON.parse(data);
                console.log(parsedData.domain);
                console.log(parsedData.emails[0].value);
                //check if the user is using a move4mobile google account
                if (parsedData.domain == "move4mobile.com") {
                    userRef.once('value', ((data) => {
                        data.forEach((childData) => {
                            if (childData.val().email == parsedData.emails[0].value) {
                                assistant.data = { username: childData.val().display_name, userkey: childData.key };

                                userData = childData;
                                i = 1;
                            }
                        })
                        if (i == 1) {
                            //get the users current open orders and finish the welcome intent
                            getUserOrder(assistant, userData);
                        } else {
                            speech = `<speak> I couldn't find an account for this email.</speak>`;
                            assistant.tell(speech);

                            //TODO: Create the user account

                        }
                    }));
                } else {
                    speech = `<speak> This app is currently only available to Move4Mobile employees. </speak>`;
                    assistant.tell(speech);
                }
            });

        }).on("error", (err) => {
            console.log("Error: " + err.message);
        });
    }
};

/*
getOrderLocation
*/
exports.biteLocation = (assistant) => {
    let storeNumber = 0;
    let store = "";
    let location = "";
    let orderStore = "";

    const locationContext = assistant.getArgument("Location");
    let i = 0;

    orderRef.once('value', ((data) => {
        storeRef.once('value', ((storeData) => {
            //get all bites for the user specified location
            data.forEach((childData) => {
                if (locationContext == childData.val().location) {
                    storeNumber = childData.val().store;
                    location = childData.val().location;
                    i++;
                }
                //get the name of the store for the last order of the location...
                storeData.forEach((childData) => {
                    if (storeNumber == childData.val().id) {
                        store += childData.val().name + ", ";
                    }
                });
            });

            //is empty if there are no open orders for that location
            if (i != 0) {
                orderStore = `<break time="1"/>, you can order from ${store} or open a Bite yourself`;
                assistant.setContext("user_order", 2);
                assistant.setContext("edit_order", 2);
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
function to retrieve the items in the user's order.
Since this happens in the same place, editing an order also happens in this function if the right context parameters are set.
add/edit: snackContext contains "add", "snack" & "amount"
remove/edit: snackContext contains "remove", "snack" & "amount" 
*/
exports.getUserOrderItems = (assistant) => {

    let productCheck = 0; //is 1 if atleast 1 product is in the user order

    let updateString = "";
    let updateString1 = "";
    let orderString = "";
    let contextString = "";
    let productPrice = 0;
    let message = "";

    //get the arguments from the user, can be empty
    const storeContext = assistant.getArgument("store");
    const changeContext = assistant.getArgument("action");
    const snackContext = assistant.getArgument("snack");
    let amountContext = assistant.getArgument("number");
    console.log("Change: " + changeContext + ", Snack: " + snackContext + ", Amount: " + amountContext + ", Store: " + storeContext);

    //get the database link and order store
    let Store;
    if (storeContext) {
        Store = storeContext;
        assistant.data = { userStore: storeContext, userOrders: assistant.data.userOrders };
        message = "You can add and remove items from your order, or lock it when you're done. ";
    } else {
        Store = assistant.data.userStore;
    }

    let dbref;
    let orderlink = assistant.data.userOrders;
    //get the right user order and store
    if (orderlink) {
        assistant.data.userOrders.forEach(function (entry) {
            let ref = entry.replace(/\_/, '&').split('&');
            //ref[0] is the store and ref[1] is the db link
            if (ref[0] == Store) {
                dbref = ref[1];
            }
        });
    }
    const productRef = admin.database().ref('products/' + Store);
    const userItem = admin.database().ref(dbref);

    userItem.once('value', ((userItemData) => {
        orderRef.once('value', ((orderData) => {
            productRef.once('value', ((productdata) => {

                //foreach product in the store the user is ordering from
                productdata.forEach((productChild) => {

                    //go to the products, an extra step since the database has a 2nd child element called products for some reason..
                    productdata.child(productChild.key).forEach(function (userOrderData) {

                        let check = 0;
                        let i = 0;

                        //lets the user add multiple items in 1 sentence
                        if (snackContext != null) {

                            snackContext.forEach(function (entry) {
                                //add item
                                if (userOrderData.val().name == entry) {
                                    productCheck++;
                                    if (changeContext == "add") {
                                        contextString = "Added ";
                                        check = 1;
                                        //if amount is undefined set to 1
                                        if (amountContext[i]) {
                                        } else {
                                            amountContext[i] = 1;
                                        }

                                        updateString += `<say-as interpret-as="cardinal">${amountContext[i]}</say-as> ${userOrderData.val().name}, `;

                                        //check if the item is already in the order, if true, add the new amount + the current amount
                                        userItemData.forEach((itemChild) => {
                                            if (itemChild.key == userOrderData.key) {
                                                amountContext[i] = parseInt(amountContext[i]) + parseInt(itemChild.val().amount);
                                            }
                                        })

                                        //update the database with the new item
                                        admin.database().ref(dbref).child(userOrderData.key).update({ amount: amountContext[i] });
                                        updateString1 += `<say-as interpret-as="cardinal">${amountContext[i]}</say-as> ${userOrderData.val().name}, `;
                                        productPrice += (parseInt(userOrderData.val().price) * amountContext[i]);

                                    } else if (changeContext == "remove") {
                                        userItemData.forEach((itemChild) => {
                                            if (itemChild.key == userOrderData.key) {
                                                contextString = "Removed ";
                                                check = 1;
                                                if (amountContext[i]) {
                                                    updateString += `<say-as interpret-as="cardinal">${amountContext[i]}</say-as> ${userOrderData.val().name}, `;
                                                    //only remove x amount
                                                    amountContext[i] = parseInt(itemChild.val().amount) - parseInt(amountContext[i]);
                                                    //negative number check
                                                    if (amountContext[i] <= 0) {
                                                        admin.database().ref(dbref).child(userOrderData.key).remove();
                                                    } else {
                                                        admin.database().ref(dbref).child(userOrderData.key).update({ amount: amountContext[i] });
                                                        orderString += `<say-as interpret-as="cardinal">${amountContext[i]}</say-as> ${userOrderData.val().name}, `;
                                                        productPrice += (parseInt(userOrderData.val().price) * amountContext[i]);
                                                    }
                                                } else {
                                                    //if no amount specified: remove all
                                                    admin.database().ref(dbref).child(userOrderData.key).remove();
                                                    updateString += `all ${userOrderData.val().name}, `;
                                                }
                                            }
                                        })
                                    }
                                }
                                i++;
                            })
                        }
                        //if check != 0 then that item was updated and thus already added to orderstring in the above part
                        if (check == 0) {
                            userItemData.forEach((itemChild) => {
                                if (itemChild.key == userOrderData.key) {
                                    productCheck++;
                                    orderString += `<say-as interpret-as="cardinal">${itemChild.val().amount}</say-as> ${userOrderData.val().name}, `;
                                    productPrice += (parseInt(userOrderData.val().price) * itemChild.val().amount);
                                }
                            })
                        }
                    })
                })
                //productCheck = 0 means there are no items in the order, prodcutprice = 0 means there are no products with a price
                if (productCheck != 0 && productPrice != 0) {
                    assistant.setContext("user_order", 2);
                    assistant.setContext("edit_order", 2);
                    const speech = `<speak> ${contextString} ${updateString}
                    Your order contains: ${updateString1} ${orderString} with a total price of
                     <say-as interpret-as="currency">EUR${productPrice / 100}</say-as>. ${message}
                 </speak>`;
                    assistant.ask(speech);
                } else {
                    //EXIT: when no items can be found while already in editing mode
                    //in the rare occasion the user removes all his items with the bite app while editing in bite assistant.
                    //OR when the user tries editing in a store where he has no orders
                    if (Store) {
                        const speech = `<speak>Oops, I couldn't find any items in your order, try starting over. </speak>`;
                        assistant.ask(speech);
                    } else {
                        const speech = `<speak> Please say edit and the store you want to order from to do this. </speak>`;
                        assistant.ask(speech);
                    }
                }
            }))
        }))
    }))
};

exports.quickOrder = (assistant) => {

    let store;
    let location;
    let check = 0;
    let productcheck = 0;

    let i = 0;
    let speech = "";

    let orderString = "";
    let updateString = "";
    let updateString1 = "";
    let productPrice = 0;

    //get the arguments from the user query
    const changeContext = assistant.getArgument("action");
    const snackContext = assistant.getArgument("snack");
    let amountContext = assistant.getArgument("number");
    let storeContext = assistant.getArgument("store");
    console.log("Change: " + changeContext + ", Snack: " + snackContext + ", Amount: " + amountContext + ", Store: " + storeContext);

    if (changeContext == "remove") {
        return assistant.ask(`<speak> You need to be in edit mode to remove an item, try saying edit, followed by your store of choice. </speak>`)
    }

    let userKey;

    //get the database link and order store
    let dbref = "" + assistant.data.userOrders;
    let Store = assistant.data.userStore;
    let userKeyData = assistant.data.userkey;

    let productRef;
    let userOrderRef;

    orderRef.once('value', ((orderData) => {
        userRef.once('value', ((data) => {
            data.forEach((childData) => {
                if (userKeyData == childData.key) {
                    userKey = childData.key;//save user data
                }
            })
            //get the open order
            orderData.forEach((childData) => {
                if (storeContext == childData.val().store) {
                    if (childData.val().status == "closed") {
                        return assistant.ask(`<speak> Sorry, this Bite is already closed, try to be faster next time. </speak>`)
                    } else {
                        location = childData.val().location;
                        productRef = admin.database().ref('products/' + childData.val().store);
                        dbref = 'user_order/' + childData.key + "/" + userKey;
                        userOrderRef = admin.database().ref('user_order/' + childData.key + "/" + userKey);
                    }

                } else {
                    speech = `<speak> Looks like there aren't any open Bites for your store, you can try starting one! </speak>`;
                    //assistant.ask(speech);
                }
            });
            if (productRef) {
                productRef.once('value', ((productdata) => {
                    userOrderRef.once('value', ((userItemData) => {

                        //foreach product in the store the user is ordering from
                        productdata.forEach((productChild) => {

                            //go to the products, an extra step since the database has a 2nd child element called products for some reason..
                            productdata.child(productChild.key).forEach(function (userOrderData) {

                                productcheck = 0;

                                //lets the user add multiple items in 1 sentence
                                if (snackContext != null) {

                                    snackContext.forEach(function (entry) {

                                        if (userOrderData.val().name == entry) {
                                            check = 1;
                                            productcheck = 1;
                                            //if amount is undefined set to 1
                                            if (amountContext[i]) {
                                            } else {
                                                amountContext[i] = 1;
                                            }

                                            updateString += `<say-as interpret-as="cardinal">${amountContext[i]}</say-as> ${userOrderData.val().name}, `;

                                            let realAmount = amountContext[i];

                                            //check if the item is already in the order, if true, add the new amount + the current amount
                                            userItemData.forEach((itemChild) => {
                                                if (itemChild.key == userOrderData.key) {
                                                    realAmount = parseInt(amountContext[i]) + parseInt(itemChild.val().amount);
                                                }
                                            })

                                            //update the database with the new item
                                            admin.database().ref(dbref).child(userOrderData.key).update({ amount: realAmount });
                                            updateString1 += `<say-as interpret-as="cardinal">${realAmount}</say-as> ${userOrderData.val().name}, `;
                                            productPrice += (parseInt(userOrderData.val().price) * realAmount);
                                            i++;
                                        }
                                    })
                                }
                                //if check != 0 then that item was updated and thus already added to orderstring in the above part
                                if (productcheck == 0) {
                                    userItemData.forEach((itemChild) => {
                                        if (itemChild.key == userOrderData.key) {
                                            orderString += `<say-as interpret-as="cardinal">${itemChild.val().amount}</say-as> ${userOrderData.val().name}, `;
                                            productPrice += (parseInt(userOrderData.val().price) * itemChild.val().amount);
                                        }
                                    })
                                }
                            })
                        })
                        if (check != 0) {
                            assistant.setContext("user_order", 2);
                            assistant.setContext("edit_order", 2);
                            speech = `<speak> Added ${updateString}
                             Your order contains: ${updateString1} ${orderString} with a total price of
                             <say-as interpret-as="currency">EUR${productPrice / 100}</say-as>. 
                             You can add and remove items from your order, or lock it when you're done.
                         </speak>`;
                        }
                        assistant.ask(speech);
                    }))
                }))
            } else {
                speech = `<speak> There aren't any open Bites for this store, try ordering from somewhere else. </speak>`;
                assistant.ask(speech);
            }
        }))
    }));
};

//Create/Delete a Bite
exports.AdminFunctions = (assistant) => {
    //get the arguments from the user query
    const changeContext = assistant.getArgument("action");
    const storeContext = assistant.getArgument("store");
    console.log("Change: " + changeContext + ", Store: " + storeContext);

    //get the userID
    let userkey = assistant.data.userkey;

    //get the store location and name
    let storeName;
    let storeLocation;

    let speech;
    let ordercheck = 0;
    orderRef.once('value', ((orderData) => {
        storeRef.once('value', ((storeData) => {
            orderData.forEach((childData) => {
                if (childData.val().store == storeContext) {
                    console.log(changeContext);
                    if (changeContext == "add") {
                        speech = `<speak> There is already an open Bite for this store, please choose another store. </speak>`;
                        ordercheck++;
                    } else if (changeContext == "remove") {
                        admin.database().ref('orders/' + childData.key).remove();
                        speech = `<speak> The Bite has been removed! </speak>`;
                        ordercheck++;
                    } else if (changeContext == "close") {
                        admin.database().ref('orders/' + childData.key).update({
                            status: "closed"
                        });
                        speech = `<speak> The Bite has been closed, no further orders can be placed. </speak>`;
                        ordercheck++;
                    }
                }
            })
            if (ordercheck == 0) {
                storeData.forEach((childData) => {
                    if (childData.val().id == storeContext) {
                        storeName = childData.val().name;
                        storeLocation = childData.val().location;
                    }
                })
                var now = new Date();
                var newPostKey = admin.database().ref().child('orders/').push().key;
                admin.database().ref('orders/' + newPostKey).set({
                    open_time: now.setMinutes(now.getMinutes() + 0),
                    close_time: now.setMinutes(now.getMinutes() + 30),
                    duration: 30,
                    location: storeLocation,
                    opened_by: userkey,
                    status: "open",
                    store: storeContext
                });
                speech = `<speak> I’ve opened a Bite for ${storeName} in ${storeLocation}. The Bite will be open for 30 minutes so hurry up and place your orders!  </speak>`;
            }
            assistant.ask(speech);
        }))
    }))
};

/*
private function getUserOrders
get open orders for the user, handles part of the welcome intent and- 
saves the array with database references of the users Bite order in assistant.data.userOrders
example: [ 'user_order/-KorC-i_WY5CsFct9ncd/2zjwkTWsWAd2ZyU2EoBnQrvU2fz2' ] supports multiple user orders
              TABLE  /     (OPEN)BITE     /            USER               / ORDERS
*/
function getUserOrder(assistant, user) {
    let check = 0;
    let itemArray = [];
    let storeArray = [];
    let store;
    let storeString = "";
    let i = 0;

    orderRef.once('value', ((orderData) => {
        userOrderRef.once('value', ((userOrderData) => {
            storeRef.once('value', ((storeData) => {

                //foreach open Bite
                orderData.forEach((orderChild) => {

                    //check if the Bite in the user_order table is open
                    userOrderData.forEach((childData) => {

                        if (orderChild.key == childData.key) {
                            //check user ids
                            userOrderData.child(childData.key).forEach(function (userOrderData) {
                                if (user.key == userOrderData.key) {
                                    check++; //+1 order
                                    storeArray.push(orderChild.val().store);
                                    store = orderChild.val().store;
                                    itemArray.push(store + '_user_order/' + childData.key + "/" + userOrderData.key);
                                }
                            })
                        }
                    })
                    //get the store id
                    if (i < check) {
                        storeData.forEach((childData) => {
                            if (store == childData.key) {
                                storeString += childData.val().name + ", ";
                                i++
                            }
                        })
                    }
                })
                if (check == 0) {
                    assistant.setContext("user_order", 5);
                    if (user.val().admin) {
                        assistant.setContext("admin", 10);
                    }
                    assistant.data = { username: user.val().display_name, userkey: user.key };

                    const speech = `<speak> Welcome ${user.val().display_name}! You can order by saying "start" and the name of the city or store you would like to order at. </speak>`;
                    assistant.ask(speech);
                } else {
                    assistant.setContext("user_order", 2);
                    assistant.setContext("edit_order", 2);
                    if (user.val().admin) {
                        assistant.setContext("admin", 10);
                    }
                    assistant.data = { username: user.val().display_name, userOrders: itemArray, userStore: storeArray, userkey: user.key };

                    const speech = `<speak> Welcome ${user.val().display_name}! You have ${check} open order(s) at ${storeString}<break time="1"/>` +
                        `Would you like to edit a current order or start another?</speak>`;
                    assistant.ask(speech);
                }
            }))
        }))
    }))
};