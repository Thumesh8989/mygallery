/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
/* tslint:disable */
// Copyright 2024 Google LLC

// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at

//     https://www.apache.org/licenses/LICENSE-2.0

// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import c from 'classnames';
import React, {useCallback, useEffect, useMemo, useState, useRef} from 'react';
import {timeToSecs} from './utils';

const formatTime = (t: number) =>
  `${Math.floor(t / 60)}:${Math.floor(t % 60)
    .toString()
    .padStart(2, '0')}`;

interface TimecodeEntry {
  time: string;
  text?: string;
  value?: number;
  // Add other properties if they exist
}

interface VideoPlayerProps {
  url: string | null;
  timecodeList: TimecodeEntry[] | null;
  requestedTimecode: number | null;
  isLoadingVideo: boolean;
  videoError: boolean;
  jumpToTimecode: (timeInSecs: number) => void;
}


export default function VideoPlayer({
  url,
  timecodeList,
  requestedTimecode,
  isLoadingVideo,
  videoError,
  jumpToTimecode,
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [duration, setDuration] = useState(0);
  const [scrubberTime, setScrubberTime] = useState(0); // Represents progress as a fraction (0 to 1)
  const [isPlaying, setIsPlaying] = useState(false);
  const [isScrubbing, setIsScrubbing] = useState(false);
  const [currentCaption, setCurrentCaption] = useState<string | undefined>(undefined);

  const currentSecs = duration * scrubberTime || 0;
  const currentPercent = scrubberTime * 100;

  const timecodeListReversed = useMemo(
    () => timecodeList?.slice().reverse(), // Use slice() to avoid mutating the original array
    [timecodeList],
  );

  const togglePlay = useCallback(() => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
    }
  }, [isPlaying, videoRef]);

  const updateDuration = () => {
    if (videoRef.current) {
      setDuration(videoRef.current.duration);
    }
  };

  const updateTime = () => {
    if (videoRef.current && !isScrubbing) {
      setScrubberTime(videoRef.current.currentTime / videoRef.current.duration || 0);
    }

    if (timecodeListReversed && videoRef.current) {
      setCurrentCaption(
        timecodeListReversed.find(
          (t) => timeToSecs(t.time) <= (videoRef.current?.currentTime ?? 0),
        )?.text,
      );
    }
  };

  const onPlay = () => setIsPlaying(true);
  const onPause = () => setIsPlaying(false);

  useEffect(() => {
    setScrubberTime(0);
    setIsPlaying(false);
    if (videoRef.current) {
      videoRef.current.currentTime = 0; // Reset video position
    }
  }, [url]);

  useEffect(() => {
    if (videoRef.current && requestedTimecode !== null) {
      videoRef.current.currentTime = requestedTimecode;
      // Optionally play the video when jumping to a timecode
      // if (!isPlaying) videoRef.current.play();
    }
  }, [videoRef, requestedTimecode]); // Removed isPlaying from deps to avoid potential loops if play() is added

  useEffect(() => {
    const onKeyPress = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (
        target.tagName !== 'INPUT' &&
        target.tagName !== 'TEXTAREA' &&
        e.key === ' '
      ) {
        e.preventDefault(); // Prevent page scroll on space
        togglePlay();
      }
    };

    document.addEventListener('keypress', onKeyPress);
    return () => {
      document.removeEventListener('keypress', onKeyPress);
    };
  }, [togglePlay]);


  return (
    <div className="videoPlayer">
      {url && !isLoadingVideo ? (
        <>
          <div className="videoContainer" aria-live="polite">
            <video
              src={url}
              ref={videoRef}
              onClick={togglePlay}
              onLoadedMetadata={updateDuration} // More reliable for duration
              onTimeUpdate={updateTime}
              onPlay={onPlay}
              onPause={onPause}
              preload="auto"
              crossOrigin="anonymous"
              aria-label="Video content"
             />
            {currentCaption && (
              <div className="videoCaption" role="status" aria-atomic="true">
                {currentCaption}
              </div>
            )}
          </div>

          <div className="videoControls" aria-label="Video playback controls">
            <div className="videoScrubber"  aria-label="Video progress scrubber">
              <input
                style={{'--pct': `${currentPercent}%`} as React.CSSProperties}
                type="range"
                min="0"
                max="1"
                value={scrubberTime || 0}
                step="0.000001"
                aria-valuetext={`${formatTime(currentSecs)} of ${formatTime(duration)}`}
                onChange={(e) => {
                  const newScrubberTime = e.target.valueAsNumber;
                  setScrubberTime(newScrubberTime);
                  if (videoRef.current) {
                    videoRef.current.currentTime = newScrubberTime * duration;
                  }
                }}
                onPointerDown={() => setIsScrubbing(true)}
                onPointerUp={() => setIsScrubbing(false)}
              />
            </div>
            <div className="timecodeMarkers" aria-label="Timecode markers">
              {timecodeList?.map(({time, text, value}, i) => {
                const secs = timeToSecs(time);
                const pct = duration > 0 ? (secs / duration) * 100 : 0;
                if (pct < 0 || pct > 100) return null; // Don't render markers outside video bounds

                return (
                  <div
                    className="timecodeMarker"
                    key={i}
                    style={{left: `${pct}%`}}
                    role="button"
                    tabIndex={0}
                    onClick={() => jumpToTimecode(secs)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') jumpToTimecode(secs)}}
                    aria-label={`Marker at ${time}: ${value || text}. Click to jump.`}
                    >
                    <div
                      className="timecodeMarkerTick"
                      aria-hidden="true"
                      >
                      <div />
                    </div>
                    <div
                      className={c('timecodeMarkerLabel', {right: pct > 50})}
                      aria-hidden="true"
                      >
                      <div>{time}</div>
                      <p>{value || text}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="videoTime" aria-live="off">
              <button onClick={togglePlay} aria-label={isPlaying ? 'Pause video' : 'Play video'}>
                <span className="icon" aria-hidden="true">
                  {isPlaying ? 'pause' : 'play_arrow'}
                </span>
              </button>
              {formatTime(currentSecs)} / {formatTime(duration)}
            </div>
          </div>
        </>
      ) : (
        <div className="emptyVideo" role="status">
          <p>
            {isLoadingVideo
              ? 'Processing video...'
              : videoError
                ? 'Error processing video. Please try a different file or check your network connection.'
                : 'Drag and drop a video file here to get started.'}
          </p>
        </div>
      )}
    </div>
  );
}