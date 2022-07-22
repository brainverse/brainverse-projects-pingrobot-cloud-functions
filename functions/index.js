/* eslint-disable linebreak-style */
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const https = require("https");
const http = require("http");

admin.initializeApp(functions.config().firebase);
const database = admin.database();
const firebaseCloudMessage = admin.messaging();

exports.test = functions.https.onRequest((request, response) => {
  response.send("Hello from Firebase!");
});

exports.onUrlCreate = functions.database.ref("userUrls/{userId}/{urlId}")
    .onCreate((snapshot, context)=>{
      const urlId = snapshot.key;
      const url = snapshot.val();
      console.log("No frequency:", snapshot.val()["frequency"]);

      // set default frequency to 5 for old app users
      if (snapshot.val()["frequency"] == null ) {
        url["frequency"] = 5;
      }
      url["owner"] = context.params.userId;
      url["live"] = true;
      url["lastChecked"] = new Date().getTime();
      database.ref("urls/" + urlId).set(url);
    });

exports.onUrlUpdate = functions.database.ref("userUrls/{userId}/{urlId}")
    .onUpdate((change)=>{
      const urlId = change.after.key;
      const url = change.after.val();
      database.ref("urls/" + urlId).update(url);
    });

exports.onUrlDelete = functions.database.ref("userUrls/{userId}/{urlId}")
    .onDelete((snapshot, context)=>{
      const urlId = snapshot.key;
      database.ref("urls/" + urlId).remove();
      const userId = context.params.userId;
      database.ref("userNotifications/" + userId).get().then((snapshot)=>{
        snapshot.forEach((childSnapshot)=>{
          const value = childSnapshot.val();
          const key = childSnapshot.key;
          console.log("here", value["url"], urlId);
          if (value["url"] == urlId) {
            database.ref("userNotifications/" + userId + "/" + key).remove();
          }
        });
      });
    });

