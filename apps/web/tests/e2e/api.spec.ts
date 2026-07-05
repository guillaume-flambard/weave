import { expect, test } from "@playwright/test";
import { e2eApiUrl } from "../../lib/e2e-env";

const API = e2eApiUrl();

async function apiReady(request: import("@playwright/test").APIRequestContext): Promise<boolean> {
  try {
    return (await request.get(`${API}/health`, { timeout: 8000 })).ok();
  } catch {
    return false;
  }
}

test.describe("Weave API — contrat OpenAPI", () => {
  test("GET /health renvoie status ok + llm", async ({ request }) => {
    test.skip(!(await apiReady(request)), `weave-api not reachable at ${API}`);

    const res = await request.get(`${API}/health`);
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBe("ok");
    expect(body.service).toBe("weave");
    expect(typeof body.llm).toBe("string");
    expect(body.llm.length).toBeGreaterThan(0);
  });

  test("GET /openapi.yaml sert la spec 3.1", async ({ request }) => {
    test.skip(!(await apiReady(request)), `weave-api not reachable at ${API}`);

    const res = await request.get(`${API}/openapi.yaml`);
    expect(res.ok()).toBeTruthy();
    expect(res.headers()["content-type"] ?? "").toMatch(/yaml/);

    const yaml = await res.text();
    expect(yaml).toMatch(/^openapi: 3\.1/);
    expect(yaml).toContain("Weave Cognitive Runtime API");
    for (const path of ["/health:", "/events:", "/ask:", "/simulate:", "/openapi.yaml:"]) {
      expect(yaml, `missing path ${path}`).toContain(`  ${path}`);
    }
  });

  test("lecture mémoire + org presets", async ({ request }) => {
    test.skip(!(await apiReady(request)), `weave-api not reachable at ${API}`);

    const project = `e2e-api-${Date.now()}`;

    for (const path of [
      `/stats?project=${project}`,
      `/facts?project=${project}`,
      `/skills?project=${project}`,
      `/graph?project=${project}`,
      `/agents?project=${project}`,
    ]) {
      const res = await request.get(`${API}${path}`);
      expect(res.ok(), path).toBeTruthy();
    }

    const presets = await request.get(`${API}/org/presets`);
    expect(presets.ok()).toBeTruthy();
    const list = await presets.json();
    expect(Array.isArray(list)).toBeTruthy();
    expect(list.length).toBeGreaterThan(0);

    const connections = await request.get(`${API}/connections`);
    expect(connections.ok()).toBeTruthy();
    expect(Array.isArray(await connections.json())).toBeTruthy();
  });

  test("inject → stats → ask sur projet isolé", async ({ request }) => {
    test.skip(!(await apiReady(request)), `weave-api not reachable at ${API}`);

    const project = `e2e-inject-${Date.now()}`;

    await request.post(`${API}/reset?project=${project}`);

    const inject = await request.post(`${API}/inject`, {
      data: {
        project,
        team: "ops",
        workstream: "banking",
        actor: "e2e",
        text: "Comment relancer la synchro bancaire ?",
      },
    });
    expect(inject.ok()).toBeTruthy();
    expect((await inject.json()).status).toBe("injected");

    const stats = await request.get(`${API}/stats?project=${project}`);
    expect(stats.ok()).toBeTruthy();
    const counts = await stats.json();
    expect(counts.events).toBeGreaterThanOrEqual(1);

    const ask = await request.post(`${API}/ask`, {
      data: {
        project,
        question: "Comment relancer la synchro bancaire ?",
      },
    });
    expect(ask.ok()).toBeTruthy();
    const answer = await ask.json();
    expect(typeof answer.answer).toBe("string");
    expect(Array.isArray(answer.layers)).toBeTruthy();
  });

  test("POST /simulate démarre l'ingestion async", async ({ request }) => {
    test.skip(!(await apiReady(request)), `weave-api not reachable at ${API}`);

    const project = "pennylane";
    await request.post(`${API}/org/load`, { data: { org: project } });

    const res = await request.post(`${API}/simulate`, { data: { project } });
    expect(res.ok()).toBeTruthy();
    const body = await res.json();
    expect(body.status).toBe("simulating");
    expect(body.events).toBeGreaterThan(0);
  });
});
