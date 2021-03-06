//STATUS: WOrking
var localVideoObject;
var remoteVideoObject;
var broadcastButton;

var roomName = "helloAdele";
var localStreams = {};
var localStream = undefined;
var remoteStreams = {};
var screenshareStream = undefined;

const configOptions = {"iceServers": [{"url": "stun:stun.l.google.com:19302"},
              { url: 'turn:numb.viagenie.ca',
                credential: 'enter1234',
                username: 'bethin.charles@yahoo.com'
              }]};

// var subscibers = [];
// var publishers = [];
var peers = [];
var peerNumberOf = {
  "userID": "peerNumber"
};

var constraints = {
  video: true,
  audio: true
};

///////////////////////
//// StreamCast Eng Stuff

var streamEng = {
    socket: null,
    serviceAddress: null,
    onSubscribeDone: undefined,
    shouldScreenshare: false,
    hasPublished: false
};

streamEng.setupService = function() {
  streamEng.subscribe();
};

streamEng.publish = function() {
  setupMediaStream(false);
  streamEng.socket.emit('publish', user.userID, roomName);
  user.isPublished = true;
};

streamEng.subscribe = function() {
  setupPage();
  streamEng.socket = io.connect(streamEng.serviceAddress);
  console.log("Connected to Stream Server", streamEng.serviceAddress, roomName);

  // $('#publishButton').click(function() {
    //   streamEng.publish();
    // });

  streamEng.socket.emit('subscribe', user.userID, roomName);

  // When it receives a subscriber ready message, add user to peers (only publishers get subscriber ready msg's)
  streamEng.socket.on('subscriber ready', function(clientID) {

    // If this clientID isn't on record yet, create a new PC and add it to record
    // Then join the room
    if (!peerNumberOf.hasOwnProperty(clientID)) {
      if (user.userID !== clientID) {
        var newPeerConnection = createPeerConnection(clientID);
        peers.push({
          "userID": clientID,
          "number": (peers.length),
          "peerConnection": newPeerConnection,
          setAndSentDescription: false,
          hasSubscribed: true,
          hasPublished: false
        });
        peerNumberOf[clientID] = peers.length - 1;
      }

      joinRoom(peerNumberOf[clientID]);

    // If client is on record,
    } else {
      console.log("Already connected to this peer. Initiating stream");

      var peerNumber = peerNumberOf[clientID];
      peers[peerNumber].hasSubscribed = true;
      joinRoom(peerNumberOf[clientID]);
    }

    setupGetStats(peerNumberOf[clientID]);

  });

  // The broadcaster is ready to stream, create a PC for it
  streamEng.socket.on('publisher ready', function(publisherID, publisherNumber) {
    // /* If peer doesn't exist, create new PC and add it to list of peers
    // If it does exist, reset the publisher number and the onaddstream function
    // so that the peer number is correct */

    if (!peerNumberOf.hasOwnProperty(publisherID)) {
      if (user.userID !== publisherID) {
        var newPeerConnection = createPeerConnection(publisherID, publisherNumber);
        peers.push({
          "userID": publisherID,
          "number": (peers.length),
          "peerConnection": newPeerConnection,
          "publisherNumber": publisherNumber,
          hasSubscribed: false,
          hasPublished: true
        });

        peerNumberOf[publisherID] = peers.length - 1;
      }

    } else {
      var peerNumber = peerNumberOf[publisherID];
      peers[peerNumber].publisherNumber = publisherNumber;
      peers[peerNumber].hasPublished = true;
      peers[peerNumber].peerConnection.onaddstream = function(event) {
        remoteStreams[peerNumber] = event.stream;
        document.getElementById('remoteVideo'+publisherNumber.toString()).srcObject = event.stream;
      };
    }

    setupGetStats(peerNumberOf[publisherID]);
    streamEng.onAddNewPublisher(publisherNumber);
  });

  // On signal, go to gotMessageFromServer to handle the message
  streamEng.socket.on('signal', function(message) {
    gotMessageFromServer(message);
  });

  // Handle client disconnect
  streamEng.socket.on('disconnect user', function(userID, roomName) {
     if (peerNumberOf.hasOwnProperty(userID)) {
       var peerNumber = peerNumberOf[userID];
       if (peers[peerNumber].hasOwnProperty("publisherNumber")) {
         // If it's a publisher, delete publishers;
           streamEng.onDeletePublisher(peers[peerNumber].publisherNumber);
       }

       delete peerNumberOf[userID];
       peers.splice(peerNumber, 1);
     }
  });

    if (typeof streamEng.onSubscribeDone !== "undefined") {
        streamEng.onSubscribeDone();
    }

}


//////////////////////////
////// To make this work

function gotMessageFromServer(message) {
    var signal = message;

    // Ignore messages from ourself
    if(signal.userID === user.userID) {
      console.log("Received from self");
      return;
    }

    // if (true) {
    // If I'm the broadcaster, loop through my peers and find the right
    // peer connection to use to send to
    peerNumber = peerNumberOf[signal.userID];

    if(signal.type === "sdp") {
        handleSDP(signal, peerNumber);
    } else if(signal.type === "ice") {
        peers[peerNumber].peerConnection.addIceCandidate(new RTCIceCandidate(signal.ice)).catch(errorHandler);
    }

}


