const JSON_HEADERS = { "Content-Type": "application/json" };

async function request(url, options) {
  const response = await fetch(url, options);
  if (response.status === 204) return null;
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(
      body.error || `Request failed (${response.status})`,
    );
    error.status = response.status;
    error.diagram = body.diagram;
    throw error;
  }
  return body;
}

export const diagramApi = {
  async list() {
    const result = await request("/api/diagrams");
    return result.diagrams;
  },
  get(id) {
    return request(`/api/diagrams/${encodeURIComponent(id)}`);
  },
  create({ id, name, document }) {
    return request("/api/diagrams", {
      method: "POST",
      headers: JSON_HEADERS,
      body: JSON.stringify({ id, name, document }),
    });
  },
  update(id, { name, document, baseVersion }) {
    return request(`/api/diagrams/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: JSON_HEADERS,
      body: JSON.stringify({ name, document, baseVersion }),
    });
  },
  delete(id) {
    return request(`/api/diagrams/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  },
};
