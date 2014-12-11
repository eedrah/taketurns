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
  this.nickname = config.nickname;
  this.isLeader = config.leader;

  this.social = freedom.socialprovider();
  this.userList = {};    //Keep track of the roster
  this.clientList = {};
  this.myClientState = null;
  this.leader = null;

  this.queue = [];

  this._boot();
};

TakeTurns.prototype.addToQueue = function () {
  if (this.myClientState.status !== this.social.STATUS.ONLINE) {
    logger.warn("removeFromQueue", "Not online yet");
    return Promise.reject();
  };

  for (var i=0; i<this.queue.length; i++) {
    if (this.queue[i].name == this.nickname) {
      return Promise.resolve();
    }
  }
  this.queue.push({
    name: this.nickname
  });
  this._dispatchEvent('onQueue', this.queue);
  this._broadcast(JSON.stringify({ queue: this.queue }));
  return Promise.resolve();
};

TakeTurns.prototype.removeFromQueue = function () {
  if (this.myClientState.status !== this.social.STATUS.ONLINE) {
    logger.warn("removeFromQueue", "Not online yet");
    return Promise.reject();
  };

  var newQueue = [];
  for (var i=0; i<this.queue.length; i++) {
    if (this.queue[i].name !== this.nickname) {
      newQueue.push(this.queue[i]);
    }
  }
  this.queue = newQueue;
  this._dispatchEvent('onQueue', this.queue);
  this._broadcast(JSON.stringify({ queue: this.queue }));
  return Promise.resolve();
};

TakeTurns.prototype._broadcast = function(msg) {
  for(var k in this.clientList) {
    if (this.clientList.hasOwnProperty(k) &&
        this.clientList[k].status == this.social.STATUS.ONLINE) {
      this.social.sendMessage(this.clientList[k].clientId, msg);
    } 
  }
  return Promise.resolve();
};

TakeTurns.prototype._keepalive = function() {
  if (this.myClientState && this.myClientState.status &&
      this.myClientState.status == this.social.STATUS.ONLINE) {
    this.social.sendMessage(this.myClientState.clientId, JSON.stringify({ ping:true }));
    setTimeout(this._keepalive.bind(this), 10000);
  }
};

TakeTurns.prototype._boot = function () {
  this.social.login({
    agent: 'taketurns_'+this._room,
    version: '0.1',
    url: 'https://github.com/ryscheng/taketurns',
    interactive: true,
    rememberLogin: false
  }).then(function (ret) {
    this.myClientState = ret;
    this._keepalive();
    logger.log("onLogin", this.myClientState);
    if (ret.status === this.social.STATUS.ONLINE) {
      this.nickname = ret.clientId;
      this._dispatchEvent('onState', { name: this.nickname, status: "Online" });
    } else {
      this._dispatchEvent('onState', { name: this.nickname, status: "Offline" });
    }
  }.bind(this), function (err) {
    logger.log("Log In Failed", JSON.stringify(err));
    this._dispatchEvent("onState", { name: this.nickname, status: "Error" });
  }.bind(this));

  /**
  * On user profile changes, let's keep track of them
  **/
  this.social.on('onUserProfile', function (data) {
    //Just save it for now
    this.userList[data.userId] = data;
  }.bind(this));
  
  /**
  * On newly online or offline clients, let's update the roster
  **/
  this.social.on('onClientState', function (data) {
    logger.debug("Roster Change", data);
    //Only track non-offline clients
    if (data.status === this.social.STATUS.OFFLINE) {
      if (this.clientList.hasOwnProperty(data.clientId)) {
        delete this.clientList[data.clientId];
      }
    } else {
      this.clientList[data.clientId] = data;
    }
    //If mine, send to the page
    if (this.myClientState !== null && data.clientId === this.myClientState.clientId) {
      if (data.status === this.social.STATUS.ONLINE) {
        this._dispatchEvent('onState', { name: this.nickname, status: "Online" });
      } else {
        this._dispatchEvent('onState', { name: this.nickname, status: "Offline" });
      }
    }
    
  }.bind(this));

  /**
  * on an 'onMessage' event from the Social provider
  * Just forward it to the outer page
  */
  this.social.on('onMessage', function (data) {
    console.log(data);
    logger.debug("Message Received", data);

  }.bind(this));

};

freedom().providePromises(TakeTurns);
