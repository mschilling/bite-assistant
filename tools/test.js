'use strict';

// process.env.DEBUG = 'bite-api:*';
console.log('Running test.js');

const chalk = require('../functions/node_modules/chalk');

const admin = require('../functions/node_modules/firebase-admin');
const serviceAccount = require('./service-account.json');

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  databaseURL: 'https://m4m-bite.firebaseio.com'
});

const api = require('../functions/helpers/api');

// const userId = 'FcESZ3XGxThkUg51Hh51E0mS2hB3';
// testGetUser(userId);

// testGetUsers();

testGetOpenOrders();

function testGetUsers() {
  return api.getUsers()
    .then(data => {
      (data || []).forEach(user => {
        console.log(user.name, chalk.bgRed(user.email));
      });
    });
}

function testGetUser(userId) {
  return api.getUser(userId)
    .then(user => {
      console.log(user);
    })
    .catch(error => {
      console.log('Error: ' + error);
    });
}

function testGetOpenOrders() {
  api.getOpenOrders().then(iets => {
    for (let i = 0; i < iets.length; i++) {
      console.log(iets[i].data());
    }
    //console.log(iets[0].data());
  });

  // return api.getOpenOrders()
  // .then( data => {
  //   data.forEach( order => {

  //     // let openedBy = order.opened_by;
  //     // return api.getUser(order.opened_by)
  //     //   .then( usr => {
  //     //     console.log(order.location, order.store, chalk.bgRed(order.status), usr.name);
  //     //   });
  //   });
  // });
}
