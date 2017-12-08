'use strict';

const Debug = require('debug');
const debug = Debug('bite-api:debug');
const error = Debug('bite-api:error');

const admin = require('firebase-admin');
const ordersRef = admin.firestore().collection('orders');

//Moment.js
var moment = require('moment');
moment().format();

//reccomend and order to the user(based on the Store belonging to the Bite that just opened)
//reccomendation will be done in the form of a list selector(with pictures of the snacks) with the user's most ordered items top 3
//a reccomendation can contain just one snack or multiple if the user often orders the same combination of items
//a push notification may be send to the user, on clicking it the user will be shown the list of his reccomended orders and be able to place it with 1 click
//learn when the user often orders: friday/wednesday
//only perform this function once per week when the user first starts Bite
function getOpenOrders() {
    let userKey = "2zjwkTWsWAd2ZyU2EoBnQrvU2fz2";

    let snackArray = []; //save all previously ordered snacks
    let amountArray = []; //save all previously ordered snack amounts
    let storeArray = [];

    let combinedOrders = [];
    let day = [];

    admin.firestore().collection('users').doc(userKey).collection("habits").doc("orders").get()
        .then(time => {
            let bool = false;
            if (time.exists) {
                let oneDayAgo = moment().subtract(1, 'days');
                let lastUpdate = moment(time.data().lastUpdate);
                bool = moment(lastUpdate).isSameOrBefore(oneDayAgo); //only update once per day
            } else {
                bool = true; //dev mode
            }

            if (bool) {

                //loop through all archived Bites
                ordersRef.where('status', '==', 'closed').get()
                    .then(snapshot => {
                        let count = 0;
                        console.log(snapshot.size);
                        snapshot.forEach(doc => {

                            //check if the user had an order in that Bite
                            ordersRef.doc(doc.id).collection('orders').doc(userKey.toString()).collection('snacks').get()
                                .then(snapshot => {
                                    count++;
                                    let i = 0;
                                    if (snapshot.size > 0) {

                                        let snacksInThisStore = [];
                                        let amountsInThisStore = [];

                                        let dayoftheweek = moment(doc.data().open_time).isoWeekday(); // returns 1-7 where 1 is Monday and 7 is Sunday
                                        day.push(dayoftheweek.toString());
                                        console.log("weekday: " + dayoftheweek);

                                        storeArray.push(doc.data().store);

                                        //loop through all the snacks 
                                        snapshot.forEach(snack => {
                                            snackArray.push(snack.data().name);
                                            amountArray.push(snack.data().amount);

                                            snacksInThisStore.push(snack.data().name);
                                            amountsInThisStore.push(snack.data().amount);

                                            i++;
                                            //console.log(i + " " + snapshot.size);
                                            if (i == snapshot.size) {
                                                combinedOrders.push(snacksInThisStore, amountsInThisStore);
                                            }
                                        })
                                    } else {
                                        console.log("nope");
                                        //do nothing
                                    }
                                }).then(() => {
                                    console.log(count + " :: " + snapshot.size);
                                    if (count == snapshot.size) {
                                        let now = new Date();
                                        let mostPopularSnack = popular(snackArray);
                                        let mostPopularDay = popular(day);
                                        let mostPopularStore = popular(storeArray);

                                        if (mostPopularSnack && mostPopularDay && mostPopularStore != null) {
                                            console.log("updated");
                                            admin.firestore().collection('users').doc(userKey).collection("habits").doc("orders").set({
                                                snack: mostPopularSnack,
                                                day: mostPopularDay,
                                                store: mostPopularStore,
                                                lastUpdate: now.setMinutes(now.getMinutes() + 0)
                                            })
                                        }
                                    }
                                })
                        })
                    })
            }
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

module.exports = {
    getOpenOrders: getOpenOrders
};
