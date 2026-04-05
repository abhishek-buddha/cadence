// Setup a test IVR on Twilio for Cadence testing
// Run: node test-ivr/setup-ivr.mjs

const TWILIO_SID = 'ACd2dd59cbb256ee8bd1021a138fac4296';
const TWILIO_TOKEN = 'ee763ae36ecd62ea2bbdf85a10e324c9';
const PHONE_NUMBER_SID = 'PN017e5013af62ed30853dfc3393c4ff04'; // +18629724303
const SERVICE_SID = 'ZS9b5272fefdb3b4b7e05bca7f974d512f';

const auth = 'Basic ' + Buffer.from(`${TWILIO_SID}:${TWILIO_TOKEN}`).toString('base64');

const IVR_FUNCTIONS = [
  {
    name: 'ivr-main',
    path: '/ivr',
    code: `
exports.handler = function(context, event, callback) {
  const twiml = new Twilio.twiml.VoiceResponse();
  const gather = twiml.gather({
    input: "speech dtmf",
    numDigits: 1,
    timeout: 8,
    speechTimeout: 3,
    action: "/ivr-level2"
  });
  gather.say({ voice: "Polly.Joanna" },
    "Thank you for calling Acme Health Insurance, a preferred provider organization. " +
    "Please listen carefully as our menu options have recently changed. " +
    "For claims and billing, press 1 or say claims. " +
    "For member services, press 2 or say member services. " +
    "For provider relations, press 3 or say provider. " +
    "For pharmacy, press 4. " +
    "To repeat this menu, press 9."
  );
  twiml.redirect("/ivr");
  return callback(null, twiml);
};`
  },
  {
    name: 'ivr-level2',
    path: '/ivr-level2',
    code: `
exports.handler = function(context, event, callback) {
  const twiml = new Twilio.twiml.VoiceResponse();
  const digits = event.Digits || "";
  const speech = (event.SpeechResult || "").toLowerCase();

  if (digits === "1" || speech.includes("claim") || speech.includes("billing")) {
    const gather = twiml.gather({
      input: "speech dtmf",
      numDigits: 1,
      timeout: 8,
      speechTimeout: 3,
      action: "/ivr-hold"
    });
    gather.say({ voice: "Polly.Joanna" },
      "You have reached the claims department. " +
      "For claim status inquiry, press 1 or say claim status. " +
      "To file a new claim, press 2. " +
      "For claim appeals, press 3. " +
      "To speak with a claims representative, press 0."
    );
    twiml.redirect({ method: "POST" }, "/ivr-level2?Digits=1");
  } else {
    twiml.say({ voice: "Polly.Joanna" }, "That option is not available. Returning to main menu.");
    twiml.redirect("/ivr");
  }
  return callback(null, twiml);
};`
  },
  {
    name: 'ivr-hold',
    path: '/ivr-hold',
    code: `
exports.handler = function(context, event, callback) {
  const twiml = new Twilio.twiml.VoiceResponse();

  twiml.say({ voice: "Polly.Joanna" },
    "Please hold while we transfer you to the next available claims representative. " +
    "Your estimated wait time is approximately 2 minutes. Your call is important to us."
  );
  twiml.play("http://com.twilio.music.classical.s3.amazonaws.com/ith_chopin-702.mp3");
  twiml.say({ voice: "Polly.Joanna" }, "Thank you for your continued patience.");
  twiml.pause({ length: 2 });

  const gather = twiml.gather({
    input: "speech",
    timeout: 180,
    speechTimeout: "auto",
    action: "/ivr-agent-response"
  });
  gather.say({ voice: "Polly.Matthew" },
    "Hi there, thanks so much for holding. This is Michael with the Acme Health Insurance claims department. " +
    "How can I help you today?"
  );
  gather.pause({ length: 180 });

  twiml.say({ voice: "Polly.Matthew" }, "Thank you for calling. Goodbye.");
  twiml.hangup();
  return callback(null, twiml);
};`
  },
  {
    name: 'ivr-agent-response',
    path: '/ivr-agent-response',
    code: `
exports.handler = function(context, event, callback) {
  const twiml = new Twilio.twiml.VoiceResponse();
  const speech = (event.SpeechResult || "").toLowerCase();

  if (speech.includes("claim") || speech.includes("status") || speech.includes("check") || speech.includes("thomas") || speech.includes("calling")) {
    const gather = twiml.gather({ input: "speech", timeout: 60, speechTimeout: "auto", action: "/ivr-agent-response" });
    gather.say({ voice: "Polly.Matthew" },
      "Sure, I can help with that. Can you give me the claim number please?"
    );
    gather.pause({ length: 60 });
  } else if (speech.match(/[0-9]/) || speech.includes("clm") || speech.includes("number")) {
    const gather = twiml.gather({ input: "speech", timeout: 60, speechTimeout: "auto", action: "/ivr-agent-response" });
    gather.say({ voice: "Polly.Matthew" },
      "Okay, let me look that up. One moment please."
    );
    gather.pause({ length: 3 });
    gather.say({ voice: "Polly.Matthew" },
      "Alright, I found that claim. It looks like it is currently in processing status. " +
      "The claim was received on March 15th and the expected decision date is approximately 10 business days from now. " +
      "The reference number for this call is R E F dash 2 0 2 6 0 4 0 5 dash 5 6 7 8. " +
      "Is there anything else I can help you with today?"
    );
    gather.pause({ length: 60 });
  } else if (speech.includes("npi") || speech.includes("tax") || speech.includes("member") || speech.includes("patient") || speech.includes("date")) {
    const gather = twiml.gather({ input: "speech", timeout: 60, speechTimeout: "auto", action: "/ivr-agent-response" });
    gather.say({ voice: "Polly.Matthew" },
      "Got it, thank you for verifying that information. Let me pull up the details."
    );
    gather.pause({ length: 2 });
    gather.say({ voice: "Polly.Matthew" },
      "Okay so I can see the claim in our system. It is currently being processed. " +
      "No additional documentation is needed at this time. " +
      "Would you like anything else?"
    );
    gather.pause({ length: 60 });
  } else if (speech.includes("no") || speech.includes("that") || speech.includes("good") || speech.includes("thank") || speech.includes("bye") || speech.includes("great")) {
    twiml.say({ voice: "Polly.Matthew" },
      "Glad I could help! Thanks for calling Acme Health Insurance. Have a wonderful day. Goodbye!"
    );
    twiml.hangup();
  } else {
    const gather = twiml.gather({ input: "speech", timeout: 60, speechTimeout: "auto", action: "/ivr-agent-response" });
    gather.say({ voice: "Polly.Matthew" },
      "Sure, could you tell me a bit more about what you need? I am happy to help."
    );
    gather.pause({ length: 60 });
  }
  return callback(null, twiml);
};`
  }
];

