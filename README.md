# LiveChat with Eliza

<img width="540" alt="Screenshot 2567-12-03 at 00 22 17" src="https://github.com/user-attachments/assets/e6119dd5-377e-41e3-937c-8ecd28082827">

Live video avatar chat application. Connects to an Eliza instance running the "Direct" client. Requires a Simli AI Open AI, and ElevenLabs API key.

## Requirements

### Eliza

[Eliza](https://github.com/ai16z/eliza) has to be running and you must paste the agentId into [main.tsx](/src/main.tsx)'s `AGENT_ID` variable.

### Environment Variables

`.env.example` should be copied into a file called `.env`. All of three of the api keys need to be populated.

- `VITE_OPENAI_API_KEY`
- `VITE_SIMLI_API_KEY`
- `VITE_ELEVENLABS_API_KEY`

## Options

You can update [main.tsx](/src/main.tsx)'s `SIMLI_FACE_ID` and `ELEVENLABS_VOICE_ID` to control the avatar and voice used respectively.

The port the application runs on can be updated in the [vite.config](/vite.config.ts).
