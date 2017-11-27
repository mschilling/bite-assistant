'use strict';

const Debug = require('debug');
const debug = Debug('bite-api:debug');
const error = Debug('bite-api:error');

const admin = require('firebase-admin');
const ordersRef = admin.firestore().collection('orders');

function getOpenOrders() {
  let docID;
  let snacks = [];
  return ordersRef.where('status', '==', 'open').where('store', '==', "0").get()
      .then(snapshot => {
        console.log(snapshot.docs.length);
        console.log(snapshot.size);
          snapshot.forEach(doc => {
              docID = doc.id;
          });
          return docID;
      }).then(snapshot => {
        //console.log(snapshot);
        return ordersRef.doc(snapshot.toString()).collection('orders').doc("2zjwkTWsWAd2ZyU2EoBnQrvU2fz2").collection('snacks').get()
            .then(snapshot => {
                snapshot.forEach(doc => {
                    snacks.push(doc);
                    console.log(doc.data() + doc.id);
                });
                return snacks;
            })
    })
}

module.exports = {
  getOpenOrders: getOpenOrders
};
