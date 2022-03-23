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

exports.checkStatus = functions.pubsub.schedule("every 55 minutes")
    .onRun((context)=>{
      database.ref("urls").get().then((snapshot)=>{
        Object.values(snapshot.val()).forEach((value)=>{
          let url = value["url"];
          if (url.substring(0, 5) == "https") {
            httpsCall(url, value);
          } else {
            if (url.substring(0, 4) == "http") {
              httpCall(url, value);
            } else {
              url = "http://" + url;
              httpCall(url, value);
            }
          }
        });
      });

      function httpCall(url, value) {
        http.get(url, (res) => {
          console.log("statusCode:", res.statusCode);
          statusCheck(res.statusCode, value);
        }).on("error", (e) => {
          console.error(e.code);
          onCallError(e, value);
        });
      }

      function httpsCall(url, value) {
        https.get(url, (res) => {
          console.log("statusCode:", res.statusCode);
          statusCheck(res.statusCode, value);
        }).on("error", (e) => {
          console.error(e.code);
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

      function statusCheck(code, value) {
        if (code == 500) {
          handleNotification(code, "Internal Server Error", value);
        } else if (code == 502) {
          handleNotification(code, "Bad Gateway", value);
        } else if (code == 503) {
          handleNotification(code, "Service Unavailable", value);
        } else if (code == 400) {
          handleNotification(code, "Bad Request", value);
        } else if (code == 401) {
          handleNotification(code, "Unauthenticated", value);
        } else if (code == 403) {
          handleNotification(code, "Unauthorised", value);
        } else if (code == 404) {
          handleNotification(code, "Not Found", value);
        }
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
