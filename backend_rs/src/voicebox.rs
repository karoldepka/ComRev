//! Text-to-speech via a local Voicebox app (https://github.com/jamiepine/voicebox), using its native
//! API: `POST /generate` starts a job for a voice profile, `GET /history/{id}` reports its status and
//! `GET /audio/{id}` serves the finished WAV. The audio is stored as a cell file; the caller writes
//! the returned file ref (and timing) into cells through the normal sync path.

use std::time::{Duration, Instant};

use axum::{extract::State, http::StatusCode, Json};
use serde::{Deserialize, Serialize};

use crate::data_row::AppState;
use crate::file::{FileRef, StoredFile};

const DEFAULT_VOICEBOX_URL: &str = "http://127.0.0.1:17493";
/// Voicebox accepts up to 50,000 characters per generation (it chunks internally).
const MAX_CHUNK_CHARS: usize = 45_000;
const CLIENT_ID: &str = "structable";
const REQUEST_TIMEOUT: Duration = Duration::from_secs(60);
/// Upper bound for one generation, including the first model load.
const GENERATION_TIMEOUT: Duration = Duration::from_secs(60 * 60);
const POLL_INTERVAL: Duration = Duration::from_secs(2);
/// Languages Voicebox's `/generate` accepts.
const LANGUAGES: [&str; 23] = [
    "zh", "en", "ja", "ko", "de", "fr", "ru", "pt", "es", "it", "he", "ar", "da", "el", "fi", "hi", "ms", "nl", "no", "pl",
    "sv", "sw", "tr",
];

#[derive(Debug, Deserialize)]
pub struct RenderRequest {
    pub text: String,
    /// Voicebox voice profile name or id; empty = the profile of the latest Voicebox generation.
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
    /// Name of the Voicebox voice profile used.
    pub voice: String,
}

#[derive(Debug, Clone, Deserialize)]
struct Profile {
    id: String,
    name: String,
    #[serde(default)]
    language: Option<String>,
    #[serde(default)]
    default_engine: Option<String>,
}

#[derive(Debug, Deserialize)]
struct Generation {
    id: String,
    #[serde(default)]
    profile_id: String,
    #[serde(default)]
    status: String,
    #[serde(default)]
    duration: Option<f64>,
    #[serde(default)]
    error: Option<String>,
}

#[derive(Debug, Deserialize)]
struct History {
    items: Vec<Generation>,
}

type ApiError = (StatusCode, String);

fn bad_gateway(message: String) -> ApiError {
    (StatusCode::BAD_GATEWAY, message)
}

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

/// The `fmt ` chunk body (16 bytes) and the sample data of a RIFF/WAVE file.
fn parse_wav(wav: &[u8]) -> Option<([u8; 16], &[u8])> {
    if wav.len() < 12 || &wav[0..4] != b"RIFF" || &wav[8..12] != b"WAVE" {
        return None;
    }
    let (mut format, mut offset) = (None, 12);
    while offset + 8 <= wav.len() {
        let id = &wav[offset..offset + 4];
        let size = u32::from_le_bytes(wav[offset + 4..offset + 8].try_into().ok()?) as usize;
        let body = offset + 8;
        if id == b"fmt " && size >= 16 && body + 16 <= wav.len() {
            format = Some(wav[body..body + 16].try_into().ok()?);
        } else if id == b"data" {
            return Some((format?, &wav[body..(body + size).min(wav.len())]));
        }
        offset = body + size + (size & 1); // chunks are word-aligned
    }
    None
}

/// Join WAVs of the same format into one (the parts of a long script).
fn concat_wavs(parts: &[Vec<u8>]) -> Result<Vec<u8>, String> {
    let mut format: Option<[u8; 16]> = None;
    let mut samples = Vec::new();
    for (index, part) in parts.iter().enumerate() {
        let (part_format, data) = parse_wav(part).ok_or_else(|| format!("part {index} is not a WAV file"))?;
        if format.is_some_and(|f| f != part_format) {
            return Err(format!("part {index} has a different audio format"));
        }
        format = Some(part_format);
        samples.extend_from_slice(data);
    }
    let format = format.ok_or("no audio parts")?;
    let mut wav = Vec::with_capacity(44 + samples.len());
    wav.extend_from_slice(b"RIFF");
    wav.extend_from_slice(&(36 + samples.len() as u32).to_le_bytes());
    wav.extend_from_slice(b"WAVEfmt ");
    wav.extend_from_slice(&16u32.to_le_bytes());
    wav.extend_from_slice(&format);
    wav.extend_from_slice(b"data");
    wav.extend_from_slice(&(samples.len() as u32).to_le_bytes());
    wav.extend_from_slice(&samples);
    Ok(wav)
}

