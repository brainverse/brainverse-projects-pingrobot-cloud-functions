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
      url["owner"] = context.params.userId;
      url["live"] = true;
      database.ref("urls/" + urlId).set(url);
    });

exports.onUrlUpdate = functions.database.ref("userUrls/{userId}/{urlId}")
    .onUpdate((change)=>{
      const urlId = change.after.key;
      const url = change.after.val();
      database.ref("urls/" + urlId).update(url);
    });

exports.onUrlDelete = functions.database.ref("userUrls/{userId}/{urlId}")
    .onDelete((snapshot)=>{
      const urlId = snapshot.key;
      database.ref("urls/" + urlId).remove();
    });

exports.checkStatus = functions.pubsub.schedule("every 5 minutes")
    .onRun((context)=>{
      database.ref("urls").get().then((snapshot)=>{
        snapshot.forEach((childSnapshot)=>{
          const value = childSnapshot.val();
          const key = childSnapshot.key;
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
        });
      });

      function httpCall(url, key, value) {
        http.get(url, (res) => {
          console.log("statusCode:", res.statusCode);
          statusCheck(res.statusCode, key, value);
        }).on("error", (e) => {
          console.error(e.code);
          updateLive(key, false);
          onCallError(e, value);
        });
      }

      function httpsCall(url, key, value) {
        https.get(url, (res) => {
          console.log("statusCode:", res.statusCode);
          statusCheck(res.statusCode, key, value);
        }).on("error", (e) => {
          console.error(e.code);
          updateLive(key, false);
          onCallError(e, value);
        });
      }

      function onCallError(e, value) {
        database.ref("userNotifications/" + value["owner"])
            .push().set({
              "read": false,
              "title": value["name"],
              "subtitle": e.code + ": " + value["url"],
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
          updateLive(key, false);
          handleNotification(code, "Internal Server Error", value);
        } else if (code == 502) {
          updateLive(key, false);
          handleNotification(code, "Bad Gateway", value);
        } else if (code == 503) {
          updateLive(key, false);
          handleNotification(code, "Service Unavailable", value);
        } else if (code == 400) {
          updateLive(key, false);
          handleNotification(code, "Bad Request", value);
        } else if (code == 401) {
          updateLive(key, false);
          handleNotification(code, "Unauthenticated", value);
        } else if (code == 403) {
          updateLive(key, false);
          handleNotification(code, "Unauthorised", value);
        } else if (code == 404) {
          updateLive(key, false);
          handleNotification(code, "Not Found", value);
        } else if (code == 200 || code == 301 || code == 307) {
          database.ref("urls/" + key + "/live").get()
              .then((snapshot)=>{
                if (snapshot.val() == false) {
                  handleNotification(code, "Back Online", value);
                }
              });
          updateLive(key, true);
        }
      }

      function updateLive(key, state) {
        database.ref("urls/" + key).update({"live": state});
      }

      function handleNotification(code, message, value) {
        database.ref("userNotifications/" + value["owner"])
            .push().set({
              "read": false,
              "title": value["name"],
              "subtitle": code + " - " + message + ": " + value["url"],
              "timestamp": new Date().getTime(),
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
