/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/
/* tslint:disable */

import {FunctionDeclaration, GoogleGenAI, Part, GenerateContentResponse} from '@google/genai';

// Define a more specific type for the file information expected by generateContent
// This aligns with what client.files.get() would return and what FileDataPart expects.
interface UploadedFileInfo {
  uri: string;
  mimeType: string;
  // Add other properties if needed, e.g., name, displayName
}


const systemInstruction = `When given a video and a query, call the relevant \
function only once with the appropriate timecodes and text for the video`;

const client = new GoogleGenAI({apiKey: process.env.API_KEY});

async function generateContent(
  text: string,
  functionDeclarations: FunctionDeclaration[],
  fileInfo: UploadedFileInfo, // Updated type
): Promise<GenerateContentResponse> { // Added explicit return type
  
  const textPart: Part = { text };
  const filePart: Part = {
    fileData: {
      mimeType: fileInfo.mimeType,
      fileUri: fileInfo.uri,
    },
  };

  const response = await client.models.generateContent({
    model: 'gemini-2.5-flash-preview-04-17', // Updated model name
    contents: [ // This structure implies a conversation history; for single turn, { parts: [textPart, filePart] } is also common
      {
        role: 'user',
        parts: [textPart, filePart],
      },
    ],
    config: {
      systemInstruction,
      temperature: 0.5,
      tools: [{functionDeclarations}],
    },
  });

  return response;
}

async function uploadFile(file: File): Promise<UploadedFileInfo> { // Return a more specific type
  // The SDK's client.files.upload expects a `Blob | { data: Blob, name?: string}`.
  // A browser `File` object is a specific kind of `Blob`.
  const blobForUpload = new Blob([file], {type: file.type});

  console.log('Uploading...');
  const uploadedFileResult = await client.files.upload({
    file: blobForUpload, // Pass the Blob directly
    config: {
      displayName: file.name,
    },
  });
  console.log('Uploaded.');
  console.log('Getting file metadata...');
  // The 'name' here is the resource name like 'files/your-file-id'
  let getFile = await client.files.get({
    name: uploadedFileResult.name,
  });

  // Polling for 'ACTIVE' state
  let retries = 0;
  const maxRetries = 12; // Approx 1 minute if timeout is 5 seconds
  while (getFile.state === 'PROCESSING' && retries < maxRetries) {
    console.log(`Current file status: ${getFile.state}. Retrying in 5 seconds... (Attempt ${retries + 1}/${maxRetries})`);
    await new Promise(resolve => setTimeout(resolve, 5000));
    getFile = await client.files.get({ name: uploadedFileResult.name });
    retries++;
  }

  console.log(`Final file status: ${getFile.state}`);
  if (getFile.state === 'FAILED') {
    console.error('File processing failed:', getFile); // Log more info on failure
    throw new Error(`File processing failed. Status: ${getFile.state}`);
  }
  if (getFile.state !== 'ACTIVE') {
    console.error('File did not become active:', getFile);
    throw new Error(`File processing did not complete successfully. Status: ${getFile.state}`);
  }

  console.log('File processing done. URI:', getFile.uri);
  // Ensure the returned object matches UploadedFileInfo structure
  return {
    uri: getFile.uri,
    mimeType: getFile.mimeType || file.type, // Fallback to original file type if mimeType is missing
  };
}

export {generateContent, uploadFile};
export type { UploadedFileInfo }; // Export type if needed elsewhere