/// Pick the profile named/identified by `voice`, else the one used by the latest generation.
fn choose_profile(profiles: &[Profile], voice: Option<&str>, last_used_profile_id: Option<&str>) -> Result<Profile, String> {
    if let Some(voice) = voice {
        return profiles
            .iter()
            .find(|p| p.id == voice || p.name.eq_ignore_ascii_case(voice))
            .cloned()
            .ok_or_else(|| {
                let names: Vec<&str> = profiles.iter().map(|p| p.name.as_str()).collect();
                format!("Voicebox has no voice profile '{voice}'. Available: {}", names.join(", "))
            });
    }
    last_used_profile_id
        .and_then(|id| profiles.iter().find(|p| p.id == id))
        .or_else(|| profiles.iter().find(|p| p.default_engine.as_deref().is_some_and(|e| !e.is_empty())))
        .or_else(|| profiles.first())
        .cloned()
        .ok_or_else(|| "Voicebox has no voice profiles; create one in the Voicebox app".to_string())
}

struct Voicebox {
    client: reqwest::Client,
    base: String,
}

impl Voicebox {
    async fn get_json<T: serde::de::DeserializeOwned>(&self, path: &str) -> Result<T, ApiError> {
        let response = self
            .client
            .get(format!("{}{path}", self.base))
            .header("X-Voicebox-Client-Id", CLIENT_ID)
            .send()
            .await
            .map_err(|e| self.unreachable(e))?;
        Self::check(response).await?.json().await.map_err(|e| bad_gateway(format!("Voicebox {path}: bad response: {e}")))
    }

    fn unreachable(&self, e: reqwest::Error) -> ApiError {
        bad_gateway(format!("Voicebox is not reachable at {} (is the app open?): {e}", self.base))
    }

    async fn check(response: reqwest::Response) -> Result<reqwest::Response, ApiError> {
        let status = response.status();
        if status.is_success() {
            return Ok(response);
        }
        let detail = response.text().await.unwrap_or_default();
        Err(bad_gateway(format!("Voicebox returned {status}: {detail}")))
    }

    async fn profile(&self, voice: Option<&str>) -> Result<Profile, ApiError> {
        let profiles: Vec<Profile> = self.get_json("/profiles").await?;
        let last_used = match voice {
            Some(_) => None,
            None => self
                .get_json::<History>("/history?limit=20")
                .await
                .ok()
                .and_then(|h| h.items.into_iter().find(|g| g.status == "completed"))
                .map(|g| g.profile_id),
        };
        choose_profile(&profiles, voice, last_used.as_deref()).map_err(|e| (StatusCode::BAD_REQUEST, e))
    }

    /// Start a generation and wait for it; returns the WAV and its length in seconds.
    async fn generate(&self, profile: &Profile, text: &str) -> Result<(Vec<u8>, f64), ApiError> {
        let language = profile.language.as_deref().filter(|l| LANGUAGES.contains(l)).unwrap_or("en");
        let mut body = serde_json::json!({ "profile_id": profile.id, "text": text, "language": language });
        if let Some(engine) = profile.default_engine.as_deref().filter(|e| !e.is_empty()) {
            body["engine"] = serde_json::Value::String(engine.to_string());
        }
        let response = self
            .client
            .post(format!("{}/generate", self.base))
            .header("X-Voicebox-Client-Id", CLIENT_ID)
            .json(&body)
            .send()
            .await
            .map_err(|e| self.unreachable(e))?;
        let mut generation: Generation =
            Self::check(response).await?.json().await.map_err(|e| bad_gateway(format!("Voicebox /generate: bad response: {e}")))?;
        let started = Instant::now();
        while generation.status != "completed" {
            if generation.status == "failed" {
                return Err(bad_gateway(format!("Voicebox generation failed: {}", generation.error.unwrap_or_default())));
            }
            if started.elapsed() > GENERATION_TIMEOUT {
                return Err(bad_gateway(format!("Voicebox generation {} still '{}' after {:?}", generation.id, generation.status, GENERATION_TIMEOUT)));
            }
            tokio::time::sleep(POLL_INTERVAL).await;
            generation = self.get_json(&format!("/history/{}", generation.id)).await?;
        }
        let response = self
            .client
            .get(format!("{}/audio/{}", self.base, generation.id))
            .header("X-Voicebox-Client-Id", CLIENT_ID)
            .send()
            .await
            .map_err(|e| self.unreachable(e))?;
        let wav = Self::check(response).await?.bytes().await.map_err(|e| bad_gateway(format!("Voicebox audio download failed: {e}")))?;
        Ok((wav.to_vec(), generation.duration.unwrap_or(0.0)))
    }
}