function joinRoom(peerNumber) {
    try {
        setupMediaStream(true, peerNumber);
    } catch(err) {
        console.log("Error:", err)
    }
}

// Get the media from camera/microphone.
function setupMediaStream(startStream, peerNumber) {

    if (streamEng.shouldScreenshare) {
        getScreenConstraints(function(error, screen_constraints) {
            if (error) {
                return alert(error);
            }

            var video_options = {
                video: screen_constraints,
                // audio: true
            };
            navigator.getUserMedia = navigator.webkitGetUserMedia || navigator.mozGetUserMedia;

            if (screenshareStream !== undefined) {
                console.log("Reusing stream");
                shareStream(screenshareStream, startStream, peerNumber);
            } else {
                navigator.getUserMedia(video_options, function(stream) {
                    screenshareStream = stream;
                    shareStream(stream, false, peerNumber);
                }, function(error) {
                    console.log("SCREENSHARE ERR:", error);
                });
            }

        });
    } else {
        if(navigator.mediaDevices.getUserMedia) {
            navigator.mediaDevices.getUserMedia(constraints).then(function(stream) {
                shareStream(stream, startStream, peerNumber);
            });
        } else {
            alert('Your browser does not support getUserMedia API');
        }
    }
}

function shareStream(stream, startStream, peerNumber) {
    localStreams[peerNumber] = stream;

    if (!streamEng.hasPublished/*startStream === false*/) {
        console.log("LEGOO")
        localStream = stream;
        streamEng.onPublish(stream);
        streamEng.hasPublished = true;
    }

    if (startStream) {
      // If you want to start the stream, addStream to connection
      if (!peers[peerNumber]) {
          console.log("Peer not found:", peerNumber);
      } else {
        peers[peerNumber].peerConnection.addStream(localStreams[peerNumber]);
        peers[peerNumber].peerConnection.createOffer().then(function(description) {
            peers[peerNumber].peerConnection.setLocalDescription(description).then(function () {
                streamEng.socket.emit('signal', {
                    'type': 'sdp',
                    'sdp': peers[peerNumber].peerConnection.localDescription,
                    'userID': user.userID
                }, peers[peerNumber].userID, roomName);
            }).catch(errorHandler);
        }).catch(errorHandler);
      }
    }
}

// Create peer connection 1
function createPeerConnection(peerUserID, publisherNumber) {

  var newPeerConnection = new RTCPeerConnection(configOptions);
  newPeerConnection.onicecandidate = function(event) {
    if(event.candidate !== null) {
        streamEng.socket.emit('signal', {'type': 'ice', 'ice': event.candidate, 'userID': user.userID}, peerUserID, roomName);
    }
  };

  if (publisherNumber !== null) {
    newPeerConnection.onaddstream = function(event) {
      remoteStreams[publisherNumber] = event.stream;
      document.getElementById('remoteVideo'+publisherNumber.toString()).srcObject = event.stream;
    };
  }

  return newPeerConnection;
}

function handleSDP(signal, peerNumber) {
  peers[peerNumber].peerConnection.setRemoteDescription(new RTCSessionDescription(signal.sdp)).then(function() {
      // Only create answers in response to offers
      if(signal.sdp.type == 'offer') {
          peers[peerNumber].peerConnection.createAnswer().then(function(description) {
            setAndSendDescription(description, peerNumber);
          }).catch(errorHandler);
      } else {
        console.log("Got answer", peerNumber);
      }
  }).catch(errorHandler);
}

function setAndSendDescription(description, peerNumber) {
  peers[peerNumber].peerConnection.setLocalDescription(description).then(function () {
      streamEng.socket.emit('signal', {
          'type': 'sdp',
          'sdp': peers[peerNumber].peerConnection.localDescription,
          'userID': user.userID
      }, peers[peerNumber].userID, roomName);
  }).catch(errorHandler);
}

function setupGetStats(peerNumber) {
  getStats(peers[peerNumber].peerConnection, function(results) {
    console.log(results);
    var bytesSent = results.video.bytesReceived;
    if (peers[peerNumber].hasPublished && bytesSent === 0) {
      console.log("Uh oh no bytes");
    }
  }, 1000);
}

// Setup DOM elements and responses
function setupPage() {
    user.isPublished = false;
    user.isSubscribed = true;

    localVideoObject = document.getElementById('local-video');
    remoteVideoObject = document.getElementById('remote-video');


    // If client is going to disconnect, let server know
    window.addEventListener("beforeunload", function(e) {
        streamEng.socket.emit('disconnect client', user.userID, roomName); // Disconnects from roomm
    }, false);
}

///////////////////
function errorHandler(error) {
    console.log(error.message);
}

streamEng.disconnect = function(userid) {
  streamEng.socket.emit('disconnect client', userid, roomName);
}
