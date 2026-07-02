function extractErrorMessage(status, text) {
  const trimmed = text.trim();
  if (trimmed) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed.error) return parsed.error;
      if (parsed.message) return parsed.message;
      if (parsed.hint) return parsed.hint;
    } catch {
      return trimmed;
    }
  }

  if (status >= 500) return "Le serveur a rencontré une erreur interne (HTTP 500).";
  if (status === 401) return "Accès refusé : clé API manquante ou invalide.";
  if (status === 403) return "Accès interdit.";
  if (status === 404) return "Endpoint introuvable.";
  return `HTTP ${status}`;
}

const cases = [
  { status: 500, text: "", expected: "Le serveur a rencontré une erreur interne (HTTP 500)." },
  { status: 401, text: "", expected: "Accès refusé : clé API manquante ou invalide." },
  { status: 404, text: "", expected: "Endpoint introuvable." },
  { status: 500, text: '{"error":"boom"}', expected: "boom" },
  { status: 400, text: '{"message":"bad request"}', expected: "bad request" },
  { status: 503, text: "plain upstream failure", expected: "plain upstream failure" },
];

for (const testCase of cases) {
  const actual = extractErrorMessage(testCase.status, testCase.text);
  if (actual !== testCase.expected) {
    console.error("check-api-errors failed", { testCase, actual });
    process.exit(1);
  }
}

console.log("check-api-errors ok");
