'use strict';

const Debug = require('debug');
const debug = Debug('bite-api:debug');
const error = Debug('bite-api:error');

const admin = require('firebase-admin');
const ordersRef = admin.firestore().collection('orders');

function getOpenOrders() {
  let snacks = [];
  let docID;
  return ordersRef.where('status', '==', 'open').where('store', '==', 0).get()
    .then(snapshot => {
      snapshot.forEach(doc => {
        docID = doc.id;
      });
      return docID;
    }).then(snapshot => {
      return ordersRef.doc(snapshot).collection('orders').doc("2zjwkTWsWAd2ZyU2EoBnQrvU2fz2").collection('snacks').get()
        .then(snapshot => {
          snapshot.forEach(doc => {
            snacks.push(doc);
          });
          return snacks;
        })
    })
}

module.exports = {
  getOpenOrders: getOpenOrders
};
