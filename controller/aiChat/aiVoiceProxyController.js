require("dotenv").config();
const WebSocket = require('ws');

const REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

/**
 * WebSocket proxy handler for OpenAI Realtime API
 * This bridges the client WebSocket with OpenAI's WebSocket
 */
const handleVoiceWebSocket = (ws, req) => {
  console.log('=== NEW VOICE WEBSOCKET CONNECTION ===');
  console.log('User:', req.user?.id);
  
  let openaiWs = null;
  let isOpenAIReady = false;
  let isSessionConfigured = false;
  const messageQueue = [];

  try {
    // Connect to OpenAI Realtime API
    const openaiUrl = `wss://api.openai.com/v1/realtime?model=${REALTIME_MODEL}`;
    console.log('Connecting to OpenAI:', openaiUrl);
    console.log('Using model:', REALTIME_MODEL);
    
    openaiWs = new WebSocket(openaiUrl, {
      headers: {
        "Authorization": `Bearer ${OPENAI_API_KEY}`,
        "OpenAI-Beta": "realtime=v1"
      }
    });

    // OpenAI connection opened
    openaiWs.on('open', () => {
      console.log('✅ Connected to OpenAI Realtime API');
      
      // Send initial configuration
      const sessionConfig = {
        type: 'session.update',
        session: {
          modalities: ['text', 'audio'],
          instructions: `You are an expert Vedic astrologer speaking with a user. 
            Provide warm, compassionate astrological guidance in a conversational manner.
            Keep responses concise and engaging. If asked about birth details, politely request date, time, and place of birth.
            Use a mix of English and Hindi (Hinglish) to be relatable.`,
          voice: "alloy",
          input_audio_format: 'pcm16',
          output_audio_format: 'pcm16',
          input_audio_transcription: {
            model: 'whisper-1'
          },
          turn_detection: {
            type: "server_vad",
            threshold: 0.5,
            prefix_padding_ms: 300,
            silence_duration_ms: 500,
          },
          temperature: 0.7,
          max_response_output_tokens: 4096,
        }
      };
      
      openaiWs.send(JSON.stringify(sessionConfig));
      console.log('Sent session configuration to OpenAI');
      
      // Mark as ready
      isOpenAIReady = true;
      
      // Send queued control messages (NOT audio yet - wait for session.updated)
      if (messageQueue.length > 0) {
        const controlMessages = [];
        const audioMessages = [];
        
        messageQueue.forEach(data => {
          const isString = typeof data === 'string';
          if (isString) {
            controlMessages.push(data);
          } else {
            audioMessages.push(data);
          }
        });
        
        // Send control messages immediately
        if (controlMessages.length > 0) {
          console.log(`📤 Sending ${controlMessages.length} queued control messages to OpenAI`);
          controlMessages.forEach(data => {
            if (openaiWs.readyState === WebSocket.OPEN) {
              openaiWs.send(data);
            }
          });
        }
        
        // Keep audio messages in queue until session is configured
        messageQueue.length = 0;
        messageQueue.push(...audioMessages);
        console.log(`📥 Keeping ${audioMessages.length} audio messages queued until session.updated`);
      }
      
      // Notify client that connection is ready
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'connection.ready', status: 'connected' }));
      }
    });

    // Forward messages from OpenAI to client
    openaiWs.on('message', (data) => {
      try {
        if (ws.readyState === WebSocket.OPEN) {
          // Convert Buffer to string if needed
          let messageStr = null;
          let isTextMessage = false;
          
          if (typeof data === 'string') {
            messageStr = data;
            isTextMessage = true;
          } else if (Buffer.isBuffer(data)) {
            // Try to parse as UTF-8 text first
            try {
              messageStr = data.toString('utf-8');
              // Check if it's valid JSON (control message)
              JSON.parse(messageStr);
              isTextMessage = true;
            } catch (e) {
              // Not valid JSON/text, it's binary audio data
              isTextMessage = false;
              messageStr = null;
            }
          }
          
          // Handle text/JSON messages
          if (isTextMessage && messageStr) {
            try {
              const parsed = JSON.parse(messageStr);
              console.log('→ Forwarding JSON message to client:', parsed.type);
              
              // Mark session as configured when we get session.updated
              if (parsed.type === 'session.updated') {
                isSessionConfigured = true;
                console.log('✅ Session configured, ready to send audio');
                
                // Send any queued audio messages
                if (messageQueue.length > 0) {
                  console.log(`📤 Sending ${messageQueue.length} queued audio messages to OpenAI`);
                  messageQueue.forEach(queuedData => {
                    if (openaiWs.readyState === WebSocket.OPEN) {
                      openaiWs.send(queuedData);
                    }
                  });
                  messageQueue.length = 0;
                }
              }
              
              // Log full message for important types
              if (parsed.type === 'error' || parsed.type === 'session.created' || parsed.type === 'session.updated') {
                console.log('Full message:', JSON.stringify(parsed, null, 2));
              }
              
              // Check for errors from OpenAI
              if (parsed.type === 'error') {
                console.error('❌ OpenAI Error:', parsed.error);
              }

              // Send JSON text to client so browser receives it as a string
              ws.send(messageStr);
            } catch (e) {
              console.log('→ Forwarding text message to client (non-JSON)');
              ws.send(messageStr);
            }
          } else {
            // Binary audio data
            console.log('→ Forwarding binary audio to client:', data.length, 'bytes');
            // Forward raw binary (PCM16 audio frames)
            ws.send(data);
          }
        }
      } catch (err) {
        console.error('Error forwarding message to client:', err);
      }
    });

    // OpenAI error
    openaiWs.on('error', (error) => {
      console.error('❌ OpenAI WebSocket error:', error.message);
      console.error('Error code:', error.code);
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ 
          type: 'error', 
          error: { message: `OpenAI connection error: ${error.message}` } 
        }));
      }
    });

    // OpenAI closed
    openaiWs.on('close', (code, reason) => {
      console.log('OpenAI WebSocket closed');
      console.log('Close code:', code);
      console.log('Close reason:', reason?.toString());
      if (ws.readyState === WebSocket.OPEN) {
        ws.close(code, reason);
      }
    });

    // Forward messages from client to OpenAI
    ws.on('message', (data) => {
      try {
        // Convert Buffer to string if needed
        let dataStr = data;
        if (Buffer.isBuffer(data)) {
          dataStr = data.toString('utf-8');
        }
        
        // Parse JSON messages to check type
        let messageType = 'unknown';
        let isAudioMessage = false;
        
        try {
          const parsed = JSON.parse(dataStr);
          messageType = parsed.type || 'unknown';
          // Audio messages are: input_audio_buffer.append, input_audio_buffer.commit
          isAudioMessage = messageType.startsWith('input_audio_buffer');
        } catch (e) {
          // Not JSON, treat as binary/unknown
          messageType = 'binary';
          isAudioMessage = true;
        }
        
        // If OpenAI is ready and session is configured, send immediately
        // OR if it's a control message (non-audio), send when ready
        if (openaiWs && openaiWs.readyState === WebSocket.OPEN && isOpenAIReady) {
          if (isSessionConfigured || !isAudioMessage) {
            // Log what we're sending (reduce spam for audio)
            if (messageType === 'input_audio_buffer.append') {
              // Don't log every audio chunk
            } else {
              console.log('← Forwarding message to OpenAI:', messageType);
            }
            
            openaiWs.send(dataStr);
          } else {
            // Queue audio until session is configured
            messageQueue.push(dataStr);
            if (messageQueue.length % 10 === 1) { // Log every 10th to avoid spam
              console.log('📥 Queued audio (waiting for session.updated), queue size:', messageQueue.length);
            }
          }
        } else {
          // Queue message until OpenAI is ready
          messageQueue.push(dataStr);
          console.log('📥 Queued message (OpenAI not ready yet), queue size:', messageQueue.length);
        }
      } catch (err) {
        console.error('Error forwarding message to OpenAI:', err);
      }
    });

    // Client disconnected
    ws.on('close', () => {
      console.log('Client WebSocket closed');
      if (openaiWs && openaiWs.readyState === WebSocket.OPEN) {
        openaiWs.close();
      }
    });

    // Client error
    ws.on('error', (error) => {
      console.error('Client WebSocket error:', error);
      if (openaiWs && openaiWs.readyState === WebSocket.OPEN) {
        openaiWs.close();
      }
    });

  } catch (error) {
    console.error('=== VOICE WEBSOCKET ERROR ===');
    console.error('Error:', error.message);
    console.error('Stack:', error.stack);
    
    ws.send(JSON.stringify({ 
      type: 'error', 
      error: { message: error.message } 
    }));
    ws.close();
  }
};

module.exports = {
  handleVoiceWebSocket
};
