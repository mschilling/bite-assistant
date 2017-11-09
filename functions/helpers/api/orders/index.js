'use strict';

const Debug = require('debug');
const debug = Debug('bite-api:debug');
const error = Debug('bite-api:error');

const admin = require('firebase-admin');
const ordersRef = admin.firestore().collection('orders');

function getOpenOrders() {
  return ordersRef
    .where('status', '==', 'open')
    .get()
    .then(snapshot => {
      const docs = [];
      for (let i = 0; i < snapshot.docs.length; i++) {
        docs.push(snapshot.docs[i].data());
      }
      return docs;
    });
}

module.exports = {
  getOpenOrders: getOpenOrders
};
