// ============================================================================
// ElevenLabs Text-to-Speech Service
//
// Converts a chess move description to speech using the ElevenLabs API and
// plays it back through the device speaker via expo-av.
// ============================================================================

import { Audio } from 'expo-av';
import * as FileSystem from 'expo-file-system/legacy';

import { ELEVENLABS_CONFIG } from './config';

const TTS_ENDPOINT = `https://api.elevenlabs.io/v1/text-to-speech/${ELEVENLABS_CONFIG.voiceId}`;

// Keep a reference to the currently-playing sound so we can stop it if a new
// move arrives before the previous one has finished speaking.
let currentSound: Audio.Sound | null = null;

/**
 * Convert a SAN move string into a more natural spoken form.
 * e.g. "Nf6" -> "Knight to f6", "e4" -> "e4", "O-O" -> "King-side castle"
 */
function sanToSpeech(san: string): string {
  // Castling
  if (san === 'O-O-O' || san === '0-0-0') return 'Queen-side castle';
  if (san === 'O-O'   || san === '0-0')   return 'King-side castle';

  const pieceNames: Record<string, string> = {
    K: 'King',
    Q: 'Queen',
    R: 'Rook',
    B: 'Bishop',
    N: 'Knight',
  };

  // Strip check/checkmate/annotation markers for cleaner speech
  let s = san.replace(/[+#!?]/g, '');

  // Promotion: e8=Q -> "e8, promote to Queen"
  const promotionMatch = s.match(/^([a-h][1-8])=([KQRBN])$/);
  if (promotionMatch) {
    const pieceName = pieceNames[promotionMatch[2]] ?? promotionMatch[2];
    return `${promotionMatch[1]}, promote to ${pieceName}`;
  }

  // Piece moves: Nf6, Bxe5, Rxd1, etc.
  const pieceMatch = s.match(/^([KQRBN])([a-h]?[1-8]?)(x?)([a-h][1-8])$/);
  if (pieceMatch) {
    const pieceName = pieceNames[pieceMatch[1]] ?? pieceMatch[1];
    const capture   = pieceMatch[3] === 'x' ? ' takes ' : ' to ';
    const dest      = pieceMatch[4];
    return `${pieceName}${capture}${dest}`;
  }

  // Pawn capture: exd5
  const pawnCapture = s.match(/^([a-h])x([a-h][1-8])$/);
  if (pawnCapture) {
    return `${pawnCapture[1]} takes ${pawnCapture[2]}`;
  }

  // Plain pawn move: e4, d5, etc.
  return s;
}

/**
 * Speak a chess move aloud using ElevenLabs TTS.
 * @param san  Standard Algebraic Notation for the move (e.g. "Nf6", "e4")
 */
export async function speakMove(san: string): Promise<void> {
  // Stop any currently-playing audio
  if (currentSound) {
    try {
      await currentSound.stopAsync();
      await currentSound.unloadAsync();
    } catch {
      // Ignore errors on cleanup
    }
    currentSound = null;
  }

  const text = sanToSpeech(san);

  try {
    // 1. Request audio from ElevenLabs
    const response = await fetch(TTS_ENDPOINT, {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_CONFIG.apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: ELEVENLABS_CONFIG.model,
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    });

    if (!response.ok) {
      console.error('[ElevenLabs] TTS request failed:', response.status, await response.text());
      return;
    }

    // 2. Write the mp3 blob to a temp file (expo-av requires a URI, not a blob)
    const arrayBuffer = await response.arrayBuffer();
    const base64 = arrayBufferToBase64(arrayBuffer);
    const fileUri = `${FileSystem.cacheDirectory}move_${Date.now()}.mp3`;
    await FileSystem.writeAsStringAsync(fileUri, base64, {
      encoding: 'base64' as any,
    });

    // 3. Configure audio session and play
    await Audio.setAudioModeAsync({
      allowsRecordingIOS: false,
      playsInSilentModeIOS: true,
      shouldDuckAndroid: true,
    });

    const { sound } = await Audio.Sound.createAsync({ uri: fileUri });
    currentSound = sound;

    sound.setOnPlaybackStatusUpdate((status) => {
      if (status.isLoaded && status.didJustFinish) {
        sound.unloadAsync().catch(() => {});
        if (currentSound === sound) currentSound = null;
        // Clean up the temp file
        FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => {});
      }
    });

    await sound.playAsync();
  } catch (err) {
    console.error('[ElevenLabs] speakMove error:', err);
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = '';
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
