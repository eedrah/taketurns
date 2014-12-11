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

var TakeTurns = function (dispatchEvent, roomname, nickname) {
  this.dispatchEvent = dispatchEvent;
  this.roomname = roomname;
  this.nickname = nickname;

  this.social = freedom.socialprovider();
  this.userList = {};    //Keep track of the roster
  this.clientList = {};
  this.myClientState = null;

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
  this.dispatchEvent('onQueue', this.queue);
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
  this.dispatchEvent('onQueue', this.queue);
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

TakeTurns.prototype._boot = function () {
  this.social.login({
    agent: 'taketurns_'+this.roomname.slice(1), //Must remove '#' or WebSockets will fail
    version: '0.1',
    url: 'https://github.com/ryscheng/taketurns',
    interactive: true,
    rememberLogin: false
  }).then(function (ret) {
    this.myClientState = ret;
    logger.log("onLogin", this.myClientState);
    if (ret.status === this.social.STATUS.ONLINE) {
      this.nickname = ret.clientId;
      this.dispatchEvent('onState', { name: this.nickname, status: "Online" });
    } else {
      this.dispatchEvent('onState', { name: this.nickname, status: "Offline" });
    }
  }.bind(this), function (err) {
    logger.log("Log In Failed", JSON.stringify(err));
    this.dispatchEvent("onState", { name: this.nickname, status: "Error" });
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
        this.dispatchEvent('onState', { name: this.nickname, status: "Online" });
      } else {
        this.dispatchEvent('onState', { name: this.nickname, status: "Offline" });
      }
    }
    
  }.bind(this));

  /**
  * on an 'onMessage' event from the Social provider
  * Just forward it to the outer page
  */
  this.social.on('onMessage', function (data) {
    logger.info("Message Received", data);
  }.bind(this));

};

freedom().providePromises(TakeTurns);
