'use strict';

const Debug = require('debug');
const debug = Debug('bite-api:debug');
const error = Debug('bite-api:error');

const admin = require('firebase-admin');
const usersRef = admin.firestore().collection('users');

function getUsers() {
  return usersRef
    .get()
    .then(snapshot => {
      const users = [];
      for (let i = 0; i < snapshot.docs.length; i++) {
        users.push(snapshot.docs[i].data());
      }
      return users;
    });
}

function getUser(userId) {
  if (!userId) {
    error('userId is null');
    return Promise.reject('userId is null');
  }

  return usersRef
    .doc(userId)
    .get()
    .then(snapshot => snapshot.data())
    .catch( e => {
      error('Errorxxxxxss: %s', e);
      return new Error('User doesn\'t exist');
    })
    ;
}

function getUserAuth(accestoken) {
  return usersRef.where('access_token', '==', accestoken)
    .get()
    .then(snapshot => {
      const users;
      for (let i = 0; i < snapshot.docs.length; i++) {
        users.push(snapshot.docs[i]);
      }
      return users;
    });
}

module.exports = {
  getUsers: getUsers,
  getUser: getUser,
  getUserAuth: getUserAuth
};
