const functions = require("firebase-functions");
const admin = require("firebase-admin");
const ping = require("ping");

admin.initializeApp(functions.config().firebase);
const database = admin.database();

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

exports.checkStatus = functions.pubsub.schedule("every 45 minutes")
    .onRun((context)=>{
      database.ref("urls").get().then((snapshot)=>{
        Object.values(snapshot.val()).forEach((value)=>{
          ping.promise
              .probe(value["url"]).then((res)=>{
                console.log(res.alive);
                if (res.alive == false) {
                  database.ref("userNotifications/" + value["owner"])
                      .push().set({
                        "read": false,
                        "title": value["name"] + " is offline",
                        "subtitle": value["url"],
                        "timestamp": new Date().getTime(),
                      });
                }
              });
        });
      });
    });
