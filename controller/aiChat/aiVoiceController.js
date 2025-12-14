require("dotenv").config();

const REALTIME_MODEL = process.env.OPENAI_REALTIME_MODEL;
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

/**
 * Create a real-time voice session token
 * This endpoint returns configuration needed for WebRTC connection to OpenAI Realtime API
 */
const createVoiceSession = async (req, res) => {
  try {
    console.log('=== CREATE VOICE SESSION START ===');
    const userId = req.user.id;
    console.log('User ID:', userId);
    console.log('OpenAI API Key exists:', !!OPENAI_API_KEY);
    console.log('Realtime Model:', REALTIME_MODEL);

    // Generate ephemeral token for OpenAI Realtime API
    // The client will use this to establish WebRTC connection
    const sessionConfig = {
      apiKey: OPENAI_API_KEY, // In production, use ephemeral tokens
      model: REALTIME_MODEL,
      voice: "alloy", // Options: alloy, echo, fable, onyx, nova, shimmer
      instructions: `You are an expert Vedic astrologer speaking with a user. 
        Provide warm, compassionate astrological guidance in a conversational manner.
        Keep responses concise and engaging. If asked about birth details, politely request date, time, and place of birth.
        Use a mix of English and Hindi (Hinglish) to be relatable.`,
      turn_detection: {
        type: "server_vad", // Voice Activity Detection
        threshold: 0.5,
        prefix_padding_ms: 300,
        silence_duration_ms: 500,
      },
      temperature: 0.7,
      max_response_output_tokens: 4096,
    };

    console.log('Session config created successfully');
    console.log('Voice selected:', sessionConfig.voice);

    res.status(200).json({
      success: true,
      model: REALTIME_MODEL,
      voice: "alloy",
      userId,
    });

    console.log('=== CREATE VOICE SESSION SUCCESS ===');
  } catch (error) {
    console.error("=== CREATE VOICE SESSION ERROR ===");
    console.error("Error message:", error.message);
    console.error("Error stack:", error.stack);
    res.status(500).json({
      success: false,
      message: "Failed to create voice session",
      error: error.message,
    });
  }
};

/**
 * Get voice session configuration
 */
const getVoiceConfig = async (req, res) => {
  try {
    console.log('=== GET VOICE CONFIG START ===');
    console.log('User ID:', req.user.id);

    const config = {
      success: true,
      config: {
        model: REALTIME_MODEL,
        voices: ["alloy", "echo", "fable", "onyx", "nova", "shimmer"],
        defaultVoice: "alloy",
        modalities: ["text", "audio"],
        turnDetection: {
          type: "server_vad",
          threshold: 0.5,
          prefix_padding_ms: 300,
          silence_duration_ms: 500,
        },
      },
    };

    console.log('Voice config retrieved successfully');
    console.log('Available voices:', config.config.voices);

    res.status(200).json(config);

    console.log('=== GET VOICE CONFIG SUCCESS ===');
  } catch (error) {
    console.error("=== GET VOICE CONFIG ERROR ===");
    console.error("Error message:", error.message);
    console.error("Error stack:", error.stack);
    res.status(500).json({
      success: false,
      message: "Failed to get voice configuration",
      error: error.message,
    });
  }
};

module.exports = {
  createVoiceSession,
  getVoiceConfig,
};
