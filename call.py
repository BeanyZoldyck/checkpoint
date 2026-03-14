import os
import numpy as np
import sounddevice as sd
from scipy.io.wavfile import write
from dotenv import load_dotenv
import assemblyai as aai

load_dotenv()

FS = 44100
CHANNELS = 1
FILENAME = "output.wav"

aai.settings.api_key = os.getenv("ASSEMBLY_AI_API_KEY")


def record_audio():
    """Record audio until the user presses Enter."""
    print("Press Enter to start recording...")
    input()

    audio_data = []

    def callback(indata, frames, time, status):
        audio_data.append(indata.copy())

    print("Recording... Press Enter to stop.")
    stream = sd.InputStream(samplerate=FS, channels=CHANNELS, callback=callback)
    stream.start()
    input()
    stream.stop()
    stream.close()

    recording = np.concatenate(audio_data, axis=0)
    write(FILENAME, FS, recording)
    print(f"Saved to {FILENAME}")
    return FILENAME


def transcribe(audio_path):
    """Transcribe an audio file using AssemblyAI."""
    transcriber = aai.Transcriber()
    transcript = transcriber.transcribe(audio_path)
    return transcript.text or ""


if __name__ == "__main__":
    print("Transcribing...")
    text = transcribe(FILENAME)
    print(f"\n{text}")
