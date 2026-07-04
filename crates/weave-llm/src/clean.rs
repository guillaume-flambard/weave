//! Structured-data helpers: tolerant JSON parsing and canonical normalization,
//! so LLM outputs land as clean, consistent, well-structured data.

use serde::de::DeserializeOwned;

/// Parse JSON from a possibly-messy LLM response: strips ```json fences and any
/// prose around the object, then deserializes the first balanced `{ … }`.
pub fn parse_json_lenient<T: DeserializeOwned>(text: &str) -> anyhow::Result<T> {
    let trimmed = text.trim();
    // Strip a leading ```json / ``` fence and trailing ``` if present.
    let unfenced = trimmed
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim();
    let slice = balanced_object(unfenced).unwrap_or(unfenced);
    Ok(serde_json::from_str::<T>(slice)?)
}

/// Return the substring spanning the first balanced top-level `{ … }` object,
/// ignoring braces inside strings. `None` if no complete object is found.
fn balanced_object(s: &str) -> Option<&str> {
    let bytes = s.as_bytes();
    let start = s.find('{')?;
    let mut depth = 0usize;
    let mut in_str = false;
    let mut escaped = false;
    for i in start..bytes.len() {
        let c = bytes[i];
        if in_str {
            if escaped {
                escaped = false;
            } else if c == b'\\' {
                escaped = true;
            } else if c == b'"' {
                in_str = false;
            }
            continue;
        }
        match c {
            b'"' => in_str = true,
            b'{' => depth += 1,
            b'}' => {
                depth -= 1;
                if depth == 0 {
                    return Some(&s[start..=i]);
                }
            }
            _ => {}
        }
    }
    None
}

/// Canonical theme form: trimmed, lowercase, whitespace collapsed, edge
/// punctuation removed. Accents are kept (French). Empty stays empty.
pub fn normalize_theme(s: &str) -> String {
    let lower = s.trim().to_lowercase();
    let collapsed = lower.split_whitespace().collect::<Vec<_>>().join(" ");
    collapsed
        .trim_matches(|c: char| !c.is_alphanumeric())
        .to_string()
}

/// ASCII kebab-case slug for stable, deterministic agent names.
pub fn slug(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut prev_dash = false;
    for c in s.trim().to_lowercase().chars() {
        let mapped = match c {
            'à' | 'â' | 'ä' | 'á' => 'a',
            'é' | 'è' | 'ê' | 'ë' => 'e',
            'î' | 'ï' | 'í' => 'i',
            'ô' | 'ö' | 'ó' => 'o',
            'û' | 'ü' | 'ú' => 'u',
            'ç' => 'c',
            c if c.is_ascii_alphanumeric() => c,
            _ => '-',
        };
        if mapped == '-' {
            if !prev_dash && !out.is_empty() {
                out.push('-');
                prev_dash = true;
            }
        } else {
            out.push(mapped);
            prev_dash = false;
        }
    }
    out.trim_matches('-').to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde::Deserialize;

    #[derive(Deserialize, PartialEq, Debug)]
    struct Themed {
        theme: String,
    }

    #[test]
    fn parses_bare_object() {
        let t: Themed = parse_json_lenient(r#"{"theme":"finance"}"#).unwrap();
        assert_eq!(t.theme, "finance");
    }

    #[test]
    fn parses_object_wrapped_in_prose_and_fences() {
        let raw = "Voici le résultat:\n```json\n{\"theme\": \"finance\"}\n```\nMerci.";
        let t: Themed = parse_json_lenient(raw).unwrap();
        assert_eq!(t.theme, "finance");
    }

    #[test]
    fn rejects_non_json() {
        assert!(parse_json_lenient::<Themed>("pas de json ici").is_err());
    }

    #[test]
    fn normalize_theme_canonicalizes() {
        assert_eq!(normalize_theme("  Gestion   Financière! "), "gestion financière");
        assert_eq!(normalize_theme("FINANCE."), "finance");
        assert_eq!(normalize_theme("   "), "");
    }

    #[test]
    fn slug_is_ascii_kebab() {
        assert_eq!(slug("Réconciliation Data"), "reconciliation-data");
        assert_eq!(slug("  déployer  checkout  "), "deployer-checkout");
    }
}
