import { isDebugMode } from "./internals/debug_mode.ts";

export const savePraiseFunction = async (jsonPraiseData, env) => {
  console.log("json Praise Data: ", JSON.stringify(jsonPraiseData));

  const debugMode = isDebugMode(env);
  if (debugMode) {
    console.log(`translate inputs: ${JSON.stringify(jsonPraiseData)}`);
  }
    
  // Call backend api to save the praise
  const backendUrl = env.BACKEND_PRAISE_URL;
  const token = env.BACKEND_PRAISE_TOKEN;
  
  console.log(`Saving at backendUrl: ${backendUrl}`)
    
  //If the backendUrl is not set, return an error
  if (!backendUrl) {
    var error =
      "BACKEND_URL needs to be set. Please contact the app maintainers.";
    return { error: error };
  }
      
  //Initiates the header and body of the API request.
  const backendResponse = await fetch(backendUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": token,
    },
    body: JSON.stringify(jsonPraiseData)
  });

  //Check the status of API response if successful
  console.log("What is the status of the backendResponse" + backendResponse.status);
  if (backendResponse.status != 200) {
    var error = backendResponse.status == 400 ? 
      `You cannot write a praise about yourself.`: 
      `Saving the praise failed! Contact the app maintainers about the error - `+ 
      `(error: ${backendResponse.statusText})`;
    console.log(error);
    return { error: error };
  }

  const backendResult = await backendResponse.json();
  if (debugMode) {
    console.log(`backend result: ${JSON.stringify(backendResponse)}`);
  }
  
  //Return the output object with the timestamp of the message sent 
  return { 
    error: null,
    ts: backendResult.ts 
  };
  };

 