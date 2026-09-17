import { NextResponse } from "next/server";
import twilio from "twilio";

// Twilio hits this when a call comes in to a registered number. We just
// answer, ask the caller to speak, and record — the actual transcription
// and AI extraction happens later in recording-status once the recording
// is ready (Twilio's recommended reliable pattern, not synchronous here).
export async function POST(request: Request) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const signature = request.headers.get("x-twilio-signature") ?? "";
  const url = request.url;
  const formData = await request.formData();
  const params: Record<string, string> = {};
  formData.forEach((value, key) => (params[key] = value.toString()));

  if (authToken) {
    const valid = twilio.validateRequest(authToken, signature, url, params);
    if (!valid) {
      return new NextResponse("Invalid signature", { status: 403 });
    }
  }

  const { origin } = new URL(url);
  const twiml = new twilio.twiml.VoiceResponse();

  twiml.say("Thanks for calling. Please leave your message after the beep.");
  twiml.record({
    playBeep: true,
    maxLength: 1800,
    trim: "trim-silence",
    recordingStatusCallback: `${origin}/api/twilio/recording-status`,
    recordingStatusCallbackEvent: ["completed"],
  });
  twiml.say("Thank you, goodbye.");
  twiml.hangup();

  return new NextResponse(twiml.toString(), {
    headers: { "Content-Type": "text/xml" },
  });
}
