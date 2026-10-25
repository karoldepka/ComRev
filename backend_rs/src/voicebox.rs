//! Text-to-speech via a local Voicebox app (https://github.com/jamiepine/voicebox), using its
//! OpenAI-compatible `POST /v1/audio/speech`. The audio is stored as a cell file; the caller
//! writes the returned file ref (and timing) into cells through the normal sync path.

use std::time::{Duration, Instant};

use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};

use crate::data_row::AppState;
use crate::file::{FileRef, StoredFile};

const DEFAULT_VOICEBOX_URL: &str = "http://127.0.0.1:17493";
/// Voicebox rejects inputs over 10,000 characters per request.
const MAX_CHUNK_CHARS: usize = 9_000;
/// Voicebox `pcm` output: 16-bit little-endian mono at 24 kHz.
const PCM_SAMPLE_RATE: u32 = 24_000;
const CLIENT_ID: &str = "structable";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(30 * 60);

#[derive(Debug, Deserialize)]
pub struct RenderRequest {
    pub text: String,
    /// Voicebox voice profile name or id; empty = Voicebox's default for this client.
    pub voice: Option<String>,
    /// Base name for the stored file (e.g. the audiobook's title).
    pub name: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct RenderResponse {
    pub file: FileRef,
    /// Wall-clock time Voicebox took to render.
    pub duration_seconds: f64,
    pub audio_seconds: f64,
    pub chunks: usize,
}

type ApiError = (StatusCode, String);

/// Split at sentence/line boundaries into chunks of at most `max_chars` characters.
fn split_text(text: &str, max_chars: usize) -> Vec<String> {
    let mut sentences: Vec<String> = Vec::new();
    let mut current = String::new();
    for ch in text.chars() {
        current.push(ch);
        if matches!(ch, '.' | '!' | '?' | '\n') {
            sentences.push(std::mem::take(&mut current));
        }
    }
    if !current.is_empty() {
        sentences.push(current);
    }

    let mut chunks: Vec<String> = Vec::new();
    let mut chunk = String::new();
    for sentence in sentences {
        if chunk.chars().count() + sentence.chars().count() > max_chars && !chunk.trim().is_empty() {
            chunks.push(std::mem::take(&mut chunk));
        }
        // A single over-long sentence: hard-split on character boundaries.
        let mut rest: Vec<char> = sentence.chars().collect();
        while rest.len() > max_chars {
            chunks.push(rest.drain(..max_chars).collect());
        }
        chunk.extend(rest);
    }
    if !chunk.trim().is_empty() {
        chunks.push(chunk);
    }
    chunks.into_iter().map(|c| c.trim().to_string()).filter(|c| !c.is_empty()).collect()
}

/// Wrap 16-bit mono PCM in a WAV header.
fn wav_from_pcm16(pcm: &[u8], sample_rate: u32) -> Vec<u8> {
    let data_len = pcm.len() as u32;
    let mut wav = Vec::with_capacity(44 + pcm.len());
    wav.extend_from_slice(b"RIFF");
    wav.extend_from_slice(&(36 + data_len).to_le_bytes());
    wav.extend_from_slice(b"WAVEfmt ");
    wav.extend_from_slice(&16u32.to_le_bytes()); // fmt chunk size
    wav.extend_from_slice(&1u16.to_le_bytes()); // PCM
    wav.extend_from_slice(&1u16.to_le_bytes()); // mono
    wav.extend_from_slice(&sample_rate.to_le_bytes());
    wav.extend_from_slice(&(sample_rate * 2).to_le_bytes()); // byte rate
    wav.extend_from_slice(&2u16.to_le_bytes()); // block align
    wav.extend_from_slice(&16u16.to_le_bytes()); // bits per sample
    wav.extend_from_slice(b"data");
    wav.extend_from_slice(&data_len.to_le_bytes());
    wav.extend_from_slice(pcm);
    wav
}

async fn speech(client: &reqwest::Client, base: &str, input: &str, voice: Option<&str>, format: &str) -> Result<Vec<u8>, ApiError> {
    let mut body = serde_json::json!({ "model": "tts-1", "input": input, "response_format": format });
    if let Some(voice) = voice {
        body["voice"] = serde_json::Value::String(voice.to_string());
    }
    let response = client
        .post(format!("{base}/v1/audio/speech"))
        .header("X-Voicebox-Client-Id", CLIENT_ID)
        .json(&body)
        .send()
        .await
        .map_err(|e| (StatusCode::BAD_GATEWAY, format!("Voicebox is not reachable at {base} (is the app open?): {e}")))?;
    let status = response.status();
    if !status.is_success() {
        let detail = response.text().await.unwrap_or_default();
        return Err((StatusCode::BAD_GATEWAY, format!("Voicebox returned {status}: {detail}")));
    }
    let bytes = response
        .bytes()
        .await
        .map_err(|e| (StatusCode::BAD_GATEWAY, format!("Voicebox audio download failed: {e}")))?;
    Ok(bytes.to_vec())
}

/// `POST /voicebox/render` — render `text`, store the WAV, return its file ref and timings.
pub async fn render(State(state): State<AppState>, Json(request): Json<RenderRequest>) -> Result<Json<RenderResponse>, ApiError> {
    let text = request.text.trim();
    if text.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "Script text is empty".to_string()));
    }
    let base = std::env::var("VOICEBOX_URL").unwrap_or_else(|_| DEFAULT_VOICEBOX_URL.to_string());
    let voice = request.voice.as_deref().map(str::trim).filter(|v| !v.is_empty());
    let client = reqwest::Client::builder()
        .timeout(REQUEST_TIMEOUT)
        .build()
        .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("http client: {e}")))?;

    let chunks = split_text(text, MAX_CHUNK_CHARS);
    tracing::info!(chars = text.chars().count(), chunks = chunks.len(), voice = ?voice, "voicebox render requested");
    let started = Instant::now();
    // One chunk: take Voicebox's WAV as-is. Several: fetch raw PCM and join into one WAV.
    let (wav, audio_seconds) = if chunks.len() == 1 {
        let wav = speech(&client, &base, &chunks[0], voice, "wav").await?;
        let seconds = wav.len().saturating_sub(44) as f64 / (PCM_SAMPLE_RATE as f64 * 2.0);
        (wav, seconds)
    } else {
        let mut pcm = Vec::new();
        for chunk in &chunks {
            pcm.extend(speech(&client, &base, chunk, voice, "pcm").await?);
        }
        let seconds = pcm.len() as f64 / (PCM_SAMPLE_RATE as f64 * 2.0);
        (wav_from_pcm16(&pcm, PCM_SAMPLE_RATE), seconds)
    };
    let duration_seconds = (started.elapsed().as_secs_f64() * 10.0).round() / 10.0;

    let base_name = request.name.as_deref().map(str::trim).filter(|n| !n.is_empty()).unwrap_or("audiobook");
    let file = StoredFile {
        id: nanoid::nanoid!(),
        name: format!("{base_name}.wav"),
        mime_type: "audio/wav".to_string(),
        content: wav,
    };
    state.store.put_file(&file).await.map_err(|e| crate::error::db_err("file", e))?;
    tracing::info!(file_id = %file.id, duration_seconds, audio_seconds, "voicebox render stored");
    Ok(Json(RenderResponse {
        file: FileRef { size_bytes: file.content.len(), id: file.id, name: file.name, mime_type: file.mime_type },
        duration_seconds,
        audio_seconds: (audio_seconds * 10.0).round() / 10.0,
        chunks: chunks.len(),
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn short_text_is_one_chunk() {
        assert_eq!(split_text("Hello. World!", 9000), vec!["Hello. World!"]);
    }

    #[test]
    fn splits_at_sentences_within_limit() {
        let chunks = split_text("Aaaa. Bbbb. Cccc.", 12);
        assert_eq!(chunks, vec!["Aaaa. Bbbb.", "Cccc."]);
        assert!(chunks.iter().all(|c| c.chars().count() <= 12));
    }

    #[test]
    fn hard_splits_overlong_sentence() {
        let chunks = split_text(&"x".repeat(25), 10);
        assert_eq!(chunks.iter().map(|c| c.len()).collect::<Vec<_>>(), vec![10, 10, 5]);
    }

    #[test]
    fn wav_header_is_valid() {
        let wav = wav_from_pcm16(&[0u8; 48_000], 24_000);
        assert_eq!(&wav[0..4], b"RIFF");
        assert_eq!(&wav[36..40], b"data");
        assert_eq!(u32::from_le_bytes(wav[40..44].try_into().unwrap()), 48_000);
        assert_eq!(wav.len(), 44 + 48_000);
    }
}