/// `POST /voicebox/render` — render `text`, store the WAV, return its file ref and timings.
pub async fn render(State(state): State<AppState>, Json(request): Json<RenderRequest>) -> Result<Json<RenderResponse>, ApiError> {
    let text = request.text.trim();
    if text.is_empty() {
        return Err((StatusCode::BAD_REQUEST, "Script text is empty".to_string()));
    }
    let voicebox = Voicebox {
        client: reqwest::Client::builder()
            .timeout(REQUEST_TIMEOUT)
            .build()
            .map_err(|e| (StatusCode::INTERNAL_SERVER_ERROR, format!("http client: {e}")))?,
        base: std::env::var("VOICEBOX_URL").unwrap_or_else(|_| DEFAULT_VOICEBOX_URL.to_string()),
    };
    let voice = request.voice.as_deref().map(str::trim).filter(|v| !v.is_empty());
    let profile = voicebox.profile(voice).await?;
    let chunks = split_text(text, MAX_CHUNK_CHARS);
    tracing::info!(chars = text.chars().count(), chunks = chunks.len(), voice = %profile.name, "voicebox render requested");

    let started = Instant::now();
    let (mut parts, mut audio_seconds) = (Vec::new(), 0.0);
    for chunk in &chunks {
        let (wav, seconds) = voicebox.generate(&profile, chunk).await?;
        parts.push(wav);
        audio_seconds += seconds;
    }
    let wav = if parts.len() == 1 { parts.remove(0) } else { concat_wavs(&parts).map_err(|e| bad_gateway(format!("joining Voicebox audio: {e}")))? };
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
        voice: profile.name,
    }))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn wav(format_tag: u8, samples: &[u8]) -> Vec<u8> {
        let mut format = [0u8; 16];
        format[0] = format_tag;
        let mut wav = b"RIFF\0\0\0\0WAVE".to_vec();
        wav.extend_from_slice(b"LIST\x03\0\0\0abc\0"); // odd-sized extra chunk + pad byte
        wav.extend_from_slice(b"fmt \x10\0\0\0");
        wav.extend_from_slice(&format);
        wav.extend_from_slice(b"data");
        wav.extend_from_slice(&(samples.len() as u32).to_le_bytes());
        wav.extend_from_slice(samples);
        wav
    }

    fn profile(id: &str, name: &str, engine: Option<&str>) -> Profile {
        Profile { id: id.into(), name: name.into(), language: Some("en".into()), default_engine: engine.map(Into::into) }
    }

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
    fn concatenates_wav_samples() {
        let joined = concat_wavs(&[wav(1, &[1, 2]), wav(1, &[3, 4, 5, 6])]).unwrap();
        let (format, data) = parse_wav(&joined).unwrap();
        assert_eq!(format[0], 1);
        assert_eq!(data, &[1, 2, 3, 4, 5, 6]);
        assert_eq!(u32::from_le_bytes(joined[4..8].try_into().unwrap()) as usize, joined.len() - 8);
    }

    #[test]
    fn rejects_mismatched_wav_formats() {
        assert!(concat_wavs(&[wav(1, &[1, 2]), wav(3, &[3, 4])]).is_err());
    }

    #[test]
    fn chooses_profile_by_name_id_or_last_used() {
        let profiles = [profile("a", "Adam", Some("kokoro")), profile("b", "Echo", Some("kokoro"))];
        assert_eq!(choose_profile(&profiles, Some("echo"), None).unwrap().id, "b");
        assert_eq!(choose_profile(&profiles, Some("a"), None).unwrap().name, "Adam");
        assert_eq!(choose_profile(&profiles, None, Some("b")).unwrap().id, "b");
        assert_eq!(choose_profile(&profiles, None, None).unwrap().id, "a");
        assert!(choose_profile(&profiles, Some("nobody"), None).unwrap_err().contains("Adam, Echo"));
    }
}
