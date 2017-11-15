'use strict';

const Debug = require('debug');
const debug = Debug('bite-api:debug');
const error = Debug('bite-api:error');

const ApiUsers = require('./users');
const ApiOrders = require('./orders');

// Configure logging for hosting platforms that only support console.log and console.error
debug.log = console.log.bind(console);
error.log = console.error.bind(console);

class BiteApi {
  static getUsers() {
    debug('getUsers');
    return ApiUsers.getUsers();
  }
  static getUser(userId) {
    debug('getUser ' + userId);
    return ApiUsers.getUser(userId);
  }

  static getUserAuth(accestoken) {
    debug('getUserAuth ' + accestoken);
    return ApiUsers.getUserAuth(accestoken);
  }

  static getOpenOrders() {
    debug('getOpenOrders');
    return ApiOrders.getOpenOrders();
  }
}

module.exports = BiteApi;
