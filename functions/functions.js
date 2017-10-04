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
            getUserOrder(assistant, userData);
        }
    }))
};

/*
2. SignUp
*/
exports.biteSignUp = (request, assistant) => {
    //get email from the user input
    let email = assistant.getArgument("email");
    //let email = request.body.result.parameters['email'];
    const userId = assistant.getUser().userId;

    let speech = `<speak> I was unable to find an account with this email, did you enter the correct email? </speak>`;//for when no match is found

    userRef.once('value', ((data) => {
        data.forEach((childData) => {
            if (childData.val().email == email) {
                //add the new uid to the user in the database.
                admin.database().ref('users/' + childData.key).update({ uid: userId });
                speech = `<speak> Thanks for registering ${childData.val().display_name}. I'll remember you the next time you use Bite Assistant. </speak>`;
                assistant.data = { username: childData.val().display_name };
                return assistant.tell(speech);
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
                let Store = assistant.data.userStore;
                if (Store == storeNumber) {
                    orderStore = `<break time="1"/>, ordering from ${store}`;
                    assistant.data = { storeNumber: storeNumber }
                }
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
if no 
*/
exports.getUserOrderItems = (assistant) => {

    let productCheck = 0; //is 1 if atleast 1 product is in the user order

    let orderString = "";
    let productPrice = 0;

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
    } else {
        Store = assistant.data.userStore;
    }

    let dbref = "" + assistant.data.userOrders[Store - 1];

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
                                        check = 1;
                                        //if amount is undefined set to 1
                                        if (amountContext[i]) {
                                        } else {
                                            amountContext[i] = 1;
                                        }

                                        //check if the item is already in the order, if true, add the new amount + the current amount
                                        userItemData.forEach((itemChild) => {
                                            if (itemChild.key == userOrderData.key) {
                                                amountContext[i] = parseInt(amountContext[i]) + parseInt(itemChild.val().amount);
                                            }
                                        })

                                        //update the database with the new item
                                        admin.database().ref(dbref).child(userOrderData.key).update({ amount: amountContext[i] });
                                        orderString += `<say-as interpret-as="cardinal">${amountContext[i]}</say-as> ${userOrderData.val().name}, `;
                                        productPrice += (parseInt(userOrderData.val().price) * amountContext[i]);

                                    } else if (changeContext == "remove") {
                                        userItemData.forEach((itemChild) => {
                                            if (itemChild.key == userOrderData.key) {
                                                check = 1;
                                                //if no amount specified: remove all
                                                if (amountContext[i]) {
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
                                                    admin.database().ref(dbref).child(userOrderData.key).remove();
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
                if (productCheck != 0) {
                    assistant.setContext("user_order", 2);
                    const speech = `<speak>Your order contains: ${orderString} with a total price of
                     <say-as interpret-as="currency">EUR${productPrice / 100}</say-as>.
                 </speak>`;
                    assistant.ask(speech);
                } else {
                    //EXIT: when no items can be found while already in editing mode
                    //in the rare occasion the user removes all his items with the bite app while editing in bite assistant.
                    //OR when the user tries editing in a store where he has no orders
                    if (storeContext) {
                        const speech = `<speak>Oops, I couldn't find any items in your order, try starting over. </speak>`;
                        assistant.tell(speech);
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

    let speech = "";

    let orderString = "";
    let productPrice = 0;

    //get the arguments from the user query
    const snackContext = assistant.getArgument("snack");
    let amountContext = assistant.getArgument("number");
    let storeContext = assistant.getArgument("store");
    console.log("Snack: " + snackContext + ", Amount: " + amountContext + ", storeContext: " + storeContext);

    const userId = assistant.getUser().userId;
    let userKey;

    //get the database link and order store
    let dbref = "" + assistant.data.userOrders;
    let Store = assistant.data.userStore;

    let productRef;
    let userOrderRef;

    orderRef.once('value', ((orderData) => {
        userRef.once('value', ((data) => {
            data.forEach((childData) => {
                if (userId == childData.val().uid) {
                    userKey = childData.key;//save user data
                    console.log("user: " + userKey);
                }
            })
            //get the open order
            orderData.forEach((childData) => {
                console.log("store check: " + childData.val().store + " " + storeContext);
                if (storeContext == childData.val().store) {
                    location = childData.val().location;
                    productRef = admin.database().ref('products/' + childData.val().store);
                    dbref = 'user_order/' + childData.key + "/" + userKey;
                    userOrderRef = admin.database().ref('user_order/' + childData.key + "/" + userKey);
                } else {
                    speech = `<speak> Looks like there aren't any open Bites for your store, you can try starting one! </speak>`;
                    //assistant.ask(speech);
                }
            });
            productRef.once('value', ((productdata) => {
                userOrderRef.once('value', ((userItemData) => {

                    //foreach product in the store the user is ordering from
                    productdata.forEach((productChild) => {

                        //go to the products, an extra step since the database has a 2nd child element called products for some reason..
                        productdata.child(productChild.key).forEach(function (userOrderData) {

                            let i = 0;

                            //lets the user add multiple items in 1 sentence
                            if (snackContext != null) {

                                snackContext.forEach(function (entry) {
                                    productcheck = 0;

                                    if (userOrderData.val().name == entry) {
                                        check = 1;
                                        productcheck = 1;
                                        //if amount is undefined set to 1
                                        if (amountContext[i]) {
                                        } else {
                                            amountContext[i] = 1;
                                        }

                                        //check if the item is already in the order, if true, add the new amount + the current amount
                                        userItemData.forEach((itemChild) => {
                                            if (itemChild.key == userOrderData.key) {
                                                amountContext[i] = parseInt(amountContext[i]) + parseInt(itemChild.val().amount);
                                            }
                                        })

                                        //update the database with the new item
                                        admin.database().ref(dbref).child(userOrderData.key).update({ amount: amountContext[i] });
                                        orderString += `<say-as interpret-as="cardinal">${amountContext[i]}</say-as> ${userOrderData.val().name}, `;
                                        productPrice += (parseInt(userOrderData.val().price) * amountContext[i]);
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
                        speech = `<speak>Your order contains: ${orderString} with a total price of
                             <say-as interpret-as="currency">EUR${productPrice / 100}</say-as>.
                         </speak>`;
                    }
                    assistant.ask(speech);
                }))
            }))
        }))
    }));
};

/*
private function getUserOrders
get open orders for the user, handles part of the welcome intent and- 
saves the array with database references of the users Bite order in assistant.data.userOrders
example: [ 'user_order/-KorC-i_WY5CsFct9ncd/2zjwkTWsWAd2ZyU2EoBnQrvU2fz2' ] supports multiple user orders
              TABLE  /     (OPEN)BITE     /            USER               / ORDERS
*/
function getUserOrder(assistant, user) {
    const userId = assistant.getUser().userId;
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
                                    itemArray.push('user_order/' + childData.key + "/" + userOrderData.key);
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
                    assistant.data = { username: user.val().display_name };
                    const speech = `<speak> Welcome ${user.val().display_name}! You can order by saying "start" or the name of the city you would like to order at. </speak>`;
                    assistant.ask(speech);
                } else {
                    assistant.setContext("user_order", 2);
                    assistant.data = { username: user.val().display_name, userOrders: itemArray, userStore: storeArray };
                    const speech = `<speak> Welcome ${user.val().display_name}! You have ${check} open order(s) at ${storeString}<break time="1"/>` +
                        `Would you like to edit a current order or start another?</speak>`;
                    assistant.ask(speech);
                }
            }))
        }))
    }))
};