async function tw(method, url, body) {
  const opts = { method, headers: { 'Authorization': auth } };
  if (body) {
    if (body instanceof FormData) {
      opts.body = body;
    } else {
      opts.headers['Content-Type'] = 'application/x-www-form-urlencoded';
      opts.body = new URLSearchParams(body).toString();
    }
  }
  const res = await fetch(url, opts);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${method} ${url} failed ${res.status}: ${text}`);
  }
  return res.json();
}

async function main() {
  const base = `https://serverless.twilio.com/v1/Services/${SERVICE_SID}`;
  const functionVersionSids = [];

  for (const fn of IVR_FUNCTIONS) {
    console.log(`Creating function: ${fn.name}...`);
    const fnResult = await tw('POST', `${base}/Functions`, { FriendlyName: fn.name });
    console.log(`  Function SID: ${fnResult.sid}`);

    // Upload code as a version
    const formData = new FormData();
    formData.append('Path', fn.path);
    formData.append('Visibility', 'public');
    formData.append('Content', new Blob([fn.code], { type: 'application/javascript' }), `${fn.name}.js`);

    const versionResult = await tw('POST', `${base}/Functions/${fnResult.sid}/Versions`, formData);
    console.log(`  Version SID: ${versionResult.sid}`);
    functionVersionSids.push(versionResult.sid);
  }

  // Create a Build with all function versions
  console.log('\nCreating build...');
  const buildBody = {};
  functionVersionSids.forEach((sid, i) => {
    buildBody[`FunctionVersions[${i}]`] = sid;
  });
  const buildResult = await tw('POST', `${base}/Builds`, buildBody);
  console.log(`Build SID: ${buildResult.sid}, Status: ${buildResult.status}`);

  // Wait for build to complete
  let buildStatus = buildResult.status;
  while (buildStatus === 'building') {
    await new Promise(r => setTimeout(r, 2000));
    const check = await tw('GET', `${base}/Builds/${buildResult.sid}`, null);
    buildStatus = check.status;
    console.log(`  Build status: ${buildStatus}`);
  }

  if (buildStatus !== 'completed') {
    throw new Error(`Build failed with status: ${buildStatus}`);
  }

  // Get or create environment
  console.log('\nSetting up environment...');
  const envList = await tw('GET', `${base}/Environments`, null);
  let envSid;
  if (envList.environments.length > 0) {
    envSid = envList.environments[0].sid;
    console.log(`Using existing environment: ${envSid}`);
  } else {
    const envResult = await tw('POST', `${base}/Environments`, { UniqueName: 'production', DomainSuffix: '' });
    envSid = envResult.sid;
    console.log(`Created environment: ${envSid}`);
  }

  // Deploy the build to the environment
  console.log('\nDeploying build...');
  const deployResult = await tw('POST', `${base}/Environments/${envSid}/Deployments`, { BuildSid: buildResult.sid });
  console.log(`Deployment SID: ${deployResult.sid}`);

  // Get the domain
  const envDetail = await tw('GET', `${base}/Environments/${envSid}`, null);
  const domain = envDetail.domain_name;
  console.log(`\nIVR is live at: https://${domain}/ivr`);

  // Update the phone number to point to our IVR
  console.log('\nUpdating phone number +18629724303 to use IVR...');
  const phoneResult = await tw('POST',
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_SID}/IncomingPhoneNumbers/${PHONE_NUMBER_SID}.json`,
    { VoiceUrl: `https://${domain}/ivr`, VoiceMethod: 'POST' }
  );
  console.log(`Phone number updated! Voice URL: ${phoneResult.voice_url}`);

  console.log('\n=== TEST IVR READY ===');
  console.log(`Phone: +18629724303 (862-972-4303)`);
  console.log(`IVR URL: https://${domain}/ivr`);
  console.log(`\nCall flow:`);
  console.log(`  1. Main menu: "Press 1 for claims..."'`);
  console.log(`  2. Claims submenu: "Press 1 for claim status..."'`);
  console.log(`  3. Hold music (~30s) then simulated agent "Michael" answers`);
  console.log(`  4. Agent responds to claim inquiries with processing status`);
}

main().catch(err => {
  console.error('ERROR:', err.message);
  process.exit(1);
});