exports.checkStatus = functions.pubsub.schedule("every 1 minutes")
    .onRun((context)=>{
      database.ref("urls").get().then((snapshot)=>{
        snapshot.forEach((childSnapshot)=>{
          const value = childSnapshot.val();
          const key = childSnapshot.key;

          if (Math.floor((new Date().getTime() - value["lastChecked"])/60000) ==
           value["frequency"]) {
            let url = value["url"];
            if (url.substring(0, 5) == "https") {
              httpsCall(url, key, value);
            } else {
              if (url.substring(0, 4) == "http") {
                httpCall(url, key, value);
              } else {
                url = "http://" + url;
                httpCall(url, key, value);
              }
            }
            value["lastChecked"] = new Date().getTime();
            database.ref("urls/" + key).update(value);
          }
        });
      });

      function httpCall(url, key, value) {
        http.get(url, (res) => {
          console.log("statusCode:", res.statusCode);
          statusCheck(res.statusCode, key, value);
        }).on("error", (e) => {
          console.error(e.code);
          database.ref("urls/" + key + "/live").get()
              .then((snapshot)=>{
                if (snapshot.val() == true) {
                  updateLive(key, false, value["owner"]);
                  onCallError(key, e, value);
                }
              });
        });
      }

      function httpsCall(url, key, value) {
        https.get(url, (res) => {
          console.log("statusCode:", res.statusCode);
          statusCheck(res.statusCode, key, value);
        }).on("error", (e) => {
          console.error(e.code);
          database.ref("urls/" + key + "/live").get()
              .then((snapshot)=>{
                if (snapshot.val() == true) {
                  updateLive(key, false, value["owner"]);
                  onCallError(key, e, value);
                }
              });
        });
      }

      function onCallError(key, e, value) {
        database.ref("userNotifications/" + value["owner"])
            .push().set({
              "status": "WARN",
              "read": false,
              "title": value["name"],
              "subtitle": e.code + ": " + value["url"],
              "url": key,
              "timestamp": new Date().getTime(),
            });
        database.ref("userFcmTokens/" + value["owner"]).get()
            .then((snapshot)=>{
              console.log(snapshot.val());
              firebaseCloudMessage
                  .send({token: snapshot.val(),
                    notification: {title: value["name"],
                      body: e.code + ": " + value["url"]}, android: {
                      priority: "high",
                    }}).then((response) => {
                    console
                        .log("Successfully sent message:",
                            response);
                    return {success: true};
                  }).catch((error) => {
                    return {error: error.code};
                  });
            });
      }

      function statusCheck(code, key, value) {
        if (code == 500) {
          database.ref("urls/" + key + "/live").get()
              .then((snapshot)=>{
                if (snapshot.val() == true) {
                  updateLive(key, false, value["owner"]);
                  handleNotification(key, code, "Internal Server Error", value);
                }
              });
        } else if (code == 502) {
          database.ref("urls/" + key + "/live").get()
              .then((snapshot)=>{
                if (snapshot.val() == true) {
                  updateLive(key, false, value["owner"]);
                  handleNotification(key, code, "Bad Gateway", value);
                }
              });
        } else if (code == 503) {
          database.ref("urls/" + key + "/live").get()
              .then((snapshot)=>{
                if (snapshot.val() == true) {
                  updateLive(key, false, value["owner"]);
                  handleNotification(key, code, "Service Unavailable", value);
                }
              });
        } else if (code == 400) {
          database.ref("urls/" + key + "/live").get()
              .then((snapshot)=>{
                if (snapshot.val() == true) {
                  updateLive(key, false, value["owner"]);
                  handleNotification(key, code, "Bad Request", value);
                }
              });
        } else if (code == 401) {
          database.ref("urls/" + key + "/live").get()
              .then((snapshot)=>{
                if (snapshot.val() == true) {
                  updateLive(key, false, value["owner"]);
                  handleNotification(key, code, "Unauthenticated", value);
                }
              });
        } else if (code == 403) {
          database.ref("urls/" + key + "/live").get()
              .then((snapshot)=>{
                if (snapshot.val() == true) {
                  updateLive(key, false, value["owner"]);
                  handleNotification(key, code, "Unauthorised", value);
                }
              });
        } else if (code == 404) {
          database.ref("urls/" + key + "/live").get()
              .then((snapshot)=>{
                if (snapshot.val() == true) {
                  updateLive(key, false, value["owner"]);
                  handleNotification(key, code, "Not Found", value);
                }
              });
        } else if (code == 200 || code == 301 || code == 307) {
          database.ref("urls/" + key + "/live").get()
              .then((snapshot)=>{
                if (snapshot.val() == false) {
                  handleNotification(key, code, "Back Online", value);
                  updateLive(key, true, value["owner"]);
                }
              });
        }
      }

      function updateLive(key, state, owner) {
        database.ref("urls/" + key).update({"live": state});
        database.ref("userUrls/" + owner + "/" + key)
            .update({"live": state, "statusTimestamp": new Date().getTime()});
      }

      function handleNotification(key, code, message, value) {
        let state;
        if (code == 200 || code == 301 || code == 307) {
          state = "OK";
        } else {
          state = "WARN";
        }
        database.ref("userNotifications/" + value["owner"])
            .push().set({
              "read": false,
              "status": state,
              "title": value["name"],
              "subtitle": code + " - " + message + ": " + value["url"],
              "timestamp": new Date().getTime(),
              "url": key,
            });
        database.ref("userFcmTokens/" + value["owner"]).get()
            .then((snapshot)=>{
              console.log(snapshot.val());
              firebaseCloudMessage
                  .send({token: snapshot.val(),
                    notification: {title: value["name"],
                      body: code + " - " + message + ": " + value["url"]},
                    android: {
                      priority: "high",
                    }}).then((response) => {
                    console
                        .log("Successfully sent message:",
                            response);
                    return {success: true};
                  }).catch((error) => {
                    return {error: error.code};
                  });
            });
      }
    });
