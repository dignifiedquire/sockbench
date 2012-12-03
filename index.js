// index.js
//
// Benchmark socket.io connections vs sock.js connections
// using a node based server.
//
// This is the server

var http = require('http');
var shoe = require('shoe');
var microtime = require('microtime');


// static file server that we later hook into
var ecstatic = require('ecstatic')(__dirname + '/static');
var server = http.createServer(ecstatic);
server.listen(9000);

// Sockjs server
var sockjsServer = shoe(function(stream) {
  // send a message that we have connected
  stream.write(createMessage('connected'));
  stream.on('data', function(data){
    console.log("Recieved: " + JSON.stringify(JSON.parse(data), null, 2));
    // send a message that we have recieved a message
    stream.write(createMessage('recieved'));
  });
  stream.on('end', function() { 
    console.log("Closed connection " + stream.id);
  });

});

var createMessage = function(type) {
  var obj = {
    type: type,
    time: microtime.now()
  };

  return JSON.stringify(obj);
};

sockjsServer.install(server, {prefix: '/shoe'});

// Socket.io server
