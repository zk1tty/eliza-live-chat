import React, { useCallback, useEffect, useRef, useState } from 'react'
import ReactDOM from 'react-dom/client'
import axios from 'axios'
import { v4 as uuidv4 } from 'uuid'

import { SimliClient } from './SimliClient'

const sk = import.meta.env.VITE_SIMLI_API_KEY
const e11 = import.meta.env.VITE_ELEVENLABS_API_KEY
const completionEndpoint = import.meta.env?.VITE_COMPLETION_ENDPOINT || 'http://localhost:3000'
const AGENT_ID = import.meta.env.VITE_ELIZA_AGENT_ID
const SIMLI_FACE_ID = import.meta.env.VITE_SIMLI_FACE_ID
const ELEVENLABS_VOICE_ID = import.meta.env.VITE_ELEVENLABS_VOICE_ID

import './styles.css'

// const AGENT_ID = 'cac13f59-ece4-0f3a-9768-b2a7aa7ffce9' // this comes from the agentId output from running the Eliza framework, it likely will be in uuid format, i.e. '123e4567-e89b-12d3-a456-426614174000'
// const SIMLI_FACE_ID = 'd2a27ba9-bd23-4e0b-88d2-499d771b81a6'
// const ELEVENLABS_VOICE_ID = '21m00Tcm4TlvDq8ikWAM'

const simliClient = new SimliClient()

