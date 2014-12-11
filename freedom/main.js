/*jslint sloppy:true */
/*globals freedom */

/**
 * TakeTurns demo backend.
 **/
// Create a logger for this module.
// TODO: allow loggers to be made synchronously.
var logger;
freedom.core().getLogger('[TakeTurns Backend]').then(function (log) {
  logger = log;
});

var TakeTurns = function (dispatchEvent, config) {
  this._dispatchEvent = dispatchEvent;
  this._room = config.room;
  this._nickname = config.nickname;
  this._isLeader = config.leader;

  this._social = freedom.socialprovider();
  this._userList = {};    //Keep track of the roster
  this._clientList = {};
  this._myClientState = null;

  this._leader = null;
  this._queue = [];

  this._boot();
};

TakeTurns.prototype.addToQueue = function () {
  if (this._myClientState.status !== this._social.STATUS.ONLINE) {
    logger.warn("removeFromQueue", "Not online yet");
    return Promise.reject();
  };

  for (var i=0; i<this._queue.length; i++) {
    if (this._queue[i].name == this._nickname) {
      return Promise.resolve();
    }
  }
  this._queue.push({
    name: this._nickname
  });
  this._dispatchEvent('onQueue', this._queue);
  this._broadcast(JSON.stringify({ queue: this._queue }));
  return Promise.resolve();
};

TakeTurns.prototype.removeFromQueue = function () {
  if (this._myClientState.status !== this._social.STATUS.ONLINE) {
    logger.warn("removeFromQueue", "Not online yet");
    return Promise.reject();
  };

  var newQueue = [];
  for (var i=0; i<this._queue.length; i++) {
    if (this._queue[i].name !== this._nickname) {
      newQueue.push(this._queue[i]);
    }
  }
  this._queue = newQueue;
  this._dispatchEvent('onQueue', this._queue);
  this._broadcast(JSON.stringify({ queue: this._queue }));
  return Promise.resolve();
};

TakeTurns.prototype._broadcast = function(msg) {
  for(var k in this._clientList) {
    if (this._clientList.hasOwnProperty(k) &&
        this._clientList[k].status == this._social.STATUS.ONLINE) {
      this._social.sendMessage(this._clientList[k].clientId, msg);
    } 
  }
  return Promise.resolve();
};

TakeTurns.prototype._keepalive = function() {
  if (this._myClientState && this._myClientState.status &&
      this._myClientState.status == this._social.STATUS.ONLINE) {
    this._social.sendMessage(this._myClientState.clientId, JSON.stringify({ ping:true }));
    setTimeout(this._keepalive.bind(this), 20000);
  }
};

TakeTurns.prototype._boot = function () {
  this._social.login({
    agent: 'taketurns_'+this._room,
    version: '0.1',
    url: 'https://github.com/ryscheng/taketurns',
    interactive: true,
    rememberLogin: false
  }).then(function (ret) {
    this._myClientState = ret;
    this._keepalive();
    logger.log("onLogin", this._myClientState);
    if (ret.status === this._social.STATUS.ONLINE) {
      this._nickname = ret.clientId;
      this._dispatchEvent('onState', { name: this._nickname, status: "Online" });
    } else {
      this._dispatchEvent('onState', { name: this._nickname, status: "Offline" });
    }
  }.bind(this), function (err) {
    logger.log("Log In Failed", JSON.stringify(err));
    this._dispatchEvent("onState", { name: this._nickname, status: "Error" });
  }.bind(this));

  /**
  * On user profile changes, let's keep track of them
  **/
  this._social.on('onUserProfile', function (data) {
    //Just save it for now
    this._userList[data.userId] = data;
  }.bind(this));
  
  /**
  * On newly online or offline clients, let's update the roster
  **/
  this._social.on('onClientState', function (data) {
    logger.debug("Roster Change", data);
    //Only track non-offline clients
    if (data.status === this._social.STATUS.OFFLINE) {
      if (this._clientList.hasOwnProperty(data.clientId)) {
        delete this._clientList[data.clientId];
      }
    } else {
      this._clientList[data.clientId] = data;
    }
    //If mine, send to the page
    if (this._myClientState !== null && data.clientId === this._myClientState.clientId) {
      if (data.status === this._social.STATUS.ONLINE) {
        this._dispatchEvent('onState', { name: this._nickname, status: "Online" });
      } else {
        this._dispatchEvent('onState', { name: this._nickname, status: "Offline" });
      }
    }
    
  }.bind(this));

  /**
  * on an 'onMessage' event from the Social provider
  * Just forward it to the outer page
  */
  this._social.on('onMessage', function (data) {
    console.log(data);
    logger.debug("Message Received", data);

  }.bind(this));

};

freedom().providePromises(TakeTurns);
