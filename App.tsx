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
import {useRef, useState, DragEvent} from 'react';
import {generateContent, uploadFile} from './api';
import Chart from './Chart.jsx';
import functions from './functions';
import modes from './modes';
import {timeToSecs} from './utils';
import VideoPlayer from './VideoPlayer.jsx';

const chartModes = Object.keys(modes.Chart.subModes);

export default function App() {
  const [vidUrl, setVidUrl] = useState<string | null>(null);
  const [file, setFile] = useState<any | null>(null); // Consider defining a more specific type for the uploaded file info
  const [timecodeList, setTimecodeList] = useState<any[] | null>(null);
  const [requestedTimecode, setRequestedTimecode] = useState<number | null>(null);
  const [selectedMode, setSelectedMode] = useState(Object.keys(modes)[0]);
  const [activeMode, setActiveMode] = useState<string | undefined>();
  const [isLoading, setIsLoading] = useState(false);
  const [showSidebar, setShowSidebar] = useState(true);
  const [isLoadingVideo, setIsLoadingVideo] = useState(false);
  const [videoError, setVideoError] = useState(false);
  const [customPrompt, setCustomPrompt] = useState('');
  const [chartMode, setChartMode] = useState(chartModes[0]);
  const [chartPrompt, setChartPrompt] = useState('');
  const [chartLabel, setChartLabel] = useState('');
  const [theme] = useState(
    window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light',
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const isCustomMode = selectedMode === 'Custom';
  const isChartMode = selectedMode === 'Chart';
  const isCustomChartMode = isChartMode && chartMode === 'Custom';
  const hasSubMode = isCustomMode || isChartMode;

  const setTimecodes = ({timecodes}: {timecodes: Array<{time: string, text?: string, objects?: string[], value?: number}>}) =>
    setTimecodeList(
      timecodes.map((t) => ({...t, text: t.text ? t.text.replace(/\\'/g, "'") : ''})),
    );

  const onModeSelect = async (mode: string) => {
    if (!file) {
      // Prevent generation if no file is uploaded
      setVideoError(true); // Or a more specific error message
      return;
    }
    setActiveMode(mode);
    setIsLoading(true);
    setChartLabel(isChartMode && !isCustomChartMode ? modes[mode].subModes[chartMode] : chartPrompt);

    const currentPrompt = isCustomMode
      ? modes[mode].prompt(customPrompt)
      : isChartMode
        ? modes[mode].prompt(
            isCustomChartMode ? chartPrompt : modes[mode].subModes[chartMode],
          )
        : modes[mode].prompt;

    try {
      const resp = await generateContent(
        currentPrompt,
        functions({ // Assuming functions returns the correct FunctionDeclaration[] structure
          set_timecodes: setTimecodes,
          set_timecodes_with_objects: setTimecodes,
          set_timecodes_with_numeric_values: ({timecodes}: {timecodes: any[]}) =>
            setTimecodeList(timecodes),
        }),
        file,
      );

      const call = resp.functionCalls?.[0];

      if (call) {
        // Ensure the function map has the called function
        const fnMap = {
          set_timecodes: setTimecodes,
          set_timecodes_with_objects: setTimecodes,
          set_timecodes_with_numeric_values: ({timecodes}: {timecodes: any[]}) =>
            setTimecodeList(timecodes),
        };
        if (fnMap[call.name]) {
          fnMap[call.name](call.args);
        } else {
          console.error(`Function ${call.name} not found in function map.`);
        }
      } else if (resp.text) {
        // Handle cases where the model might return text directly if function calling wasn't triggered
        // This part depends on how you want to handle non-function call responses
        console.log("Model response text:", resp.text);
        //setTimecodeList([{ time: "0:00", text: resp.text }]); // Example handling
      }


    } catch (error) {
      console.error("Error generating content:", error);
      // Handle error appropriately, e.g., show error message to user
    } finally {
      setIsLoading(false);
      if (scrollRef.current) {
        scrollRef.current.scrollTo({top: 0});
      }
    }
  };

  const uploadVideo = async (e: DragEvent<HTMLElement>) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files?.[0];

    if (droppedFile) {
      if (!droppedFile.type.startsWith('video/')) {
        console.warn('Dropped file is not a video type.');
        setVideoError(true);
        setIsLoadingVideo(false);
        // Optionally clear existing video and analysis
        setVidUrl(null);
        setFile(null);
        setTimecodeList(null);
        setActiveMode(undefined);
        return;
      }

      setIsLoadingVideo(true);
      setVideoError(false);
      // Clear previous results when a new video is being processed
      setVidUrl(null); // Clear previous vidUrl first
      setFile(null);
      setTimecodeList(null);
      setActiveMode(undefined);
      setRequestedTimecode(null); // Reset requested timecode

      let objectUrl: string | null = null;
      try {
        objectUrl = URL.createObjectURL(droppedFile);
        setVidUrl(objectUrl);

        const uploadedFileInfo = await uploadFile(droppedFile);
        setFile(uploadedFileInfo);
        setIsLoadingVideo(false);
      } catch (uploadError) {
        console.error('Error during video processing or upload:', uploadError);
        setVideoError(true);
        setIsLoadingVideo(false);
        if (objectUrl) {
          URL.revokeObjectURL(objectUrl); // Clean up the created object URL
        }
        setVidUrl(null); // Clear the video URL in UI on error
        setFile(null); // Clear file info
      }
    } else {
      console.warn('No files were dropped or item was not a file.');
      setVideoError(true); // Indicate an error state
      setIsLoadingVideo(false);
    }
  };


  return (
    <main
      className={theme}
      onDrop={uploadVideo}
      onDragOver={(e: DragEvent<HTMLElement>) => e.preventDefault()}
      onDragEnter={() => {}}
      onDragLeave={() => {}}>
      <section className="top">
        {vidUrl && !isLoadingVideo && (
          <>
            <div className={c('modeSelector', {hide: !showSidebar})}>
              {hasSubMode ? (
                <>
                  <div>
                    {isCustomMode ? (
                      <>
                        <h2>Custom prompt:</h2>
                        <textarea
                          aria-label="Custom prompt for video analysis"
                          placeholder="Type a custom prompt..."
                          value={customPrompt}
                          onChange={(e) => setCustomPrompt(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              onModeSelect(selectedMode);
                            }
                          }}
                          rows={5}
                        />
                      </>
                    ) : (
                      <>
                        <h2>Chart this video by:</h2>

                        <div className="modeList" role="radiogroup" aria-labelledby="chart-mode-label">
                          <span id="chart-mode-label" className="sr-only">Chart Modes</span>
                          {chartModes.map((mode) => (
                            <button
                              key={mode}
                              role="radio"
                              aria-checked={mode === chartMode}
                              className={c('button', {
                                active: mode === chartMode,
                              })}
                              onClick={() => setChartMode(mode)}>
                              {mode}
                            </button>
                          ))}
                        </div>
                        <textarea
                          aria-label="Custom prompt for chart generation"
                          className={c({active: isCustomChartMode})}
                          placeholder="Or type a custom prompt..."
                          value={chartPrompt}
                          onChange={(e) => setChartPrompt(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !e.shiftKey) {
                              e.preventDefault();
                              onModeSelect(selectedMode);
                            }
                          }}
                          onFocus={() => setChartMode('Custom')}
                          rows={2}
                        />
                      </>
                    )}
                    <button
                      className="button generateButton"
                      onClick={() => onModeSelect(selectedMode)}
                      disabled={
                        isLoading || !file ||
                        (isCustomMode && !customPrompt.trim()) ||
                        (isChartMode &&
                          isCustomChartMode &&
                          !chartPrompt.trim())
                      }
                      aria-disabled={
                        isLoading || !file ||
                        (isCustomMode && !customPrompt.trim()) ||
                        (isChartMode &&
                          isCustomChartMode &&
                          !chartPrompt.trim())
                      }>
                      ▶️ Generate
                    </button>
                  </div>
                  <div className="backButton">
                    <button
                      onClick={() => {
                        setSelectedMode(Object.keys(modes)[0]);
                        // Optionally reset sub-mode states
                        setCustomPrompt('');
                        setChartPrompt('');
                        setChartMode(chartModes[0]);
                      }}
                      aria-label="Back to main mode selection">
                      <span className="icon" aria-hidden="true">chevron_left</span>
                      Back
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <h2 id="explore-video-label">Explore this video via:</h2>
                    <div className="modeList" role="radiogroup" aria-labelledby="explore-video-label">
                      {Object.entries(modes).map(([mode, {emoji}]) => (
                        <button
                          key={mode}
                          role="radio"
                          aria-checked={mode === selectedMode}
                          className={c('button', {
                            active: mode === selectedMode,
                          })}
                          onClick={() => setSelectedMode(mode)}>
                          <span className="emoji" aria-hidden="true">{emoji}</span> {mode}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <button
                      className="button generateButton"
                      onClick={() => onModeSelect(selectedMode)}
                      disabled={isLoading || !file}
                      aria-disabled={isLoading || !file}>
                      ▶️ Generate
                    </button>
                  </div>
                </>
              )}
            </div>
            <button
              className="collapseButton"
              onClick={() => setShowSidebar(!showSidebar)}
              aria-label={showSidebar ? "Collapse sidebar" : "Expand sidebar"}
              aria-expanded={showSidebar}>
              <span className="icon" aria-hidden="true">
                {showSidebar ? 'chevron_left' : 'chevron_right'}
              </span>
            </button>
          </>
        )}

        <VideoPlayer
          url={vidUrl}
          requestedTimecode={requestedTimecode}
          timecodeList={timecodeList}
          jumpToTimecode={setRequestedTimecode}
          isLoadingVideo={isLoadingVideo}
          videoError={videoError}
        />
      </section>

      <div className={c('tools', {inactive: !vidUrl || !file})}
        aria-live="polite"
        aria-atomic="true"
      >
        <section
          className={c('output', {['mode' + activeMode]: activeMode})}
          ref={scrollRef}
          aria-label="Video analysis output"
          tabIndex={-1}
          >
          {isLoading ? (
            <div className="loading" role="status" aria-label="Waiting for model response">
              Waiting for model<span>...</span>
            </div>
          ) : timecodeList ? (
            activeMode === 'Table' ? (
              <table aria-label="Video analysis table">
                <thead>
                  <tr>
                    <th scope="col">Time</th>
                    <th scope="col">Description</th>
                    <th scope="col">Objects</th>
                  </tr>
                </thead>
                <tbody>
                  {timecodeList.map(({time, text, objects}, i) => (
                    <tr
                      key={i}
                      role="button"
                      tabIndex={0}
                      onClick={() => setRequestedTimecode(timeToSecs(time))}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setRequestedTimecode(timeToSecs(time))}}
                      aria-label={`Jump to ${time}, description: ${text}, objects: ${objects?.join(', ')}`}>
                      <td>
                        <time dateTime={time}>{time}</time>
                      </td>
                      <td>{text}</td>
                      <td>{objects?.join(', ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : activeMode === 'Chart' ? (
              <Chart
                data={timecodeList.filter(item => typeof item.value === 'number')}
                yLabel={chartLabel}
                jumpToTimecode={setRequestedTimecode}
              />
            ) : modes[activeMode]?.isList ? (
              <ul aria-label={`List of ${activeMode}`}>
                {timecodeList.map(({time, text}, i) => (
                  <li key={i} className="outputItem">
                    <button
                      onClick={() => setRequestedTimecode(timeToSecs(time))}
                      aria-label={`Jump to ${time}, ${text}`}>
                      <time dateTime={time}>{time}</time>
                      <p className="text">{text}</p>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              // General text output
              // Wrap in a container for better accessibility if it becomes complex
              <div>
                {timecodeList.map(({time, text}, i) => (
                  <span
                    key={i}
                    className="sentence"
                    role="button"
                    tabIndex={0}
                    onClick={() => setRequestedTimecode(timeToSecs(time))}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setRequestedTimecode(timeToSecs(time))}}
                    aria-label={`Jump to ${time}, ${text}`}>
                    <time dateTime={time}>{time}</time>
                    <span>{text}</span>
                  </span>
                ))}
              </div>
            )
          ) : (vidUrl && file && !isLoading && <div aria-live="polite">Select a mode and click "Generate" to analyze the video.</div>)}
        </section>
      </div>
    </main>
  );
}