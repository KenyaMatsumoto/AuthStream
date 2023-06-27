import { Role } from "amazon-kinesis-video-streams-webrtc";
import { SignalingClient } from "amazon-kinesis-video-streams-webrtc";
import { KinesisVideo, KinesisVideoSignalingChannels } from "aws-sdk";
import React, { useEffect, useRef, useState } from "react";
import { awsCredentials } from "./streaming-viewer-content";

interface Props {
  channelName: string;
  channelARN: string;
}

const globalKVS: any = {};

const StreamingViewer: React.FC<Props> = (props: Props) => {
  const kinesisVideoClient = new KinesisVideo(awsCredentials);
  const [masterStream, setMasterStream] = useState<MediaStream | null>(null);
  const [paused, setPaused] = useState(false);
  const [clientIsLoaded, setClientIsLoaded] = useState(false);
  const [cameraList, setCameraList] = useState<any[]>([]);
  const clientId = "viewer-" + generateUuid();

  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = masterStream;
    }
  }, [masterStream]);

  useEffect(() => {
    if (videoRef.current && paused) {
      videoRef.current.pause();
    }
  }, [paused]);

  useEffect(() => {
    if (clientIsLoaded) {
      startViewer();
    }
  }, [clientIsLoaded]);

  const setupKVS = async () => {
    console.log("--- setupKVS ---");
    const getSignalingChannelEndpointResponse = await kinesisVideoClient
      .getSignalingChannelEndpoint({
        ChannelARN: props.channelARN,
        SingleMasterChannelEndpointConfiguration: {
          Protocols: ["WSS", "HTTPS"],
          Role: Role.VIEWER,
        },
      })
      .promise();
    const endpointsByProtocol =
      getSignalingChannelEndpointResponse.ResourceEndpointList.reduce(
        (endpoints, endpoint) => {
          endpoints[endpoint.Protocol] = endpoint.ResourceEndpoint;
          return endpoints;
        },
        {}
      );

    console.log("endpointsByProtocol", endpointsByProtocol);
    globalKVS.getSignalingChannelEndpointResponse =
      getSignalingChannelEndpointResponse;
    globalKVS.endpointsByProtocol = endpointsByProtocol;
    const kinesisVideoSignalingChannelsClient =
      new KinesisVideoSignalingChannels({
        ...awsCredentials,
        endpoint: endpointsByProtocol.ResourceEndpoint,
      });
    globalKVS.kinesisVideoSignalingChannelsClient =
      kinesisVideoSignalingChannelsClient;

    const getIceServerConfigResponse = await kinesisVideoSignalingChannelsClient
      .getIceServerConfig({
        ChannelARN: props.channelARN,
      })
      .promise();
    const iceServers: any = [
      {
        urls: [
          `stun:stun.kinesisvideo.${awsCredentials.region}.amazonaws.com:443`,
        ],
      },
    ];
    getIceServerConfigResponse.IceServerList?.forEach((iceServer) =>
      iceServers.push({
        urls: iceServer.Uris,
        username: iceServer.Username,
        credential: iceServer.Password,
      })
    );
    globalKVS.iceServers = iceServers;
    console.log("iceServers", iceServers);

    const signalingClient = new SignalingClient({
      channelARN: props.channelARN,
      channelEndpoint: endpointsByProtocol["WSS"],
      clientId: clientId,
      role: Role.VIEWER,
      region: awsCredentials.region,
      credentials: {
        accessKeyId: awsCredentials.accessKeyId,
        secretAccessKey: awsCredentials.secretAccessKey,
      },
    });
    globalKVS.signalingClient = signalingClient;
    console.log("globalKVS", globalKVS);

    // const peerConnection = new RTCPeerConnection({
    //   iceServers: iceServers,
    // })

    // globalKVS.peerConnection = peerConnection

    // Once the signaling channel connection is open, connect to the webcam and create an offer to send to the master
    globalKVS.signalingClient.on("open", async () => {
      console.log("signaling client open");

      // --- prepare new peer ---
      if (!globalKVS.peerConnection) {
        globalKVS.peerConnection = prepareNewPeer(
          globalKVS.iceServers,
          globalKVS.signalingClient
        );
      } else {
        console.warn("WARN: ALREADY peer exist");
      }

      if (globalKVS.peerConnection.addTransceiver) {
        globalKVS.peerConnection.addTransceiver("video", {
          direction: "recvonly",
        });
        globalKVS.peerConnection.addTransceiver("audio", {
          direction: "recvonly",
        });
      }

      // Create an SDP offer and send it to the master
      const offer = await globalKVS.peerConnection.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: true,
      });
      await globalKVS.peerConnection.setLocalDescription(offer);
      console.log("send offer");
      signalingClient.sendSdpOffer(globalKVS.peerConnection.localDescription);
    });

    // When the SDP answer is received back from the master, add it to the peer connection.
    globalKVS.signalingClient.on("sdpAnswer", async (answer) => {
      console.log("got answer");
      await globalKVS.peerConnection.setRemoteDescription(answer);
    });

    // When an ICE candidate is received from the master, add it to the peer connection.
    globalKVS.signalingClient.on("iceCandidate", (candidate) => {
      console.log("got iceCandidate");
      globalKVS.peerConnection.addIceCandidate(candidate);
    });

    globalKVS.signalingClient.on("close", () => {
      // Handle client closures
      console.warn("signalingClient close");
    });

    globalKVS.signalingClient.on("error", (error) => {
      // Handle client errors
      console.error("signalingClient error", error);
    });

    setClientIsLoaded(true);
  };

  function prepareNewPeer(iceServers, signalingClient) {
    const peerConnection = new RTCPeerConnection({ iceServers });

    // Send any ICE candidates generated by the peer connection to the other peer
    peerConnection.addEventListener("icecandidate", ({ candidate }) => {
      if (candidate) {
        console.log("send iceCandidate");
        signalingClient.sendIceCandidate(candidate);
      } else {
        // No more ICE candidates will be generated
      }
    });

    // As remote tracks are received, add them to the remote view
    peerConnection.addEventListener("track", (event) => {
      console.log("on track");
      playVideo(event.streams[0]);
    });

    // handle disconnect
    peerConnection.addEventListener("iceconnectionstatechange", (event) => {
      console.log(
        "on iceconnectionstatechange. iceState:",
        peerConnection.iceConnectionState,
        " signalingState:",
        peerConnection.signalingState
      ); //, 'connectionState:', peerConnection.connectionState);
      if (peerConnection.iceConnectionState === "failed") {
        console.warn("remote peeer closed");
        stopVideo();
        stopViewer();
      }
    });

    const dataChannel = peerConnection.createDataChannel("kvsDataChannel");
    peerConnection.ondatachannel = (event) => {
      console.log("ondatachannel", event);
      event.channel.onmessage = (messageEvent) => {
        console.log("onmessage", messageEvent);
        setCameraList(JSON.parse(messageEvent.data).cameras);
      };
    };

    dataChannel.onopen = () => {
      console.log("dataChannel open");
    };

    dataChannel.onmessage = (event) => {
      console.log("dataChannel message", event);
    };

    globalKVS.dataChannel = dataChannel;

    return peerConnection;
  }

  async function playVideo(stream) {
    setMasterStream(stream);
    setPaused(false);
  }

  function stopVideo() {
    setPaused(true);
  }

  function generateUuid() {
    // refer
    //   https://qiita.com/psn/items/d7ac5bdb5b5633bae165
    //   https://github.com/GoogleChrome/chrome-platform-analytics/blob/master/src/internal/identifier.js
    // const FORMAT: string = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx";
    let chars = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".split("");
    for (let i = 0, len = chars.length; i < len; i++) {
      switch (chars[i]) {
        case "x":
          chars[i] = Math.floor(Math.random() * 16).toString(16);
          break;
        case "y":
          chars[i] = (Math.floor(Math.random() * 4) + 8).toString(16);
          break;
      }
    }
    return chars.join("");
  }

  function startViewer() {
    console.log("-- start Viewer --");
    console.log("globalKVS", globalKVS);
    globalKVS.signalingClient.open();
  }

  function stopViewer() {
    console.log("-- stop Viewer --");

    stopVideo();

    if (globalKVS.signalingClient) {
      globalKVS.signalingClient.close();
    }

    if (globalKVS.peerConnection) {
      globalKVS.peerConnection.close();
      globalKVS.peerConnection = null;
    }

    if (globalKVS.localStream) {
      globalKVS.localStream.getTracks().forEach((track) => track.stop());
      globalKVS.localStream = null;
    }
  }

  useEffect(() => {
    console.log("props.channelName", props.channelName);
    console.log("props.channelARN", props.channelARN);
    setupKVS();
  }, [props.channelName]);

  return (
    <div>
      <h1>{props.channelName}</h1>
      <video
        style={{ width: "100%", aspectRatio: `${16 / 9}` }}
        ref={videoRef}
        autoPlay
        playsInline
        muted
      />
      {cameraList?.map((camera, index) => {
        return (
          <div key={index}>
            <button
              onClick={() => {
                globalKVS.dataChannel.send(
                  JSON.stringify({ cameraId: camera.deviceId })
                );
              }}
            >
              {camera.label}
            </button>
          </div>
        );
      })}
    </div>
  );
};

export default StreamingViewer;
