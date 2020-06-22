const JanusPlugin = require('../JanusPlugin');

class VideoRoomSubscriber extends JanusPlugin {
  constructor (logger) {
    super(logger);
    this.pluginName = "janus.plugin.videoroom";
  }

  initialize (peerConnection) {
    this.peerConnection = peerConnection;
  }

  joinRoomAndSubscribe (roomId, publisherId, roomPin = null, privatePublisherId = null,
      audio = true, video = true) {
    console.log(`Subscribing to member ${this.publisherId} in room ${this.roomId}`);

    this.roomId = roomId;
    this.roomPin = roomPin;
    this.publisherId = publisherId;
    this.privatePublisherId = privatePublisherId;
    this.audio = audio;
    this.video = video;

    let join = {
      request: "join",
      ptype: "subscriber",
      feed: publisherId,
      room: roomId,
      offer_video: video,
      offer_audio: audio
    };
    if (roomPin) {
      join.pin = roomPin;
    }
    if (privatePublisherId) {
      join.private_id = privatePublisherId;
    }

    return this.transaction("message", { body: join }, "event")
      .then((response) => {
        const { data, json } = response || {};

        if (!data || data.videoroom !== "attached") {
          this.logger.error("VideoRoom join answer is not \"attached\"", data, json);
          throw new Error("VideoRoom join answer is not \"attached\"");
        }
        if (!json.jsep) {
          this.logger.error("VideoRoom join answer does not contains jsep", data, json);
          throw new Error("VideoRoom join answer does not contains jsep");
        }

        const jsep = json.jsep;
        if (this.filterDirectCandidates && jsep.sdp) {
          jsep.sdp = this.sdpHelper.filterDirectCandidates(jsep.sdp);
        }

        return this.peerConnection.setRemoteDescription(jsep)
          .then(() => {
            console.log("[sub] RemoteDescription set", jsep);
            return this.peerConnection.createAnswer({ offerToReceiveAudio: true, offerToReceiveVideo: true })
              .then((answer) => {
                return this.peerConnection.setLocalDescription(answer)
                  .then(() => {
                    console.log("[sub] LocalDescription set", answer);

                    const jsep = answer;
                    const body = { request: 'start', room: this.roomId };
                    return this.transaction('message', { body, jsep }, 'event')
                      .then((response) => {
                        const { data, json } = response || {};

                        if (!data || data.started !== 'ok') {
                          this.logger.error('VideoRoom, could not start a stream', data, json);
                          throw new Error('VideoRoom, could not start a stream');
                        }

                        return data;
                      }).catch((error) => {
                        this.logger.error('VideoRoom, unknown error sending answer', error, jsep);
                        throw error;
                      });
                  });
              });
          });
      }).catch((error) => {
        this.logger.error('VideoRoom, unknown error connecting to room', error, join);
        throw error;
      });
  }

  modifySubscription (audio = true, video = true) {
    console.log(`Modifying subscription to member ${this.publisherId} in room ${this.roomId}`);

    this.audio = audio;
    this.video = video;

    let configure = {
      request: 'configure',
      ptype: 'subscriber',
      feed: this.publisherId,
      room: this.roomId,
      video: video,
      audio: audio,
      offer_video: video,
      offer_audio: audio
    };
    if (this.roomPin) {
      configure.pin = this.roomPin;
    }
    if (this.privatePublisherId) {
      configure.private_id = this.privatePublisherId;
    }

    return this.transaction("message", { body: configure }, "event")
      .then((response) => {
        const { data, json } = response || {};

        if (!data || data.configured !== "ok") {
          this.logger.error("VideoRoom join answer is not \"ok\"", data, json);
          throw new Error("VideoRoom join answer is not \"ok\"");
        }
        console.log("Subscription modified", response);
      }).catch((error) => {
        this.logger.error("VideoRoom, unknown error connecting to room", error, configure);
        throw error;
      });
  }

  stopAudio () {
    console.log(`Stopping audio of publisher ${this.publisherId}`);
    return this.modifySubscription(false, this.video);
  }

  startAudio () {
    console.log("[ START AUDIO ]");
    console.log(`Starting audio of publisher ${this.publisherId}`);
    return this.modifySubscription(true, this.video);
  }

  stopVideo () {
    console.log(`Stopping video of publisher ${this.publisherId}`);
    return this.modifySubscription(this.audio, false);
  }

  startVideo () {
    console.log(`Starting video of publisher ${this.publisherId}`);
    return this.modifySubscription(this.audio, true);
  }
}

module.exports = VideoRoomSubscriber;
