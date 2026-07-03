//! Symmetric encryption of secrets at rest (ChaCha20-Poly1305 AEAD).
//! Storage layout per value: 12-byte random nonce ‖ ciphertext+tag.

use base64::{engine::general_purpose::STANDARD, Engine};
use chacha20poly1305::aead::{Aead, AeadCore, KeyInit, OsRng};
use chacha20poly1305::{ChaCha20Poly1305, Nonce};

const NONCE_LEN: usize = 12;

/// An AEAD cipher keyed by a 32-byte master key.
pub struct Cipher {
    inner: ChaCha20Poly1305,
}

impl Cipher {
    /// Build from a base64-encoded 32-byte key.
    pub fn from_base64(b64: &str) -> anyhow::Result<Self> {
        let bytes = STANDARD
            .decode(b64.trim())
            .map_err(|e| anyhow::anyhow!("WEAVE_ENC_KEY not valid base64: {e}"))?;
        if bytes.len() != 32 {
            anyhow::bail!("WEAVE_ENC_KEY must decode to 32 bytes, got {}", bytes.len());
        }
        let inner = ChaCha20Poly1305::new_from_slice(&bytes)
            .map_err(|e| anyhow::anyhow!("bad key: {e}"))?;
        Ok(Cipher { inner })
    }

    /// Build from the `WEAVE_ENC_KEY` environment variable.
    pub fn from_env() -> anyhow::Result<Self> {
        let b64 = std::env::var("WEAVE_ENC_KEY")
            .map_err(|_| anyhow::anyhow!("WEAVE_ENC_KEY not set"))?;
        Self::from_base64(&b64)
    }

    /// Encrypt to `nonce ‖ ciphertext`.
    pub fn encrypt(&self, plaintext: &str) -> anyhow::Result<Vec<u8>> {
        let nonce = ChaCha20Poly1305::generate_nonce(&mut OsRng);
        let ct = self
            .inner
            .encrypt(&nonce, plaintext.as_bytes())
            .map_err(|e| anyhow::anyhow!("encrypt failed: {e}"))?;
        let mut out = Vec::with_capacity(NONCE_LEN + ct.len());
        out.extend_from_slice(nonce.as_slice());
        out.extend_from_slice(&ct);
        Ok(out)
    }

    /// Decrypt a `nonce ‖ ciphertext` blob. Errors on a bad tag (tamper) or truncation.
    pub fn decrypt(&self, blob: &[u8]) -> anyhow::Result<String> {
        if blob.len() < NONCE_LEN {
            anyhow::bail!("ciphertext too short");
        }
        let (nonce_bytes, ct) = blob.split_at(NONCE_LEN);
        let nonce = Nonce::from_slice(nonce_bytes);
        let pt = self
            .inner
            .decrypt(nonce, ct)
            .map_err(|e| anyhow::anyhow!("decrypt failed: {e}"))?;
        Ok(String::from_utf8(pt)?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // 32 zero bytes, base64.
    const TEST_KEY: &str = "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";

    #[test]
    fn round_trip() {
        let c = Cipher::from_base64(TEST_KEY).unwrap();
        let blob = c.encrypt("xoxe.xoxp-secret").unwrap();
        assert_eq!(c.decrypt(&blob).unwrap(), "xoxe.xoxp-secret");
    }

    #[test]
    fn nonce_is_unique_per_encrypt() {
        let c = Cipher::from_base64(TEST_KEY).unwrap();
        let a = c.encrypt("same").unwrap();
        let b = c.encrypt("same").unwrap();
        assert_ne!(a, b, "two encryptions of the same plaintext must differ");
    }

    #[test]
    fn tamper_fails() {
        let c = Cipher::from_base64(TEST_KEY).unwrap();
        let mut blob = c.encrypt("secret").unwrap();
        let last = blob.len() - 1;
        blob[last] ^= 0xff; // flip a ciphertext byte
        assert!(c.decrypt(&blob).is_err());
    }

    #[test]
    fn bad_key_length_rejected() {
        assert!(Cipher::from_base64("AAAA").is_err());
    }
}
