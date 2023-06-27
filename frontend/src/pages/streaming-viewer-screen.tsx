import React, { useEffect, useState } from "react";
import {
  awsCredentials,
  strings,
} from "../components/streaming-viewer/streaming-viewer-content";
import StreamingViewer from "../components/streaming-viewer/streaming-viewer-main";
import { KinesisVideo } from "aws-sdk";

interface Props {
  isLoading: boolean;
}

const StreamingViewerScreen: React.FC<Props> = (props: Props) => {
  const [channelInfoList, setChannelInfoList] = useState<any[]>([]);
  const [selectedChannelInfo, setSelectedChannelInfo] = useState<any>({});
  const [viewingChannelInfo, setViewingChannelInfo] = useState<any>({});
  const kinesisVideoClient = new KinesisVideo(awsCredentials);

  useEffect(() => {
    kinesisVideoClient.listSignalingChannels({}, (err, data) => {
      if (err) {
        console.log(err);
        alert(err);
      } else {
        setChannelInfoList(data.ChannelInfoList);
      }
    });
  }, []);
  return (
    <div>
      <h1 title={strings.title}>
        <select
          onChange={(event) => {
            console.log("event.target.value", event.target.value);
            console.log(
              channelInfoList.find((e) => e.ChannelName === event.target.value)
            );
            setSelectedChannelInfo(
              channelInfoList.find((e) => e.ChannelName === event.target.value)
            );
          }}
          value={selectedChannelInfo?.ChannelName}
          options={channelInfoList.map((info) => {
            return {
              value: info.ChannelName,
              label: info.ChannelName,
            };
          })}
        />
        <button
          title={"Start Viewing"}
          onClick={() => {
            setViewingChannelInfo(selectedChannelInfo);
          }}
        />
        {!!viewingChannelInfo?.ChannelName ? (
          <StreamingViewer
            channelName={viewingChannelInfo.ChannelName}
            channelARN={viewingChannelInfo.ChannelARN}
          />
        ) : (
          <div></div>
        )}
      </h1>
    </div>
  );
};
export default StreamingViewerScreen;