const App = () => {
  const [inputText, setInputText] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [error, setError] = useState('')
  const [_, setChatgptText] = useState('')
  const [startWebRTC, setStartWebRTC] = useState(false)
  const [isListening, setIsListening] = useState(false)
  const cancelTokenRef = useRef<any | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const audioContextRef = useRef<any | null>(null)
  const analyserRef = useRef<any | null>(null)
  const microphoneRef = useRef<any | null>(null)

  // TODO: populate these from localStorage if roomid and useruuid are set, otherwise generate a random uuid
  const [roomID, setRoomID] = useState('')
  const [userUUID, setUserUUID] = useState('')

  useEffect(() => {
    const storedRoomID = localStorage.getItem('roomID')
    const storedUserUUID = localStorage.getItem('userUUID')
    if (storedRoomID && storedUserUUID) {
      setRoomID(storedRoomID)
      setUserUUID(storedUserUUID)
    } else {
      const newRoomID = uuidv4()
      const newUserUUID = uuidv4()
      setRoomID(newRoomID)
      setUserUUID(newUserUUID)
      localStorage.setItem('roomID', newRoomID)
      localStorage.setItem('userUUID', newUserUUID)
    }
  }, [])

  const initializeSimliClient = useCallback(() => {
    if (videoRef.current && audioRef.current) {
      const SimliConfig = {
        apiKey: sk,
        faceID: SIMLI_FACE_ID,
        handleSilence: true,
        videoRef: videoRef,
        audioRef: audioRef,
      }

      console.log('SimliConfig', SimliConfig)

      simliClient.Initialize(SimliConfig)
      console.log('Simli Client initialized')
    }
  }, [])

  useEffect(() => {
    initializeSimliClient()

    const handleConnected = () => {
      console.log('SimliClient is now connected!')
    }

    const handleDisconnected = () => {
      console.log('SimliClient has disconnected!')
    }

    const handleFailed = () => {
      console.log('SimliClient has failed to connect!')
      setError('Failed to connect to Simli. Please try again.')
    }

    const handleStarted = () => {
      console.log('SimliClient has started!')
      setIsLoading(false)
      setIsConnecting(false)
    }

    simliClient.on('connected', handleConnected)
    simliClient.on('disconnected', handleDisconnected)
    simliClient.on('failed', handleFailed)
    simliClient.on('started', handleStarted)

    return () => {
      simliClient.off('connected', handleConnected)
      simliClient.off('disconnected', handleDisconnected)
      simliClient.off('failed', handleFailed)
      simliClient.off('started', handleStarted)
      simliClient.close()
    }
  }, [initializeSimliClient])

  const handleStart = useCallback(() => {
    simliClient.start()
    setStartWebRTC(true)
    setIsLoading(true)
    setIsConnecting(true)

    setTimeout(() => {
      const audioData = new Uint8Array(6000).fill(0)
      simliClient.sendAudioData(audioData)
    }, 4000)
  }, [])

  const processInput = useCallback(async (text: any) => {
    setIsLoading(true)
    setError('')

    if (cancelTokenRef.current) {
      cancelTokenRef.current.cancel('Operation canceled by the user.')
    }

    cancelTokenRef.current = axios.CancelToken.source()

    try {
      console.log('sending input to chatgpt')
      const chatGPTResponse = await axios.post(
        completionEndpoint + `/${AGENT_ID}/message`,
        {
          text,
          roomId: roomID,
          userId: userUUID,
          userName: 'User',
        },
        {
          cancelToken: cancelTokenRef.current.token,
        }
      )

      console.log('chatGPTResponse', chatGPTResponse)

      const chatGPTText = chatGPTResponse.data[0].text
      if (!chatGPTText || chatGPTText.length === 0) {
        setError('No response from chatGPT. Please try again.')
        return
      }
      setChatgptText(chatGPTText)

      const elevenlabsResponse = await axios.post(
        `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_VOICE_ID}?output_format=pcm_16000`,
        {
          text: chatGPTText,
          model_id: 'eleven_turbo_v2_5',
        },
        {
          headers: {
            'xi-api-key': e11,
            'Content-Type': 'application/json',
          },
          responseType: 'arraybuffer',
          cancelToken: cancelTokenRef.current.token,
        }
      )

      const pcm16Data = new Uint8Array(elevenlabsResponse.data)
      const chunkSize = 6000
      for (let i = 0; i < pcm16Data.length; i += chunkSize) {
        const chunk = pcm16Data.slice(i, i + chunkSize)
        simliClient.sendAudioData(chunk)
      }
    } catch (err) {
      if (axios.isCancel(err)) {
        console.log('Request canceled:', err.message)
      } else {
        setError('An error occurred. Please try again.')
        console.error(err)
      }
    } finally {
      setIsLoading(false)
      cancelTokenRef.current = null
    }
  }, [])

  const toggleListening = useCallback(() => {
    if (isListening) {
      console.log('Stopping mic')
      stopListening()
    } else {
      console.log('Starting mic')
      startListening()
    }
  }, [isListening])

  const sendAudioToWhisper = useCallback(
    async (audioBlob: Blob) => {
      const formData = new FormData()
      formData.append('file', audioBlob, 'audio.wav')

      try {
        const response = await axios.post(`${completionEndpoint}/${AGENT_ID}/whisper`, formData, {
          headers: {
            'Content-Type': 'multipart/form-data',
          },
        })

        const transcribedText = response.data.text
        await processInput(transcribedText)
      } catch (error) {
        console.error('Error transcribing audio:', error)
        setError('Error transcribing audio. Please try again.')
      }
    },
    [processInput]
  )

  const startListening = useCallback(() => {
    setIsListening(true)
    navigator.mediaDevices
      .getUserMedia({ audio: true })
      .then((stream) => {
        if (!audioContextRef.current) {
          audioContextRef.current = new (window.AudioContext ||
            (window as any).webkitAudioContext)()
        }

        if (!analyserRef.current) {
          analyserRef.current = audioContextRef.current.createAnalyser()
          analyserRef.current.fftSize = 512
        }

        if (microphoneRef.current) {
          microphoneRef.current.disconnect()
        }

        microphoneRef.current = audioContextRef.current.createMediaStreamSource(stream)
        microphoneRef.current.connect(analyserRef.current)

        mediaRecorderRef.current = new MediaRecorder(stream)
        mediaRecorderRef.current.ondataavailable = (event) => {
          console.log('Data available:', event.data)
          chunksRef.current.push(event.data)
        }
        mediaRecorderRef.current.onstop = () => {
          console.log('Recorder stopped')
          const audioBlob = new Blob(chunksRef.current, { type: 'audio/wav' })
          sendAudioToWhisper(audioBlob)
          chunksRef.current = []
        }
        mediaRecorderRef.current.start()
      })
      .catch((err) => {
        console.error('Error accessing microphone:', err)
        setIsListening(false)
        setError('Error accessing microphone. Please check your permissions and try again.')
      })
  }, [sendAudioToWhisper])

  const stopListening = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop()
    }
    console.log('Stopping listening')
    setIsListening(false)
  }, [])

  useEffect(() => {
    console.log('isListening', isListening)
    console.log('chunksRef.current', chunksRef.current)

    if (!isListening && chunksRef.current.length > 0) {
      console.log('Sending audio to Whisper')
      const audioBlob = new Blob(chunksRef.current, { type: 'audio/wav' })
      sendAudioToWhisper(audioBlob)
      chunksRef.current = []
    }
  }, [isListening, sendAudioToWhisper])

  const handleSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault()
      const input = inputText.trim()
      setInputText('')
      await processInput(input)
    },
    [inputText, processInput]
  )

  return (
    <>
      <div className='flex h-screen w-full flex-col items-center justify-center font-mono text-white'>
        <div className='relative size-full'>
          <video
            ref={videoRef}
            id='simli_video'
            autoPlay
            playsInline
            className='size-full object-cover'
          ></video>
          <audio ref={audioRef} id='simli_audio' autoPlay></audio>
        </div>
        {startWebRTC && !isConnecting ? (
          <>
            {/* {chatgptText && <p className='text-center'>{chatgptText}</p>} */}
            <form
              onSubmit={handleSubmit}
              className='fixed bottom-4 mx-4 w-full max-w-md space-y-4 px-4'
            >
              <div className='flex w-full items-center space-x-2'>
                <input
                  type='text'
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  placeholder='Enter your message'
                  className='grow rounded border border-white bg-black px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-white'
                />
                <button
                  type='submit'
                  disabled={isLoading || !inputText.trim()}
                  className='rounded bg-white px-3 py-1 text-3xl text-black transition-colors hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-black disabled:opacity-50'
                >
                  {isLoading ? '➡️' : '➡️'}
                </button>
                <button
                  type='button'
                  onClick={toggleListening}
                  className='rounded bg-blue-500 px-3 py-1 text-2xl text-white transition-colors hover:bg-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-black'
                >
                  {isListening ? '🔴' : '🎤'}
                </button>
              </div>
            </form>
          </>
        ) : (
          <>
            {isConnecting && (
              <p className='fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2'>
                Connecting...
              </p>
            )}
            {!isConnecting && (
              <button
                disabled={isConnecting}
                onClick={handleStart}
                className='fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded bg-white px-4 py-2 text-black transition-colors hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-white focus:ring-offset-2 focus:ring-offset-black'
              >
                Start
              </button>
            )}
          </>
        )}
        {error && <p className='fixed bottom-20 mt-4 text-center text-red-500'>{error}</p>}
      </div>
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          width: '100%',
          height: '100%',
          backgroundImage: 'url(./bg.jpg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          zIndex: -1000,
        }}
      />
    </>
  )
}

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
)
