var express = require('express');
var app = express();
app.use(express.static(__dirname + '/public'));

var server = require('http').createServer(app).listen(3000);
console.log('Server is up and running!');

var io = require('socket.io')(server);

var MongoClient = require('mongodb').MongoClient;
var dbUrl = "mongodb://localhost:27017/epidemicPaint";

app.get('/', function (req, res) {
  res.sendFile(__dirname + '/public/index.html');
});

// Object containing all drawing sessions
var sessions = {};

MongoClient.connect(dbUrl, function (err, db) {
  if (err) {
    console.log('Error, failed to connect to MongoDB.')
    return;
  }

  var collection = db.collection('drawings');

  // Get saved sessions from MongoDB, map them to the session object and emit them to client
  collection.find({}).toArray(function (err, docs) {
    for (var i in docs) {
      sessions['room-' + i] = {
        room: 'room-' + i,
        index: i,
        id: docs[i]._id,
        name: docs[i].name,
        canvas: docs[i].image,
        undo: [],
        redo: []
      };
    }
  });
});

io.on('connection', function (client) {
    // Current room
    var room = '';
    client.emit('sessions', sessions);

    MongoClient.connect(dbUrl, function (err, db) {
      if (err) {
        console.log('Error, failed to connect to MongoDB.');
        return;
      }
      var collection = db.collection('drawings');
      // On save event add entry to MongoDB drawings collection
      client.on('save', function () {
        var doc = {name: sessions[room].name, image: sessions[room].canvas};
        if(sessions[room].id) {
          doc._id = sessions[room].id;
        }
        collection.save(doc, null,
        function (err, response) {
          if (!err) {
            // Clear the undo/redo history after saving the canvas
            sessions[room].undo = [];
            sessions[room].redo = [];
            client.emit('message', "Your drawing session is saved!");
          } else {
            client.emit('message', "Something went wrong!");
          }
        });
      });
    });

    var joinRoom = function (name) {
      client.join(name);
      room = name;
      client.emit('canvas', sessions[room].canvas);
    }

    client.on('createRoom', function (data) {
      var index = Object.keys(sessions).length;
      var roomData = {room: 'room-' + index, index: index, name: data.name || 'N/A', undo: [], redo: [], canvas: ''};
      sessions[roomData.room] = roomData;
      joinRoom(roomData.room);
      io.sockets.emit('newSession', roomData);
    });

    client.on('join', joinRoom); 

    client.on('leave', function () {
      client.leave(room);
      room = '';
    });

    client.on('point', function (data) {
      client.broadcast.to(room).emit('point', data);
    });

    client.on('stroke', function (data) {
      sessions[room].undo.push(sessions[room].canvas);
      sessions[room].canvas = data.image;
      if (data.redraw == true) {
        client.broadcast.to(room).emit('canvas', sessions[room].canvas);
      }
    });

    client.on('clear', function () {
      sessions[room].canvas = '';
      io.sockets.in(room).emit('clear');
    });

    client.on('undo', function () {
      if (sessions[room].undo.length > 0) {
        sessions[room].redo.push(sessions[room].canvas);
        sessions[room].canvas = sessions[room].undo.pop();
        io.sockets.in(room).emit('canvas', sessions[room].canvas);
      }
    });

    client.on('redo', function () {
      if (sessions[room].redo.length > 0) {
        sessions[room].undo.push(sessions[room].canvas);
        sessions[room].canvas = sessions[room].redo.pop();
        io.sockets.in(room).emit('canvas', sessions[room].canvas);
      }
    });
});
