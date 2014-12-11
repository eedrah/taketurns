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
    logger.warn("addToQueue", "Not online yet");
    return Promise.reject();
  }
  if (this._leader === null) {
    logger.warn("addToQueue:", "Unknown leader");
    return Promise.reject();
  }
  this._social.sendMessage(this._leader, JSON.stringify({ add: this._nickname }))
  return Promise.resolve();
};

TakeTurns.prototype.removeFromQueue = function () {
  if (this._myClientState.status !== this._social.STATUS.ONLINE) {
    logger.warn("removeFromQueue", "Not online yet");
    return Promise.reject();
  }
  if (this._leader === null) {
    logger.warn("removeFromQueue:", "Unknown leader");
    return Promise.reject();
  }
  this._social.sendMessage(this._leader, JSON.stringify({ remove: this._nickname }))
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
    if (this._myClientState.status === this._social.STATUS.ONLINE) {
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
      this._myClientState = data;
      if (data.status === this._social.STATUS.ONLINE) {
        this._dispatchEvent('onState', { name: this._nickname, status: "Online" });
      } else {
        this._dispatchEvent('onState', { name: this._nickname, status: "Offline" });
      }
    }
    // Tell everyone if I'm the leader
    if (data.status === this._social.STATUS.ONLINE &&
        this._myClientState !== null &&
        this._myClientState.status === this._social.STATUS.ONLINE &&
        this._isLeader) {
      this._social.sendMessage(data.clientId, JSON.stringify({ leader:this._myClientState.clientId }));
    }
    
  }.bind(this));

  /**
  * on an 'onMessage' event from the Social provider
  * Just forward it to the outer page
  */
  this._social.on('onMessage', function (data) {
    logger.debug("onMessage", data);
    try {
      var parsedMsg = JSON.parse(data);
      if (parsedMsg.leader) {
        this._leader = parsedMsg.leader;
      } else if (parsedMsg.add && this._isLeader) {
        for (var i=0; i<this._queue.length; i++) {
          if (this._queue[i].name == parsedMsg.add) {
            return;
          }
        }
        this._queue.push({ name: parsedMsg.add });
        this._broadcast(JSON.stringify({ queue: this._queue }));
      } else if (parsedMsg.remove && this._isLeader) {
        var newQueue = [];
        for (var i=0; i<this._queue.length; i++) {
          if (this._queue[i].name !== parsedMsg.remove) {
            newQueue.push(this._queue[i]);
          }
        }
        this._queue = newQueue;
        this._broadcast(JSON.stringify({ queue: this._queue }));
      } else if (parsedMsg.queue) {
        this._queue = parsedMsg.queue;
        this._dispatchEvent('onQueue', this._queue);
      } else if (parsedMsg.ping) {
        //Ignore
      } else {
        logger.warn("onMessage unrecognized message", data);
      }
    } catch(e) {
      logger.error("onMessage", e);
    }

  }.bind(this));

};

TakeTurns.prototype._broadcast = function(msg) {
  for(var k in this.clientList) {
    if (this.clientList.hasOwnProperty(k) &&
        this.clientList[k].status == this.social.STATUS.ONLINE) {
      this.social.sendMessage(this.clientList[k].clientId, msg);
    } 
  }
};

freedom().providePromises(TakeTurns);
