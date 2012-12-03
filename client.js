var shoe = require('shoe');
var domready = require('domready');
var _ = require('lodash');

domready(function(){
  var stream = shoe('/shoe');

  stream.on('connection', function(data) {
    console.log("Connected");
  });

  var counter = 10;
  var results = [];
  stream.on('data', function(data) {
    if (counter > 0) {
      stream.write(createMessage(counter));
      results.push(JSON.parse(data));
      counter -= 1;
    } else {
      stream.end();
    }

  });

  stream.on('end', function(data) {
    console.log("Closed connnection", results);
  });

  var createMessage = function(type) {
    var obj = {
      type: type,
      time: Date.now()
    };
    return JSON.stringify(obj);
  };

});